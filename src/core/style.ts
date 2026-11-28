/**
 * A block's style: how this one block departs from the theme (ADR 0001 d7).
 *
 * Every value is either a reference to a theme token, which follows the theme
 * when it changes, or a free value, which stays as the author set it. Both end
 * up inside a stylesheet, so a free value is accepted only when it is plainly a
 * colour, a length or a known name. Nothing is escaped: what does not match is
 * dropped.
 */
import { type Issue, isObject } from './util.ts';

export type StyleValue = { token: string } | { value: string };

/** What a property holds; also the theme's token groups (all but `align`). */
export type StyleKind = 'color' | 'space' | 'radius' | 'font' | 'size' | 'width' | 'align' | 'choice';

export const TOKEN_GROUPS = ['color', 'space', 'radius', 'font', 'size', 'width'] as const;
export type TokenGroup = (typeof TOKEN_GROUPS)[number];

/** The properties a block may set. A closed list that grows on purpose. */
export const STYLE_PROPS = {
  background: { kind: 'color', css: 'background-color' },
  color: { kind: 'color', css: 'color' },
  paddingBlock: { kind: 'space', css: 'padding-block' },
  paddingInline: { kind: 'space', css: 'padding-inline' },
  marginBlock: { kind: 'space', css: 'margin-block' },
  gap: { kind: 'space', css: '--b-gap' },
  radius: { kind: 'radius', css: 'border-radius' },
  fontFamily: { kind: 'font', css: 'font-family' },
  fontSize: { kind: 'size', css: 'font-size' },
  maxWidth: { kind: 'width', css: '--b-width' },
  textAlign: { kind: 'align', css: 'text-align' },
  /** The colours of the buttons inside the block (ADR 0068 d2). */
  buttonBackground: { kind: 'color', css: '--b-button-bg' },
  buttonColor: { kind: 'color', css: '--b-button-fg' },
  /** A section's look (ADR 0085 d4): the colour over its picture and how strong it is. */
  overlay: { kind: 'color', css: '--b-overlay' },
  overlayStrength: { kind: 'choice', css: '--b-shade' },
  /** A gradient from the block's background to this colour, in one of a few directions. */
  gradient: { kind: 'color', css: '--b-gradient' },
  gradientDirection: { kind: 'choice', css: '--b-gradient-dir' },
  height: { kind: 'choice', css: 'min-height' },
  alignY: { kind: 'choice', css: '--b-align-y' },
  /** A shadow and a border (ADR 0085 d5): names, each written once below. */
  shadow: { kind: 'choice', css: 'box-shadow' },
  border: { kind: 'choice', css: 'border' },
  /** Drawn as a class of the block (`hide-phone`, `hide-wide`), not as a declaration. */
  hideOn: { kind: 'choice', css: '' },
} as const satisfies Record<string, { kind: StyleKind; css: string }>;

export type StyleProp = keyof typeof STYLE_PROPS;
export type BlockStyle = Partial<Record<StyleProp, StyleValue>>;

export const isStyleProp = (v: string): v is StyleProp => Object.hasOwn(STYLE_PROPS, v);

/**
 * The names a `choice` property takes, each with the CSS it writes (ADR 0085
 * d4). A closed list: a choice is a name, so it follows no token and is never
 * counted as a value of one's own.
 */
export const STYLE_CHOICES: Partial<Record<StyleProp, Record<string, string>>> = {
  overlayStrength: { light: '.3', medium: '.5', deep: '.7' },
  gradientDirection: { down: '180deg', right: '90deg', across: '135deg' },
  height: { half: '50svh', screen: '100svh' },
  alignY: { start: 'start', center: 'center', end: 'end' },
  hideOn: { phone: '', wide: '' },
  shadow: { soft: '0 1px 3px rgb(0 0 0 / .08),0 4px 12px rgb(0 0 0 / .08)', deep: '0 4px 8px rgb(0 0 0 / .1),0 16px 40px rgb(0 0 0 / .18)' },
  border: { thin: '1px solid var(--t-color-border)', thick: '3px solid var(--t-color-border)' },
};

/** The properties of a band (ADR 0085 d4): offered for a block, not for the header, the menu or the footer. */
export const BAND_PROPS: readonly StyleProp[] = ['overlay', 'overlayStrength', 'gradient', 'gradientDirection', 'height', 'alignY', 'hideOn'];
/** Only a group has a picture behind it, so only a group has a colour over it. */
export const PICTURE_PROPS: readonly StyleProp[] = ['overlay', 'overlayStrength'];
/** The properties a block of this type offers: in the block's own style (`own`), or in a theme's default for the type. */
export const stylePropsFor = (type: string, own: boolean): StyleProp[] =>
  (Object.keys(STYLE_PROPS) as StyleProp[]).filter((prop) => (type === 'group' || !PICTURE_PROPS.includes(prop)) && (own || prop !== 'hideOn'));

/** The CSS of a choice, or null when the name is not one of the property's. */
export const choiceCss = (prop: StyleProp, name: unknown): string | null => {
  const list = STYLE_CHOICES[prop];
  return list && typeof name === 'string' && Object.hasOwn(list, name) ? (list[name] as string) : null;
};

/**
 * Typefaces a site may use (ADR 0085 d6). A name from one of three lists, never
 * a CSS stack typed in:
 *
 * - a stack of this list: a face Uhlaka carries (`fonts/`, served by the site,
 *   ADR 0068 d1), or a typeface the visitor's device already has;
 * - `google:<family>`: a Google Fonts family the site downloaded once and serves
 *   as its own;
 * - `own:<name>`: a face the owner uploaded.
 *
 * Every stack ends in the Noto families of the other scripts, so a word in
 * Arabic, Hebrew, Thai or Chinese is drawn by a face the site carries too.
 */
const SANS_SCRIPTS = '"Noto Sans", "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans Bengali", "Noto Sans Tamil", "Noto Sans Thai", "Noto Sans Georgian", "Noto Sans Armenian", "Noto Sans SC", "Noto Sans TC", "Noto Sans JP", "Noto Sans KR"';
const SERIF_SCRIPTS = SANS_SCRIPTS.replace('"Noto Sans", ', '"Noto Serif", ');
export const FONT_STACKS = {
  system: `system-ui, -apple-system, "Segoe UI", Roboto, ${SANS_SCRIPTS}, sans-serif`,
  humanist: `Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", ${SANS_SCRIPTS}, sans-serif`,
  geometric: `Avenir, Montserrat, Corbel, "URW Gothic", ${SANS_SCRIPTS}, sans-serif`,
  serif: `Charter, "Bitstream Charter", "Sitka Text", Cambria, ${SERIF_SCRIPTS}, serif`,
  oldstyle: `"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, ${SERIF_SCRIPTS}, serif`,
  mono: `ui-monospace, "Cascadia Code", Menlo, Consolas, ${SANS_SCRIPTS}, monospace`,
  bricolage: `"Bricolage Grotesque", Avenir, Montserrat, Corbel, ${SANS_SCRIPTS}, sans-serif`,
  figtree: `Figtree, Seravek, "Gill Sans Nova", Ubuntu, Calibri, ${SANS_SCRIPTS}, sans-serif`,
  inter: `Inter, ${SANS_SCRIPTS}, system-ui, sans-serif`,
  manrope: `Manrope, ${SANS_SCRIPTS}, system-ui, sans-serif`,
  literata: `Literata, ${SERIF_SCRIPTS}, Georgia, serif`,
  garamond: `"EB Garamond", ${SERIF_SCRIPTS}, Garamond, serif`,
  jetbrains: `"JetBrains Mono", ${SANS_SCRIPTS}, ui-monospace, monospace`,
  'noto-sans': `${SANS_SCRIPTS}, sans-serif`,
  'noto-serif': `${SERIF_SCRIPTS}, serif`,
} as const;
export type FontStack = keyof typeof FONT_STACKS;

/** Where the site serves its faces: the ones Uhlaka carries, and the ones it downloaded or was given. */
export const FONTS_PATH = '/assets/fonts/';

/** Where a font of the site's own comes from (ADR 0085 d6). */
export const FONT_SOURCES = ['google', 'own'] as const;
export type FontSource = (typeof FONT_SOURCES)[number];
/** `google:playfair-display`, `own:brand-sans`: a source and a name of lowercase letters, digits and dashes. */
const SITE_FONT = /^(google|own):([a-z0-9][a-z0-9-]{0,47})$/;

/** Whether `value` names a font of the site's own (`google:…`, `own:…`); whether the site has it is the site's question. */
export const isSiteFont = (value: unknown): value is string => typeof value === 'string' && SITE_FONT.test(value);
/** A family's name as a font name's part: `Playfair Display` → `playfair-display`. Empty when nothing is left. */
export const fontSlug = (family: string): string =>
  family
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
/**
 * The CSS family a font of the site's own is declared under: its name, with the
 * colon as a dash, so it never meets the name of a face the device has.
 */
export const siteFontFamily = (name: string): string => name.replace(':', '-');

/** Whether `value` is a font a style may name: a stack of the list, or a font of the site's own. */
export const isFontName = (value: unknown): value is string => typeof value === 'string' && (Object.hasOwn(FONT_STACKS, value) || isSiteFont(value));

/** The CSS of a font name; a font of the site's own falls back to the other scripts, then to the device's. */
export const fontStack = (value: string): string =>
  Object.hasOwn(FONT_STACKS, value) ? FONT_STACKS[value as FontStack] : isSiteFont(value) ? `"${siteFontFamily(value)}", ${SANS_SCRIPTS}, system-ui, sans-serif` : FONT_STACKS.system;

/** One `@font-face`: a file of one family, for a range of weights, one style and the characters of `range`. */
export interface FontFace {
  family: string;
  file: string;
  /** `400`, or a range of a variable face: `200 800`. */
  weight: string;
  style: 'normal' | 'italic';
  /** A CSS `unicode-range`, as the file covers it; empty: every character. */
  range: string;
}

const FAMILY = /^[A-Za-z0-9 -]{1,64}$/;
const FILE = /^[a-z0-9][a-z0-9.-]{0,95}\.woff2$/;
const WEIGHT = /^[1-9]00( [1-9]00)?$|^[1-9]\d{1,2}( [1-9]\d{1,2})?$/;
const RANGE = /^U\+[0-9A-F?]{1,6}(-[0-9A-F]{1,6})?(, ?U\+[0-9A-F?]{1,6}(-[0-9A-F]{1,6})?)*$/i;
/** A face as a site keeps it, or null: every part ends up inside a stylesheet, so each is checked. */
export function cleanFontFace(input: unknown): FontFace | null {
  if (typeof input !== 'object' || input === null) return null;
  const { family, file, weight, style, range } = input as Record<string, unknown>;
  if (typeof family !== 'string' || !FAMILY.test(family) || typeof file !== 'string' || !FILE.test(file)) return null;
  if (typeof weight !== 'string' || !WEIGHT.test(weight) || (style !== 'normal' && style !== 'italic')) return null;
  if (typeof range !== 'string' || (range !== '' && !RANGE.test(range))) return null;
  return { family, file, weight, style, range };
}

/** A `unicode-range` as intervals of code points; empty means every character. */
export function rangeIntervals(range: string): [number, number][] {
  if (!range) return [[0, 0x10ffff]];
  return range.split(',').map((part) => {
    const [from, to] = part.trim().slice(2).split('-') as [string, string | undefined];
    if (from.includes('?')) return [parseInt(from.replace(/\?/g, '0'), 16), parseInt(from.replace(/\?/g, 'F'), 16)];
    return [parseInt(from, 16), parseInt(to ?? from, 16)];
  });
}

/** The device's own typefaces, at the head of a stack; every device draws Latin, Greek and Cyrillic, and the signs between words. */
const DEVICE = '';
const DEVICE_COVERS: readonly [number, number][] = [
  [0, 0x052f],
  [0x1e00, 0x1fff],
  [0x2000, 0x20cf],
  [0x2100, 0x215f],
  [0x2190, 0x21ff],
  [0x2200, 0x22ff],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

/** The families a CSS font stack names, in its order: `"Bricolage Grotesque", Avenir, sans-serif` → three. */
const familiesOf = (stack: string): string[] => stack.split(',').map((f) => f.trim().replace(/^"|"$/g, ''));

/**
 * The faces a site needs: those of the families its stylesheet names, through
 * a stack. Given the characters its pages hold (`chars`), only the faces that
 * draw one of them: for each character, the first family of the stack with a
 * face for it. A Romanian page carries Latin; it never carries Japanese.
 */
export function facesUsed(css: Iterable<string>, faces: readonly FontFace[], chars?: Set<number>): FontFace[] {
  const families = new Set(faces.map((f) => f.family));
  const stacks: string[][] = [];
  const named = new Set<string>();
  const seen = new Set<string>();
  for (const text of css)
    for (const match of text.matchAll(/font-family:([^;}]+)|--t-font-[a-z0-9-]+:([^;}]+)/g)) {
      const stack = (match[1] ?? match[2] ?? '').trim();
      if (seen.has(stack)) continue;
      seen.add(stack);
      const all = familiesOf(stack);
      const list = all.filter((f) => families.has(f));
      if (!list.length) continue;
      // A stack that starts with the device's typefaces leaves to them the letters every device has.
      stacks.push(families.has(all[0] as string) ? list : [DEVICE, ...list]);
      for (const f of list) named.add(f);
    }
  if (!chars) return faces.filter((f) => named.has(f.family));
  const ranges = new Map(faces.map((f) => [f, rangeIntervals(f.range)] as const));
  const covers = (face: FontFace, c: number): boolean => (ranges.get(face) ?? []).some(([a, b]) => c >= a && c <= b);
  const byFamily = new Map<string, FontFace[]>();
  for (const f of faces) byFamily.set(f.family, [...(byFamily.get(f.family) ?? []), f]);
  const used = new Set<FontFace>();
  for (const c of chars) {
    if (c < 0x20) continue;
    for (const stack of stacks)
      for (const family of stack) {
        if (family === DEVICE) {
          if (DEVICE_COVERS.some(([a, b]) => c >= a && c <= b)) break;
          continue;
        }
        const covering = (byFamily.get(family) ?? []).filter((f) => covers(f, c));
        if (!covering.length) continue;
        for (const f of covering) used.add(f);
        break;
      }
  }
  return faces.filter((f) => used.has(f));
}

/** The characters of these texts, for `facesUsed`; markup is read as text, which only adds a few Latin letters. */
export function charsOf(texts: Iterable<string>): Set<number> {
  const chars = new Set<number>();
  for (const text of texts) for (const c of text) chars.add(c.codePointAt(0) as number);
  return chars;
}

/** These faces as `@font-face` rules, each file under `FONTS_PATH`. */
export const fontFacesCss = (faces: readonly FontFace[]): string =>
  faces
    .map((f) => `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};font-display:swap;src:url(${FONTS_PATH}${f.file}) format("woff2")${f.range ? `;unicode-range:${f.range}` : ''}}\n`)
    .join('');

export const ALIGNMENTS = ['start', 'center', 'end'] as const;

const TOKEN_NAME = /^[a-z0-9][a-z0-9-]{0,30}$/;
const COLOR =
  /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|oklch\(\d{1,3}(\.\d{1,4})?%? \d(\.\d{1,4})? \d{1,3}(\.\d{1,4})?( ?\/ ?(0|1|0?\.\d{1,3}))?\))$/i;
const LENGTH = /^(0|\d{1,4}(\.\d{1,4})?(rem|em|px|%|vw|vh|ch))$/;

export const isTokenName = (v: unknown): v is string => typeof v === 'string' && TOKEN_NAME.test(v);

/** Whether `value` is a literal this kind accepts. The one gate to a stylesheet. */
export function isFreeValue(kind: StyleKind, value: unknown, prop?: StyleProp): value is string {
  if (typeof value !== 'string') return false;
  switch (kind) {
    case 'choice':
      return !!prop && choiceCss(prop, value) !== null;
    case 'color':
      return COLOR.test(value);
    case 'space':
    case 'radius':
    case 'size':
    case 'width':
      return LENGTH.test(value);
    case 'font':
      return isFontName(value);
    case 'align':
      return (ALIGNMENTS as readonly string[]).includes(value);
  }
}

/** The CSS text of a checked free value. */
export function freeValueCss(kind: StyleKind, value: string, prop?: StyleProp): string {
  if (kind === 'choice') return (prop && choiceCss(prop, value)) || '';
  return kind === 'font' ? fontStack(value) : value;
}

export const tokenVar = (group: TokenGroup, name: string): string => `--t-${group}-${name}`;

/**
 * Untrusted input as a clean style. A property that is unknown, or a value
 * that is neither a well-formed token reference nor a valid literal, is left
 * out and reported. Whether a referenced token exists is the theme's question,
 * answered when the page is drawn.
 */
export function normalizeStyle(input: unknown, path = 'style'): { style: BlockStyle; issues: Issue[] } {
  const style: BlockStyle = {};
  const issues: Issue[] = [];
  if (input === undefined || input === null) return { style, issues };
  if (!isObject(input)) return { style, issues: [{ path, message: 'a style is an object' }] };

  for (const [prop, raw] of Object.entries(input)) {
    const at = `${path}.${prop}`;
    if (!isStyleProp(prop)) {
      issues.push({ path: at, message: 'not a style property' });
      continue;
    }
    const kind: StyleKind = STYLE_PROPS[prop].kind;
    if (!isObject(raw)) {
      issues.push({ path: at, message: 'a style value is { token } or { value }' });
    } else if ('token' in raw) {
      if (kind === 'align' || kind === 'choice') issues.push({ path: at, message: 'this property has no tokens' });
      else if (isTokenName(raw.token)) style[prop] = { token: raw.token };
      else issues.push({ path: at, message: 'not a token name' });
    } else if (isFreeValue(kind, raw.value, prop)) {
      style[prop] = { value: raw.value };
    } else {
      issues.push({ path: at, message: `not a ${kind} value` });
    }
  }
  return { style, issues };
}

export const isFree = (v: StyleValue): v is { value: string } => 'value' in v;

/**
 * A value the author typed or picked that will not follow the theme: a free
 * value, but not a choice from a closed list (a height, where it is hidden),
 * which means the same under every theme and is kept by "Reset to theme".
 */
export const isOwnValue = (prop: string, v: StyleValue | undefined): boolean => !!v && isFree(v) && !(isStyleProp(prop) && STYLE_PROPS[prop].kind === 'choice');
