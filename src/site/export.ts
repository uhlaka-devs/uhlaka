/**
 * Static export (ADR 0001 d9): the published site as plain files that any
 * host can serve. Nothing here runs when a visitor arrives.
 */
import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  type Audience,
  type Audiences,
  audienceFromWord,
  audienceWord,
  NO_AUDIENCES,
  authorPath,
  type Byline,
  datePath,
  periodName,
  periodsOf,
  typeAuthorPath,
  type Block,
  categoriesOf,
  type ContentType,
  contentTypes,
  entryPath,
  feedPath,
  imageSources,
  mediaSources,
  type PlacedPage,
  mediaKindOf,
  mediaNameOf,
  type MediaSize,
  mediaPath,
  listed,
  listPath,
  type MenuList,
  POSTS_TYPE,
  type Page,
  paginate,
  pagePath,
  type Post,
  type ShownComment,
  typeById,
  postExcerpt,
  postImageSources,
  typeCategoryPath,
  typeTagPath,
  type Redirect,
  redirectFile,
  redirectsFile,
  htaccessFile,
  type Site,
  type Theme,
  themeCss,
  FONTS_PATH,
  facesUsed,
  fontFacesCss,
  charsOf,
  alternates,
  pagesIn,
  fillSections,
  withAreas,
  languageOf,
  commentKey,
  entriesIn,
  entryAlternates,
  listAlternates,
  siteIn,
  slugsIn,
  typeIn,
  prefixOf,
} from '../core/index.ts';
import { wordsFor } from '../blocks/words.ts';
import { lockedPage, membersPage } from './locks.ts';
import { menuOf, pageSetting, renderBlogList, renderPage, renderPost, STYLESHEET, withScheme } from './document.ts';
import { SCHEME_SCRIPT, SCHEME_SCRIPT_PATH } from './scheme.ts';
import { checkRedirects, checkSeo, checkSite, describeCheck, type SiteCheck, serverOnly } from './check.ts';
import { BASE_CSS, SHIPPED_FACES, shippedFont } from './shipped.ts';
import { shopGate } from '../parts/shop/gate.ts';
import { STATS, type Store } from './store.ts';
import type { EditTarget } from './admin-bar.ts';

const MARKER = '.uhlaka-export';
const FEED_ENTRIES = 30;

const xml = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Gives a stored image's bytes by name; null when the site does not have it. */
export type MediaSource = (name: string) => Uint8Array | null | Promise<Uint8Array | null>;

/** `/blog/` → `blog/index.html`. */
const fileOf = (path: string): string => `${path.slice(1)}index.html`;

/** The newest posts as an Atom feed, for people who follow the site in a reader. */
function feed(site: Site, type: ContentType, posts: Post[]): string {
  const day = (date: string): string => `${date}T00:00:00Z`;
  const entries = posts.slice(0, FEED_ENTRIES).map((post) => {
    const url = xml(`${site.url}${entryPath(type, post.slug)}`);
    return [
      '  <entry>',
      `    <title>${xml(post.title)}</title>`,
      `    <link href="${url}"/>`,
      `    <id>${url}</id>`,
      `    <updated>${day(post.date)}</updated>`,
      `    <summary>${xml(postExcerpt(post))}</summary>`,
      ...[...post.categories, ...post.tags].map((name) => `    <category term="${xml(name)}"/>`),
      '  </entry>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${xml(site.language)}">`,
    `  <title>${xml(type.id === POSTS_TYPE ? site.name : `${site.name}: ${type.name}`)}</title>`,
    `  <id>${xml(`${site.url}${listPath(type)}`)}</id>`,
    `  <link href="${xml(`${site.url}${listPath(type)}`)}"/>`,
    `  <link rel="self" href="${xml(`${site.url}${feedPath(type)}`)}"/>`,
    `  <updated>${day(posts[0]?.date ?? '1970-01-01')}</updated>`,
    `  <author><name>${xml(site.name)}</name></author>`,
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}

/** The people who wrote these entries, each with theirs, in the order they first appear: only those with a page (a name). */
function authorsOf(posts: Post[]): { person: Byline; posts: Post[] }[] {
  const found = new Map<string, { person: Byline; posts: Post[] }>();
  for (const post of posts) {
    const slug = post.author?.slug;
    if (!post.author || !slug) continue;
    const one = found.get(slug) ?? { person: post.author, posts: [] };
    one.posts.push(post);
    found.set(slug, one);
  }
  return [...found.values()];
}

/** What marks a page behind a password, for the runtime: its content is the page's address in the main language. */
export const LOCK_META = 'uhlaka-locked';

/** What marks a page for visitors signed in or for members (ADR 0064 d4): its content says who sees it. */
export const MEMBERS_META = 'uhlaka-members';

/** Who sees a built file, when it is not for everyone. */
export const membersOf = (html: string): Audience | null => {
  const found = new RegExp(`<meta name="${MEMBERS_META}" content="([^"]*)">`).exec(html);
  return found ? audienceFromWord(found[1] as string) : null;
};

/** The page behind a password a built file is, or null. */
export const lockOf = (html: string): string | null => {
  const found = new RegExp(`<meta name="${LOCK_META}" content="([^"]*)">`).exec(html);
  return found ? (found[1] as string).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null;
};

/**
 * The whole site as `path → contents`, without touching the disk. Of the
 * stored images, only those something published shows are included.
 */
export async function buildSite(
  site: Site,
  theme: Theme,
  pages: Page[],
  media: MediaSource = () => null,
  /** Published entries: the posts alone, or every type's by the type's name. */
  entries: Post[] | Record<string, Post[]> = [],
  redirects: Redirect[] = [],
  /** Each type's own page (ADR 0015), by the type's name; a type without one uses the default page. */
  templates: Record<string, Block[] | null> = {},
  /** Published sections (ADR 0033): drawn where a page shows them, in the page's language. */
  sections: Page[] = [],
  /** The stored pictures' sizes and smaller copies (ADR 0005 d8): each picture is offered at the size that fits. */
  images: Record<string, MediaSize> = {},
  /** The approved comments (ADR 0040), by `type/entry`: shown under the entries of a type that takes them. */
  comments: Record<string, ShownComment[]> = {},
  /** The pages behind a password (ADR 0043): each address, with the page it belongs to. */
  locked: Record<string, string> = {},
  /** Who wrote each entry, by `type/entry` (ADR 0055 d3): shown under the title of a dated one. */
  bylines: Record<string, Byline> = {},
  /** When each page (by its main address) and each entry (by `type/entry`) was last published: the sitemap's dates (ADR 0058 d3). */
  times: PublishedTimes = {},
  /** Who sees each page, entry and type that is not for everyone (ADR 0064 d4). */
  audiences: Audiences = NO_AUDIENCES,
  /** Filled with what each page and entry address is in the editor, for the admin bar of a served site (ADR 0075). */
  targets?: Map<string, EditTarget>,
  /** The bytes of a file of the site's own fonts (ADR 0085 d6). */
  fontFile: (name: string) => Promise<Uint8Array | null> = async () => null,
): Promise<Map<string, string | Uint8Array>> {
  const files = new Map<string, string | Uint8Array>();
  /** Each address for visitors signed in or for members, with who sees it: marked for the runtime at the end. */
  const members = new Map<string, Audience>();
  /** Who sees an entry: its type's audience first, then its own. */
  const audienceOf = (typeId: string, post: Post): Audience | undefined => audiences.types[typeId] ?? audiences.entries[`${typeId}/${post.of ?? post.slug}`];
  site = { ...withScheme(site, theme), pictures: { sizes: images, widths: theme.tokens.width } };
  // Each section block holds its section's blocks from here on, so the pages, their pictures and their links include them.
  pages = pages.map((p) => ({ ...p, blocks: fillSections(p.blocks, sections, languageOf(site, p.slug)) }));
  const published = Array.isArray(entries) ? { [POSTS_TYPE]: entries } : entries;
  /** Where each entry is in each other language, for the links between entries there (ADR 0054). */
  const slugs = Object.fromEntries(site.languages.map((language) => [language, slugsIn(language, published)]));
  const commented = (id: string, post: Post, language: string): Post => {
    const author = bylines[`${id}/${post.of ?? post.slug}`];
    const signed = author ? { ...post, author } : post;
    return typeById(site, id)?.comments ? { ...signed, comments: comments[commentKey(id, post.of ?? post.slug, language === site.language ? '' : language)] ?? [] } : signed;
  };
  /**
   * Each language with its entries (ADR 0054): the main language's as they
   * are, another's only those translated into it, in its type's words. A type
   * with nothing published in a language has no list there, and so no place
   * in its menu.
   */
  const languages = [site.language, ...site.languages].map((language) => {
    const types = contentTypes(site)
      .map((type) => {
        const local = typeIn(site, type, language);
        const own = entriesIn(site, type, published[type.id] ?? [], language, slugs[language] ?? {}).map((post) => commented(type.id, { ...post, blocks: fillSections(post.blocks, sections, language) }, language));
        return { type: local, main: type, posts: listed(local, own) };
      })
      .filter((t) => t.posts.length > 0);
    const lists = types.map(({ type }): MenuList => ({ id: type.id, title: type.name, href: listPath(type) }));
    // What a block that lists entries shows: only what is published, in the page's language.
    const listable = Object.fromEntries(types.map(({ type, posts: own }) => [type.id, { type, entries: own }]));
    return { language, types, lists, listable };
  });
  const main = languages[0] as (typeof languages)[number];
  const inLanguage = (language: string) => languages.find((l) => l.language === language) ?? main;
  const posts = languages.flatMap((l) => l.types.flatMap((t) => t.posts));
  const menu = menuOf(site, pagesIn(site, site.language, pages), main.lists);
  const homes = alternates(site, null, pages);
  /** Every address a visitor can open, for the sitemap. */
  const paths: string[] = [];
  /** Addresses that are there but kept out of the sitemap: a period's list, which only repeats (ADR 0056 d4). */
  const unlisted = new Set<string>();
  /** What the sitemap says of an address besides where it is: when it last changed, and its pictures (ADR 0058 d3). */
  const about = new Map<string, { at?: string | undefined; images: string[] }>();
  const page = (path: string, html: string, hidden = false, at?: string, images: string[] = []): void => {
    files.set(fileOf(path), html);
    // A page hidden from search engines is not in the sitemap (ADR 0050 d3).
    if (!hidden) paths.push(path);
    else unlisted.add(path);
    about.set(path, { at, images });
  };

  // The structure first, the theme after it: where both set the same thing, the theme wins.
  files.set(STYLESHEET.slice(1), `${BASE_CSS}${themeCss(theme)}`);
  // The switch's script, only while the theme follows the visitor (ADR 0074 d4).
  if (site.schemeSwitch) files.set(SCHEME_SCRIPT_PATH.slice(1), SCHEME_SCRIPT);
  // What each page and entry is as data, written beside it at the end (ADR 0057 d3).
  const data: Data[] = [];
  for (const p of pages) {
    const setting = pageSetting(site, p.slug, pages, main.lists, (language) => inLanguage(language).lists);
    page(
      pagePath(p.slug),
      renderPage(withAreas(setting.site, sections, setting.site.language), theme, p, setting.menu, inLanguage(setting.site.language).listable, setting.alternates),
      p.noindex,
      times.pages?.[(p as Partial<PlacedPage>).of ?? p.slug],
      imageSources(p.blocks),
    );
    data.push({ path: pagePath(p.slug), language: setting.site.language, page: p });
    targets?.set(pagePath(p.slug), { kind: 'page', slug: p.slug, main: (p as Partial<PlacedPage>).of ?? p.slug });
    const audience = audiences.pages[(p as Partial<PlacedPage>).of ?? p.slug];
    if (audience) members.set(pagePath(p.slug), audience);
  }
  // A page behind a password says so to the runtime, which asks for it; search engines are asked to keep none of it.
  for (const [path, slug] of Object.entries(locked)) {
    const html = files.get(fileOf(path));
    if (typeof html !== 'string') continue;
    files.set(fileOf(path), html.replace('<head>', `<head>\n<meta name="robots" content="noindex">\n<meta name="${LOCK_META}" content="${xml(slug)}">`));
    if (paths.includes(path)) paths.splice(paths.indexOf(path), 1);
  }
  // What a layout shows around the main language's entries and lists (ADR 0035).
  const framed = withAreas(site, sections, site.language);

  for (const { language, types, lists: own, listable } of languages) {
    const local = language === site.language ? site : siteIn(site, language, pages);
    const frame = language === site.language ? framed : withAreas(local, sections, language);
    const localMenu = language === site.language ? menu : menuOf(local, pagesIn(site, language, pages), own);
    const here = alternates(site, null, pages, language);
    const has = (id: string) => (other: string) => !!languages.find((l) => l.language === other)?.types.some((t) => t.type.id === id);
    for (const { type, main: original, posts: list } of types) {
      const template = templates[type.id] ? fillSections(templates[type.id] as Block[], sections, language) : null;
      const byMain = new Map((published[type.id] ?? []).map((p) => [p.slug, p]));
      for (const post of list) {
        const from = byMain.get(post.of ?? post.slug) as Post;
        page(
          entryPath(type, post.slug),
          renderPost(frame, theme, post, localMenu, type, listable, template, site.languages.length ? entryAlternates(site, original, from, here, language) : []),
          post.noindex,
          times.entries?.[`${type.id}/${post.of ?? post.slug}`],
          [...(post.cover ? [post.cover.src] : []), ...imageSources(post.blocks)],
        );
        data.push({ path: entryPath(type, post.slug), language, post, type });
        // An entry in another language is opened in the editor at `ro/<address>` (ADR 0054).
        targets?.set(entryPath(type, post.slug), { kind: original.id, slug: language === site.language ? post.slug : `${prefixOf(language)}/${post.slug}`, main: from.slug, singular: original.singular });
        const audience = audienceOf(original.id, from);
        if (audience) members.set(entryPath(type, post.slug), audience);
      }
      // What only members see is in no list of data and in no feed; a list still names it, and its page asks who opens it.
      const open = list.filter((post) => !audienceOf(original.id, byMain.get(post.of ?? post.slug) as Post));
      const whole = audiences.types[original.id];
      if (!whole) data.push({ path: listPath(type), language, type, list: open });
      const listed = site.languages.length ? listAlternates(site, original, has(type.id), here, language) : [];
      type List = { heading: string; path: (n: number) => string; posts: Post[]; alternates: typeof here; person?: Byline; noindex?: boolean };
      const pagesOf: List[] = [
        { heading: type.name, path: (n: number) => listPath(type, n), posts: list, alternates: listed },
        ...categoriesOf(list).map((c) => ({ heading: c.name, path: (n: number) => typeCategoryPath(type, c.name, n), posts: c.posts, alternates: here })),
        ...categoriesOf(list, 'tags').map((c) => ({ heading: `#${c.name}`, path: (n: number) => typeTagPath(type, c.name, n), posts: c.posts, alternates: here })),
        // A dated type's entries by who wrote them, and by year, month and day (ADR 0056); a period's list only repeats, so search engines keep none.
        ...(type.dated
          ? [
              ...authorsOf(list).map(({ person, posts: own }) => ({ heading: person.name, path: (n: number) => typeAuthorPath(type, person.slug as string, n), posts: own, alternates: here, person })),
              ...([4, 7, 10] as const).flatMap((length) =>
                periodsOf(list, length).map(({ period, posts: own }) => ({ heading: periodName(period, language), path: (n: number) => datePath(type, period, n), posts: own, alternates: here, noindex: true })),
              ),
            ]
          : []),
      ];
      for (const one of pagesOf) {
        const cut = paginate(one.posts);
        cut.forEach((some, i) => {
          const path = one.path(i + 1);
          const html = renderBlogList(frame, { heading: one.heading, path, posts: some, newer: i > 0 ? one.path(i) : '', older: i < cut.length - 1 ? one.path(i + 2) : '' }, localMenu, type, i === 0 ? one.alternates : here, {
            person: one.person ?? null,
            noindex: one.noindex,
          });
          page(path, html, one.noindex);
          // A whole type for members is so in each of its lists (ADR 0064 d4).
          if (whole) members.set(path, whole);
        });
      }
      // A feed names every entry by its full address, so it needs the site's own.
      if (site.url && type.feed && !whole) files.set(feedPath(type).slice(1), feed(local, type, open));
    }
    // Each person's page across every dated type of this language (ADR 0056 d3), newest first.
    const all = types.filter((t) => t.type.dated).flatMap(({ type, posts: own }) => own.map((post) => ({ type, post })));
    const prefix = language === site.language ? '' : `/${prefixOf(language)}`;
    for (const { person, posts: own } of authorsOf(all.map((one) => one.post))) {
      const mine = all.filter((one) => own.includes(one.post)).sort((a, b) => (a.post.date === b.post.date ? a.post.slug.localeCompare(b.post.slug) : a.post.date < b.post.date ? 1 : -1));
      const cut = paginate(mine);
      const at = (n: number): string => authorPath(prefix, person.slug as string, n);
      const trail = [
        { name: wordsFor(language).home, href: `${prefix}/` },
        { name: person.name, href: at(1) },
      ];
      cut.forEach((some, i) => {
        const path = at(i + 1);
        const list = { heading: person.name, path, posts: some.map((one) => one.post), newer: i > 0 ? at(i) : '', older: i < cut.length - 1 ? at(i + 2) : '' };
        page(path, renderBlogList(frame, list, localMenu, some[0]?.type, here, { person, kinds: some.map((one) => one.type), trail, current: '' }));
      });
    }
  }

  const shown: [string, string][] = [
    ...pages.flatMap((p) => [...mediaSources(p.blocks), ...(p.shareImage ? [p.shareImage.src] : [])].map((src): [string, string] => [`the page "${p.title}"`, src])),
    ...posts.flatMap((p) => postImageSources(p).map((src): [string, string] => [`the entry "${p.title}"`, src])),
    ...main.types.flatMap(({ type }) => mediaSources(fillSections(templates[type.id] ?? [], sections, site.language)).map((src): [string, string] => [`the page of "${type.name}"`, src])),
  ];
  for (const [name, blocks] of Object.entries(framed.areas ?? {})) for (const src of mediaSources(blocks)) shown.push([`the section "${name}" of a layout`, src]);
  // Each person's picture, beside what they wrote and on their page (ADR 0056 d2).
  for (const post of posts) if (post.author?.picture) shown.push([`the picture of ${post.author.name}`, post.author.picture.src]);
  if (site.logo) shown.push(['the header', site.logo.src]);
  if (site.shareImage) shown.push(['the picture for sharing, in Settings', site.shareImage.src]);
  for (const [where, src] of shown) {
    const name = mediaNameOf(src);
    if (!name || files.has(src.slice(1))) continue;
    const bytes = await media(name);
    // A site that would show a broken picture, or link to a missing file, is not published quietly.
    if (!bytes) throw new Error(`${where} ${mediaKindOf(name) === 'image' ? 'shows an image' : 'links to a file'} this site does not have: ${src}`);
    files.set(src.slice(1), bytes);
    // Its smaller copies go with it, for the srcset that names them.
    for (const variant of images[name]?.variants ?? []) {
      const copy = await media(variant);
      if (copy) files.set(mediaPath(variant).slice(1), copy);
    }
  }

  // An old address is kept only where nothing lives now and what it leads to is published.
  const written: Redirect[] = [];
  for (const { from, to } of redirects) {
    const file = redirectFile(from);
    const target = to.split('#')[0] as string;
    if (files.has(file) || !(paths.includes(target) || unlisted.has(target))) continue;
    written.push({ from, to });
    const href = xml(to);
    files.set(
      file,
      `<!doctype html><html lang="${xml(site.language)}"><head><meta charset="utf-8"><title>${xml(site.name)}</title>` +
        `<link rel="canonical" href="${xml(site.url)}${href}"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${href}"></head>` +
        `<body><p><a href="${href}">${xml(site.name)}</a></p></body></html>\n`,
    );
  }

  // A host that reads a list of redirects answers with a real 301; any other serves the small pages above (ADR 0036).
  if (written.length) {
    files.set('_redirects', redirectsFile(written));
    files.set('.htaccess', htaccessFile(written));
  }
  files.set(
    '404.html',
    renderPage(framed, theme, { slug: '404', title: wordsFor(site.language).notFound, description: '', inMenu: false, blocks: [] }, menu),
  );
  // Each other language's frame, for what the runtime answers in it, such as search (ADR 0054).
  for (const { language, lists: own } of languages.slice(1)) {
    const local = siteIn(site, language, pages);
    files.set(`${prefixOf(language)}/404.html`, renderPage(withAreas(local, sections, language), theme, { slug: '404', title: wordsFor(language).notFound, description: '', inMenu: false, blocks: [] }, menuOf(local, pagesIn(site, language, pages), own)));
  }
  // A page for members says so to the runtime, which asks who opens it; search engines are asked to keep none of it (ADR 0064 d4).
  for (const [path, audience] of members) {
    const html = files.get(fileOf(path));
    if (typeof html !== 'string') continue;
    files.set(fileOf(path), html.replace('<head>', `<head>\n${html.includes('<meta name="robots" content="noindex">') ? '' : '<meta name="robots" content="noindex">\n'}<meta name="${MEMBERS_META}" content="${xml(audienceWord(audience))}">`));
    if (paths.includes(path)) paths.splice(paths.indexOf(path), 1);
  }
  if (site.url) {
    files.set('sitemap.xml', sitemapFile(site, paths, about));
  }
  files.set('robots.txt', robotsFile(site));
  if (site.data !== false) writeData(files, site, data.filter((d) => !(d.path in locked) && !members.has(d.path)));
  // The faces the stylesheet names (ADR 0068 d1, ADR 0085 d6), declared first in it and served beside it: only those that draw
  // a letter of the site's pages, or of the words the served site answers with, so a Romanian site never carries Japanese.
  const css = STYLESHEET.slice(1);
  const texts = [...files.values()].filter((f): f is string => typeof f === 'string');
  const words = site.languages.map((language) => JSON.stringify(wordsFor(language)));
  const used = facesUsed(texts, [...SHIPPED_FACES, ...(site.faces ?? [])], charsOf([...texts, ...words]));
  if (used.length && typeof files.get(css) === 'string') {
    files.set(css, `${fontFacesCss(used)}${files.get(css) as string}`);
    for (const face of used) {
      const bytes = (await shippedFont(face.file)) ?? (await fontFile(face.file));
      if (bytes) files.set(`${FONTS_PATH.slice(1)}${face.file}`, bytes);
    }
  }
  return files;
}

const DATA_FORMAT = 'uhlaka.data/1';
const jsonOf = (path: string): string => `${path.slice(1)}index.json`;

/** A page, an entry or a type's list, kept as it was drawn to be written as data. */
interface Data {
  path: string;
  language: string;
  page?: Page;
  post?: Post;
  type?: ContentType;
  list?: Post[];
}

/** The part of a drawn page that is its own, without the header and footer around it. */
const mainOf = (html: unknown): string => (typeof html === 'string' ? (/<main[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? '').trim() : '');

/** An entry as data: what its type shows, without what is kept only for the editor. */
function entryData(post: Post, type: ContentType, path: string, language: string, html?: string): Record<string, unknown> {
  return {
    path,
    type: type.id,
    language,
    title: post.title,
    description: post.description,
    date: post.date,
    excerpt: postExcerpt(post),
    cover: post.cover,
    categories: post.categories,
    tags: post.tags,
    fields: post.fields,
    ...(post.author ? { author: { name: post.author.name, slug: post.author.slug ?? '' } } : {}),
    ...(html === undefined ? {} : { blocks: post.blocks, html }),
  };
}

/**
 * The site's data as JSON beside its pages (ADR 0057 d3): each page and entry
 * at its address with `index.json`, each type's list the same way, and
 * `site.json` naming them all. Only what is published, never a page behind a
 * password: the same as the HTML, for an app or another site to read.
 */
function writeData(files: Map<string, string | Uint8Array>, site: Site, data: Data[]): void {
  const json = (value: unknown): string => `${JSON.stringify(value, null, 1)}\n`;
  const pages: { path: string; language: string; title: string; data: string }[] = [];
  const lists: { type: string; name: string; path: string; language: string; data: string }[] = [];
  for (const one of data) {
    const html = mainOf(files.get(fileOf(one.path)));
    const at = `/${jsonOf(one.path)}`;
    if (one.page) {
      files.set(jsonOf(one.path), json({ format: DATA_FORMAT, kind: 'page', path: one.path, language: one.language, title: one.page.title, description: one.page.description, blocks: one.page.blocks, html }));
      pages.push({ path: one.path, language: one.language, title: one.page.title, data: at });
    } else if (one.type && one.post) {
      files.set(jsonOf(one.path), json({ format: DATA_FORMAT, kind: 'entry', ...entryData(one.post, one.type, one.path, one.language, html) }));
    } else if (one.type && one.list) {
      const type = one.type;
      const entries = one.list.map((post) => ({ ...entryData(post, type, entryPath(type, post.slug), one.language), data: `/${jsonOf(entryPath(type, post.slug))}` }));
      files.set(jsonOf(one.path), json({ format: DATA_FORMAT, kind: 'list', path: one.path, language: one.language, type: { id: type.id, name: type.name }, entries }));
      lists.push({ type: type.id, name: type.name, path: one.path, language: one.language, data: at });
    }
  }
  files.set('site.json', json({ format: DATA_FORMAT, kind: 'site', name: site.name, url: site.url, language: site.language, languages: site.languages, pages, types: lists }));
}

/** When pages and entries were last published, as the store keeps it (ADR 0058 d3). */
export interface PublishedTimes {
  /** By the main page's address. */
  pages?: Record<string, string>;
  /** By `type/entry`. */
  entries?: Record<string, string>;
}

/**
 * The sitemap: each address, the day it was last published when that is
 * known, and the site's own pictures it shows (ADR 0058 d3). A picture on
 * another site is that site's to list.
 */
function sitemapFile(site: Site, paths: string[], about: Map<string, { at?: string | undefined; images: string[] }>): string {
  let pictures = false;
  const urls = paths.map((path) => {
    const { at, images } = about.get(path) ?? { images: [] };
    const own = [...new Set(images.filter((src) => src.startsWith('/') && !src.startsWith('//')))].slice(0, 1000);
    if (own.length) pictures = true;
    const day = at && /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : '';
    return [
      `  <url><loc>${xml(`${site.url}${path}`)}</loc>`,
      day ? `<lastmod>${day}</lastmod>` : '',
      ...own.map((src) => `<image:image><image:loc>${xml(`${site.url}${src}`)}</image:loc></image:image>`),
      '</url>',
    ].join('');
  });
  const spaces = `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${pictures ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ''}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${spaces}>\n${urls.join('\n')}\n</urlset>\n`;
}

/** `robots.txt`: every page may be read, then the owner's own lines (ADR 0058 d5), then where the sitemap is. */
export function robotsFile(site: Site): string {
  const own = site.robots ? `${site.robots}\n` : '';
  return `User-agent: *\nAllow: /\n${own}${site.url ? `\nSitemap: ${site.url}/sitemap.xml\n` : ''}`;
}

/**
 * Writes the published site into `outDir` and returns the paths written.
 *
 * The folder is emptied first, so it is only ever a folder this function
 * made: one that does not exist, is empty, or carries the marker of an earlier
 * export. Anything else is refused, because the alternative is deleting
 * someone's files.
 */
export async function exportSite(store: Store, outDir: string, warn: (line: string) => void = () => {}): Promise<string[]> {
  const files = await exportedFiles(store, warn);
  const existing = await readdir(outDir).catch(() => [] as string[]);
  if (existing.length > 0 && !existing.includes(MARKER)) {
    throw new Error(`${outDir} is not empty and was not made by an export; choose another folder`);
  }
  await rm(outDir, { recursive: true, force: true });

  files.set(MARKER, 'Made by uhlaka export. This folder is replaced on every export.\n');
  for (const [path, contents] of files) {
    const target = join(outDir, path);
    await mkdir(dirname(target), { recursive: true });
    await Bun.write(target, contents);
  }
  return [...files.keys()].sort();
}

/**
 * The files a static export writes, in memory: checked first, and a page
 * behind a password left out. What the folder gets, and the ZIP the admin
 * gives (ADR 0057 d4).
 */
export async function exportedFiles(store: Store, warn: (line: string) => void = () => {}): Promise<Map<string, string | Uint8Array>> {
  const files = await publishedSite(store);
  // A link that would lead nowhere is not published quietly either (ADR 0029).
  const { problems, warnings } = describeCheck(await fullCheck(store, files));
  if (problems.length) throw new Error(`Nothing was exported. A link leads to an address the site does not have:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  for (const line of warnings) warn(line);
  // A page behind a password is not written out: a static host cannot ask for it (ADR 0043).
  const frame = String(files.get('404.html'));
  for (const [path, contents] of files) if (typeof contents === 'string' && lockOf(contents) !== null) files.set(path, lockedPage(frame, null));
  // Nor one for members: a static host knows nobody (ADR 0064 d4).
  for (const [path, contents] of files) if (typeof contents === 'string' && membersOf(contents) !== null) files.set(path, membersPage(frame));
  return files;
}

/** What is wrong with the built site, and what of it only its own server answers (ADR 0029, ADR 0044). */
export async function fullCheck(store: Store, files: Map<string, string | Uint8Array>): Promise<SiteCheck> {
  const routes = (await store.extensions()).some((e) => e.enabled && e.manifest.routes.length > 0);
  return {
    ...checkSite(files),
    untranslated: await store.untranslated(),
    redirects: checkRedirects(files, await store.redirects()),
    server: serverOnly(files, { formsElsewhere: (await store.site()).forms !== '', routes, stats: (await store.extension(STATS))?.enabled === true, visitorLanguage: following(await store.site()) }),
    seo: checkSeo(files),
  };
}

/**
 * The published site as the files an export writes, in memory: what is checked
 * before anything is written. `served`: for the runtime, which reads documents,
 * sound and video from the library as they are asked for, so they are only
 * checked to be there and stand in the map empty (ADR 0046).
 */
/** Whether the home page follows the visitor's browser (ADR 0071 d3): on as soon as there is a second language, unless the owner turned it off. */
const following = (site: Site): boolean => site.languages.length > 0 && site.visitorLanguage !== false;

export async function publishedSite(store: Store, served = false, targets?: Map<string, EditTarget>): Promise<Map<string, string | Uint8Array>> {
  const theme = await store.publishedTheme();
  if (!theme) throw new Error('the theme is not published yet');
  const pages = await store.published();
  if (pages.length === 0) throw new Error('nothing is published yet');
  if (!pages.some((p) => p.slug === '')) throw new Error('the home page is not published');
  // Each form block is drawn with the form it names (ADR 0049), each extension's block with what it asks (ADR 0062 d6).
  // "My account" is in the menu only while visitor accounts are on (ADR 0064 d8).
  const accounts = ((await store.visitorSettings()) as { on?: unknown } | null)?.on === true;
  // A product's Buy part, only on a served site while the shop is on (ADR 0065 d3, d10): a static host has no cart.
  const shop = served ? await shopGate(store).shown() : null;
  const site = { ...(await store.site()), faces: await store.siteFaces(), formDefs: await store.formsByName(), extensionBlocks: await store.extensionBlocks(), accounts, ...(shop ? { shop } : {}), ...(served ? { served: true } : {}) };
  const entries: Record<string, Post[]> = {};
  const templates: Record<string, Block[] | null> = {};
  for (const type of contentTypes(site)) {
    entries[type.id] = await store.publishedEntries(type.id);
    templates[type.id] = await store.publishedTemplate(type.id);
  }
  const locks = new Set(await store.lockedPages());
  const locked = Object.fromEntries(pages.filter((p) => locks.has(p.of)).map((p) => [pagePath(p.slug), p.of]));
  const media: MediaSource = async (name) =>
    served && mediaKindOf(name) !== 'image' ? ((await store.hasMedia(name)) ? new Uint8Array(0) : null) : ((await store.mediaFile(name))?.bytes ?? null);
  return buildSite(site, theme, pages, media, entries, await store.redirects(), templates, await store.publishedSections(), await store.mediaSizes(), await store.shownComments(), locked, await store.bylines(), await store.publishedTimes(), await store.audiences(), targets, (name) => store.fontFile(name));
}
