/** ADR 0085 d7: the blog, an entry, the footer in columns and the pages of their own. */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizePage, normalizeSite, parseTheme, type Post, type Theme, themeCss, withAreas } from '../src/core/index.ts';
import { renderBlogList, renderParts } from '../src/site/document.ts';
import { publishedSite } from '../src/site/export.ts';
import { resultsPage } from '../src/site/search.ts';
import { Store } from '../src/site/store.ts';
import plain from '../themes/plain.json';

const withLayout = (layout: Record<string, unknown>) => parseTheme({ ...plain, layout });
const css = (layout: Record<string, unknown>): string => themeCss(withLayout(layout).theme as Theme);
const dir = await mkdtemp(join(tmpdir(), 'uhlaka-blog-look-'));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('a list of entries and an entry in the style', () => {
  test('the names are read, the first of each list kept as an absence, anything else refused', () => {
    const { theme, issues } = withLayout({ list: { look: 'cards', hide: ['meta', 'picture'], excerpt: 'short', more: true }, entry: { cover: 'behind' } });
    expect(issues).toEqual([]);
    expect(theme?.layout.list).toEqual({ look: 'cards', hide: ['picture', 'meta'], excerpt: 'short', more: true });
    expect(theme?.layout.entry).toEqual({ cover: 'behind' });
    expect(withLayout({ list: { look: 'stack', hide: [], excerpt: 'long', more: false }, entry: { cover: 'below' } }).theme?.layout).toMatchObject({ list: {}, entry: {} });
    for (const [layout, path] of [
      [{ list: { look: 'masonry' } }, 'layout.list.look'],
      [{ list: { hide: ['title'] } }, 'layout.list.hide'],
      [{ list: { hide: 'picture' } }, 'layout.list.hide'],
      [{ list: { excerpt: 'medium' } }, 'layout.list.excerpt'],
      [{ list: { more: 'yes' } }, 'layout.list.more'],
      [{ list: { columns: 3 } }, 'layout.list.columns'],
      [{ entry: { cover: 'left' } }, 'layout.entry.cover'],
      [{ entry: { share: true } }, 'layout.entry.share'],
    ] as const) {
      expect(withLayout(layout).issues.map((i) => i.path)).toContain(path);
    }
  });

  test('each name is written once as CSS, and a style without them writes none of it', () => {
    const none = css({});
    for (const absent of ['.post-picture img{', '.post-more{display:block', 'line-clamp', '.post-cover{order:-1', '.post-head:has(.post-cover)']) expect(none).not.toContain(absent);
    expect(css({ list: { look: 'grid' } })).toContain('.posts{grid-template-columns:repeat(auto-fill,minmax(min(16rem,100%),1fr))}');
    expect(css({ list: { look: 'side' } })).toContain('.post-card.has-picture>.post-picture{grid-column:1;grid-row:1/span 5}');
    expect(css({ list: { look: 'cards' } })).toContain('background-color:var(--t-color-surface)');
    expect(css({ list: { hide: ['picture', 'excerpt'] } })).toContain('.post-card>.post-picture,.post-card>.post-excerpt{display:none}');
    const all = css({ list: { excerpt: 'short', more: true }, entry: { cover: 'above' } });
    expect(all).toContain('line-clamp:2');
    expect(all).toContain('.post-more{display:block}');
    expect(all).toContain('.post-head .post-cover{order:-1');
    expect(css({ entry: { cover: 'none' } })).toContain('.post-head .post-cover{display:none}');
    expect(css({ entry: { cover: 'behind' } })).toContain('.post-head:has(.post-cover)::before');
  });

  test('a list is numbered, with the pages around this one and the first and the last', () => {
    const site = normalizeSite({ name: 'S' });
    const posts = [{ slug: 'one', title: 'One', date: '2026-11-01', blocks: [], categories: [], tags: [], cover: { src: '/media/a.jpg', alt: '' } }] as unknown as Post[];
    const numbers = Array.from({ length: 9 }, (_, i) => (i === 0 ? '/blog/' : `/blog/page/${i + 1}/`));
    const html = renderBlogList(site, { heading: 'Blog', path: '/blog/page/5/', posts, newer: '/blog/page/4/', older: '/blog/page/6/', numbers, at: 5 }, []);
    const pager = /<ol class="pager-numbers">([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? '';
    expect([...pager.matchAll(/>(\d|…)</g)].map((m) => m[1])).toEqual(['1', '…', '3', '4', '5', '6', '7', '…', '9']);
    expect(pager).toContain('<span aria-current="page" aria-label="Page 5">5</span>');
    expect(html).toContain('class="post-card has-picture"');
    expect(html).toContain('class="post-excerpt"');
    expect(html).toContain('class="post-more" href="/blog/one/"');
    expect(renderBlogList(site, { heading: 'Blog', path: '/blog/', posts }, [])).not.toContain('pager-numbers');
  });
});

describe('the footer in columns and "Back to top"', () => {
  test('read from the site, drawn above the footer line, and left out while not chosen', () => {
    const site = normalizeSite({ name: 'S', footerSection: 'Footer Cols', backToTop: true, notFound: 'gone', searchSection: 'more' });
    expect(site).toMatchObject({ footerSection: 'footer-cols', backToTop: true, notFound: 'gone', searchSection: 'more' });
    expect(normalizeSite({ name: 'S', backToTop: 'yes', footerSection: '' })).not.toContainKeys(['backToTop', 'footerSection']);
    const cols = normalizePage({ slug: 'footer-cols', title: 'Footer', blocks: [{ type: 'text', content: { body: [{ type: 'paragraph', children: [{ text: 'Open every day' }] }] } }] }).page;
    const page = normalizePage({ title: 'T', blocks: [] }).page;
    const { body } = renderParts(withAreas(site, [cols], 'en'), parseTheme(plain).theme as Theme, page, []);
    const footer = /<footer[\s\S]*<\/footer>/.exec(body)?.[0] ?? '';
    expect(footer).toContain('class="footer-area"');
    expect(footer.indexOf('Open every day')).toBeLessThan(footer.indexOf('class="site-in"'));
    expect(footer).toContain('<a class="to-top" href="#top">Back to top');
    const before = renderParts(normalizeSite({ name: 'S' }), parseTheme(plain).theme as Theme, page, []).body;
    expect(before).not.toContain('footer-area');
    expect(before).not.toContain('to-top');
  });
});

describe('the page for a missing address and the search results (ADR 0085 d7)', () => {
  async function store(name: string, settings: Record<string, unknown>): Promise<Store> {
    const one = await Store.open(join(dir, `${name}.db`));
    await one.setTheme(plain);
    await one.publishTheme();
    await one.setSite({ name: 'Atelier', ...settings });
    await one.savePage({ slug: '', title: 'Home', blocks: [] });
    await one.publish('');
    for (const [slug, words] of [['gone', 'Try our menu'], ['more', 'Ask us instead']] as const) {
      await one.saveSection({ slug, title: slug, blocks: [{ type: 'text', content: { body: [{ type: 'paragraph', children: [{ text: words }] }] } }] });
      await one.publishSection(slug);
    }
    return one;
  }

  test('served: a heading and a search field, then the chosen section; the results carry theirs', async () => {
    const one = await store('served', { notFound: 'gone', searchSection: 'more' });
    try {
      const frame = String((await publishedSite(one, true)).get('404.html'));
      const main = /<main[^>]*>([\s\S]*?)<\/main>/.exec(frame)?.[1] ?? '';
      expect(main).toContain('Page not found');
      expect(main).toContain('action="/_/search"');
      expect(main).toContain('Try our menu');
      expect(main).toContain('<template data-search-after>');
      const results = resultsPage(frame, 'en', 'menu', []);
      const shown = /<main[^>]*>([\s\S]*?)<\/main>/.exec(results)?.[1] ?? '';
      expect(shown).toContain('Ask us instead');
      expect(shown).not.toContain('Try our menu');
      expect(shown.indexOf('Ask us instead')).toBeGreaterThan(shown.indexOf('search-form'));
    } finally {
      one.close();
    }
  });

  test('on a static host the heading leads home; with nothing chosen there is nothing more', async () => {
    const one = await store('static', {});
    try {
      const frame = String((await publishedSite(one)).get('404.html'));
      expect(frame).toContain('Page not found');
      expect(frame).not.toContain('action="/_/search"');
      expect(frame).toContain('href="/"');
      expect(frame).not.toContain('Try our menu');
      expect(frame).not.toContain('data-search-after');
      expect(resultsPage(frame, 'en', 'x', [])).not.toContain('Ask us instead');
    } finally {
      one.close();
    }
  });
});
