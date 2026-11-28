/** ADR 0085 d4: sections, columns and backgrounds, on the group and in a block's style. */
import { describe, expect, test } from 'bun:test';
import { blocksCss, columnCount, countFreeValues, normalizeBlocks, normalizePage, normalizeSite, normalizeStyle, parseTheme, resetToTheme, type Theme } from '../src/core/index.ts';
import { renderParts } from '../src/site/document.ts';
import plain from '../themes/plain.json';

const theme = parseTheme(plain).theme as Theme;
const one = (raw: unknown) => normalizeBlocks([raw]).blocks[0];
const site = normalizeSite({ name: 'S' });
const body = (blocks: unknown[]): string => renderParts(site, theme, normalizePage({ title: 'T', blocks }).page, []).body;
const text = (words: string) => ({ type: 'text', content: { body: [{ type: 'paragraph', children: [{ text: words }] }] } });

describe('a group in columns', () => {
  test('the proportion comes from a closed list; anything else is one under another', () => {
    expect(one({ type: 'group', content: { columns: '1-2', reverse: true } })?.content).toMatchObject({ columns: '1-2', reverse: true });
    expect(one({ type: 'group', content: { columns: '3-1' } })?.content.columns).toBe('');
    expect(one({ type: 'group', content: { columns: 'grid-template-columns:1fr' } })?.content.columns).toBe('');
    expect([columnCount('1-1'), columnCount('1-1-1-1'), columnCount(''), columnCount('x')]).toEqual([2, 4, 1, 1]);
  });

  test('each block is a column, in its proportion; the phone may show the last first', () => {
    const html = body([{ type: 'group', content: { columns: '2-1', reverse: true }, children: [text('Left'), text('Right')] }]);
    expect(html).toContain('class="group cols cols-2-1 reverse"');
    expect(html.indexOf('Left')).toBeLessThan(html.indexOf('Right'));
    expect(body([{ type: 'group', content: { reverse: true }, children: [text('A')] }])).toContain('class="group"');
  });

  test('a picture behind covers the band, hidden from readers when it has no words', () => {
    const html = body([{ type: 'group', content: { image: { src: 'https://example.com/a.jpg', alt: '' } }, children: [text('Over')] }]);
    expect(html).toContain('class="group has-bg"');
    expect(html).toMatch(/<img class="group-bg" src="https:\/\/example.com\/a.jpg"[^>]*alt="" aria-hidden="true"/);
    expect(html).toContain('<span class="group-shade" aria-hidden="true"></span>');
    expect(body([{ type: 'group', content: { image: { src: 'javascript:alert(1)', alt: '' } } }])).not.toContain('group-bg');
  });
});

describe('the look of a band, from closed lists', () => {
  test('choices are names, never CSS; colours are tokens or plain colours', () => {
    const { style, issues } = normalizeStyle({
      height: { value: 'screen' },
      alignY: { value: 'end' },
      overlay: { token: 'primary' },
      overlayStrength: { value: 'deep' },
      gradient: { token: 'surface' },
      gradientDirection: { value: 'across' },
      hideOn: { value: 'phone' },
    });
    expect(issues).toEqual([]);
    expect(Object.keys(style)).toHaveLength(7);
    const bad = normalizeStyle({ height: { value: '100vh' }, alignY: { token: 'center' }, hideOn: { value: 'tablet' }, overlayStrength: { value: '.9' } });
    expect(bad.style).toEqual({});
    expect(bad.issues).toHaveLength(4);
  });

  test('the stylesheet: a tall band centres its content, a gradient runs from its background', () => {
    const blocks = normalizeBlocks([
      { id: 'tall', type: 'group', style: { height: { value: 'screen' } } },
      { id: 'grad', type: 'group', style: { background: { token: 'primary' }, gradient: { token: 'surface' }, gradientDirection: { value: 'right' } } },
      { id: 'shade', type: 'group', style: { overlay: { token: 'primary' }, overlayStrength: { value: 'light' }, alignY: { value: 'end' } } },
    ]).blocks;
    const css = blocksCss(blocks, theme);
    expect(css).toContain('[data-b="tall"][data-b][data-b]{min-height:100svh;display:flex;flex-direction:column;justify-content:var(--b-align-y,center)}');
    expect(css).toContain('--b-gradient:var(--t-color-surface);--b-gradient-dir:90deg;--b-bg:var(--t-color-primary);background-image:linear-gradient(var(--b-gradient-dir,180deg),var(--b-bg,transparent),var(--b-gradient))');
    expect(css).toContain('--b-overlay:var(--t-color-primary);--b-shade:.3;--b-align-y:end');
    expect(css).not.toContain('hideOn');
  });

  test('hidden on a phone or a wide screen is a class of the block; in the editor it is only faded', () => {
    const blocks = [{ id: 'gone', type: 'text', style: { hideOn: { value: 'wide' } }, content: {} }];
    expect(body(blocks)).toMatch(/class="b b-text hide-wide"/);
    const editing = renderParts(site, theme, normalizePage({ title: 'T', blocks }).page, [], true).body;
    expect(editing).toMatch(/class="b b-text cms-hide-wide"/);
    expect(blocksCss(normalizeBlocks(blocks).blocks, theme)).toBe('');
  });

  test('a choice follows no token, so it is not counted as one\'s own and "Reset to theme" keeps it', () => {
    const blocks = normalizeBlocks([{ type: 'group', style: { height: { value: 'half' }, hideOn: { value: 'phone' }, background: { value: '#123456' } } }]).blocks;
    expect(countFreeValues(blocks)).toBe(1);
    expect(resetToTheme(blocks)[0]?.style).toEqual({ height: { value: 'half' }, hideOn: { value: 'phone' } });
  });

  test('a style written before reads and draws as before', () => {
    const blocks = normalizeBlocks([{ id: 'old', type: 'hero', style: { background: { token: 'primary' }, color: { token: 'on-primary' } } }]).blocks;
    expect(blocksCss(blocks, theme)).toBe('[data-b="old"][data-b][data-b]{background-color:var(--t-color-primary);color:var(--t-color-on-primary);--t-color-link:var(--t-color-on-primary)}\n');
  });
});
