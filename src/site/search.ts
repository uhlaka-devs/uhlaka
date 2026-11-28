/**
 * Search on the site (ADR 0042). The runtime reads the pages it serves, the
 * same files an export writes, and answers `/_/search?q=` with a page of the
 * site's own: its header, its menu, its theme, and what matches. No script,
 * no service elsewhere, nothing sent anywhere.
 */
import { wordsFor } from '../blocks/words.ts';
import './languages.ts';

/** One page as search sees it: where it is, its title, and its words. */
export interface SearchDoc {
  path: string;
  title: string;
  text: string;
  /** The language the page is in: a search from a page in one language finds pages in it (ADR 0054). */
  language?: string;
}

export interface SearchHit {
  path: string;
  title: string;
  /** Escaped HTML: the words around the first match, the matches marked. */
  snippet: string;
}

/** At most this many pages are listed. */
export const SEARCH_RESULTS = 20;
export const SEARCH_MAX_QUERY = 200;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) =>
    code[0] === '#' ? String.fromCodePoint(code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1))) : (ENTITIES[code.toLowerCase()] ?? whole),
  );
const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A word as search compares it: lower case, without its accents, so `paduri` finds `păduri`. */
function folded(text: string): { text: string; at: number[] } {
  let out = '';
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const one = (text[i] as string).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (let j = 0; j < one.length; j++) at.push(i);
    out += one;
  }
  return { text: out, at };
}

const words = (query: string): string[] => [...new Set(folded(query).text.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0))].slice(0, 8);

/**
 * The pages a visitor can find: every page and entry the site serves, by the
 * words in its `<main>`. Lists of entries, old addresses and the page for an
 * address that does not exist are left out; so is what a form says.
 */
export function searchIndex(files: Map<string, string | Uint8Array>): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const [file, body] of files) {
    // A page behind a password is not found by search: its words would be shown to anyone (ADR 0043).
    // Nor is one hidden from search engines (ADR 0050 d3).
    if (typeof body !== 'string' || !file.endsWith('index.html') || body.includes('http-equiv="refresh"') || body.includes('<meta name="uhlaka-locked"') || body.includes('<meta name="uhlaka-members"') || body.includes('<meta name="robots" content="noindex">')) continue;
    const main = /<main[^>]*>([\s\S]*?)<\/main>/.exec(body)?.[1] ?? '';
    if (main.includes('class="b blog"')) continue;
    const title = decode(/<meta property="og:title" content="([^"]*)">/.exec(body)?.[1] ?? '');
    const text = decode(
      main
        .replace(/<(script|style|form|template|nav)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
    )
      .replace(/\s+/g, ' ')
      .trim();
    const language = /<html lang="([^"]+)"/.exec(body)?.[1] ?? '';
    docs.push({ path: `/${file.slice(0, -'index.html'.length)}`, title, text, language });
  }
  return docs;
}

/** The pages with every word of the query, those that have them in their title first. */
export function search(index: SearchDoc[], query: string, limit = SEARCH_RESULTS): SearchHit[] {
  const wanted = words(query.slice(0, SEARCH_MAX_QUERY));
  if (wanted.length === 0) return [];
  const scored: { doc: SearchDoc; score: number }[] = [];
  for (const doc of index) {
    const title = folded(doc.title).text;
    const text = folded(doc.text).text;
    if (!wanted.every((w) => title.includes(w) || text.includes(w))) continue;
    const score = wanted.reduce((sum, w) => sum + (title.includes(w) ? 10 : 0) + Math.min(text.split(w).length - 1, 10), 0);
    scored.push({ doc, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.doc.path.localeCompare(b.doc.path))
    .slice(0, limit)
    .map(({ doc }) => ({ path: doc.path, title: doc.title, snippet: snippet(doc.text, wanted) }));
}

/** About thirty words around the first match, each match marked. */
function snippet(text: string, wanted: string[]): string {
  const { text: plain, at } = folded(text);
  const first = Math.min(...wanted.map((w) => plain.indexOf(w)).filter((i) => i >= 0), plain.length);
  const from = Math.max(0, (at[first] ?? 0) - 80);
  const start = from === 0 ? 0 : text.indexOf(' ', from) + 1;
  const end = Math.min(text.length, start + 220);
  const piece = text.slice(start, end);
  const { text: pieceFolded, at: pieceAt } = folded(piece);
  const marks: [number, number][] = [];
  for (const w of wanted) {
    for (let i = pieceFolded.indexOf(w); i >= 0; i = pieceFolded.indexOf(w, i + w.length)) {
      marks.push([pieceAt[i] as number, (pieceAt[i + w.length - 1] as number) + 1]);
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  let out = '';
  let done = 0;
  for (const [a, b] of marks) {
    if (a < done) continue;
    out += `${escape(piece.slice(done, a))}<mark>${escape(piece.slice(a, b))}</mark>`;
    done = b;
  }
  out += escape(piece.slice(done));
  return `${start > 0 ? '… ' : ''}${out}${end < text.length ? ' …' : ''}`;
}

/**
 * The page of results, in the site's own frame: the page for an address that
 * does not exist, its title and its `<main>` replaced. Search engines are
 * asked not to keep it.
 */
export function resultsPage(frame: string, language: string, query: string, hits: SearchHit[], asked = ''): string {
  const said = wordsFor(language);
  const q = escape(query);
  const heading = query ? said.searchFound.replace('{query}', q) : said.search;
  const list = hits.length
    ? `<ol class="search-results">${hits.map((h) => `<li><a href="${escape(h.path)}">${escape(h.title || h.path)}</a><p>${h.snippet}</p></li>`).join('')}</ol>`
    : query
      ? `<p class="lead">${said.searchNone.replace('{query}', q)}</p>`
      : '';
  const main =
    `<section class="b b-search"><div class="b-in"><h1>${heading}</h1>` +
    `<form class="search-form" role="search" method="get" action="/_/search"><label class="search-label" for="search-q">${escape(said.search)}</label>` +
    `${asked ? `<input type="hidden" name="l" value="${escape(asked)}">` : ''}<input id="search-q" name="q" type="search" maxlength="${SEARCH_MAX_QUERY}" value="${q}" required> <button class="button" type="submit">${escape(said.search)}</button></form>` +
    `${list}</div></section>`;
  // What the owner put under the results (ADR 0085 d7), carried by the frame.
  const after = /<template data-search-after>([\s\S]*?)<\/template>/.exec(frame)?.[1] ?? '';
  return frame
    .replace(/<title>[^<]*?(( · [^<]*)?)<\/title>/, (_whole, rest: string) => `<title>${escape(said.search)}${rest}</title>`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escape(said.search)}">`)
    .replace('</head>', '<meta name="robots" content="noindex">\n</head>')
    .replace(/<main([^>]*)>[\s\S]*?<\/main>/, (_whole, attrs: string) => `<main${attrs}>${main}${after}</main>`);
}
