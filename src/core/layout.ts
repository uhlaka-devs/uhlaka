/**
 * Layouts (ADR 0035): how a page is arranged around its blocks. A few closed
 * choices, never a grid to draw: whether the page has the site's header and
 * footer, how wide its content runs, whether it has a sidebar and on which
 * side, and a band above and below its blocks. The sidebar and the bands
 * each show one section (ADR 0033), so what is in them is written once, in
 * the block editor, like any other section.
 *
 * What a layout looks like (colours, spacing, how the header is arranged) is
 * the theme's; what the header and footer say is the site's. A layout only
 * says what is there and where.
 */
import type { Block } from './blocks.ts';
import { measureFor, pictureAttrs, type Share } from './media.ts';
import type { Page, Site } from './page.ts';
import { fillSections } from './section.ts';
import { isObject, slugify, str } from './util.ts';

export const LAYOUT_WIDTHS = ['narrow', 'normal', 'wide', 'full'] as const;
export type LayoutWidth = (typeof LAYOUT_WIDTHS)[number];
export const SIDEBARS = ['none', 'left', 'right'] as const;
export type Sidebar = (typeof SIDEBARS)[number];
/** The places of a layout that show a section. */
export const LAYOUT_AREAS = ['top', 'side', 'bottom'] as const;
export type LayoutArea = (typeof LAYOUT_AREAS)[number];

export interface Layout {
  /** What a page names it by: `standard`, `landing`. */
  id: string;
  /** What the owner calls it: "Standard", "Landing page". */
  name: string;
  header: boolean;
  footer: boolean;
  width: LayoutWidth;
  sidebar: Sidebar;
  /** The section shown in the sidebar, above the blocks and below them; '' for none. */
  side: string;
  top: string;
  bottom: string;
}

/** The layout every page has unless it or its type says another, and the one that cannot be removed. */
export const STANDARD = 'standard';
export const MAX_LAYOUTS = 20;

const layout = (id: string, name: string, change: Partial<Layout> = {}): Layout => ({ id, name, header: true, footer: true, width: 'normal', sidebar: 'none', side: '', top: '', bottom: '', ...change });

/** The layouts a site starts with, ready to use and each one changeable. */
export const READY_LAYOUTS: readonly Layout[] = [
  layout(STANDARD, 'Standard'),
  layout('landing', 'Landing page', { header: false, footer: false, width: 'full' }),
  layout('sidebar', 'With a sidebar', { sidebar: 'right' }),
  layout('article', 'Article', { width: 'narrow' }),
];

/** One layout, cleaned; null when it has no name. */
function normalizeLayout(raw: unknown): Layout | null {
  if (!isObject(raw)) return null;
  const name = str(raw.name, 60).replace(/\s+/g, ' ').trim();
  const id = slugify(raw.id) || slugify(name);
  if (!name || !id) return null;
  const section = (value: unknown): string => slugify(value);
  return {
    id,
    name,
    header: raw.header !== false,
    footer: raw.footer !== false,
    width: LAYOUT_WIDTHS.find((w) => w === raw.width) ?? 'normal',
    sidebar: SIDEBARS.find((s) => s === raw.sidebar) ?? 'none',
    side: section(raw.side),
    top: section(raw.top),
    bottom: section(raw.bottom),
  };
}

/**
 * A site's layouts: the ready ones until the owner changes them, each id
 * once, and always one that is `standard`.
 */
export function normalizeLayouts(input: unknown): Layout[] {
  if (!Array.isArray(input)) return READY_LAYOUTS.map((l) => ({ ...l }));
  const out: Layout[] = [];
  for (const raw of input) {
    const found = normalizeLayout(raw);
    if (found && out.length < MAX_LAYOUTS && !out.some((l) => l.id === found.id)) out.push(found);
  }
  if (!out.some((l) => l.id === STANDARD)) out.unshift({ ...(READY_LAYOUTS[0] as Layout) });
  return out;
}

/** The layout of this id; the standard one when there is none by that name. */
export function layoutOf(layouts: readonly Layout[] | undefined, id: string | undefined): Layout {
  const all = layouts ?? READY_LAYOUTS;
  return all.find((l) => l.id === id) ?? all.find((l) => l.id === STANDARD) ?? (READY_LAYOUTS[0] as Layout);
}

/** The sections these layouts show, each once. */
export const layoutSections = (layouts: readonly Layout[]): string[] => [...new Set(layouts.flatMap((l) => LAYOUT_AREAS.map((a) => l[a]).filter(Boolean)))];

/** The block that shows a section in a place of a layout: what the page draws there. */
export const areaBlock = (section: string): Block => ({ id: `l_${section.replace(/-/g, '_')}`.slice(0, 40), type: 'section', content: { section } });

/**
 * What each section a layout shows holds, in a language, by its name: filled
 * in before a page is drawn, as a page's own section blocks are (ADR 0033).
 */
export function layoutAreas(layouts: readonly Layout[], sections: readonly Page[], language: string, also: readonly string[] = []): Record<string, Block[]> {
  const names = [...new Set([...layoutSections(layouts), ...also.filter(Boolean)])];
  return Object.fromEntries(names.map((name) => [name, fillSections([areaBlock(name)], sections, language)[0]?.children ?? []]));
}

/** The site, ready to draw a page in this language: what each of its layouts' sections holds, and the bar above its header (ADR 0085 d3). */
export const withAreas = (site: Site, sections: readonly Page[], language: string): Site => ({ ...site, areas: layoutAreas(site.layouts ?? READY_LAYOUTS, sections, language, [site.header?.bar ?? '']) });

/** A picture drawn straight in a page's layout, outside any block (an entry's cover): what fits there (ADR 0005 d8). */
export const pictureIn = (site: Site, layout: string | undefined, src: string, share: Share): ReturnType<typeof pictureAttrs> =>
  pictureAttrs(site.pictures, src, measureFor(site.pictures?.widths ?? {}, layoutOf(site.layouts, layout).width), share);
