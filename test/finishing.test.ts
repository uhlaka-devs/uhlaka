/** ADR 0085 d8: motion, the page in a box, a logo for the dark, a section on a type, and the shop's products. */
import { describe, expect, test } from 'bun:test';
import { cleanEntryExtras, type ContentType, normalizeProduct, normalizeSite, normalizeTypes, parseTheme, type Post, shownPrice, type Theme, themeCss, withAreas } from '../src/core/index.ts';
import { renderBlogList, renderPost } from '../src/site/document.ts';
import atelier from '../themes/atelier.json';
import plain from '../themes/plain.json';

const withLayout = (layout: Record<string, unknown>) => parseTheme({ ...plain, layout });
const css = (layout: Record<string, unknown>): string => themeCss(withLayout(layout).theme as Theme);
const plainTheme = parseTheme(plain).theme as Theme;

describe('the finishing in the style', () => {
  test('the names are read, the first of each list kept as an absence, anything else refused', () => {
    const { theme, issues } = withLayout({ motion: { appear: 'rise', hover: 'zoom' }, page: { boxed: true, background: 'surface', stickySide: true }, shop: { badge: true, zoom: true, bar: true } });
    expect(issues).toEqual([]);
    expect(theme?.layout.motion).toEqual({ appear: 'rise', hover: 'zoom' });
    expect(theme?.layout.page).toEqual({ boxed: true, background: 'surface', stickySide: true });
    expect(theme?.layout.shop).toEqual({ badge: true, zoom: true, bar: true });
    expect(withLayout({ motion: { appear: 'none', hover: 'none' }, page: { boxed: false }, shop: { bar: false } }).theme?.layout).toMatchObject({ motion: {}, page: {}, shop: {} });
    for (const [layout, path] of [
      [{ motion: { appear: 'spin' } }, 'layout.motion.appear'],
      [{ motion: { hover: 'glow' } }, 'layout.motion.hover'],
      [{ motion: { speed: 2 } }, 'layout.motion.speed'],
      [{ page: { boxed: 'yes' } }, 'layout.page.boxed'],
      [{ page: { background: '#ff0000' } }, 'layout.page.background'],
      [{ page: { background: 'no-such-colour' } }, 'layout.page.background'],
      [{ shop: { badge: 1 } }, 'layout.shop.badge'],
      [{ shop: { wishlist: true } }, 'layout.shop.wishlist'],
    ] as const) {
      expect(withLayout(layout).issues.map((i) => i.path)).toContain(path);
    }
  });

  test('a style without them writes none of it', () => {
    const none = css({});
    for (const absent of ['uh-appear', ':hover img{scale', 'html{background-color', '.layout-aside{position:sticky', '.shop-badge{display', '.post-zoom{cursor', 'uh-bar']) expect(none).not.toContain(absent);
  });

  test('motion is only for a visitor who did not ask for less, and appearing only where the browser ties it to the view', () => {
    const rise = css({ motion: { appear: 'rise', hover: 'lift' } });
    expect(rise).toContain('@media (prefers-reduced-motion:no-preference){@supports (animation-timeline:view()){main>.b:not(:first-child)');
    expect(rise).toContain('@keyframes uh-appear{from{opacity:0;translate:0 1.5rem}}');
    expect(rise).toContain('@media (prefers-reduced-motion:no-preference){:is(.post-card,.entry-card,.gallery>li){transition');
    expect(rise).toContain(':hover{translate:0 -.25rem');
    expect(css({ motion: { appear: 'fade' } })).toContain('@keyframes uh-appear{from{opacity:0}}');
    expect(css({ motion: { hover: 'zoom' } })).toContain(':hover img{scale:1.06}');
  });

  test('the box, the colour around it and the sidebar that stays', () => {
    const boxed = css({ page: { boxed: true, background: 'primary' } });
    expect(boxed).toContain('html{background-color:var(--t-color-primary)}.site-backdrop{display:block}');
    expect(boxed).toContain('body{max-width:var(--t-width-wide);margin:var(--t-space-lg) auto');
    expect(css({ page: { boxed: true } })).toContain('html{background-color:var(--t-color-surface)}');
    // A colour around the box with no box: nothing.
    expect(css({ page: { background: 'primary' } })).not.toContain('html{background-color');
    expect(css({ page: { stickySide: true } })).toContain('.layout-aside{position:sticky;top:var(--t-space-md)');
    expect(css({ header: { sticky: true }, page: { stickySide: true } })).toContain('.layout-aside{position:sticky;top:calc(');
  });

  test('the ready-made styles give the new choices a value', () => {
    const theme = parseTheme(atelier).theme as Theme;
    expect(theme.layout.motion.appear).toBeDefined();
    expect(theme.layout.shop.badge).toBe(true);
    // Plain is kept a style written before there was a layout (test/layout.test.ts): every choice its first.
    expect(plainTheme.layout.shop).toEqual({});
  });
});

describe('a logo for the dark and a picture around the page', () => {
  const logo = { src: '/media/logo.png', alt: 'Shop' };
  const dark = { src: '/media/logo-dark.png', alt: 'Shop' };

  test('both are kept as pictures, and nothing else is', () => {
    const site = normalizeSite({ name: 'S', logo, logoDark: dark, background: { src: '/media/bg.jpg', alt: '' } });
    expect(site.logoDark).toEqual(dark);
    expect(site.background?.src).toBe('/media/bg.jpg');
    const bad = normalizeSite({ name: 'S', logoDark: 'logo.png', background: { src: 'javascript:alert(1)' } });
    expect(bad.logoDark).toBeUndefined();
    expect(bad.background).toBeUndefined();
  });

  test('the page carries both logos and the style shows the one of its scheme', () => {
    const site = normalizeSite({ name: 'S', logo, logoDark: dark });
    const html = renderBlogList(site, { heading: 'Blog', path: '/blog/', posts: [] }, []);
    expect(html).toContain('class="site-logo logo-light"');
    expect(html).toContain('class="site-logo logo-dark" src="/media/logo-dark.png"');
    const light = themeCss(plainTheme);
    expect(light).toContain(':root .logo-dark{display:none}:root .logo-light{display:block}');
    const following = themeCss(parseTheme(atelier).theme as Theme);
    expect(following).toMatch(/@media \(prefers-color-scheme: dark\)\{[\s\S]*?:root:not\(\[data-scheme=light\]\) \.logo-light\{display:none\}/);
    expect(following).toContain(':root[data-scheme=dark] .logo-dark{display:block}');
  });

  test('a site with one logo draws it as before', () => {
    const html = renderBlogList(normalizeSite({ name: 'S', logo }), { heading: 'Blog', path: '/blog/', posts: [] }, []);
    expect(html).toContain('<img class="site-logo" src="/media/logo.png"');
    expect(html).not.toContain('logo-dark');
  });

  test('the picture around the page is in the page, hidden until the style boxes it', () => {
    const html = renderBlogList(normalizeSite({ name: 'S', background: { src: '/media/bg.jpg', alt: '' } }), { heading: 'Blog', path: '/blog/', posts: [] }, []);
    expect(html).toMatch(/<div class="site-backdrop" aria-hidden="true"><img src="\/media\/bg.jpg"/);
  });
});

describe('a section on every entry of a type', () => {
  test('it is kept as a slug with the other extras', () => {
    expect(cleanEntryExtras({ section: 'Sign Up!' })).toEqual({ entry: { section: 'sign-up' } });
    expect(cleanEntryExtras({ section: 42 })).toEqual({});
  });

  test('it is drawn after the entry, before what comes after it', () => {
    const [type] = normalizeTypes([{ name: 'Blog', path: 'blog', dated: true, entry: { section: 'sign-up', nextPrev: true } }]) as [ContentType];
    const site = normalizeSite({ name: 'S', types: [type] });
    const section = { slug: 'sign-up', title: 'Sign up', blocks: [{ id: 'b_sign', type: 'text', content: { text: [{ type: 'paragraph', children: [{ text: 'Join the letter' }] }] } }] };
    const post = { slug: 'one', title: 'One', date: '2026-11-01', blocks: [], categories: [], tags: [] } as unknown as Post;
    const html = renderPost(withAreas(site, [section as never], 'en'), plainTheme, post, [], type);
    expect(html).toContain('data-area="entry"');
    expect(html).toContain('data-b="b_sign"');
    const without = renderPost(withAreas(normalizeSite({ name: 'S' }), [section as never], 'en'), plainTheme, post, []);
    expect(without).not.toContain('data-area="entry"');
  });
});

describe('the shop: prices in a list, the badge, zoom and the bar', () => {
  const shop = { currency: 'RON', vat: true, stock: { 'products/gone': 0 } };
  const [type] = normalizeTypes([{ id: 'products', name: 'Products', path: 'products', sells: true }]) as [ContentType];
  const item = (slug: string, product: Record<string, unknown>): Post => ({ slug, title: slug, blocks: [], categories: [], tags: [], cover: { src: `/media/${slug}.jpg`, alt: slug }, product: normalizeProduct(product) }) as unknown as Post;

  test('the price shown: the sale one with the old, the lowest of several, and whether any is left', () => {
    expect(shownPrice(shop, normalizeProduct({ price: '100', sale: '80' }), 'products', 'mug')).toEqual({ price: 10000, sale: 8000, from: false, left: true });
    expect(shownPrice(shop, normalizeProduct({ price: '100', counted: true }), 'products', 'gone')?.left).toBe(false);
    expect(shownPrice(shop, normalizeProduct({}), 'products', 'none')).toBeNull();
    const sized = normalizeProduct({ price: '100', options: [{ name: 'Size', values: ['S', 'L'] }], variants: { L: { price: '120' } } });
    expect(shownPrice(shop, sized, 'products', 'shirt')).toMatchObject({ price: 10000, from: true });
  });

  test('a list of products shows each price and a badge; a list of posts shows neither', () => {
    const site = { ...normalizeSite({ name: 'S', types: [type] }), shop };
    const html = renderBlogList(site, { heading: 'Products', path: '/products/', posts: [item('mug', { price: '100', sale: '80' }), item('gone', { price: '50', counted: true }), item('cup', { price: '30' })] }, [], type);
    expect(html).toMatch(/<p class="post-price"><del><span class="site-hide">Was<\/span> [^<]*100[^<]*<\/del> <ins>[^<]*80/);
    expect(html).toContain('<span class="shop-badge">Sale</span>');
    expect(html).toContain('<span class="shop-badge" data-out="">Sold out</span>');
    expect(html.match(/shop-badge/g)?.length).toBe(2);
    const posts = renderBlogList(normalizeSite({ name: 'S' }), { heading: 'Blog', path: '/blog/', posts: [item('mug', { price: '100', sale: '80' })] }, []);
    expect(posts).not.toContain('post-price');
    expect(posts).not.toContain('shop-badge');
  });

  test("a product's page has its picture to open whole and the bar, which the style turns on", () => {
    const site = { ...normalizeSite({ name: 'S', types: [type] }), shop };
    const html = renderPost(site, plainTheme, item('mug', { price: '100' }), [], type);
    expect(html).toContain('<a class="post-zoom post-cover" id="zoom-from" href="#zoom-whole"');
    expect(html).toContain('<div class="zoom-whole" id="zoom-whole"');
    expect(html).toContain('<div class="buy-bar" aria-hidden="true">');
    expect(html).toContain('<form class="buy" id="buy"');
    const on = css({ shop: { zoom: true, bar: true, badge: true } });
    expect(on).toContain('.zoom-whole:target{display:grid}');
    expect(on).toContain('body:has(.buy) .buy-bar{display:flex;animation:uh-bar');
    expect(on).toContain('.shop-badge{display:inline-block}');
  });

  test('an entry that is not a product has no zoom and no bar', () => {
    const post = { slug: 'one', title: 'One', date: '2026-11-01', blocks: [], categories: [], tags: [], cover: { src: '/media/a.jpg', alt: '' } } as unknown as Post;
    const html = renderPost(normalizeSite({ name: 'S' }), plainTheme, post, []);
    expect(html).not.toContain('post-zoom');
    expect(html).not.toContain('buy-bar');
  });
});
