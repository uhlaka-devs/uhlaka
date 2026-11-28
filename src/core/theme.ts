/**
 * A theme is a data document (ADR 0001 d8): tokens, the default style of each
 * block type with its named variants, and how the header and footer are laid
 * out (ADR 0006). It holds no code and no CSS text.
 * The theme builder edits this document; `themeCss` in `css.ts` turns it into
 * a stylesheet.
 */
import { BLOCK_TYPES, type BlockType, isBlockType } from './blocks.ts';
import {
  type BlockStyle,
  isFreeValue,
  isTokenName,
  normalizeStyle,
  STYLE_PROPS,
  type StyleProp,
  TOKEN_GROUPS,
  type TokenGroup,
} from './style.ts';
import { fromOldName } from './name.ts';
import { type Issue, isObject, str } from './util.ts';

export const THEME_SPEC = 'uhlaka.theme/1';

export type Tokens = Record<TokenGroup, Record<string, string>>;

export interface BlockTheme {
  style?: BlockStyle;
  variants?: Record<string, BlockStyle>;
}

/**
 * How the parts of the header, and of the footer, sit beside each other. A
 * closed list: a theme picks one by name, and `css.ts` knows what each means.
 */
export const HEADER_ARRANGEMENTS = ['inline', 'centered', 'stacked', 'menu-centre', 'logo-centre'] as const;
export const FOOTER_ARRANGEMENTS = ['inline', 'centered'] as const;
export type HeaderArrangement = (typeof HEADER_ARRANGEMENTS)[number];
export type FooterArrangement = (typeof FOOTER_ARRANGEMENTS)[number];

/** How the menu marks the page one is on, and the item under the pointer (ADR 0085 d3). */
export const MENU_CURRENT = ['colour', 'underline', 'pill'] as const;
export type MenuCurrent = (typeof MENU_CURRENT)[number];
/** Where the menu opens on a phone: under the header, as a panel from the side, or over the whole screen. */
export const MENU_PHONE = ['below', 'side', 'full'] as const;
export type MenuPhone = (typeof MENU_PHONE)[number];

export interface ThemeLayout {
  header: {
    arrangement: HeaderArrangement;
    /** Stays at the top of the screen while the page scrolls. */
    sticky: boolean;
    /** Lies over a page's first block when that is a hero, without a background of its own (ADR 0085 d3). Absent: off. */
    over?: true;
    /** Gets smaller as the page scrolls, while it stays at the top. Absent: off. */
    shrink?: true;
    style?: BlockStyle;
  };
  footer: { arrangement: FooterArrangement; style?: BlockStyle };
  /** The panel a menu item opens (ADR 0008), how the current item is marked, and the menu on a phone. Absent: `colour`, `below`. */
  menu: { style?: BlockStyle; current?: MenuCurrent; phone?: MenuPhone };
  /** The bar above the header (ADR 0085 d3): what it shows is the site's, its look the style's. */
  bar: { style?: BlockStyle };
}

/** The parts of a style's layout. */
export const LAYOUT_PARTS = ['header', 'footer', 'menu', 'bar'] as const;

export const DEFAULT_LAYOUT: ThemeLayout = { header: { arrangement: 'inline', sticky: false }, footer: { arrangement: 'inline' }, menu: {}, bar: {} };

/** Light or dark: what a palette is made for (ADR 0074). */
export const SCHEMES = ['light', 'dark'] as const;
export type Scheme = (typeof SCHEMES)[number];

/**
 * What a site shows (ADR 0074 d2): only its light colours, only its dark ones,
 * or what the visitor's device asks for, with a switch in the header.
 */
export const SHOWS = ['light', 'dark', 'visitor'] as const;
export type Shows = (typeof SHOWS)[number];

/** The colours of the theme's other scheme: only tokens the theme has; one left out keeps its value. */
export interface Palette {
  color: Record<string, string>;
}

export interface Theme {
  spec: typeof THEME_SPEC;
  name: string;
  /** What the theme's own colours (`tokens.color`) are made for. Absent: light. */
  scheme?: 'dark';
  tokens: Tokens;
  /** The colours for the dark, on a theme whose own are light (ADR 0074 d1). */
  dark?: Palette;
  /** The colours for the light, on a theme whose own are dark. */
  light?: Palette;
  /** What the site shows. Absent: the theme's own scheme, as before ADR 0074. */
  shows?: Shows;
  blocks: Partial<Record<BlockType, BlockTheme>>;
  /** Always present once parsed; a theme file written before ADR 0006 gets the default. */
  layout: ThemeLayout;
}

/**
 * Tokens every theme defines. A block bound to one of these looks right under
 * any theme; a theme may add its own, and a reference to a token the current
 * theme lacks falls back to the theme's default for that block.
 */
export const REQUIRED_TOKENS: Record<TokenGroup, readonly string[]> = {
  color: ['background', 'surface', 'text', 'muted', 'border', 'primary', 'on-primary'],
  space: ['xs', 'sm', 'md', 'lg', 'xl'],
  radius: ['none', 'sm', 'md', 'lg'],
  font: ['body', 'heading'],
  size: ['sm', 'base', 'lg', 'xl', '2xl', '3xl'],
  width: ['narrow', 'content', 'wide'],
};

const MAX_TOKENS = 64;
const MAX_VARIANTS = 12;

/** Is the token this style value names one the theme has? */
export function hasToken(theme: Theme, group: TokenGroup, name: string): boolean {
  return Object.hasOwn(theme.tokens[group], name);
}

function checkStyleTokens(theme: Theme, style: BlockStyle, path: string, issues: Issue[]): void {
  for (const [prop, value] of Object.entries(style) as [StyleProp, BlockStyle[StyleProp]][]) {
    if (!value || !('token' in value)) continue;
    const group = STYLE_PROPS[prop].kind as TokenGroup;
    if (!hasToken(theme, group, value.token)) {
      issues.push({ path: `${path}.${prop}`, message: `no ${group} token "${value.token}" in this theme` });
    }
  }
}

/**
 * Untrusted input as a theme. Unlike a block's style, a theme is all or
 * nothing: any issue means the document is refused (`theme` is null), because
 * a half-applied theme is a site that looks broken with no visible reason.
 */
export function parseTheme(input: unknown): { theme: Theme | null; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!isObject(input)) return { theme: null, issues: [{ path: '', message: 'a theme is an object' }] };
  if (fromOldName(input.spec) !== THEME_SPEC) issues.push({ path: 'spec', message: `expected "${THEME_SPEC}"` });

  const name = str(input.name, 80).trim();
  if (!name) issues.push({ path: 'name', message: 'a theme has a name' });

  const tokens = Object.fromEntries(TOKEN_GROUPS.map((g) => [g, {}])) as Tokens;
  const rawTokens = isObject(input.tokens) ? input.tokens : {};
  for (const key of Object.keys(rawTokens)) {
    if (!(TOKEN_GROUPS as readonly string[]).includes(key)) {
      issues.push({ path: `tokens.${key}`, message: 'not a token group' });
    }
  }
  for (const group of TOKEN_GROUPS) {
    const raw = isObject(rawTokens[group]) ? (rawTokens[group] as Record<string, unknown>) : {};
    const entries = Object.entries(raw);
    if (entries.length > MAX_TOKENS) issues.push({ path: `tokens.${group}`, message: `at most ${MAX_TOKENS} tokens` });
    for (const [token, value] of entries.slice(0, MAX_TOKENS)) {
      const at = `tokens.${group}.${token}`;
      if (!isTokenName(token)) issues.push({ path: at, message: 'not a token name' });
      else if (!isFreeValue(group, value)) issues.push({ path: at, message: `not a ${group} value` });
      else tokens[group][token] = value;
    }
    for (const required of REQUIRED_TOKENS[group]) {
      if (!Object.hasOwn(tokens[group], required)) {
        issues.push({ path: `tokens.${group}.${required}`, message: 'every theme defines this token' });
      }
    }
  }

  const theme: Theme = { spec: THEME_SPEC, name, tokens, blocks: {}, layout: structuredClone(DEFAULT_LAYOUT) };
  parseSchemes(input, theme, issues);
  const rawBlocks = isObject(input.blocks) ? input.blocks : {};
  for (const [type, raw] of Object.entries(rawBlocks)) {
    const at = `blocks.${type}`;
    if (!isBlockType(type)) {
      issues.push({ path: at, message: `not a block type (${BLOCK_TYPES.join(', ')})` });
      continue;
    }
    if (!isObject(raw)) {
      issues.push({ path: at, message: 'a block theme is an object' });
      continue;
    }
    const entry: BlockTheme = {};
    if (raw.style !== undefined) {
      const { style, issues: found } = normalizeStyle(raw.style, `${at}.style`);
      issues.push(...found);
      checkStyleTokens(theme, style, `${at}.style`, issues);
      entry.style = style;
    }
    if (raw.variants !== undefined) {
      const variants = isObject(raw.variants) ? Object.entries(raw.variants) : [];
      if (variants.length > MAX_VARIANTS) issues.push({ path: `${at}.variants`, message: `at most ${MAX_VARIANTS} variants` });
      entry.variants = {};
      for (const [variant, rawStyle] of variants.slice(0, MAX_VARIANTS)) {
        const vAt = `${at}.variants.${variant}`;
        if (!isTokenName(variant)) {
          issues.push({ path: vAt, message: 'not a variant name' });
          continue;
        }
        const { style, issues: found } = normalizeStyle(rawStyle, vAt);
        issues.push(...found);
        checkStyleTokens(theme, style, vAt, issues);
        entry.variants[variant] = style;
      }
    }
    theme.blocks[type] = entry;
  }

  if (input.layout !== undefined && !isObject(input.layout)) issues.push({ path: 'layout', message: 'a layout is an object' });
  const rawLayout = isObject(input.layout) ? input.layout : {};
  for (const key of Object.keys(rawLayout)) {
    if (!(LAYOUT_PARTS as readonly string[]).includes(key)) issues.push({ path: `layout.${key}`, message: `not a part of the layout (${LAYOUT_PARTS.join(', ')})` });
  }
  for (const part of LAYOUT_PARTS) {
    const raw = rawLayout[part];
    if (raw === undefined) continue;
    const at = `layout.${part}`;
    if (!isObject(raw)) {
      issues.push({ path: at, message: 'an object' });
      continue;
    }
    const allowed: readonly string[] = part === 'header' ? HEADER_ARRANGEMENTS : part === 'footer' ? FOOTER_ARRANGEMENTS : [];
    if (raw.arrangement !== undefined) {
      if ((part === 'header' || part === 'footer') && typeof raw.arrangement === 'string' && allowed.includes(raw.arrangement)) theme.layout[part].arrangement = raw.arrangement as never;
      else issues.push({ path: `${at}.arrangement`, message: allowed.length ? `one of: ${allowed.join(', ')}` : `the ${part} has no arrangement` });
    }
    if (part === 'header') {
      if (raw.sticky !== undefined) {
        if (typeof raw.sticky === 'boolean') theme.layout.header.sticky = raw.sticky;
        else issues.push({ path: `${at}.sticky`, message: 'true or false' });
      }
      for (const flag of ['over', 'shrink'] as const) {
        if (raw[flag] === undefined) continue;
        if (typeof raw[flag] !== 'boolean') issues.push({ path: `${at}.${flag}`, message: 'true or false' });
        else if (raw[flag]) theme.layout.header[flag] = true;
      }
    } else if (part === 'menu') {
      for (const [key, allowedValues] of [['current', MENU_CURRENT], ['phone', MENU_PHONE]] as const) {
        const value = raw[key];
        if (value === undefined) continue;
        if (typeof value === 'string' && (allowedValues as readonly string[]).includes(value)) {
          // The first of each list is how a menu looked before ADR 0085, and is kept as an absence.
          if (value !== allowedValues[0]) (theme.layout.menu as Record<string, string>)[key] = value;
        } else issues.push({ path: `${at}.${key}`, message: `one of: ${allowedValues.join(', ')}` });
      }
    }
    if (raw.style !== undefined) {
      const { style, issues: found } = normalizeStyle(raw.style, `${at}.style`);
      issues.push(...found);
      checkStyleTokens(theme, style, `${at}.style`, issues);
      if (Object.keys(style).length) theme.layout[part].style = style;
    }
  }

  return issues.length ? { theme: null, issues } : { theme, issues };
}

/** The scheme a theme's own colours are made for. */
export const ownScheme = (theme: Theme): Scheme => theme.scheme ?? 'light';
/** The scheme its second palette is for. */
export const otherScheme = (theme: Theme): Scheme => (ownScheme(theme) === 'light' ? 'dark' : 'light');
/** The second palette's colours, when the theme has one. */
export const otherPalette = (theme: Theme): Record<string, string> | undefined => theme[otherScheme(theme)]?.color;

/** What the site shows under this theme: what the owner chose, if the theme can show it, and otherwise its own scheme. */
export function shownBy(theme: Theme): Shows {
  const shows = theme.shows ?? ownScheme(theme);
  return shows === ownScheme(theme) || otherPalette(theme) ? shows : ownScheme(theme);
}

/** Does the site carry the switch between light and dark (ADR 0074 d4)? Only while it follows the visitor. */
export const hasSchemeSwitch = (theme: Theme): boolean => shownBy(theme) === 'visitor';

/** A theme's colours in one scheme: its own, or its own with the second palette over them. */
export function colorsFor(theme: Theme, scheme: Scheme): Record<string, string> {
  return scheme === ownScheme(theme) ? { ...theme.tokens.color } : { ...theme.tokens.color, ...otherPalette(theme) };
}

/** The scheme of the theme's colours, its second palette, and what the site shows (ADR 0074 d1, d2). */
function parseSchemes(input: Record<string, unknown>, theme: Theme, issues: Issue[]): void {
  if (input.scheme !== undefined) {
    if (input.scheme === 'dark') theme.scheme = 'dark';
    else if (input.scheme !== 'light') issues.push({ path: 'scheme', message: 'light or dark' });
  }
  for (const scheme of SCHEMES) {
    const raw = input[scheme];
    if (raw === undefined) continue;
    if (scheme === ownScheme(theme)) {
      issues.push({ path: scheme, message: `the theme's own colours are ${scheme}: they are its tokens` });
      continue;
    }
    if (!isObject(raw)) {
      issues.push({ path: scheme, message: 'a palette is an object' });
      continue;
    }
    for (const key of Object.keys(raw)) if (key !== 'color') issues.push({ path: `${scheme}.${key}`, message: 'a palette holds only colours' });
    if (raw.color !== undefined && !isObject(raw.color)) issues.push({ path: `${scheme}.color`, message: 'an object' });
    const colors = isObject(raw.color) ? raw.color : {};
    const entries = Object.entries(colors);
    if (entries.length > MAX_TOKENS) issues.push({ path: `${scheme}.color`, message: `at most ${MAX_TOKENS} colours` });
    const palette: Record<string, string> = {};
    for (const [token, value] of entries.slice(0, MAX_TOKENS)) {
      const at = `${scheme}.color.${token}`;
      if (!Object.hasOwn(theme.tokens.color, token)) issues.push({ path: at, message: 'not a colour token of this theme' });
      else if (!isFreeValue('color', value)) issues.push({ path: at, message: 'not a color value' });
      else palette[token] = value;
    }
    theme[scheme] = { color: palette };
  }
  if (input.shows !== undefined) {
    if (typeof input.shows !== 'string' || !(SHOWS as readonly string[]).includes(input.shows)) issues.push({ path: 'shows', message: `one of: ${SHOWS.join(', ')}` });
    else if (input.shows !== ownScheme(theme) && !otherPalette(theme)) issues.push({ path: 'shows', message: `needs the colours for the ${otherScheme(theme)} ("${otherScheme(theme)}")` });
    else if (input.shows !== ownScheme(theme)) theme.shows = input.shows as Shows;
  }
}

/** The variants a block of this type may wear under this theme. */
export function variantsOf(theme: Theme, type: BlockType): string[] {
  return Object.keys(theme.blocks[type]?.variants ?? {});
}
