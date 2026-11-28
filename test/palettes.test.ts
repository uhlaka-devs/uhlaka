import { describe, expect, test } from 'bun:test';
import { applyPalette, contrastIssues, PALETTE_COLORS, paletteFrom, paletteInUse, paletteIssues, PALETTES, parseTheme, shownBy, type Theme } from '../src/core/index.ts';
import { en } from '../src/admin/messages.ts';
import ro from '../languages/ro.json';
import atelier from '../themes/atelier.json';
import plain from '../themes/plain.json';
import studio from '../themes/studio.json';

const parsed = (raw: unknown): Theme => {
  const { theme } = parseTheme(raw);
  if (!theme) throw new Error('not a theme');
  return theme;
};
const ready = [atelier, plain, studio].map(parsed);

describe('colour palettes (ADR 0083)', () => {
  test('every palette reads at 4.5 : 1 or more, in the light and in the dark', () => {
    for (const palette of PALETTES) expect({ id: palette.id, issues: paletteIssues(palette) }).toEqual({ id: palette.id, issues: [] });
  });

  test('every palette sets every colour, in both schemes, and has a name in each language', () => {
    for (const palette of PALETTES) {
      for (const scheme of ['light', 'dark'] as const) expect(Object.keys(palette[scheme]).sort()).toEqual([...PALETTE_COLORS].sort());
      expect(en.palettes.names[palette.id]).toBeTruthy();
      expect((ro as unknown as Record<string, string>)[`admin.palettes.names.${palette.id}`]).toBeTruthy();
    }
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
  });

  test('on every ready-made style, a palette leaves a valid style that reads everywhere and knows itself', () => {
    for (const theme of ready) {
      for (const palette of PALETTES) {
        const next = applyPalette(theme, palette);
        expect(parseTheme(next).issues).toEqual([]);
        expect({ style: theme.name, palette: palette.id, issues: contrastIssues(next) }).toEqual({ style: theme.name, palette: palette.id, issues: [] });
        expect(paletteInUse(next)?.id).toBe(palette.id);
        expect(shownBy(next)).toBe(shownBy(theme));
        expect(next.tokens.font).toEqual(theme.tokens.font);
        expect(next.layout).toEqual(theme.layout);
      }
    }
  });

  test('a dark style takes the dark colours as its own and the light as its second palette', () => {
    const studioTheme = ready[2] as Theme;
    const ocean = PALETTES.find((p) => p.id === 'ocean')!;
    const next = applyPalette(studioTheme, ocean);
    expect(next.tokens.color.background).toBe(ocean.dark.background);
    expect(next.light?.color.background).toBe(ocean.light.background);
  });

  test('shades of the old main colour follow the new one; colours of another hue stay', () => {
    const atelierTheme = ready[0] as Theme;
    const next = applyPalette(atelierTheme, PALETTES.find((p) => p.id === 'forest')!);
    expect(next.tokens.color.deep).not.toBe(atelierTheme.tokens.color.deep);
    expect(next.tokens.color.sun).toBe(atelierTheme.tokens.color.sun);
  });

  test('a colour changed by hand is no longer the palette', () => {
    const next = applyPalette(ready[1] as Theme, PALETTES[0]!);
    next.tokens.color.primary = '#ff0000';
    expect(paletteInUse(next)).toBeNull();
  });

  test('a palette made from any colour reads in both schemes', () => {
    for (const color of ['#ff0000', '#ffd24d', '#00ff88', '#2337a8', '#888888', '#000000', '#ffffff', '#e91e63', '#7dd3fc', '#abc']) {
      const made = paletteFrom(color);
      expect(made).not.toBeNull();
      expect({ color, issues: paletteIssues(made!) }).toEqual({ color, issues: [] });
    }
    expect(paletteFrom('red')).toBeNull();
  });
});
