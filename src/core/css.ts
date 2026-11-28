/**
 * From data to a stylesheet. The only place the core writes CSS, and every
 * value written here has passed `isFreeValue` or names a token.
 */
import type { Block } from './blocks.ts';
import { type BlockStyle, freeValueCss, isFree, isFreeValue, STYLE_PROPS, type StyleProp, TOKEN_GROUPS, type TokenGroup, tokenVar } from './style.ts';
import { colorsFor, type FooterArrangement, hasToken, type HeaderArrangement, otherPalette, otherScheme, ownScheme, type Scheme, shownBy, type Theme } from './theme.ts';
import { isId } from './util.ts';

/**
 * A style as CSS declarations under this theme. A reference to a token the
 * theme does not have writes nothing, so the theme's own default shows; a free
 * value is checked again here, because this is the last step before a browser.
 */
export function declarations(style: BlockStyle | undefined, theme: Theme): string {
  if (!style) return '';
  const out: string[] = [];
  for (const prop of Object.keys(STYLE_PROPS) as StyleProp[]) {
    const value = style[prop];
    if (!value) continue;
    const { kind, css } = STYLE_PROPS[prop];
    if (isFree(value)) {
      if (isFreeValue(kind, value.value)) out.push(`${css}:${freeValueCss(kind, value.value)}`);
    } else if (kind !== 'align' && hasToken(theme, kind as TokenGroup, value.token)) {
      out.push(`${css}:var(${tokenVar(kind as TokenGroup, value.token)})`);
    }
  }
  // A band with its own background and text colour (a hero, a header) has its links and accents in that text colour:
  // the page's link colour is made for the page's background, not the band's (ADR 0074 d1).
  const text = out.find((d) => d.startsWith('color:'));
  if (text && out.some((d) => d.startsWith('background-color:'))) out.push(`--t-color-link:${text.slice('color:'.length)}`);
  return out.join(';');
}

const rule = (selector: string, body: string): string => (body ? `${selector}{${body}}\n` : '');

/** Colour tokens as custom properties; a value that is not plainly a colour writes nothing. */
const colorVars = (colors: Record<string, string>): string[] =>
  Object.entries(colors)
    .filter(([, value]) => isFreeValue('color', value))
    .map(([name, value]) => `${tokenVar('color', name)}:${freeValueCss('color', value)}`);

/** The switch in the header offers the scheme the page is not in (ADR 0074 d4). */
const switchRule = (selector: string, scheme: Scheme): string =>
  `${selector} .scheme-to-${scheme}{display:none}${selector} .scheme-to-${scheme === 'light' ? 'dark' : 'light'}{display:inline-flex}\n`;

/** One scheme's colours, under a selector. */
const schemeRule = (selector: string, theme: Theme, scheme: Scheme): string =>
  rule(selector, [...colorVars(colorsFor(theme, scheme)), `color-scheme:${scheme}`].join(';')) + switchRule(selector, scheme);

/**
 * What each arrangement means. The header and footer are the same HTML under
 * every theme; an arrangement only sets the properties their one flex row
 * reads (`base.css`). So a theme still changes a site's look without changing
 * a byte of its pages.
 */
const HEADER_LAYOUT: Record<HeaderArrangement, string> = {
  inline: '',
  centered: '--l-direction:column;--l-align:center;--l-justify:center;text-align:center',
  stacked: '--l-direction:column;--l-align:flex-start;--l-justify:flex-start',
  'menu-centre': '',
  'logo-centre': '',
};
/** What the two arrangements of ADR 0085 move, on a screen wide enough for the menu (a phone folds it, as under any other). */
const WIDE = '@media (min-width:48.01rem)';
const HEADER_WIDE: Partial<Record<HeaderArrangement, string>> = {
  'menu-centre': '.site-header .site-nav{flex:1 1 auto}.site-header .site-nav>nav{margin-inline:auto}',
  'logo-centre':
    // The name is placed at the middle of the row itself, so what is on either side, however long, does not move it.
    // The menu keeps to its half, short of the name, and wraps inside it when long.
    '.site-header .site-in{flex-wrap:nowrap}.site-header .site-nav{display:contents}.site-header .site-nav>nav{order:-1;max-width:calc(50% - 7rem)}' +
    '.site-header .site-name{position:absolute;left:50%;top:50%;translate:-50% -50%}' +
    '.site-header .site-tools{order:1;margin-inline-start:auto}.site-header .site-nav>.button{order:2}',
};
/** How tall a header is on a wide screen, to leave room for it in the hero it lies over: one row, or the name above the menu. */
const ONE_ROW = 'calc(2.5rem + 2 * var(--t-space-sm))';
const TWO_ROWS = 'calc(4.5rem + 3 * var(--t-space-sm))';
/** The header over a page whose first block is a hero, and that hero (ADR 0085 d3). */
const OVER = '.site-header:has(+.layout>main:first-child>.b-hero:first-child)';
const OVER_HERO = '.site-header+.layout>main:first-child>.b-hero:first-child';
const SCROLLED = '@supports (animation-timeline:scroll())';
/** How the menu marks the current item and the one under the pointer, past the colour of before. */
const MENU_TOP = ['.menu>li>a', '.menu>li>details>summary'];
const MENU_MARKED = ['.menu>li>a[aria-current]', '.menu>li>details>summary.current', '.menu>li>a:hover', '.menu>li>details>summary:hover'];
const MENU_CURRENT_CSS: Record<string, string> = {
  underline: `${MENU_MARKED.map((m) => `.site-header ${m}`).join(',')}{color:inherit;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:.4em}`,
  pill:
    `${MENU_TOP.map((m) => `.site-header ${m}`).join(',')}{padding:.35em .85em;border-radius:999px}` +
    `${MENU_MARKED.map((m) => `.site-header ${m}`).join(',')}{color:inherit;background-color:color-mix(in srgb,currentColor 14%,transparent)}`,
};
/** The menu on a phone, as a panel from the side or over the whole screen; its own label closes it. */
const MENU_PANEL = (whole: boolean): string =>
  '@media (max-width:48rem){' +
  `.site-nav{position:fixed;z-index:20;inset-block:0;inset-inline-end:0;${whole ? 'inset-inline-start:0' : 'width:min(20rem,85vw)'};overflow-y:auto;` +
  'padding:var(--t-space-md);background-color:var(--t-color-surface);color:var(--t-color-text);flex-basis:auto;justify-content:flex-start;box-shadow:0 0 2rem rgb(0 0 0 / .25)}' +
  '.menu-close{display:block;align-self:flex-end;cursor:pointer;font-size:1.5rem;line-height:1;padding:.2em .4em}' +
  (whole ? '' : '.menu-check:checked+.menu-button::before{content:"";position:fixed;inset:0;z-index:19;background:rgb(0 0 0 / .4)}') +
  '}\n';
const FOOTER_LAYOUT: Record<FooterArrangement, string> = {
  inline: '',
  centered: '--l-direction:column;--l-align:center;--l-justify:center;text-align:center',
};
const STICKY = 'position:sticky;top:0;z-index:5';

const join = (...parts: string[]): string => parts.filter(Boolean).join(';');

/** The theme as a stylesheet: its tokens, each block type's default and variants, then the header and footer. */
export function themeCss(theme: Theme, options: { preview?: boolean } = {}): string {
  const shows = shownBy(theme);
  // The colours of the scheme the page starts in: the theme's own, or the other's when the owner chose only that one.
  const first: Scheme = shows === 'visitor' ? ownScheme(theme) : shows;
  const vars: string[] = [];
  for (const group of TOKEN_GROUPS) {
    if (group === 'color') continue;
    for (const [name, value] of Object.entries(theme.tokens[group])) {
      if (isFreeValue(group, value)) vars.push(`${tokenVar(group, name)}:${freeValueCss(group, value)}`);
    }
  }
  let css = rule(':root', [...colorVars(colorsFor(theme, first)), ...vars, ...(otherPalette(theme) || first === 'dark' ? [`color-scheme:${first}`] : [])].join(';'));
  if (otherPalette(theme)) {
    css += switchRule(':root', first);
    const other = otherScheme(theme);
    if (shows === 'visitor') {
      // The device's choice, unless the visitor turned the switch the other way (ADR 0074 d3, d4).
      const unless = `:root:not([data-scheme=${ownScheme(theme)}])`;
      css += `@media (prefers-color-scheme: ${other}){\n${schemeRule(unless, theme, other)}}\n`;
    }
    // What the switch chose, or the editor's preview of either scheme.
    if (shows === 'visitor' || options.preview) {
      for (const scheme of options.preview ? ([ownScheme(theme), other] as Scheme[]) : [other]) css += schemeRule(`:root[data-scheme=${scheme}]`, theme, scheme);
    }
  }
  for (const [type, entry] of Object.entries(theme.blocks)) {
    css += rule(`.b-${type}`, declarations(entry?.style, theme));
    for (const [variant, style] of Object.entries(entry?.variants ?? {})) {
      css += rule(`.b-${type}.v-${variant}`, declarations(style, theme));
    }
  }
  const { header, footer, menu, bar } = theme.layout;
  css += rule('.site-header', join(HEADER_LAYOUT[header.arrangement], header.sticky ? STICKY : '', declarations(header.style, theme)));
  const wide = HEADER_WIDE[header.arrangement];
  if (wide) css += `${WIDE}{${wide}}\n`;
  if (header.over) css += overCss(theme);
  if (header.sticky && header.shrink) {
    css += `${SCROLLED}{.site-header{animation:uh-shrink linear both;animation-timeline:scroll();animation-range:0 6rem}.site-header .site-logo{animation:uh-shrink-logo linear both;animation-timeline:scroll();animation-range:0 6rem}}\n`;
    css += '@keyframes uh-shrink{to{padding-block:var(--t-space-xs)}}@keyframes uh-shrink-logo{to{height:1.75rem}}\n';
  }
  css += rule('.site-footer', join(FOOTER_LAYOUT[footer.arrangement], declarations(footer.style, theme)));
  css += rule('.site-header .sub', declarations(menu.style, theme));
  if (menu.current) css += `${MENU_CURRENT_CSS[menu.current]}\n`;
  if (menu.phone) css += MENU_PANEL(menu.phone === 'full');
  css += rule('.site-bar', declarations(bar.style, theme));
  return css;
}

/**
 * The header over a hero: no background of its own, in the hero's text colour
 * (each variant's own when it sets one), the hero made taller by the header's
 * height so nothing is covered. A header that also stays at the top fills its
 * background in once the page has scrolled; a browser that cannot tie that to
 * the scroll keeps such a header as it was, with its background.
 */
function overCss(theme: Theme): string {
  const { header } = theme.layout;
  const hero = theme.blocks.hero;
  const colorOf = (style: BlockStyle | undefined): string => {
    const value = style?.color;
    if (!value) return '';
    if (isFree(value)) return isFreeValue('color', value.value) ? freeValueCss('color', value.value) : '';
    return hasToken(theme, 'color', value.token) ? `var(${tokenVar('color', value.token)})` : '';
  };
  const room = header.arrangement === 'centered' || header.arrangement === 'stacked' ? TWO_ROWS : ONE_ROW;
  const own = colorOf(hero?.style);
  let colours = own ? rule(OVER, `--over-color:${own}`) : '';
  for (const [variant, style] of Object.entries(hero?.variants ?? {})) {
    const c = colorOf(style);
    if (c) colours += rule(OVER.replace('.b-hero:first-child', `.b-hero.v-${variant}:first-child`), `--over-color:${c}`);
  }
  const lies = `margin-block-end:calc(-1 * var(--over-room));position:${header.sticky ? 'sticky' : 'relative'};z-index:5`;
  const clear = 'background-color:transparent;color:var(--over-color,inherit);--t-color-link:var(--over-color,currentColor)';
  const heroRoom = `${OVER_HERO}{border-block-start:var(--over-room) solid transparent}`;
  const roomVar = `${OVER}{--over-room:${room}}`;
  // Only where the header is one known height: on a phone its parts may take two rows, and it keeps its background, as most themes do there.
  if (!header.sticky) return `${WIDE}{${roomVar}\n${colours}${OVER}{${lies};${clear}}\n${heroRoom}}\n`;
  // Getting smaller is a second animation of the same header: named here too, or this rule, which wins, would drop it.
  const fill = header.shrink
    ? 'animation:uh-fill linear both,uh-shrink linear both;animation-timeline:scroll(),scroll();animation-range:0 var(--over-room),0 6rem'
    : 'animation:uh-fill linear both;animation-timeline:scroll();animation-range:0 var(--over-room)';
  const filled = `background-color:${colorOf({ color: header.style?.background }) || 'var(--t-color-background)'};color:${colorOf(header.style) || 'var(--t-color-text)'}`;
  return (
    `${WIDE}{${SCROLLED}{${roomVar}\n${colours}${OVER}{${lies};${fill}}\n${heroRoom}}}\n` +
    `@keyframes uh-fill{from{${clear}}to{${filled}}}\n`
  );
}

/**
 * The styles the blocks of one page set for themselves. Selected by id and
 * repeated (`[data-b][data-b]`) so a block's own choice always wins over the
 * theme's default and variant for its type.
 */
export function blocksCss(blocks: Block[], theme: Theme): string {
  let css = '';
  const walk = (list: Block[]): void => {
    for (const b of list) {
      if (isId(b.id)) css += rule(`[data-b="${b.id}"][data-b][data-b]`, declarations(b.style, theme));
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return css;
}

/** How many style values on a page are free, i.e. will not follow a theme change. */
export function countFreeValues(blocks: Block[]): number {
  let n = 0;
  for (const b of blocks) {
    n += Object.values(b.style ?? {}).filter((v) => v && isFree(v)).length;
    if (b.children) n += countFreeValues(b.children);
  }
  return n;
}

/** How many colours on a page were chosen by hand: they stay the same in either scheme (ADR 0074 d5). */
export function countFreeColors(blocks: Block[]): number {
  let n = 0;
  for (const b of blocks) {
    n += Object.entries(b.style ?? {}).filter(([prop, v]) => v && isFree(v) && STYLE_PROPS[prop as StyleProp]?.kind === 'color').length;
    if (b.children) n += countFreeColors(b.children);
  }
  return n;
}

/** "Reset to theme": the same blocks with every free value removed. Content is untouched. */
export function resetToTheme(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    const kept = Object.fromEntries(Object.entries(b.style ?? {}).filter(([, v]) => v && !isFree(v))) as BlockStyle;
    const { style: _style, ...rest } = b;
    return {
      ...rest,
      ...(Object.keys(kept).length ? { style: kept } : {}),
      ...(b.children ? { children: resetToTheme(b.children) } : {}),
    };
  });
}
