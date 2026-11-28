/**
 * A change to the theme, tried on a copy first (ADR 0004 d2). The panels of
 * Design (ADR 0082) all change the one theme of the site: the style, the
 * header and the footer. Each goes through here, so a change that would leave
 * the theme invalid is never made, wherever it was asked for.
 */
import { parseTheme, type Theme } from '../core/index.ts';

export type Tried = { theme: Theme; problem: '' } | { theme: null; problem: string };

export function tryTheme(theme: Theme, mutate: (draft: Theme) => void, invalid: string): Tried {
  const draft = structuredClone(theme);
  mutate(draft);
  const { theme: valid, issues } = parseTheme(draft);
  if (!valid) return { theme: null, problem: issues[0] ? `${issues[0].path}: ${issues[0].message}` : invalid };
  return { theme: valid, problem: '' };
}

/** The themes are the same document, apart from the order of their keys. */
const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, sorted(v)]))
      : value;
export const sameTheme = (a: Theme, b: Theme): boolean => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/**
 * The ready-made style the site's theme is, untouched; null when it was
 * changed since, or is not one of them (ADR 0082 d4).
 */
export const readyMade = (theme: Theme, ready: Theme[]): Theme | null => ready.find((r) => r.name === theme.name && sameTheme(r, theme)) ?? null;

/** The parts of Design, as the page shows them (ADR 0082 d2). */
export const DESIGN_PARTS = ['style', 'header', 'text', 'blog', 'footer'] as const;
export type DesignPart = (typeof DESIGN_PARTS)[number];

/** Every face the site may draw with, Uhlaka's and its own, as `@font-face` rules (ADR 0085 d6): for the admin's samples. */
export const FACES_CSS = '/admin/fonts.css';
