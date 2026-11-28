/**
 * The faces Uhlaka carries (ADR 0085 d6), made again from Google Fonts, and the
 * catalogue of Google Fonts the admin offers.
 *
 *   bun tools/fonts.ts                     the faces: fonts/, src/site/faces.json, src/site/shipped-fonts.ts
 *   bun tools/fonts.ts --metadata <dir>    the same, with each family's licence from `google-font-metadata`'s data
 *   bun tools/fonts.ts --catalogue <dir>   the catalogue too: src/site/google-fonts.json
 *
 * `<dir>` is the `data/` folder of the npm package `google-font-metadata`
 * (MIT), downloaded by hand: it is not a dependency. Every family here is under
 * the SIL Open Font License, which lets the site serve it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type FontFace, fontSlug } from '../src/core/index.ts';
import { downloadGoogle, type Fetch } from '../src/site/google-fonts.ts';

/** Each family, with the axes asked of Google: Latin with its extensions, Cyrillic, Greek and Vietnamese, or one other script. */
export const CARRIED: readonly { family: string; axes: string }[] = [
  { family: 'Bricolage Grotesque', axes: 'wght@200..800' },
  { family: 'Figtree', axes: 'ital,wght@0,300..900;1,300..900' },
  { family: 'Inter', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Manrope', axes: 'wght@200..800' },
  { family: 'Literata', axes: 'ital,wght@0,200..900;1,200..900' },
  { family: 'EB Garamond', axes: 'ital,wght@0,400..800;1,400..800' },
  { family: 'JetBrains Mono', axes: 'ital,wght@0,100..800;1,100..800' },
  { family: 'Noto Sans', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Noto Serif', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Noto Sans Arabic', axes: 'wght@100..900' },
  { family: 'Noto Sans Hebrew', axes: 'wght@100..900' },
  { family: 'Noto Sans Bengali', axes: 'wght@100..900' },
  { family: 'Noto Sans Tamil', axes: 'wght@100..900' },
  { family: 'Noto Sans Thai', axes: 'wght@100..900' },
  { family: 'Noto Sans Georgian', axes: 'wght@100..900' },
  { family: 'Noto Sans Armenian', axes: 'wght@100..900' },
  { family: 'Noto Sans SC', axes: 'wght@100..900' },
  { family: 'Noto Sans TC', axes: 'wght@100..900' },
  { family: 'Noto Sans JP', axes: 'wght@100..900' },
  { family: 'Noto Sans KR', axes: 'wght@100..900' },
];

/** A file's name: the family, `italic` for an italic, and the script it is cut for. */
export const fileName = (family: string, style: string, subset: string): string => `${fontSlug(family)}${style === 'italic' ? '-italic' : ''}-${subset}.woff2`;

/** An identifier for a file in the imports: `figtree-italic-latin.woff2` → `figtreeItalicLatin`. */
const identifier = (file: string): string =>
  `font_${file
    .replace(/\.woff2$/, '')
    .replace(/[^a-z0-9]+/g, '_')}`;

export function shippedFontsModule(files: readonly string[]): string {
  return [
    '// Written by tools/fonts.ts: do not edit. The faces in fonts/, imported as files so the single executable carries them.',
    ...files.map((f) => `import ${identifier(f)} from '../../fonts/${f}' with { type: 'file' };`),
    '',
    'export const FONT_FILES: Record<string, string> = {',
    ...files.map((f) => `  '${f}': ${identifier(f)},`),
    '};',
    '',
  ].join('\n');
}

/** The Noto families for Chinese, Japanese and Korean are Adobe's Source Han, under another name; their metadata has no licence line. */
const CJK_COPYRIGHT = "Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'";

const OFL_BODY = (root: string): string => {
  const figtree = readFileSync(join(root, 'fonts', 'OFL-figtree.txt'), 'utf8');
  return figtree.slice(figtree.indexOf('\n'));
};

/** A licence's first line, from `google-font-metadata`'s `licenses.json`. */
const copyrightOf = (licences: Record<string, { original?: string }>, family: string): string | null => {
  const text = licences[fontSlug(family)]?.original ?? (family.startsWith('Noto Sans') && / (SC|TC|JP|KR)$/.test(family) ? CJK_COPYRIGHT : undefined);
  return text ? text.replace(/\s+\S+\.ttf:.*$/s, '').trim() : null;
};

/** The catalogue's rows from `api-response.json` and `variable.json`: family, kind, axes, scripts. */
export function catalogueRows(api: { family: string; variants: string[]; subsets: string[]; category: string }[], variable: Record<string, { axes: Record<string, { min: string; max: string }> }>): [string, string, string, string][] {
  const kinds: Record<string, string> = { 'sans-serif': 's', serif: 'f', display: 'd', handwriting: 'h', monospace: 'm' };
  return api.map((font) => {
    const axes = variable[fontSlug(font.family)]?.axes;
    const italic = font.variants.some((v) => v.includes('italic'));
    let spec: string;
    if (axes?.wght) {
      const range = `${axes.wght.min}..${axes.wght.max}`;
      spec = italic ? `ital,wght@0,${range};1,${range}` : `wght@${range}`;
    } else {
      const tuples = font.variants.map((v) => [v.includes('italic') ? 1 : 0, v === 'regular' || v === 'italic' ? 400 : parseInt(v, 10)] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const plain = tuples.length === 1 && tuples[0]?.[0] === 0 && tuples[0][1] === 400;
      spec = plain ? '' : italic ? `ital,wght@${tuples.map(([i, w]) => `${i},${w}`).join(';')}` : `wght@${tuples.map(([, w]) => w).join(';')}`;
    }
    return [font.family, kinds[font.category] ?? 's', spec, font.subsets.join(' ')];
  });
}

export async function makeFonts(root: string, options: { metadata?: string; catalogue?: string; fetch?: Fetch; log?: (line: string) => void } = {}): Promise<{ faces: FontFace[] }> {
  const log = options.log ?? console.log;
  const faces: FontFace[] = [];
  const licences = options.metadata ? (JSON.parse(readFileSync(join(options.metadata, 'licenses.json'), 'utf8')) as Record<string, { original?: string }>) : {};
  mkdirSync(join(root, 'fonts'), { recursive: true });
  const body = OFL_BODY(root);
  for (const { family, axes } of CARRIED) {
    const got = await downloadGoogle({ family, axes, category: '', subsets: [] }, options.fetch);
    for (const { face, subset, bytes } of got) {
      const file = fileName(family, face.style, subset);
      writeFileSync(join(root, 'fonts', file), bytes);
      faces.push({ ...face, file });
    }
    const copyright = copyrightOf(licences, family);
    if (copyright) writeFileSync(join(root, 'fonts', `OFL-${fontSlug(family)}.txt`), `${copyright}${body}`);
    log(`${family}: ${got.length} files`);
  }
  writeFileSync(join(root, 'src', 'site', 'faces.json'), `${JSON.stringify({ faces }, null, 0).replace(/\},\{/g, '},\n{')}\n`);
  writeFileSync(join(root, 'src', 'site', 'shipped-fonts.ts'), shippedFontsModule(faces.map((f) => f.file)));
  if (options.catalogue) {
    const api = JSON.parse(readFileSync(join(options.catalogue, 'api-response.json'), 'utf8'));
    const variable = JSON.parse(readFileSync(join(options.catalogue, 'variable.json'), 'utf8'));
    const rows = catalogueRows(api, variable);
    const date = new Date().toISOString().slice(0, 10);
    writeFileSync(join(root, 'src', 'site', 'google-fonts.json'), `{"date":"${date}","families":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
    log(`The catalogue: ${rows.length} families`);
  }
  return { faces };
}

if (import.meta.main) {
  const arg = (name: string): string | undefined => {
    const at = process.argv.indexOf(name);
    return at > 0 ? process.argv[at + 1] : undefined;
  };
  const catalogue = arg('--catalogue');
  await makeFonts(resolve(import.meta.dir, '..'), { metadata: arg('--metadata') ?? catalogue, catalogue });
}
