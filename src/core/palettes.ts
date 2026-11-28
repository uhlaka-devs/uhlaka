/**
 * Colour palettes for a site (ADR 0083). A palette is the usual colours of a
 * style, for the light and for the dark, made to go together. Choosing one
 * changes only the style's colours; the owner changes any of them after, or
 * makes a palette from a colour of their own. Every pair a site is read by
 * reads at 4.5 : 1 or more in both schemes (`test/palettes.test.ts`).
 */
import { colorPairs, contrast, hexOf, hslOf, MIN_CONTRAST, readableOn, rgbOf } from './contrast.ts';
import { colorsFor, otherScheme, ownScheme, type Scheme, type Theme } from './theme.ts';

/** The colours a palette sets: the ones every style has, and the links. */
export const PALETTE_COLORS = ['background', 'surface', 'text', 'muted', 'border', 'primary', 'on-primary', 'link'] as const;
export type PaletteColor = (typeof PALETTE_COLORS)[number];

export type SchemeColors = Record<PaletteColor, string>;

export interface ColorPalette {
  /** Its name in the language packs (`admin.palettes.<id>`). */
  id: string;
  light: SchemeColors;
  dark: SchemeColors;
}

export const PALETTES: readonly ColorPalette[] = [
  {
    id: 'ocean',
    light: { background: '#f7f9fc', surface: '#ffffff', text: '#0f1b2d', muted: '#4a5873', border: '#dde4ef', primary: '#1d4ed8', 'on-primary': '#ffffff', link: '#1d4ed8' },
    dark: { background: '#0b1220', surface: '#121b2e', text: '#e8eef8', muted: '#9fb0c9', border: '#24314a', primary: '#60a5fa', 'on-primary': '#0b1220', link: '#7cb5fb' },
  },
  {
    id: 'forest',
    light: { background: '#f6f8f4', surface: '#ffffff', text: '#14211a', muted: '#4b5b50', border: '#dce5dc', primary: '#1f6b3a', 'on-primary': '#ffffff', link: '#1f6b3a' },
    dark: { background: '#0d1510', surface: '#142019', text: '#e6efe8', muted: '#9db3a3', border: '#253a2c', primary: '#5fc184', 'on-primary': '#0b1a10', link: '#74cf95' },
  },
  {
    id: 'terracotta',
    light: { background: '#fbf7f3', surface: '#ffffff', text: '#2a1a12', muted: '#6b5446', border: '#eadfd5', primary: '#a8431f', 'on-primary': '#ffffff', link: '#a8431f' },
    dark: { background: '#17110d', surface: '#211813', text: '#f3e9e1', muted: '#bba596', border: '#3a2b22', primary: '#ec8a5f', 'on-primary': '#1d0f08', link: '#f09a73' },
  },
  {
    id: 'plum',
    light: { background: '#faf8fc', surface: '#ffffff', text: '#1e1530', muted: '#5a4f6e', border: '#e6e0ef', primary: '#6d28d9', 'on-primary': '#ffffff', link: '#6d28d9' },
    dark: { background: '#120e1c', surface: '#1b1528', text: '#eee9f7', muted: '#ada3c2', border: '#322846', primary: '#b392f5', 'on-primary': '#160d2a', link: '#bea2f7' },
  },
  {
    id: 'rose',
    light: { background: '#fdf8f8', surface: '#ffffff', text: '#2a1418', muted: '#6b5257', border: '#f0e0e2', primary: '#be123c', 'on-primary': '#ffffff', link: '#be123c' },
    dark: { background: '#170d10', surface: '#221418', text: '#f7e9ec', muted: '#c2a5ab', border: '#3d252b', primary: '#fb7193', 'on-primary': '#24060e', link: '#fc8aa6' },
  },
  {
    id: 'teal',
    light: { background: '#f5faf9', surface: '#ffffff', text: '#0f2422', muted: '#475f5c', border: '#d8e8e5', primary: '#0f766e', 'on-primary': '#ffffff', link: '#0f766e' },
    dark: { background: '#0a1514', surface: '#111f1e', text: '#e3f2f0', muted: '#97b6b2', border: '#203a37', primary: '#3cc7b5', 'on-primary': '#04201c', link: '#5ad3c3' },
  },
  {
    id: 'honey',
    light: { background: '#fcf9f2', surface: '#ffffff', text: '#24190a', muted: '#66573f', border: '#ece2cf', primary: '#8a5a00', 'on-primary': '#ffffff', link: '#8a5a00' },
    dark: { background: '#14110b', surface: '#1e1a12', text: '#f4eee2', muted: '#b8ab92', border: '#383020', primary: '#f2b84b', 'on-primary': '#1a1509', link: '#f2b84b' },
  },
  {
    id: 'graphite',
    light: { background: '#fafafa', surface: '#ffffff', text: '#18181b', muted: '#52525b', border: '#e4e4e7', primary: '#18181b', 'on-primary': '#ffffff', link: '#1d4ed8' },
    dark: { background: '#0c0c0e', surface: '#17171a', text: '#f4f4f5', muted: '#a1a1aa', border: '#2c2c31', primary: '#f4f4f5', 'on-primary': '#18181b', link: '#8ab4f8' },
  },
];

/** The pairs a palette is read by, as `colorPairs` in `contrast.ts` names them. */
export const PALETTE_PAIRS: readonly [PaletteColor, PaletteColor][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['muted', 'background'],
  ['muted', 'surface'],
  ['link', 'background'],
  ['link', 'surface'],
  ['on-primary', 'primary'],
];

/** The pairs of a palette that read under 4.5 : 1, in each scheme. */
export function paletteIssues(palette: Pick<ColorPalette, 'light' | 'dark'>): { scheme: Scheme; text: PaletteColor; on: PaletteColor; ratio: number }[] {
  const issues: { scheme: Scheme; text: PaletteColor; on: PaletteColor; ratio: number }[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    for (const [text, on] of PALETTE_PAIRS) {
      const ratio = contrast(palette[scheme][text], palette[scheme][on]) ?? 0;
      if (ratio < MIN_CONTRAST) issues.push({ scheme, text, on, ratio: Math.floor(ratio * 10) / 10 });
    }
  }
  return issues;
}

const same = (a: string | undefined, b: string): boolean => a?.toLowerCase() === b.toLowerCase();

/** The palette the style's colours are, in both schemes; null when they were changed or are the style's own. */
export function paletteInUse(theme: Theme, palettes: readonly ColorPalette[] = PALETTES): ColorPalette | null {
  const own = theme.tokens.color;
  const other = theme[otherScheme(theme)]?.color ?? {};
  return palettes.find((p) => PALETTE_COLORS.every((name) => same(own[name], p[ownScheme(theme)][name]) && same(other[name] ?? own[name], p[otherScheme(theme)][name]))) ?? null;
}

/**
 * Turn a colour of the style that is not in the palette towards the
 * palette's main colour, when it was a shade of the old main colour (Atelier's
 * `deep`, `tint-1`): it keeps how light and how strong it is. Colours of
 * another hue (a yellow, a green) stay as they are.
 */
function retint(value: string, from: string | undefined, to: string): string {
  const rgb = rgbOf(value);
  const old = rgbOf(from);
  const next = rgbOf(to);
  if (!rgb || !old || !next) return value;
  const [h, s, l] = hslOf(rgb);
  const [oh, os] = hslOf(old);
  const [nh, ns] = hslOf(next);
  const apart = Math.min(Math.abs(h - oh), 360 - Math.abs(h - oh));
  if (s < 0.12 || os < 0.12 || apart > 25) return value;
  return hexOf([nh, ns < 0.12 ? ns : s, l]);
}

/**
 * The style with the palette's colours, in its own scheme and in the other
 * one. Its other colours stay, shades of the old main colour turned to the
 * new one; what the site shows (light, dark or the visitor's) stays.
 */
export function applyPalette(theme: Theme, palette: Pick<ColorPalette, 'light' | 'dark'>): Theme {
  const next = structuredClone(theme);
  const own = ownScheme(theme);
  const other = otherScheme(theme);
  const ownBefore = theme.tokens.color;
  const otherBefore = theme[other]?.color ?? {};
  for (const [name, value] of Object.entries(ownBefore)) {
    if (!(PALETTE_COLORS as readonly string[]).includes(name)) next.tokens.color[name] = retint(value, ownBefore.primary, palette[own].primary);
  }
  Object.assign(next.tokens.color, palette[own]);
  const otherColors: Record<string, string> = {};
  for (const [name, value] of Object.entries(otherBefore)) {
    if (!(PALETTE_COLORS as readonly string[]).includes(name)) otherColors[name] = retint(value, otherBefore.primary ?? ownBefore.primary, palette[other].primary);
  }
  next[other] = { color: { ...otherColors, ...palette[other] } };
  readableExtras(next);
  return next;
}

/**
 * A colour of the style's own that a palette colour is read on (or that is
 * read on one), moved in lightness until the pair reads again, in the scheme
 * where it does not: Atelier's `deep` carries `on-primary`, which a palette
 * may make dark in the dark.
 */
function readableExtras(theme: Theme): void {
  const isOwn = (name: string): boolean => !(PALETTE_COLORS as readonly string[]).includes(name);
  for (const scheme of [ownScheme(theme), otherScheme(theme)]) {
    const colors = colorsFor(theme, scheme);
    const target = scheme === ownScheme(theme) ? theme.tokens.color : (theme[scheme] as { color: Record<string, string> }).color;
    for (const { text, on } of colorPairs(theme)) {
      if ((contrast(colors[text], colors[on]) ?? MIN_CONTRAST) >= MIN_CONTRAST) continue;
      const moved = isOwn(on) ? on : isOwn(text) ? text : null;
      if (!moved) continue;
      const against = moved === on ? colors[text] : colors[on];
      const lighter = (contrast(against, '#000000') ?? 0) < (contrast(against, '#ffffff') ?? 0);
      target[moved] = colors[moved] = readableOn(colors[moved] ?? '', against ?? '', lighter);
    }
  }
}

/** Text for on a fill: white, or a near black of the fill's hue, whichever reads better. */
function textOn(fill: string): string {
  const [h, s] = hslOf(rgbOf(fill) ?? [0, 0, 0]);
  const darkText = hexOf([h, Math.min(s, 0.4), 0.07]);
  return (contrast('#ffffff', fill) ?? 0) >= (contrast(darkText, fill) ?? 0) ? '#ffffff' : darkText;
}

/** A main colour moved in lightness until its own text reads on it. */
function fillWith(value: string, text: string, lighter: boolean): string {
  return (contrast(value, text) ?? 0) >= MIN_CONTRAST ? value : readableOn(value, text, lighter);
}

/**
 * A palette made from one colour the owner picked (ADR 0083 d3): calm
 * neutrals of its hue, the colour as the main one, moved as little as it
 * takes to read, in the light and in the dark.
 */
export function paletteFrom(color: string): Pick<ColorPalette, 'light' | 'dark'> | null {
  const rgb = rgbOf(color);
  if (!rgb) return null;
  const [h, s, l] = hslOf(rgb);
  const tone = Math.min(s, 0.3);
  const n = (sat: number, light: number): string => hexOf([h, sat, light]);

  const lightBg = n(tone * 0.6, 0.975);
  const lightPrimary = fillWith(hexOf([h, s, Math.min(l, 0.5)]), '#ffffff', false);
  const light: SchemeColors = {
    background: lightBg,
    surface: '#ffffff',
    text: n(tone, 0.1),
    muted: n(tone * 0.6, 0.36),
    border: n(tone * 0.6, 0.89),
    primary: lightPrimary,
    'on-primary': '#ffffff',
    link: readableOn(lightPrimary, lightBg, false),
  };

  const darkBg = n(tone * 0.8, 0.08);
  const darkSurface = n(tone * 0.8, 0.12);
  const darkPrimary = hexOf([h, Math.min(s, 0.85), Math.max(l, 0.62)]);
  const onDark = textOn(darkPrimary);
  const dark: SchemeColors = {
    background: darkBg,
    surface: darkSurface,
    text: n(tone * 0.5, 0.94),
    muted: n(tone * 0.5, 0.7),
    border: n(tone * 0.6, 0.22),
    primary: fillWith(darkPrimary, onDark, onDark !== '#ffffff'),
    'on-primary': onDark,
    link: readableOn(darkPrimary, darkSurface, true),
  };
  return { light, dark };
}
