/** ADR 0085 d3: the header and the menu, as the popular themes offer them, in one style. */
import { describe, expect, test } from 'bun:test';
import { normalizePage, normalizeSite, parseTheme, type Theme, themeCss, withAreas } from '../src/core/index.ts';
import { renderParts } from '../src/site/document.ts';
import atelier from '../themes/atelier.json';
import plain from '../themes/plain.json';
import studio from '../themes/studio.json';

const themeOf = (input: unknown): Theme => parseTheme(input).theme as Theme;
const withLayout = (layout: unknown): ReturnType<typeof parseTheme> => parseTheme({ ...plain, layout });
const page = (blocks: unknown[] = []) => normalizePage({ title: 'T', blocks }).page;
const MENU = [{ title: 'About', href: '/about/', children: [] }];

describe('the style says how the header and the menu look', () => {
  test('the new choices are read, and anything else is refused', () => {
    const { theme } = withLayout({ header: { arrangement: 'logo-centre', sticky: true, over: true, shrink: true }, menu: { current: 'pill', phone: 'side' }, bar: { style: { background: { token: 'primary' } } } });
    expect(theme?.layout.header).toMatchObject({ arrangement: 'logo-centre', sticky: true, over: true, shrink: true });
    expect(theme?.layout.menu).toMatchObject({ current: 'pill', phone: 'side' });
    expect(theme?.layout.bar.style).toEqual({ background: { token: 'primary' } });
    for (const [layout, path] of [
      [{ header: { over: 'yes' } }, 'layout.header.over'],
      [{ header: { shrink: 1 } }, 'layout.header.shrink'],
      [{ menu: { current: 'glow' } }, 'layout.menu.current'],
      [{ menu: { phone: 'popup' } }, 'layout.menu.phone'],
      [{ bar: { arrangement: 'inline' } }, 'layout.bar.arrangement'],
      [{ sidebar: {} }, 'layout.sidebar'],
    ] as const) {
      expect(withLayout(layout).issues.map((i) => i.path)).toContain(path);
    }
  });

  test('a style written before reads as before: the first choice of each list is kept as an absence', () => {
    const { theme } = withLayout({ header: { over: false }, menu: { current: 'colour', phone: 'below' } });
    expect(theme?.layout.header.over).toBeUndefined();
    expect(theme?.layout.menu).toEqual({});
    expect(theme?.layout.bar).toEqual({});
    const css = themeCss(themeOf(plain));
    for (const absent of ['site-bar', 'uh-shrink', 'uh-fill', '--over-room', '.menu-close{display:block', 'min-width:48.01rem']) expect(css).not.toContain(absent);
  });

  test('the two arrangements move the parts only where the menu is not folded', () => {
    const logo = themeCss(withLayout({ header: { arrangement: 'logo-centre' } }).theme as Theme);
    expect(logo).toContain('@media (min-width:48.01rem){.site-header .site-in{flex-wrap:nowrap}.site-header .site-nav{display:contents}');
    expect(logo).toContain('.site-header .site-name{position:absolute;left:50%;top:50%;translate:-50% -50%}');
    const menu = themeCss(withLayout({ header: { arrangement: 'menu-centre' } }).theme as Theme);
    expect(menu).toContain('.site-header .site-nav>nav{margin-inline:auto}');
  });

  test('over the first block: the header lies over a hero in its text colour, and leaves room for itself', () => {
    const theme = themeOf({ ...atelier, layout: { ...atelier.layout, header: { ...atelier.layout.header, over: true } } });
    const css = themeCss(theme);
    expect(css).toContain('.site-header:has(+.layout>main:first-child>.b-hero:first-child){--over-color:var(--t-color-on-primary)}');
    // A variant with its own text colour gives the header that colour over it.
    expect(css).toContain('.b-hero.v-light:first-child){--over-color:var(--t-color-text)}');
    expect(css).toContain('background-color:transparent;color:var(--over-color,inherit)');
    expect(css).toContain('.site-header+.layout>main:first-child>.b-hero:first-child{border-block-start:var(--over-room) solid transparent}');
    expect(css).not.toContain('uh-fill');
  });

  test('over the first block and staying at the top: the background fills in as the page scrolls, only where a browser can', () => {
    const theme = themeOf({ ...studio, layout: { ...studio.layout, header: { arrangement: 'inline', sticky: true, over: true, shrink: true } } });
    const css = themeCss(theme);
    const supported = css.slice(css.indexOf('@supports (animation-timeline:scroll())'));
    expect(supported).toContain('animation:uh-fill linear both,uh-shrink linear both');
    expect(css).toContain('@keyframes uh-fill{from{background-color:transparent');
    // Outside @supports the header keeps its background: nothing makes it transparent.
    expect(css.slice(0, css.indexOf('@supports'))).not.toContain('background-color:transparent');
  });

  test('smaller as it scrolls only while it stays at the top', () => {
    expect(themeCss(withLayout({ header: { sticky: true, shrink: true } }).theme as Theme)).toContain('@keyframes uh-shrink');
    expect(themeCss(withLayout({ header: { sticky: false, shrink: true } }).theme as Theme)).not.toContain('uh-shrink');
  });

  test('the current item and the menu on a phone', () => {
    const css = themeCss(withLayout({ menu: { current: 'underline', phone: 'full' } }).theme as Theme);
    expect(css).toContain('text-decoration:underline');
    expect(css).toContain('.site-nav{position:fixed;z-index:20;inset-block:0;inset-inline-end:0;inset-inline-start:0');
    expect(css).toContain('.menu-close{display:block');
    const side = themeCss(withLayout({ menu: { current: 'pill', phone: 'side' } }).theme as Theme);
    expect(side).toContain('width:min(20rem,85vw)');
    expect(side).toContain('.menu-check:checked+.menu-button::before');
    expect(side).toContain('border-radius:999px');
  });

  test('the ready-made styles each give the new choices a value', () => {
    expect(themeOf(atelier).layout.menu).toEqual({ current: 'pill', phone: 'side' });
    expect(themeOf(studio).layout.header.shrink).toBe(true);
    expect(themeOf(studio).layout.menu).toEqual({ current: 'underline', phone: 'full' });
  });
});

describe('the site says what else the header shows', () => {
  test('a bar, a search and the cart are cleaned; nothing else is kept', () => {
    expect(normalizeSite({ name: 'S', header: { bar: 'Opening Hours', search: true, cart: 'yes', other: 1 } }).header).toEqual({ bar: 'opening-hours', search: true });
    expect(normalizeSite({ name: 'S', header: { search: false } }).header).toBeUndefined();
    expect(normalizeSite({ name: 'S' }).header).toBeUndefined();
  });

  test('the bar shows its section above the header, in each language it is written in', () => {
    const site = normalizeSite({ name: 'S', header: { bar: 'hours' } });
    const hours = normalizePage({ slug: 'hours', title: 'Hours', blocks: [{ id: 'h1', type: 'text', content: { body: [{ type: 'paragraph', children: [{ text: 'Open 9–17' }] }] } }] }).page;
    const { body } = renderParts(withAreas(site, [hours], 'en'), themeOf(plain), page(), MENU);
    expect(body.indexOf('class="site-bar"')).toBeGreaterThan(-1);
    expect(body.indexOf('class="site-bar"')).toBeLessThan(body.indexOf('<header'));
    expect(body).toContain('Open 9–17');
    // A bar whose section is gone, or empty, draws nothing.
    expect(renderParts(withAreas(normalizeSite({ name: 'S', header: { bar: 'gone' } }), [hours], 'en'), themeOf(plain), page(), MENU).body).not.toContain('site-bar');
  });

  test('a search asks the site, with no script; the cart shows only while the shop is on', () => {
    const site = normalizeSite({ name: 'S', header: { search: true, cart: true } });
    const off = renderParts(site, themeOf(plain), page(), MENU).body;
    expect(off).toContain('<details class="site-search">');
    expect(off).toContain('action="/_/search"');
    expect(off).not.toContain('site-cart');
    const on = renderParts({ ...site, shop: { currency: 'RON', vat: true, stock: {} } }, themeOf(plain), page(), MENU).body;
    expect(on).toContain('<a class="site-cart" href="/_/cart">');
    // The editor's search asks nothing.
    expect(renderParts(site, themeOf(plain), page(), MENU, true).body).not.toContain('action="/_/search"');
  });

  test('the menu has a label that closes it, for the panel on a phone', () => {
    const { body } = renderParts(normalizeSite({ name: 'S' }), themeOf(plain), page(), MENU);
    expect(body).toContain('<label class="menu-close" for="site-menu">');
    expect(body).toContain('Close the menu');
  });
});
