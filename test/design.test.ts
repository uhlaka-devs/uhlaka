import { describe, expect, test } from 'bun:test';
import { DESIGN_PARTS, readyMade, sameTheme, tryTheme } from '../src/admin/themeEdit.ts';
import { parseTheme, type Theme } from '../src/core/index.ts';
import atelier from '../themes/atelier.json';
import plain from '../themes/plain.json';
import studio from '../themes/studio.json';

const parsed = (raw: unknown): Theme => {
  const { theme } = parseTheme(raw);
  if (!theme) throw new Error('not a theme');
  return theme;
};
const ready = [atelier, plain, studio].map(parsed);

describe('Design (ADR 0082)', () => {
  test('has four parts beside the page: the style, the header, text and buttons (ADR 0085 d5), the footer', () => {
    expect([...DESIGN_PARTS]).toEqual(['style', 'header', 'text', 'footer']);
  });

  test('a ready-made style is known as itself, whatever the order of its keys', () => {
    const reversed = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(reversed) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reversed(x)])) : v;
    const shuffled = reversed(ready[1]) as Theme;
    expect(sameTheme(shuffled, ready[1] as Theme)).toBe(true);
    expect(readyMade(shuffled, ready)?.name).toBe('Plain');
  });

  test('a style changed by hand, or renamed, is no longer the ready-made one: choosing another asks first', () => {
    const sticky = tryTheme(ready[1] as Theme, (d) => { d.layout.header.sticky = !d.layout.header.sticky; }, 'invalid');
    expect(sticky.problem).toBe('');
    expect(readyMade(sticky.theme as Theme, ready)).toBeNull();
    const renamed = tryTheme(ready[0] as Theme, (d) => { d.name = 'Mine'; }, 'invalid');
    expect(readyMade(renamed.theme as Theme, ready)).toBeNull();
  });

  test('a change that would leave the style invalid is not made, and says why', () => {
    const bad = tryTheme(ready[0] as Theme, (d) => { d.tokens.color.primary = 'url(https://evil.example)'; }, 'invalid');
    expect(bad.theme).toBeNull();
    expect(bad.problem).toContain('primary');
    const untouched = ready[0] as Theme;
    expect(untouched.tokens.color.primary).toBe('#2337a8');
  });
});
