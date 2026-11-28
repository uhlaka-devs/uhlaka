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
import { cleanFontFace, type FontFace } from '../core/index.ts';
import faces from './faces.json';
import { FONT_FILES } from './shipped-fonts.ts';
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
 * The faces Uhlaka carries (ADR 0068 d1, ADR 0085 d6), as `tools/fonts.ts`
 * made them: each family cut by script, so a page loads only the files its
 * words need. Their files are in `fonts/`, imported as files
 * (`shipped-fonts.ts`) so the single executable carries them.
 */
export const SHIPPED_FACES: readonly FontFace[] = (faces.faces as unknown[]).map(cleanFontFace).filter((f): f is FontFace => f !== null);
const read = new Map<string, Promise<Uint8Array>>();
/** The bytes of one of those files, read when first asked for (a site in Romanian never reads the Japanese ones); null for a name not among them. */
export const shippedFont = (name: string): Promise<Uint8Array> | null => {
  const path = Object.hasOwn(FONT_FILES, name) ? FONT_FILES[name] : undefined;
  if (!path) return null;
  let bytes = read.get(name);
  if (!bytes) read.set(name, (bytes = Bun.file(path).bytes()));
  return bytes;
};
/** The theme a new site starts with. */
export const DEFAULT_THEME: unknown = plain;
/**
 * The statistics, packed (ADR 0062 d8): an extension the program carries, so
 * that the Statistics screen installs it with one button. A test holds it to
 * a fresh pack of `extensions/stats`.
 */
export const SHIPPED_STATS: string = statsPackage;
