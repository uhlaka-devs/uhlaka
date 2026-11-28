/** ADR 0085 d5: type, buttons and forms, as names in the style. */
import { describe, expect, test } from 'bun:test';
import { blocksCss, normalizeBlocks, parseTheme, type Theme, themeCss } from '../src/core/index.ts';
import plain from '../themes/plain.json';

const withLayout = (layout: Record<string, unknown>) => parseTheme({ ...plain, layout });
const css = (layout: Record<string, unknown>): string => themeCss(withLayout(layout).theme as Theme);

describe('text, buttons and fields in the style', () => {
  test('the names are read, the first of each list kept as an absence, anything else refused', () => {
    const { theme, issues } = withLayout({
      text: { heading: { weight: 'black', line: 'tight', spacing: 'tight', case: 'upper' }, body: { weight: 'normal', line: 'loose' }, menu: { case: 'upper' }, phone: 'smaller' },
      button: { look: 'outline', hover: 'text' },
      field: { look: 'underline' },
    });
    expect(issues).toEqual([]);
    expect(theme?.layout.text).toEqual({ heading: { weight: 'black', line: 'tight', spacing: 'tight', case: 'upper' }, body: { line: 'loose' }, menu: { case: 'upper' }, phone: 'smaller' });
    expect(theme?.layout.button).toEqual({ look: 'outline', hover: 'text' });
    expect(theme?.layout.field).toEqual({ look: 'underline' });
    expect(withLayout({ button: { look: 'filled' }, field: { look: 'boxed' }, text: { phone: 'same' } }).theme?.layout).toMatchObject({ button: {}, field: {}, text: {} });
    for (const [layout, path] of [
      [{ text: { heading: { weight: 900 } } }, 'layout.text.heading.weight'],
      [{ text: { body: { case: 'upper' } } }, 'layout.text.body.case'],
      [{ text: { menu: { line: 'tight' } } }, 'layout.text.menu.line'],
      [{ text: { footer: {} } }, 'layout.text.footer'],
      [{ button: { look: 'glow' } }, 'layout.button.look'],
      [{ button: { hover: 'nope' } }, 'layout.button.hover'],
      [{ field: { look: 'round' } }, 'layout.field.look'],
    ] as const) {
      expect(withLayout(layout).issues.map((i) => i.path)).toContain(path);
    }
  });

  test('each name is written once as CSS', () => {
    const out = css({ text: { heading: { weight: 'semibold', line: 'tight', case: 'upper' }, menu: { weight: 'medium', spacing: 'wide' }, phone: 'much-smaller' }, button: { look: 'text', hover: 'primary' }, field: { look: 'filled' } });
    expect(out).toContain('h1,h2,h3,h4{font-weight:600;line-height:1.05;text-transform:uppercase}');
    expect(out).toContain('.menu a,.menu summary{font-weight:500;letter-spacing:.05em}');
    expect(out).toContain('@media (max-width:48rem){h1{font-size:min(var(--t-size-xl),8vw)}');
    expect(out).toContain('.button:not(.quiet){background:transparent;color:var(--b-button-bg,var(--t-color-primary));padding-inline:0;text-decoration:underline');
    expect(out).toContain('.button:not(.quiet):hover{color:var(--t-color-primary)}');
    expect(out).toContain('background:var(--t-color-surface);border-color:transparent}');
    expect(css({ button: { hover: 'primary' } })).toContain('.button:not(.quiet):hover{background:var(--t-color-primary)}');
  });

  test('a style written before draws as before', () => {
    const out = themeCss(parseTheme(plain).theme as Theme);
    for (const absent of ['h1,h2,h3,h4{', '.button:not(.quiet)', '.form input:not(']) expect(out).not.toContain(absent);
  });

  test('a shadow and a border are names on a block or the header', () => {
    const theme = parseTheme(plain).theme as Theme;
    const blocks = normalizeBlocks([{ id: 'card', type: 'group', style: { shadow: { value: 'soft' }, border: { value: 'thin' } } }]).blocks;
    expect(blocksCss(blocks, theme)).toContain('box-shadow:0 1px 3px rgb(0 0 0 / .08),0 4px 12px rgb(0 0 0 / .08);border:1px solid var(--t-color-border)');
    expect(normalizeBlocks([{ type: 'group', style: { shadow: { value: '0 0 9px red' } } }]).issues).toHaveLength(1);
    expect(css({ header: { sticky: true, style: { shadow: { value: 'deep' } } } })).toContain('box-shadow:0 4px 8px');
  });
});
