/**
 * The admin's design system (ADR 0084): every colour is a role in
 * src/admin/tokens.css, so light and dark are two sets of values for the
 * same names and no screen shows a light box on a dark admin.
 */
import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';

const ADMIN = new URL('../src/admin/', import.meta.url);
/** A colour written by hand in CSS. */
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g;
/**
 * The only colours by hand allowed: the search preview draws a result as the
 * search engine shows it, in its own colours, whatever the admin looks like.
 */
const ALLOWED: Record<string, string[]> = { 'SeoPanel.svelte': ['#1a0dab', '#4d5156'] };

async function styles(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const file of (await readdir(ADMIN)).filter((f) => f.endsWith('.svelte'))) {
    const source = await Bun.file(new URL(file, ADMIN)).text();
    out.set(file, [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n'));
  }
  return out;
}

const literals = (css: string): string[] => css.match(LITERAL) ?? [];

test('no screen of the admin writes a colour by hand', async () => {
  const all = await styles();
  expect(all.size).toBeGreaterThanOrEqual(50);
  for (const [file, css] of all) {
    const own = literals(css).filter((c) => !(ALLOWED[file] ?? []).includes(c.toLowerCase()));
    expect(`${file}: ${own.join(' ')}`).toBe(`${file}: `);
  }
});

test('text sizes are on the scale', async () => {
  for (const [file, css] of await styles()) {
    const own = [...css.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1]!.trim()).filter((v) => /^[\d.]+(px|rem)$/.test(v));
    expect(`${file}: ${own.join(' ')}`).toBe(`${file}: `);
  }
});

test('light, dark or like the device can be chosen in the settings and the profile', async () => {
  for (const file of ['SitePanel.svelte', 'Profile.svelte']) expect(await Bun.file(new URL(file, ADMIN)).text()).toContain('<SchemeChoice />');
});

test('the tokens give every role a value for light and for dark', async () => {
  const css = await Bun.file(new URL('tokens.css', ADMIN)).text();
  const light = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const dark = css.slice(css.indexOf('prefers-color-scheme: dark'));
  const roles = (block: string): string[] => [...block.matchAll(/--([a-z-]+):\s*oklch/g)].map((m) => m[1]!).filter((r) => !r.startsWith('elev'));
  expect(roles(light).length).toBeGreaterThanOrEqual(25);
  for (const role of roles(light)) expect(`${role}: ${roles(dark).includes(role)}`).toBe(`${role}: true`);
});

test('the admin page loads the tokens before its own styles', async () => {
  const server = await Bun.file(new URL('../src/site/server.ts', import.meta.url)).text();
  expect(server).toContain('<link rel="stylesheet" href="/admin/admin.css">');
  expect(server).toContain("case '/admin/admin.css':");
});
