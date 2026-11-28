/**
 * One page as a complete HTML document. The same functions serve the static
 * export and the editor's canvas, so what the author sees while editing is
 * what a visitor gets.
 */
// The language packs are read here, so whatever draws a page has their words (ADR 0021).
import './languages.ts';
import { render } from 'svelte/server';
import BlogLayout from '../blocks/BlogLayout.svelte';
import type { EntryLists } from '../blocks/editing.ts';
import Layout from '../blocks/Layout.svelte';
import PostLayout from '../blocks/PostLayout.svelte';
import { ALTERNATES, wordsFor } from '../blocks/words.ts';
import { SCHEME_SCRIPT_PATH } from './scheme.ts';
import {
  type Alternate,
  type Byline,
  typeAuthorPath,
  breadcrumbData,
  type Crumb,
  entryTrail,
  listTrail,
  alternates as alternatesOf,
  type Block,
  blocksCss,
  type ContentType,
  entryPath,
  feedPath,
  type MenuLists,
  postsType,
  type MenuLink,
  type MenuPage,
  type Page,
  pageDescription,
  pagePath,
  type Post,
  postDescription,
  resolveMenu,
  type Site,
  type Theme,
  languageOf,
  entrySchemaData,
  faqData,
  organizationData,
  pagesIn,
  siteIn,
  hasSchemeSwitch,
} from '../core/index.ts';

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type MenuItem = MenuLink;

/** The menu these pages get: the one the owner arranged, or the pages in order and then the blog. */
export const menuOf = (site: Site, pages: MenuPage[], lists: MenuLists): MenuItem[] => resolveMenu(site, pages, lists, wordsFor(site.language).myAccount);

export const STYLESHEET = '/assets/site.css';

/**
 * What a page is drawn with in its own language (ADR 0024): the site's words
 * and menu in that language, and where the page is in the others.
 */
export function pageSetting(site: Site, slug: string, pages: MenuPage[], lists: MenuLists, listsIn: (language: string) => MenuLists = () => []): { site: Site; menu: MenuItem[]; alternates: Alternate[] } {
  const language = languageOf(site, slug);
  const local = siteIn(site, language, pages);
  // Each language's lists are those of the entries in it (ADR 0054).
  return { site: local, menu: menuOf(local, pagesIn(site, language, pages), language === site.language ? lists : listsIn(language)), alternates: alternatesOf(site, slug, pages) };
}

/** The other languages reach the header through the context of the render. */
const withAlternates = (alternates: Alternate[]) => new Map<string, unknown>([[ALTERNATES, alternates]]);

/**
 * Svelte marks where a browser would take the page over (`<!--[-->`). Nothing
 * does here, so the marks go. Every string an author wrote is escaped by then
 * (`<` is `&lt;`), so no comment in the markup can be theirs.
 */
const clean = (html: string): string => html.replace(/<!--(\[-?\d*|\]|)-->/g, '');

/** The site as a page draws it under this theme: with the switch between light and dark when the theme follows the visitor (ADR 0074 d4). */
export const withScheme = (site: Site, theme: Theme): Site => {
  const { schemeSwitch: _was, ...rest } = site;
  return hasSchemeSwitch(theme) ? { ...rest, schemeSwitch: true } : rest;
};

// Generated only from checked values (`blocksCss`); `</style` cannot occur in it.
const own = (blocks: Block[], theme: Theme): string => blocksCss(blocks, theme);

/**
 * A page's markup and the styles its blocks set for themselves. With
 * `editing`, text that can be typed on the page is marked for the editor.
 */
export function renderParts(site: Site, theme: Theme, page: Page, menu: MenuItem[], editing = false, lists: EntryLists = {}, alternates: Alternate[] = []): { body: string; css: string } {
  site = withScheme(site, theme);
  return { body: clean(render(Layout, { props: { site, page, menu, editing, lists }, context: withAlternates(alternates) }).body), css: own(page.blocks, theme) };
}

/** The same for an entry of a content type; a blog post when no type is named. */
export function renderPostParts(
  site: Site,
  theme: Theme,
  post: Post,
  menu: MenuItem[],
  editing = false,
  type: ContentType = postsType(),
  lists: EntryLists = {},
  /** The type's own page (ADR 0015); null draws the default one. */
  template: Block[] | null = null,
  /** The editor is changing the type's page, with this entry as the example. */
  designing = false,
  alternates: Alternate[] = [],
): { body: string; css: string } {
  site = withScheme(site, theme);
  return {
    body: clean(render(PostLayout, { props: { site, post, menu, editing, type, lists, template, designing, crumbs: crumbsOf(site, entryTrail(wordsFor(site.language).home, type, post)) }, context: withAlternates(alternates) }).body),
    css: own([...(template ?? []), ...post.blocks], theme),
  };
}

/** The breadcrumbs a page shows: none when the owner turned them off (ADR 0050 d4). */
const crumbsOf = (site: Site, trail: Crumb[]): Crumb[] => (site.breadcrumbs === false ? [] : trail);

interface Head {
  /** What the browser's tab says. */
  title: string;
  /** What a link preview says: the page's own title, without the site's name. */
  shareTitle: string;
  description: string;
  path: string;
  type: 'website' | 'article' | 'profile';
  /** A picture for link previews: an address on this site or elsewhere. */
  image?: string;
  /** The feed to point a reader at, when this part of the site has one. */
  feed?: string;
  /** The same page in the site's other languages. */
  alternates?: Alternate[];
  /** What the page is, said for search engines as schema.org data (ADR 0030). */
  data?: Record<string, unknown>[];
  /** Kept out of search engines (ADR 0050 d3). */
  noindex?: boolean;
}

/** The business behind the site, as schema.org names it: who publishes every page; a local business when the owner says where it is (ADR 0061 d2). */
const organization = (site: Site): Record<string, unknown> => organizationData(site);
const absolute = (site: Site, src: string): string => (src.startsWith('/') ? `${site.url}${src}` : src);

/**
 * Data for search engines, in the head (ADR 0030): JSON, never run. `<` is
 * written as `\u003c` so nothing in a title can close the script element.
 */
function structured(site: Site, data: Record<string, unknown>[] | undefined): string {
  if (!site.url || !data?.length) return '';
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': data }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function documentHtml(site: Site, head: Head, body: string, css: string): string {
  const canonical = site.url ? `${site.url}${head.path}` : '';
  // A page without a picture of its own has the site's (ADR 0050 d2).
  const picture = head.image || site.shareImage?.src || '';
  const image = picture ? (picture.startsWith('/') ? (site.url ? `${site.url}${picture}` : '') : picture) : '';
  const lines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(head.title)}</title>`,
    head.noindex ? '<meta name="robots" content="noindex">' : '',
    // The codes that prove the site is the owner's are read on the home page only (ADR 0058 d4).
    head.path === '/' && site.verify?.google ? `<meta name="google-site-verification" content="${esc(site.verify.google)}">` : '',
    head.path === '/' && site.verify?.bing ? `<meta name="msvalidate.01" content="${esc(site.verify.bing)}">` : '',
    head.description ? `<meta name="description" content="${esc(head.description)}">` : '',
    canonical ? `<link rel="canonical" href="${esc(canonical)}">` : '',
    `<meta property="og:title" content="${esc(head.shareTitle)}">`,
    head.description ? `<meta property="og:description" content="${esc(head.description)}">` : '',
    canonical ? `<meta property="og:url" content="${esc(canonical)}">` : '',
    `<meta property="og:type" content="${head.type}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    head.feed ? `<link rel="alternate" type="application/atom+xml" title="${esc(site.name)}" href="${head.feed}">` : '',
    // Search engines are told where each language's page is; only with the site's address, as they want it whole.
    ...(site.url ? (head.alternates ?? []).map((a) => `<link rel="alternate" hreflang="${esc(a.language)}" href="${esc(`${site.url}${a.href}`)}">`) : []),
    // The main home page is also where a visitor with none of these languages lands (ADR 0071 d3).
    site.url && head.path === '/' && (head.alternates ?? []).length ? `<link rel="alternate" hreflang="x-default" href="${esc(`${site.url}/`)}">` : '',
    // The one script a page may carry, before the stylesheet so the visitor's choice is there at the first paint (ADR 0074 d4).
    site.schemeSwitch ? `<script src="${SCHEME_SCRIPT_PATH}"></script>` : '',
    `<link rel="stylesheet" href="${STYLESHEET}">`,
    css ? `<style>${css}</style>` : '',
    structured(site, head.data),
  ].filter(Boolean);
  return `<!doctype html>\n<html lang="${esc(site.language)}">\n<head>\n${lines.join('\n')}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

export function renderPage(site: Site, theme: Theme, page: Page, menu: MenuItem[], lists: EntryLists = {}, alternates: Alternate[] = []): string {
  site = withScheme(site, theme);
  const { body, css } = renderParts(site, theme, page, menu, false, lists, alternates);
  return documentHtml(
    site,
    {
      // A title for search engines is the whole title (ADR 0050 d1).
      title: page.seoTitle || (page.slug ? `${page.title} · ${site.name}` : site.name),
      shareTitle: page.seoTitle || (page.slug ? page.title : site.name),
      description: pageDescription(page),
      path: pagePath(page.slug),
      type: 'website',
      image: page.shareImage?.src,
      noindex: page.noindex,
      // Only a page's own translations: a language's home page is not this page in that language.
      alternates: alternates.filter((a) => a.translated).length > 1 ? alternates.filter((a) => a.translated) : [],
      // The home page says what the site is, and whose.
      data: [
        ...(page.slug === '' ? [{ '@type': 'WebSite', '@id': `${site.url}/#website`, name: site.name, url: `${site.url}/`, inLanguage: site.language, publisher: { '@id': `${site.url}/#organization` } }, organization(site)] : []),
        // The questions the page answers (ADR 0061 d1).
        ...[faqData(page.blocks)].filter((d) => d !== null),
      ],
    },
    body,
    css,
  );
}

const feedOf = (site: Site, type: ContentType): string => (site.url && type.feed ? feedPath(type) : '');

export function renderPost(
  site: Site,
  theme: Theme,
  post: Post,
  menu: MenuItem[],
  type: ContentType = postsType(),
  lists: EntryLists = {},
  template: Block[] | null = null,
  alternates: Alternate[] = [],
): string {
  site = withScheme(site, theme);
  const { body, css } = renderPostParts(site, theme, post, menu, false, type, lists, template, false, alternates);
  const trail = breadcrumbData(site.url, entryTrail(wordsFor(site.language).home, type, post));
  // An event or a product, and the questions the entry answers (ADR 0061 d1, d3).
  const own = entrySchemaData(site, type, post, `${site.url}${entryPath(type, post.slug)}`, postDescription(post));
  const more = [own, faqData(post.blocks)].filter((d) => d !== null);
  if (own) more.push(organization(site));
  return documentHtml(
    site,
    {
      title: post.seoTitle || `${post.title} · ${site.name}`,
      shareTitle: post.seoTitle || post.title,
      description: postDescription(post),
      path: entryPath(type, post.slug),
      type: 'article',
      image: post.shareImage?.src ?? post.cover?.src,
      noindex: post.noindex,
      feed: feedOf(site, type),
      // Each language the entry is in, for search engines (ADR 0054 d5).
      alternates: alternates.filter((a) => a.translated).length > 1 ? alternates.filter((a) => a.translated) : [],
      // A dated entry is an article: its headline, its day, its picture, and who published it.
      // A dated entry is an article, unless its type says it is an event or a product (ADR 0061 d3).
      data: type.dated && !type.schema
        ? [
            {
              '@type': 'BlogPosting',
              headline: post.title,
              datePublished: post.date,
              url: `${site.url}${entryPath(type, post.slug)}`,
              inLanguage: site.language,
              ...(postDescription(post) ? { description: postDescription(post) } : {}),
              ...(post.cover ? { image: absolute(site, post.cover.src) } : {}),
              ...(post.categories.length ? { articleSection: post.categories[0] } : {}),
              ...(post.tags.length ? { keywords: post.tags.join(', ') } : {}),
              publisher: { '@id': `${site.url}/#organization` },
              // Who wrote it, when the site names them (ADR 0055 d3); otherwise the business.
              author: post.author ? { '@type': 'Person', name: post.author.name, ...(post.author.slug ? { url: `${site.url}${typeAuthorPath(type, post.author.slug)}` } : {}) } : { '@id': `${site.url}/#organization` },
            },
            organization(site),
            trail,
            ...more,
          ]
        : [trail, ...more],
    },
    body,
    css,
  );
}

/** How a list is more than a type's list (ADR 0056): whose it is, of which types, and whether search engines keep it. */
export interface ListOptions {
  /** Whose entries these are: their page says who they are, for visitors and for search engines. */
  person?: Byline | null;
  /** Each entry's own type, when they are of several. */
  kinds?: ContentType[];
  /** Where the list is, when it is not under one type. */
  trail?: Crumb[];
  /** What the menu marks as where the visitor is. */
  current?: string;
  /** A list that repeats what is listed elsewhere, as a month's: kept out of search engines. */
  noindex?: boolean;
}

/** One page of a list of entries: a type's own, one category or tag of it, one person's or one period's. */
export function renderBlogList(
  site: Site,
  list: { heading: string; path: string; posts: Post[]; newer?: string; older?: string; numbers?: string[]; at?: number },
  menu: MenuItem[],
  type: ContentType = postsType(),
  alternates: Alternate[] = [],
  options: ListOptions = {},
): string {
  const trail = options.trail ?? listTrail(wordsFor(site.language).home, type, list.heading, list.path);
  const crumbs = crumbsOf(site, trail);
  const { person = null, kinds = [], current = null } = options;
  const body = clean(render(BlogLayout, { props: { site, menu, heading: list.heading, posts: list.posts, newer: list.newer, older: list.older, numbers: list.numbers ?? [], at: list.at ?? 1, type, crumbs, kinds, person, current }, context: withAlternates(alternates) }).body);
  // A person's page is about them (schema.org ProfilePage).
  const profile = person
    ? [{ '@type': 'ProfilePage', url: `${site.url}${list.path}`, mainEntity: { '@type': 'Person', name: person.name, ...(person.bio ? { description: person.bio } : {}), ...(person.picture ? { image: absolute(site, person.picture.src) } : {}) } }]
    : [];
  return documentHtml(
    site,
    {
      title: `${list.heading} · ${site.name}`,
      shareTitle: list.heading,
      description: person?.bio ?? '',
      path: list.path,
      type: person ? 'profile' : 'website',
      image: person?.picture?.src,
      feed: options.kinds ? '' : feedOf(site, type),
      noindex: options.noindex,
      data: [...profile, breadcrumbData(site.url, trail)],
    },
    body,
    '',
  );
}
