/**
 * Google Fonts, served by the site (ADR 0085 d6). The owner picks a family from
 * the catalogue Uhlaka carries; the server asks Google once for the family's
 * files, keeps them with the site and serves them as its own. No visitor's
 * browser ever asks Google for anything (ADR 0001 d3).
 *
 * The same reading of Google's stylesheet makes the faces Uhlaka carries
 * (`tools/fonts.ts`).
 */
import { cleanFontFace, type FontFace, fontSlug } from '../core/index.ts';
import catalogue from './google-fonts.json';

export const GOOGLE_CSS = 'https://fonts.googleapis.com/css2';
const GOOGLE_FILES = 'https://fonts.gstatic.com/';
/** Google gives `woff2` files, each cut to a script, only to a browser it knows takes them. */
export const WOFF2_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
/** The most a family's files may weigh together, and one file: a family cut for Chinese is about 5 MB in a hundred pieces. */
export const GOOGLE_MAX_BYTES = 40 * 1024 * 1024;
export const FONT_FILE_MAX_BYTES = 8 * 1024 * 1024;

/** A family of the catalogue: its name, its kind, the styles to ask for, and the scripts it has. */
export interface GoogleFamily {
  family: string;
  category: string;
  /** What follows the family's name in Google's address: `ital,wght@0,400;1,400`, `wght@100..900`, or nothing. */
  axes: string;
  subsets: string[];
}

const CATEGORIES: Record<string, string> = { s: 'sans-serif', f: 'serif', d: 'display', h: 'handwriting', m: 'monospace' };
type Row = [string, string, string, string];
/** The catalogue, as `tools/fonts.ts` wrote it from Google's list. */
export const GOOGLE_FAMILIES: readonly GoogleFamily[] = (catalogue.families as Row[]).map(([family, category, axes, subsets]) => ({
  family,
  category: CATEGORIES[category] ?? 'sans-serif',
  axes,
  subsets: subsets ? subsets.split(' ') : [],
}));
export const GOOGLE_CATALOGUE_DATE: string = catalogue.date;
export const googleFamily = (family: string): GoogleFamily | undefined => GOOGLE_FAMILIES.find((f) => f.family === family);
/** The family a font name `google:<slug>` stands for. */
export const googleFamilyBySlug = (slug: string): GoogleFamily | undefined => GOOGLE_FAMILIES.find((f) => fontSlug(f.family) === slug);

/** The address of a family's stylesheet at Google. */
export const googleCssUrl = (family: string, axes: string): string =>
  `${GOOGLE_CSS}?family=${encodeURIComponent(family).replace(/%20/g, '+')}${axes ? `:${axes}` : ''}&display=swap`;

/** One face of Google's stylesheet: what it is, and where its file is. */
export interface GoogleFace {
  face: Omit<FontFace, 'file'>;
  url: string;
  /** The script it is cut for (`latin-ext`), or its number for the scripts cut in many pieces. */
  subset: string;
}

/** The faces of a stylesheet from Google. A face whose file is not Google's, or whose parts are not plainly a face's, is left out. */
export function parseGoogleCss(css: string): GoogleFace[] {
  const out: GoogleFace[] = [];
  let index = 0;
  for (const match of css.matchAll(/(?:\/\*\s*([a-z0-9-[\]]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g)) {
    const body = match[2] as string;
    const part = (name: string): string => (new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1] ?? '').trim();
    const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)\s'"]+\.woff2)\)/.exec(body)?.[1];
    const family = part('font-family').replace(/^['"]|['"]$/g, '');
    const face = cleanFontFace({ family, file: 'x.woff2', weight: part('font-weight'), style: part('font-style'), range: part('unicode-range').replace(/\s+/g, ' ') });
    const subset = (match[1] ?? String(index)).replace(/[[\]]/g, '');
    index++;
    if (!url || !face || !url.startsWith(GOOGLE_FILES)) continue;
    const { file: _file, ...rest } = face;
    out.push({ face: rest, url, subset });
  }
  return out;
}

/** Whether these bytes are a `woff2` font: they begin with `wOF2`. */
export const isWoff2 = (bytes: Uint8Array): boolean => bytes.length > 48 && bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** A family's faces with their bytes, as Google gives them. Throws when Google answers with nothing a site can serve. */
export async function downloadGoogle(family: GoogleFamily, fetcher: Fetch = fetch): Promise<{ face: Omit<FontFace, 'file'>; subset: string; bytes: Uint8Array }[]> {
  const answer = await fetcher(googleCssUrl(family.family, family.axes), { headers: { 'user-agent': WOFF2_AGENT } });
  if (!answer.ok) throw new Error(`Google Fonts answered ${answer.status} for ${family.family}`);
  const faces = parseGoogleCss(await answer.text());
  if (!faces.length) throw new Error(`Google Fonts gave no faces for ${family.family}`);
  const out: { face: Omit<FontFace, 'file'>; subset: string; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const { face, url, subset } of faces) {
    const file = await fetcher(url);
    if (!file.ok) throw new Error(`Google Fonts answered ${file.status} for a file of ${family.family}`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isWoff2(bytes) || bytes.length > FONT_FILE_MAX_BYTES) throw new Error(`a file of ${family.family} is not a font`);
    total += bytes.length;
    if (total > GOOGLE_MAX_BYTES) throw new Error(`${family.family} is too large`);
    out.push({ face, subset, bytes });
  }
  return out;
}
