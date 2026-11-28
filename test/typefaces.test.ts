/**
 * Typefaces (ADR 0085 d6): Uhlaka's own for every common script, Google Fonts
 * served by the site, and faces the owner bought. Every face is served by the
 * site; a page carries only the files its letters need.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { charsOf, cleanFontFace, facesUsed, type FontFace, fontFacesCss, fontSlug, fontStack, isFontName, isSiteFont, normalizeStyle, parseTheme, rangeIntervals, siteFontFamily } from '../src/core/index.ts';
import { publishedSite } from '../src/site/export.ts';
import { downloadGoogle, GOOGLE_CATALOGUE_DATE, GOOGLE_FAMILIES, googleCssUrl, googleFamily, googleFamilyBySlug, isWoff2, parseGoogleCss } from '../src/site/google-fonts.ts';
import { startEditor } from '../src/site/server.ts';
import { SHIPPED_FACES, shippedFont } from '../src/site/shipped.ts';
import { Store } from '../src/site/store.ts';
import { catalogueRows, CARRIED, fileName, makeFonts, shippedFontsModule } from '../tools/fonts.ts';
import atelier from '../themes/atelier.json';

const dir = await mkdtemp(join(tmpdir(), 'uhlaka-typefaces-'));
afterAll(() => rm(dir, { recursive: true, force: true }));
const root = join(import.meta.dir, '..');

/** A woff2's first bytes and enough after them to be taken for one. */
const woff2 = (seed: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(200).map((_, i) => (i * 7 + seed) % 256);
  bytes.set([0x77, 0x4f, 0x46, 0x32]);
  return bytes;
};
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153';
const CYRILLIC = 'U+0301, U+0400-045F, U+0490-0491';
const googleCss = (family: string): string => `/* cyrillic */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/x/v1/cyr.woff2) format('woff2');
  unicode-range: ${CYRILLIC};
}
/* latin */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/x/v1/lat.woff2) format('woff2');
  unicode-range: ${LATIN};
}
/* elsewhere */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 400;
  src: url(https://evil.example/x.woff2) format('woff2');
}
`;
/** Google, as the tests see it: a stylesheet for any family, and two files. */
const fakeGoogle = (asked: string[] = []) =>
  async (url: string): Promise<Response> => {
    asked.push(url);
    if (url.startsWith('https://fonts.googleapis.com/css2')) {
      const family = decodeURIComponent(new URL(url).searchParams.get('family')?.split(':')[0] ?? '').replace(/\+/g, ' ');
      return new Response(googleCss(family));
    }
    if (url.endsWith('/cyr.woff2')) return new Response(woff2(1));
    if (url.endsWith('/lat.woff2')) return new Response(woff2(2));
    return new Response('no', { status: 404 });
  };

describe('the names a style gives a typeface', () => {
  test('a stack of the list, or a font of the site’s own; never a stack typed in', () => {
    expect(isFontName('inter')).toBe(true);
    expect(isFontName('google:playfair-display')).toBe(true);
    expect(isFontName('own:brand-sans')).toBe(true);
    for (const bad of ['Arial, sans-serif', 'google:', 'google:Playfair', 'own:a b', 'other:x', 'google:x;}body{', 7]) expect(isFontName(bad)).toBe(false);
    expect(isSiteFont('inter')).toBe(false);
    expect(normalizeStyle({ fontFamily: { value: 'google:lora' } }).style).toEqual({ fontFamily: { value: 'google:lora' } });
    expect(normalizeStyle({ fontFamily: { value: 'Comic Sans' } }).issues).toHaveLength(1);
    const theme = parseTheme({ ...atelier, tokens: { ...atelier.tokens, font: { heading: 'google:lora', body: 'own:brand' } } });
    expect(theme.theme?.tokens.font).toEqual({ heading: 'google:lora', body: 'own:brand' });
  });

  test('each name as CSS: the face first, then the other scripts, then the device', () => {
    expect(fontStack('literata')).toStartWith('Literata, "Noto Serif", "Noto Sans Arabic"');
    expect(fontStack('google:lora')).toStartWith('"google-lora", "Noto Sans", ');
    expect(fontStack('own:brand')).toEndWith('sans-serif');
    expect(fontStack('nothing')).toBe(fontStack('system'));
    expect(fontSlug('Playfair Display')).toBe('playfair-display');
    expect(fontSlug('  Ștefan’s Sans!! ')).toBe('stefan-s-sans');
    expect(fontSlug('!!!')).toBe('');
    expect(siteFontFamily('own:brand')).toBe('own-brand');
  });

  test('a face is checked, part by part, before it reaches a stylesheet', () => {
    const face = { family: 'Inter', file: 'inter-latin.woff2', weight: '100 900', style: 'normal', range: LATIN };
    expect(cleanFontFace(face)).toEqual(face as FontFace);
    expect(cleanFontFace({ ...face, range: '' })?.range).toBe('');
    for (const bad of [{ family: 'a"b' }, { file: '../x.woff2' }, { weight: 'bold' }, { style: 'oblique' }, { range: 'U+0000;}' }]) expect(cleanFontFace({ ...face, ...bad })).toBeNull();
    expect(cleanFontFace(null)).toBeNull();
    expect(rangeIntervals('U+0041-005A, U+00E?')).toEqual([
      [0x41, 0x5a],
      [0xe0, 0xef],
    ]);
    expect(rangeIntervals('')).toEqual([[0, 0x10ffff]]);
    expect(fontFacesCss([{ ...(face as FontFace), range: '' }])).toBe('@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;font-display:swap;src:url(/assets/fonts/inter-latin.woff2) format("woff2")}\n');
  });
});

describe('the faces Uhlaka carries', () => {
  test('cover Latin with ș and ț, Cyrillic, Greek and Vietnamese, and Noto the other scripts', () => {
    const covered = (family: string, c: number) => SHIPPED_FACES.some((f) => f.family === family && rangeIntervals(f.range).some(([a, b]) => c >= a && c <= b));
    for (const family of ['Inter', 'Manrope', 'Literata', 'EB Garamond', 'JetBrains Mono', 'Noto Sans', 'Noto Serif'])
      for (const c of [0x0219, 0x021b, 0x0436, 0x03c9, 0x1ea1]) expect(`${family} ${c.toString(16)}: ${covered(family, c)}`).toBe(`${family} ${c.toString(16)}: true`);
    for (const [family, c] of [['Noto Sans Arabic', 0x0628], ['Noto Sans Hebrew', 0x05d0], ['Noto Sans Thai', 0x0e01], ['Noto Sans JP', 0x3042], ['Noto Sans KR', 0xac00], ['Noto Sans SC', 0x4e2d]] as const) expect(covered(family, c)).toBe(true);
  });

  test('every face has its file, read only when asked for, and every family its licence', async () => {
    const files = new Set(SHIPPED_FACES.map((f) => f.file));
    expect([...files].sort()).toEqual((await readdir(join(root, 'fonts'))).filter((f) => f.endsWith('.woff2')).sort());
    expect(isWoff2((await shippedFont('inter-latin.woff2')) as Uint8Array)).toBe(true);
    expect(shippedFont('nothing.woff2')).toBeNull();
    const licences = (await readdir(join(root, 'fonts'))).filter((f) => f.startsWith('OFL-'));
    for (const { family } of CARRIED) expect(licences).toContain(`OFL-${fontSlug(family)}.txt`);
    expect(await readFile(join(root, 'fonts', 'OFL-noto-sans-jp.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  test('a page carries the files of its letters: Romanian never downloads Japanese', () => {
    const css = [`:root{--t-font-body:${fontStack('figtree')};--t-font-heading:${fontStack('system')}}`];
    const files = (text: string) => facesUsed(css, SHIPPED_FACES, charsOf([text])).map((f) => f.file);
    const ro = files('Înțelepciunea și știința');
    expect(ro).toContain('figtree-latin.woff2');
    expect(ro).toContain('figtree-latin-ext.woff2');
    expect(ro.some((f) => f.startsWith('noto'))).toBe(false);
    // Figtree has no Cyrillic: Noto Sans draws it. The device's stack draws it on its own.
    expect(files('Привет')).toContain('noto-sans-cyrillic.woff2');
    // Kana and Han: the first Noto of Chinese, Japanese and Korean that has them; Hangul only Korean has.
    const jp = files('こんにちは');
    expect(jp.length).toBeGreaterThan(0);
    expect(jp.every((f) => f.startsWith('noto-sans-sc-'))).toBe(true);
    expect(files('안녕하세요').every((f) => f.startsWith('noto-sans-kr-'))).toBe(true);
    // Without letters, every face of every family named.
    expect(facesUsed(css, SHIPPED_FACES).length).toBeGreaterThan(400);
    expect(facesUsed(['body{color:red}'], SHIPPED_FACES)).toEqual([]);
  });
});

describe('Google Fonts', () => {
  test('the catalogue Uhlaka carries, each family with the scripts it has', () => {
    expect(GOOGLE_FAMILIES.length).toBeGreaterThan(1500);
    expect(GOOGLE_CATALOGUE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const lora = googleFamily('Lora');
    expect(lora?.category).toBe('serif');
    expect(lora?.subsets).toContain('cyrillic');
    expect(googleFamilyBySlug('playfair-display')?.family).toBe('Playfair Display');
    expect(googleCssUrl('Playfair Display', 'wght@400..900')).toBe('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..900&display=swap');
    expect(googleCssUrl('ABeeZee', '')).toBe('https://fonts.googleapis.com/css2?family=ABeeZee&display=swap');
  });

  test('Google’s stylesheet read: only its own files, each part checked', () => {
    const faces = parseGoogleCss(googleCss('Lora'));
    expect(faces).toHaveLength(2);
    expect(faces[0]).toEqual({ face: { family: 'Lora', weight: '400 900', style: 'normal', range: CYRILLIC }, url: 'https://fonts.gstatic.com/s/x/v1/cyr.woff2', subset: 'cyrillic' });
    expect(parseGoogleCss('@font-face{font-family:x;src:url(https://fonts.gstatic.com/a.woff2)}')).toEqual([]);
  });

  test('a family downloaded; an answer that is not a font is refused', async () => {
    const lora = googleFamily('Lora') as NonNullable<ReturnType<typeof googleFamily>>;
    const asked: string[] = [];
    const got = await downloadGoogle(lora, fakeGoogle(asked));
    expect(got.map((g) => g.subset)).toEqual(['cyrillic', 'latin']);
    expect(asked[0]).toContain('family=Lora:');
    expect(asked.every((u) => !u.includes('evil'))).toBe(true);
    await expect(downloadGoogle(lora, async () => new Response('', { status: 500 }))).rejects.toThrow('answered 500');
    await expect(downloadGoogle(lora, async () => new Response('body{}'))).rejects.toThrow('no faces');
    await expect(downloadGoogle(lora, async (url) => (url.includes('css2') ? new Response(googleCss('Lora')) : new Response('not a font')))).rejects.toThrow('not a font');
    await expect(downloadGoogle(lora, async (url) => (url.includes('css2') ? new Response(googleCss('Lora')) : new Response('', { status: 404 })))).rejects.toThrow('answered 404');
  });
});

describe('the site’s own fonts', () => {
  test('kept, served, carried by the export, taken away with their files', async () => {
    const store = await Store.open(join(dir, 'own.db'));
    await store.setTheme({ ...atelier, tokens: { ...atelier.tokens, font: { heading: 'google:lora', body: 'own:brand' } } });
    await store.publishTheme();
    await store.setSite({ name: 'Atelier' });
    await store.savePage({ slug: '', title: 'Acasă', blocks: [] });
    await store.publish('');
    const editor = await startEditor(store, { listen: false, fontsFetch: fakeGoogle() });
    const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
      editor.fetch(
        new Request(`http://127.0.0.1:4321${path}`, {
          method,
          headers: { host: '127.0.0.1:4321', 'x-uhlaka-token': editor.token, ...(body !== undefined && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}), ...headers },
          body: body instanceof Uint8Array ? (body as Uint8Array<ArrayBuffer>) : body === undefined ? undefined : JSON.stringify(body),
        }),
      );
    try {
      expect(await (await call('GET', '/api/fonts')).json()).toEqual({ fonts: [] });
      const found = (await (await call('GET', '/api/fonts/google?q=lor')).json()) as { families: { family: string }[]; total: number };
      expect(found.families[0]?.family).toBe('Lora');
      expect(((await (await call('GET', '/api/fonts/google')).json()) as { families: unknown[] }).families).toHaveLength(40);
      expect((await call('POST', '/api/fonts/google', { family: 'Nothing At All' })).status).toBe(404);
      const added = (await (await call('POST', '/api/fonts/google', { family: 'Lora' })).json()) as { font: { name: string; faces: FontFace[] } };
      expect(added.font.name).toBe('google:lora');
      expect(added.font.faces.map((f) => f.family)).toEqual(['google-lora', 'google-lora']);

      // A face the owner bought: a .woff2, and a name.
      expect((await call('POST', '/api/fonts/own?label=Brand', new TextEncoder().encode('not a font') as Uint8Array<ArrayBuffer>)).status).toBe(400);
      expect((await call('POST', '/api/fonts/own?label=!!', woff2(3))).status).toBe(400);
      expect((await call('POST', '/api/fonts/own?label=Brand', woff2(3), { 'content-length': String(9 * 1024 * 1024) })).status).toBe(413);
      await call('POST', '/api/fonts/own?label=Brand&weight=400', woff2(3));
      const bold = (await (await call('POST', '/api/fonts/own?label=Brand&weight=700&style=italic', woff2(4))).json()) as { font: { faces: FontFace[] } };
      expect(bold.font.faces.map((f) => `${f.weight} ${f.style}`)).toEqual(['400 normal', '700 italic']);
      // The same weight and style again: the new file takes the old one's place.
      await call('POST', '/api/fonts/own?label=Brand&weight=400', woff2(5));
      const fonts = (await (await call('GET', '/api/fonts')).json()) as { fonts: { name: string; faces: FontFace[] }[] };
      expect(fonts.fonts.map((f) => f.name)).toEqual(['own:brand', 'google:lora']);
      expect(fonts.fonts[0]?.faces).toHaveLength(2);
      await expect(store.addSiteFont('bad', 'x', [])).rejects.toThrow('not a font name');
      await expect(store.addSiteFont('own:x', 'x', [{ face: { weight: 'heavy', style: 'normal', range: '' }, bytes: woff2(9) }])).rejects.toThrow('not a face');

      // Served by the site, declared in the canvas and in the admin's samples.
      const file = fonts.fonts[1]?.faces[0]?.file as string;
      const served = await call('GET', `/assets/fonts/${file}`);
      expect(served.headers.get('content-type')).toBe('font/woff2');
      expect(isWoff2(new Uint8Array(await served.arrayBuffer()))).toBe(true);
      expect(await (await call('GET', '/admin/site.css')).text()).toContain(`url(/assets/fonts/${file})`);
      expect(await (await call('GET', '/admin/fonts.css')).text()).toContain('font-family:"own-brand"');
      expect(await (await call('GET', '/admin/admin.css')).text()).toContain('font-family:"Figtree"');
      expect(await store.fontFile('../x')).toBeNull();

      // The published site: its own faces, of the letters it has.
      const files = await publishedSite(store);
      const css = files.get('assets/site.css') as string;
      expect(css).toContain('font-family:"google-lora"');
      expect(css).toContain('--t-font-heading:"google-lora"');
      expect(files.has(`assets/fonts/${fonts.fonts[1]?.faces.find((f) => f.range === LATIN)?.file}`)).toBe(true);
      expect(files.has(`assets/fonts/${fonts.fonts[1]?.faces.find((f) => f.range === CYRILLIC)?.file}`)).toBe(false);
      expect(await (await call('GET', '/api/fonts/nothing')).json()).toEqual({ error: 'not found' });

      await call('DELETE', '/api/fonts?name=google:lora');
      expect((await store.siteFonts()).map((f) => f.name)).toEqual(['own:brand']);
      expect((await call('GET', `/assets/fonts/${file}`)).status).toBe(404);
    } finally {
      editor.stop();
    }
  });
});

describe('tools/fonts.ts', () => {
  test('makes the faces and the catalogue from what Google gives', async () => {
    const out = join(dir, 'tool');
    await mkdir(join(out, 'fonts'), { recursive: true });
    await mkdir(join(out, 'src', 'site'), { recursive: true });
    await writeFile(join(out, 'fonts', 'OFL-figtree.txt'), 'Copyright Figtree\n\nSIL OPEN FONT LICENSE Version 1.1\n');
    const meta = join(dir, 'meta');
    await mkdir(meta, { recursive: true });
    await writeFile(join(meta, 'licenses.json'), JSON.stringify({ inter: { original: 'Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) Inter[opsz,wght].ttf: Copyright 2016' } }));
    await writeFile(join(meta, 'api-response.json'), JSON.stringify([{ family: 'Lora', variants: ['regular', 'italic'], subsets: ['latin', 'cyrillic'], category: 'serif' }]));
    await writeFile(join(meta, 'variable.json'), JSON.stringify({ lora: { axes: { wght: { min: '400', max: '700' } } } }));
    const lines: string[] = [];
    const { faces } = await makeFonts(out, { metadata: meta, catalogue: meta, fetch: fakeGoogle(), log: (l) => lines.push(l) });
    expect(faces).toHaveLength(CARRIED.length * 2);
    expect(faces[0]?.file).toBe('bricolage-grotesque-cyrillic.woff2');
    expect(await readFile(join(out, 'fonts', 'OFL-inter.txt'), 'utf8')).toBe('Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)\n\nSIL OPEN FONT LICENSE Version 1.1\n');
    expect(await readFile(join(out, 'fonts', 'OFL-noto-sans-jp.txt'), 'utf8')).toStartWith('Copyright 2014-2021 Adobe');
    expect(JSON.parse(await readFile(join(out, 'src', 'site', 'google-fonts.json'), 'utf8')).families).toEqual([['Lora', 'f', 'ital,wght@0,400..700;1,400..700', 'latin cyrillic']]);
    expect(await readFile(join(out, 'src', 'site', 'shipped-fonts.ts'), 'utf8')).toContain("'inter-latin.woff2': font_inter_latin,");
    expect(lines.at(-1)).toBe('The catalogue: 1 families');
  });

  test('the axes asked of Google, for a variable family and a fixed one', () => {
    const rows = catalogueRows(
      [
        { family: 'ABeeZee', variants: ['regular', 'italic'], subsets: ['latin'], category: 'sans-serif' },
        { family: 'Anton', variants: ['regular'], subsets: ['latin'], category: 'sans-serif' },
        { family: 'Oswald', variants: ['200', '700'], subsets: ['latin'], category: 'odd' },
        { family: 'Inter', variants: ['regular'], subsets: [], category: 'sans-serif' },
      ],
      { inter: { axes: { wght: { min: '100', max: '900' } } } },
    );
    expect(rows.map((r) => r[2])).toEqual(['ital,wght@0,400;1,400', '', 'wght@200;700', 'wght@100..900']);
    expect(rows[2]?.[1]).toBe('s');
    expect(fileName('Noto Sans', 'italic', 'latin')).toBe('noto-sans-italic-latin.woff2');
    expect(shippedFontsModule(['a-b.woff2'])).toContain("import font_a_b from '../../fonts/a-b.woff2' with { type: 'file' };");
  });
});
