/**
 * The admin's design system (ADR 0084): every colour is a role in
 * src/admin/tokens.css. Screens still written by hand move a part at a time
 * (d6); this holds the line while they do.
 */
import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';

const ADMIN = new URL('../src/admin/', import.meta.url);
/** A colour written by hand in CSS. */
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g;
/** Screens already drawn with the tokens only: a colour by hand here is a mistake. */
const MOVED = ['App.svelte', 'DesignPanel.svelte', 'HeaderPanel.svelte', 'FooterPanel.svelte', 'StyleGallery.svelte', 'SitePanel.svelte'];
/** How many colours by hand the other screens still have. It may only go down: lower it as screens move. */
const CEILING = 228;

async function styles(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const file of (await readdir(ADMIN)).filter((f) => f.endsWith('.svelte'))) {
    const source = await Bun.file(new URL(file, ADMIN)).text();
    out.set(file, [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n'));
  }
  return out;
}

const literals = (css: string): string[] => css.match(LITERAL) ?? [];

test('the screens moved to the tokens write no colour by hand', async () => {
  const all = await styles();
  for (const file of MOVED) {
    expect(all.has(file)).toBe(true);
    expect(`${file}: ${literals(all.get(file)!).join(' ')}`).toBe(`${file}: `);
  }
});

test('the colours written by hand in the admin do not grow', async () => {
  const count = [...(await styles()).values()].reduce((n, css) => n + literals(css).length, 0);
  expect(count).toBeLessThanOrEqual(CEILING);
});

test('the tokens give every role a value for light and for dark', async () => {
  const css = await Bun.file(new URL('tokens.css', ADMIN)).text();
  const light = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const dark = css.slice(css.indexOf(":root[data-scheme='dark']"));
  const roles = (block: string): string[] => [...block.matchAll(/--([a-z-]+):\s*oklch/g)].map((m) => m[1]!).filter((r) => !r.startsWith('elev'));
  expect(roles(light).length).toBeGreaterThanOrEqual(25);
  for (const role of roles(light)) expect(`${role}: ${roles(dark).includes(role)}`).toBe(`${role}: true`);
});

test('the admin page loads the tokens before its own styles', async () => {
  const server = await Bun.file(new URL('../src/site/server.ts', import.meta.url)).text();
  expect(server).toContain('<link rel="stylesheet" href="/admin/admin.css">');
  expect(server).toContain("case '/admin/admin.css':");
});
