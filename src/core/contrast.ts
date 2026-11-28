/**
 * How readable a theme's colours are, in each of its schemes, and a first
 * proposal for the second palette (ADR 0074 d5). Only `#rgb` and `#rrggbb`
 * colours are measured; any other kind of colour is left out of the check.
 */
import type { BlockStyle } from './style.ts';
import { colorsFor, otherPalette, otherScheme, ownScheme, type Scheme, type Theme } from './theme.ts';

/** WCAG AA for ordinary text. */
export const MIN_CONTRAST = 4.5;

type Rgb = [number, number, number];

export function rgbOf(value: string | undefined): Rgb | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value?.trim() ?? '')?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

const luminance = ([r, g, b]: Rgb): number => {
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** The contrast of two colours, 1 to 21; null when either is not a colour this can measure. */
export function contrast(a: string | undefined, b: string | undefined): number | null {
  const x = rgbOf(a);
  const y = rgbOf(b);
  if (!x || !y) return null;
  const [dark, light] = [luminance(x), luminance(y)].sort((p, q) => p - q) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** A pair of colour tokens: text, and what it is read on. */
export interface ColorPair {
  text: string;
  on: string;
}

export interface ContrastIssue extends ColorPair {
  scheme: Scheme;
  /** Rounded to one decimal. */
  ratio: number;
}

/** The pairs a site is read by under this theme: the theme's own, then each style it sets with both a text and a background colour. */
export function colorPairs(theme: Theme): ColorPair[] {
  const has = (name: string): boolean => Object.hasOwn(theme.tokens.color, name);
  const link = has('link') ? 'link' : 'primary';
  const pairs: ColorPair[] = [
    { text: 'text', on: 'background' },
    { text: 'text', on: 'surface' },
    { text: 'muted', on: 'background' },
    { text: 'muted', on: 'surface' },
    { text: link, on: 'background' },
    { text: 'on-primary', on: 'primary' },
  ];
  const token = (value: BlockStyle[keyof BlockStyle]): string | null => (value && 'token' in value && has(value.token) ? value.token : null);
  const styles: (BlockStyle | undefined)[] = [
    ...Object.values(theme.blocks).flatMap((entry) => [entry?.style, ...Object.values(entry?.variants ?? {})]),
    theme.layout.header.style,
    theme.layout.footer.style,
    theme.layout.menu.style,
    theme.layout.bar.style,
  ];
  for (const style of styles) {
    if (!style) continue;
    const bg = token(style.background);
    const fg = token(style.color);
    if (bg && fg) pairs.push({ text: fg, on: bg });
    const buttonBg = token(style.buttonBackground);
    const buttonFg = token(style.buttonColor);
    if (buttonBg && buttonFg) pairs.push({ text: buttonFg, on: buttonBg });
  }
  const seen = new Set<string>();
  return pairs.filter((p) => has(p.text) && has(p.on) && !seen.has(`${p.text}/${p.on}`) && seen.add(`${p.text}/${p.on}`));
}

/** Each pair that reads under 4.5 : 1, in each scheme the theme has. It warns; nothing is refused for it. */
export function contrastIssues(theme: Theme): ContrastIssue[] {
  const schemes: Scheme[] = otherPalette(theme) ? [ownScheme(theme), otherScheme(theme)] : [ownScheme(theme)];
  const issues: ContrastIssue[] = [];
  for (const scheme of schemes) {
    const colors = colorsFor(theme, scheme);
    for (const pair of colorPairs(theme)) {
      const ratio = contrast(colors[pair.text], colors[pair.on]);
      if (ratio !== null && ratio < MIN_CONTRAST) issues.push({ ...pair, scheme, ratio: Math.floor(ratio * 10) / 10 });
    }
  }
  return issues;
}

type Hsl = [number, number, number];

export function hslOf([r, g, b]: Rgb): Hsl {
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === x ? (y - z) / d + (y < z ? 6 : 0) : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return [h * 60, s, l];
}

export function hexOf([h, s, l]: Hsl): string {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const clamp = (v: number): number => Math.max(0, Math.min(1, v));

/** The same colour, lighter or darker step by step until it reads on `on`; the nearest it gets otherwise. */
export function readableOn(value: string, on: string, lighter: boolean): string {
  const rgb = rgbOf(value);
  if (!rgb) return value;
  const [h, s, l] = hslOf(rgb);
  for (let step = 0; step <= 50; step++) {
    const candidate = hexOf([h, s, clamp(l + (lighter ? step : -step) * 0.02)]);
    if ((contrast(candidate, on) ?? 0) >= MIN_CONTRAST) return candidate;
  }
  return hexOf([h, s, lighter ? 0.97 : 0.05]);
}

/** Where the neutrals land in each scheme: how light each is. */
const NEUTRALS: Record<Scheme, Record<string, number>> = {
  dark: { background: 0.1, surface: 0.15, border: 0.26, text: 0.94, muted: 0.72 },
  light: { background: 0.97, surface: 0.93, border: 0.85, text: 0.1, muted: 0.36 },
};

/**
 * A first second palette for a theme (ADR 0074 d5 "Make it for me"): the
 * neutrals turned around, light fills made deep and deep ones light, the
 * colours that read on another (`on-…`) kept, and `link` moved in lightness
 * until it reads on the new background. The owner adjusts any of it.
 * `link` is what the theme's own colours gain when they have none: the primary.
 */
export function proposePalette(theme: Theme): { palette: Record<string, string>; link?: string } {
  const target = otherScheme(theme);
  const toDark = target === 'dark';
  const own = theme.tokens.color;
  const palette: Record<string, string> = {};
  for (const [name, value] of Object.entries(own)) {
    const rgb = rgbOf(value);
    if (!rgb || name.startsWith('on-') || name === 'link') continue;
    const [h, s, l] = hslOf(rgb);
    const neutral = NEUTRALS[target][name];
    if (neutral !== undefined) palette[name] = hexOf([h, Math.min(s, 0.45), neutral]);
    else if (toDark && l >= 0.8) palette[name] = hexOf([h, s * 0.6, 0.18]);
    else if (toDark && l <= 0.2) palette[name] = hexOf([h, s, 0.06]);
    else if (!toDark && l <= 0.2) palette[name] = hexOf([h, s * 0.6, 0.9]);
    else if (!toDark && l >= 0.8) palette[name] = hexOf([h, s, 0.3]);
  }
  const background = palette.background ?? own.background ?? '';
  const link = own.link ?? own.primary ?? '';
  palette.link = readableOn(link, background, toDark);
  return { palette, ...(own.link === undefined && own.primary ? { link: own.primary } : {}) };
}
