/**
 * What ships inside the program: the themes, the language packs, the CSS
 * every page starts from. Imported, not read from a folder, so the single
 * executable (`tools/build.ts`) carries them. A test holds these lists to the
 * folders, so a file added there is not forgotten here.
 */
import plain from '../../themes/plain.json';
import studio from '../../themes/studio.json';
import atelier from '../../themes/atelier.json';
import ro from '../../languages/ro.json';
import baseCss from '../blocks/base.css' with { type: 'text' };
import adminTokens from '../admin/tokens.css' with { type: 'text' };
import bricolageLatin from '../../fonts/bricolage-grotesque-latin.woff2' with { type: 'file' };
import bricolageLatinExt from '../../fonts/bricolage-grotesque-latin-ext.woff2' with { type: 'file' };
import figtreeLatin from '../../fonts/figtree-latin.woff2' with { type: 'file' };
import figtreeLatinExt from '../../fonts/figtree-latin-ext.woff2' with { type: 'file' };
import figtreeItalicLatin from '../../fonts/figtree-italic-latin.woff2' with { type: 'file' };
import figtreeItalicLatinExt from '../../fonts/figtree-italic-latin-ext.woff2' with { type: 'file' };
import adminIcon from '../../brand/uhlaka-icon-16.svg' with { type: 'text' };
import statsPackage from '../../extensions/stats/stats.uhlaka-extension' with { type: 'text' };

/** The themes in `themes/`, by file name. */
export const SHIPPED_THEMES: Record<string, unknown> = { 'atelier.json': atelier, 'plain.json': plain, 'studio.json': studio };
/** The language packs in `languages/`, by file name. */
export const SHIPPED_LANGUAGES: Record<string, unknown> = { 'ro.json': ro };
/** Uhlaka's tab icon, the logo's 16 px drawing (ADR 0080 d3, d4). */
export const ADMIN_ICON: string = adminIcon;
/** The structure every page's CSS starts with; the theme's comes after it. */
export const BASE_CSS: string = baseCss;
/** The admin's design tokens (ADR 0084): every colour, size and duration of the admin, in one file. */
export const ADMIN_TOKENS: string = adminTokens;
/**
 * The files of the faces in `fonts/`, by file name (ADR 0068 d1). Imported as
 * files, so the single executable carries them; read when the site is built.
 */
const FONT_FILES: Record<string, string> = {
  'bricolage-grotesque-latin.woff2': bricolageLatin,
  'bricolage-grotesque-latin-ext.woff2': bricolageLatinExt,
  'figtree-latin.woff2': figtreeLatin,
  'figtree-latin-ext.woff2': figtreeLatinExt,
  'figtree-italic-latin.woff2': figtreeItalicLatin,
  'figtree-italic-latin-ext.woff2': figtreeItalicLatinExt,
};
let fonts: Promise<Map<string, Uint8Array>> | undefined;
/** The faces' bytes, by file name, read once. */
export const shippedFonts = (): Promise<Map<string, Uint8Array>> =>
  (fonts ??= Promise.all(Object.entries(FONT_FILES).map(async ([name, path]) => [name, await Bun.file(path).bytes()] as const)).then((all) => new Map(all)));
/** The theme a new site starts with. */
export const DEFAULT_THEME: unknown = plain;
/**
 * The statistics, packed (ADR 0062 d8): an extension the program carries, so
 * that the Statistics screen installs it with one button. A test holds it to
 * a fresh pack of `extensions/stats`.
 */
export const SHIPPED_STATS: string = statsPackage;
