/**
 * The editing server: `uhlaka edit site.db`. It serves the admin, the canvas
 * the admin edits on, and a small JSON API over the store.
 *
 * It is a tool for one person on their own computer, so it listens on
 * 127.0.0.1 only. That is not enough on its own: any web page that person has
 * open can send requests to localhost. So every API call must carry a token
 * that only the admin page was given, must name this server as its host (a
 * page that points its own domain at 127.0.0.1 does not), and must not come
 * from another origin.
 *
 * Given a public address (`uhlaka serve`), it is a server others reach, and
 * it has accounts instead (ADR 0022, src/site/accounts.ts): a session cookie,
 * a header no other site's page can send, and calls only the owner may make.
 */
import { mediaResponse } from './serve-media.ts';
import { startClock } from './clock.ts';
import { backups, type Remote, type S3Settings } from './backup.ts';
import { isEmail, type Mailer, smtpMailer } from './mail.ts';
import { defaultTemplate as defaultMail, extensionMailKey, mailAddress, normalizeMailSettings, normalizeTemplates, ORDER_TEMPLATES, siteMailer, type Template, TEMPLATES } from './site-mail.ts';
import { startRuntime } from './runtime.ts';
import { zoneFor } from './stats.ts';
import { isValkeyAddress, openShared, type Shared, shownAddress, switchable, testValkey } from './shared.ts';

/** The admin's own addresses; every other is the site's (ADR 0044). */
const ADMIN_PATHS = new Set(['/admin', '/preview']);
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { compile } from 'svelte/compiler';
import { prefixOf, typeIn, SECTION_KIND, type Block, cleanSeo, type Form, fillSections, takeWords, withAreas, type Site, siteIn, type PlacedPage, translatedPage, cleanRow, EXTENSION_MAX_BYTES, type ExtensionManifest, extensionAsks, extensionWord, isObject, languageOf, normalizeBlocks, shownRow, uniqueFields, str, type ContentType, DISPLAY_NAME, type LanguagePack, defaultTemplate, MEDIA_MAX_BYTES, MEDIA_PREFIX, UPLOAD_MAX_BYTES, EMBED_ORIGINS, normalizePage, type Page, type Post, contentTypes, listPath, type MenuList, normalizePost, parseTheme, pagesIn, POSTS_TYPE, reservedSlugs, slugProblem, type Theme, themeCss, FONTS_PATH, fontFacesCss } from '../core/index.ts';
import type { EntryLists } from '../blocks/editing.ts';
import { type FetchImage, fetchImage as fetchOverNetwork, IMPORT_MAX_BYTES, type ImportReport, runImport } from '../import/run.ts';
import { type ImportPlan, planImport } from '../import/wxr.ts';
import { contentPreview, isContentFile, readContentFile, runContentImport } from '../import/uhlaka.ts';
import { contentFileName, contentParts, exportContent } from './transfer.ts';
import { zipFiles } from './zip.ts';
import { type MenuItem, menuOf, pageSetting, renderParts, renderPostParts } from './document.ts';
import { languages, packFor } from './languages.ts';
import { accounts, cleanPublicAddress, cookieOf, ownerOnly, shown } from './accounts.ts';
import { backTo, barHtml, barLinks, barWords, SIGN_OUT_PATH, withBar } from './admin-bar.ts';
import { shopGate } from '../parts/shop/gate.ts';
import { extensionHost, type Spawn } from './extensions.ts';
import { BUILT_ADMIN } from './built-admin.ts';
import { ADMIN_ICON, ADMIN_TOKENS, BASE_CSS, SHIPPED_STATS, SHIPPED_THEMES, shippedFonts } from './shipped.ts';
import { STATS, type Store, type User, writesAll } from './store.ts';
import { reportsOf, rowWrites } from '../view/index.ts';
import { newer } from './update.ts';
import { exportedFiles, fullCheck, publishedSite } from './export.ts';
import { indexNow } from './indexnow.ts';
import { seoRows, setSeo } from './seo-table.ts';
import { cleanSearchConsole, type SearchReport, searchReport } from './search-console.ts';

/** Where the Search Console report is kept, and for how long: Google counts it again once a day. */
const SEARCH_REPORT = 'searchconsole:report';
const SEARCH_REPORT_MS = 60 * 60_000;

const ADMIN = new URL('../admin/', import.meta.url);

/**
 * The admin and the canvas script, built for a browser from their sources.
 *
 * With UHLAKA_COVERAGE set to a folder, the build also writes its source maps
 * there, and the Svelte compiler's own, so that what the browser ran in the
 * end-to-end tests can be counted against the source lines (tools/coverage.ts).
 */
export async function buildAdmin(coverage = process.env.UHLAKA_COVERAGE): Promise<Map<string, string>> {
  const svelteMaps: Record<string, unknown> = {};
  const result = await Bun.build({
    entrypoints: [new URL('main.ts', ADMIN).pathname, new URL('frame.ts', ADMIN).pathname],
    target: 'browser',
    conditions: ['browser'],
    sourcemap: coverage ? 'external' : 'none',
    plugins: [
      {
        name: 'svelte-client',
        setup(build) {
          build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
            const source = await Bun.file(path).text();
            const { js } = compile(source, { filename: path, generate: 'client', css: 'injected', dev: false });
            if (coverage) svelteMaps[path] = js.map;
            return { contents: js.code, loader: 'js' };
          });
        },
      },
    ],
  });
  if (!result.success) throw new AggregateError(result.logs, 'the admin did not build');
  const files = new Map<string, string>();
  const maps: Record<string, unknown> = {};
  for (const output of result.outputs) {
    const name = output.path.replace(/^.*[\\/]/, '').replace(/^main\.js/, 'app.js');
    if (output.kind === 'sourcemap') maps[name.replace(/\.map$/, '')] = await output.json();
    else files.set(name, await output.text());
  }
  if (coverage) {
    await mkdir(coverage, { recursive: true });
    await Bun.write(join(coverage, 'admin-maps.json'), JSON.stringify({ root: process.cwd(), bundles: maps, svelte: svelteMaps }));
  }
  return files;
}

/** The themes that ship with the CMS, for the theme picker. */
export function bundledThemes(): Theme[] {
  return Object.keys(SHIPPED_THEMES)
    .sort()
    .flatMap((file) => parseTheme(SHIPPED_THEMES[file]).theme ?? []);
}

// The canvas plays the players a page may show (ADR 0047).
const CSP = `default-src 'self'; img-src 'self' http: https: data:; style-src 'self' 'unsafe-inline'; frame-src 'self' ${EMBED_ORIGINS.join(' ')}; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`;
const SECURITY = { 'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };

const html = (body: string): Response => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY } });
const text = (body: string, type: string): Response => new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, ...SECURITY } });
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY } });

/** The admin's page, with the words of its language in it, read before the admin starts (ADR 0021). */
const adminPage = (pack: LanguagePack | null): string => `<!doctype html>
<html lang="${(pack?.language ?? 'en').replace(/[^A-Za-z0-9-]/g, '')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${DISPLAY_NAME}</title>
<link rel="icon" href="/admin/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/admin/admin.css">
</head>
<body>
<div id="app"></div>
<script type="application/json" id="cms-language">${JSON.stringify(pack).replace(/</g, '\\u003c')}</script>
<script type="module" src="/admin/app.js"></script>
</body>
</html>
`;

const previewPage = (language: string): string => `<!doctype html>
<html lang="${language.replace(/[^A-Za-z0-9-]/g, '')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/admin/site.css" id="cms-theme">
<style id="cms-own"></style>
</head>
<body>
<div id="cms-root"></div>
<script type="module" src="/admin/frame.js"></script>
</body>
</html>
`;

function sameToken(given: string | null, token: string): boolean {
  if (!given || given.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= given.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export interface EditorServer {
  /** The address to open, token included. */
  url: string;
  /** With accounts and no owner yet: the one-time link that makes the first owner. */
  setupUrl: string;
  token: string;
  port: number;
  /** One request, answered without a network: what the tests call. */
  fetch: (request: Request) => Promise<Response>;
  stop: () => void;
}

/** What an export file would bring, counted, for the owner to look at before anything is written. */
export interface ImportPreview {
  /** Where it came from: a WordPress export, or a Uhlaka content export (ADR 0057). */
  kind?: 'uhlaka';
  site: { name: string; url: string };
  pages: number;
  posts: number;
  /** A Uhlaka content export's sections and forms. */
  sections?: number;
  forms?: number;
  /** The kinds of entry asked for, as content types. */
  types: { id: string; name: string; count: number }[];
  /** Kinds a plugin or theme added that could be brought as content types. */
  others: { type: string; count: number }[];
  /** Categories of posts that could each become a content type (ADR 0016). */
  categories: { nicename: string; name: string; count: number }[];
  images: number;
  redirects: number;
  menu: boolean;
  notes: string[];
}

/** Where an import started from the admin has got to. */
export type ImportProgress =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; report: ImportReport }
  | { status: 'failed'; error: string };

const preview = (plan: ImportPlan): ImportPreview => ({
  site: { name: plan.site.name, url: plan.site.url },
  pages: plan.pages.length,
  posts: plan.posts.length,
  types: plan.types.map((type) => ({ id: type.id, name: type.name, count: plan.entries[type.id]?.length ?? 0 })),
  others: plan.others,
  categories: plan.categories,
  images: plan.images.length,
  redirects: plan.redirects.length,
  menu: plan.menu !== null,
  notes: plan.notes,
});

export async function startEditor(
  store: Store,
  options: {
    port?: number;
    listen?: boolean;
    /** How an import fetches images; the tests give their own. */
    fetchImage?: FetchImage;
    /** The admin's public address, `https://cms.example.com`: with it, people sign in with accounts (ADR 0022). */
    public?: string;
    /** Where to listen; this machine unless said otherwise. */
    hostname?: string;
    /** How an extension's process is started; the tests give their own. */
    spawnExtension?: Spawn;
    /** How the owner is told of a message or a comment (ADR 0019). */
    mailer?: Mailer | null;
    to?: string;
    from?: string;
    log?: (line: string) => void;
    /** Valkey's address from UHLAKA_VALKEY_URL (ADR 0044 d4): it comes before the one saved in Settings → Performance, which cannot change it. */
    valkey?: string;
    /** Where what is kept without Valkey is also written to disk. */
    cacheDir?: string;
    /** What the site's processes share, given whole; the tests give their own. */
    shared?: Shared;
    /** The folder backups are kept in (ADR 0051); without it, the site makes none. */
    backups?: string;
    /** Where a copy of each backup is sent; S3 unless a test gives its own. */
    backupRemote?: (s3: S3Settings) => Remote;
    /** How Google is asked for the Search Console report; the tests give their own. */
    searchConsoleFetch?: (url: string, init: RequestInit) => Promise<Response>;
    /** How IndexNow is told; the tests give their own. */
    indexNowFetch?: (url: string, init: RequestInit) => Promise<Response>;
  } = {},
): Promise<EditorServer> {
  const assets = BUILT_ADMIN ? new Map(Object.entries(BUILT_ADMIN)) : await buildAdmin();
  const themes = bundledThemes();
  const baseCss = BASE_CSS;
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  let port = options.port ?? 4321;
  const publicAddress = options.public ? cleanPublicAddress(options.public) : '';
  if (options.public && !publicAddress) throw new Error('the public address is https://, with nothing after the host (http:// only on this machine)');
  // What the site's processes share: Valkey when an address is set, this process otherwise (ADR 0044 d4).
  const fromEnvironment = options.valkey ?? '';
  const keptAt = { dir: options.cacheDir, log: options.log };
  const shared = switchable(options.shared ?? openShared(fromEnvironment || (await store.valkeyAddress()), keptAt));
  const people = publicAddress ? accounts(store, publicAddress, shared) : null;
  /** On one's own computer, whoever has the key is the owner. */
  const LOCAL_OWNER: User = { id: 'local', email: '', name: '', role: 'owner', active: true, createdAt: '' };

  const theme = async (): Promise<Theme> => {
    const current = await store.theme();
    if (!current) throw new Error('this site has no theme yet');
    return current;
  };
  type Listed = Awaited<ReturnType<Store['entries']>>;
  /** Each content type's entries, by the type's name. */
  const allEntries = async (): Promise<Record<string, Listed>> => {
    const out: Record<string, Listed> = {};
    // Each entry says which link to it (ADR 0052 d4), so deleting it is never a surprise.
    const uses = await store.linkedFrom();
    // Who wrote each, and where it is in its review (ADR 0055).
    const authors = await store.entryAuthors();
    const reviews = new Map((await store.reviews()).map((r) => [`${r.type}/${r.slug}`, { state: r.state, note: r.note, at: r.at }]));
    for (const type of contentTypes(await store.site())) {
      out[type.id] = (await store.entries(type.id)).map((entry) => {
        const key = `${type.id}/${entry.slug}`;
        return { ...entry, ...(uses.get(key) ? { usedBy: uses.get(key) } : {}), ...(authors.get(key) ? { author: authors.get(key) } : {}), ...(reviews.get(key) ? { review: reviews.get(key) } : {}) };
      });
    }
    return out;
  };
  // The menu as the editor shows it: from the drafts, with each content type as soon as it has an entry.
  const menuLists = async (): Promise<MenuList[]> => {
    const entries = await allEntries();
    return contentTypes(await store.site())
      .filter((type) => (entries[type.id]?.length ?? 0) > 0)
      .map((type): MenuList => ({ id: type.id, title: type.name, href: listPath(type) }));
  };
  /** The main language's menu: entries are in it (ADR 0024). */
  const menu = async (): Promise<MenuItem[]> => {
    const site = await store.site();
    return menuOf(site, pagesIn(site, site.language, await store.pages()), await menuLists());
  };
  // What a block that lists entries shows in the editor: the drafts, so a post just written is there.
  const entryLists = async (): Promise<EntryLists> => {
    const out: EntryLists = {};
    for (const type of contentTypes(await store.site())) out[type.id] = { type, entries: await store.draftEntries(type.id) };
    return out;
  };
  /** Every list the admin shows: the pages, and each content type's entries by the type's name. */
  /** Each type's own page (ADR 0015): whether it has one, and whether visitors see what is being worked on. */
  const templates = async (): Promise<Record<string, { custom: boolean; published: boolean; changed: boolean }>> => {
    const out: Record<string, { custom: boolean; published: boolean; changed: boolean }> = {};
    for (const type of contentTypes(await store.site())) {
      const draft = await store.template(type.id);
      const live = await store.publishedTemplate(type.id);
      out[type.id] = { custom: draft !== null, published: live !== null || draft === null, changed: JSON.stringify(draft) !== JSON.stringify(live) };
    }
    return out;
  };
  /** The forms, where each is shown, and how many messages each has (ADR 0049). */
  const formsState = async (): Promise<{ forms: Form[]; usedOn: Record<string, string[]>; counts: Record<string, number> }> => {
    const counts: Record<string, number> = {};
    for (const m of await store.messages()) counts[m.form] = (counts[m.form] ?? 0) + 1;
    return { forms: await store.forms(), usedOn: Object.fromEntries(await store.formUses()), counts };
  };
  const lists = async (): Promise<{ pages: Awaited<ReturnType<Store['pages']>>; sections: Awaited<ReturnType<Store['sections']>>; forms: { name: string; title: string }[]; posts: Listed; entries: Record<string, Listed>; templates: Awaited<ReturnType<typeof templates>> }> => ({
    pages: await store.pages(),
    sections: await store.sections(),
    forms: (await store.forms()).map((f) => ({ name: f.name, title: f.title })),
    // A site may have no posts (ADR 0025): it then lists none, rather than failing to open the admin.
    posts: contentTypes(await store.site()).some((t) => t.id === POSTS_TYPE) ? await store.posts() : [],
    entries: await allEntries(),
    templates: await templates(),
  });
  /** Blocks as the canvas draws them: each section block with its section's drafts, in the language (ADR 0033). */
  /** The site with what its layouts' sections hold (ADR 0035), from the drafts, in its language. */
  const framed = async (site?: Site): Promise<Site> => {
    // A product's Buy part is drawn on the canvas as the site will show it, while the shop is on (ADR 0065 d3).
    const selling = await shop.shown();
    const drawn = { ...(site ?? (await store.site())), formDefs: await store.formsByName(), extensionBlocks: await store.extensionBlocks(), ...(selling ? { shop: selling } : {}) };
    return withAreas(drawn, await store.draftSections(), drawn.language);
  };
  const filled = async (blocks: Block[], language?: string): Promise<Block[]> => fillSections(blocks, await store.draftSections(), language ?? (await store.site()).language);
  /** A page at its address as the builder edits it: no more than a page. */
  const asPage = (p: PlacedPage): Page => ({ slug: p.slug, title: p.title, description: p.description, inMenu: p.inMenu, blocks: p.blocks, ...cleanSeo(p) });
  /** What the builder is told of a translation: the page it is of, its language, whether it is split. */
  const translationOf = (p: PlacedPage) => ({ of: p.of, language: p.language, split: p.split });
  /** A type's page as the builder edits it: a page whose blocks are the type's page, named after the type. */
  const templateDoc = async (type: ContentType): Promise<Page> => ({
    slug: type.id,
    title: `${type.singular} page`,
    description: '',
    inMenu: false,
    blocks: (await store.template(type.id)) ?? defaultTemplate(),
  });
  /** What a type's page is drawn with in the builder: its newest entry, or an example when it has none. */
  const sampleEntry = async (type: ContentType): Promise<Post> =>
    (await store.draftEntries(type.id))[0] ??
    normalizePost(
      { slug: 'example', title: `An example ${type.singular.toLowerCase()}`, excerpt: '', blocks: [{ type: 'text', content: { body: [{ type: 'paragraph', children: [{ text: `What a ${type.singular.toLowerCase()} says goes here.` }] }] } }] },
      new Date().toISOString().slice(0, 10),
      type,
    ).post;
  const extensions = extensionHost(store, { spawn: options.spawnExtension, log: options.log });
  const backed = options.backups ? backups(store, { dir: options.backups, remote: options.backupRemote, claim: (key, ms) => shared.claim(key, ms), log: options.log }) : null;
  // The site itself, at the same address as its admin, as WordPress serves both (ADR 0044).
  const shop = shopGate(store);
  const site = startRuntime(store, { listen: false, extensions, shared, mailer: options.mailer, to: options.to, from: options.from, log: options.log });
  /**
   * The extensions as the admin shows them. The owner sees each one, with what
   * it asked for and its screens; an editor sees what the ones turned on offer
   * in the editor.
   */
  const extensionsFor = async (me: User) =>
    (await store.extensions())
      .filter((e) => me.role === 'owner' || e.enabled)
      .map(({ manifest, sha256, enabled, installedAt }) => {
        // An editor opens an extension's reports, and runs the actions they name (ADR 0062 d8).
        const reports = me.role === 'editor' ? reportsOf(manifest) : [];
        return {
          name: manifest.name,
          displayName: manifest.displayName,
          description: manifest.description,
          version: manifest.version,
          publisher: manifest.publisher,
          enabled,
          actions: manifest.actions.filter((a) => me.role === 'owner' || a.on || reports.includes(a.name)).map(({ name, label, on, ask, each }) => ({ name, label, on, ask, each })),
          messages: manifest.messages,
          // The blocks it adds to the site's pages (ADR 0062 d6), which any author places.
          blocks: manifest.blocks.map(({ name, label }) => ({ name, label })),
          ...(me.role === 'owner'
            ? { sha256, installedAt, asks: extensionAsks(manifest), views: manifest.views, collections: manifest.collections }
            : reports.length
              ? { views: manifest.views.filter((v) => v.type === 'report'), collections: [] }
              : {}),
        };
      });
  const state = async (me: User): Promise<unknown> => ({
    extensions: await extensionsFor(me),
    site: await store.site(),
    theme: await theme(),
    themeChanged: await store.themeChanged(),
    themes,
    languages: languages(),
    me: shown(me),
    // Who may be named an entry's author, and whose name a list shows (ADR 0055 d2).
    people: (await store.users()).map((u) => ({ id: u.id, name: u.name || (writesAll(me.role) ? u.email : ''), role: u.role })),
    accounts: people !== null,
    shared: shared.status(),
    // A backup that failed is said at the top of the admin until one succeeds (ADR 0051 d6).
    backupFailed: me.role === 'owner' && backed !== null && (await backed.last())?.ok === false,
    // The shop's settings (ADR 0065 d10): whether to show "sells" on a type and a product's fields.
    shop: await shop.settings(),
    ...(await lists()),
  });

  /** One import at a time; it outlives the request that started it, because copying images takes minutes. */
  let importing: ImportProgress = { status: 'idle' };

  async function importApi(request: Request, url: URL): Promise<Response> {
    if (request.method === 'GET' && url.pathname === '/api/import') return json(importing);
    if (request.method === 'DELETE' && url.pathname === '/api/import') {
      // The report was read: forget it, so the screen starts clean. A running import is not stopped.
      if (importing.status !== 'running') importing = { status: 'idle' };
      return json(importing);
    }
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    if (Number(request.headers.get('content-length') ?? 0) > IMPORT_MAX_BYTES) return json({ error: 'the export file is too large' }, 413);
    // The body is the export file itself. It is read and understood before anything is written.
    const listed = (name: string): string[] => (url.searchParams.get(name) ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    const text = await request.text();
    // A Uhlaka content export comes back in by the same screen (ADR 0057 d2).
    if (isContentFile(text)) {
      const file = readContentFile(text);
      if (url.pathname === '/api/import/plan') return json(contentPreview(file));
      if (url.pathname !== '/api/import/run') return json({ error: 'not found' }, 404);
      if (importing.status === 'running') return json({ error: 'an import is already running' }, 409);
      importing = { status: 'running', done: 0, total: file.media.length };
      void runContentImport(store, file, {
        fresh: url.searchParams.get('settings') === '1',
        onImage: (done, total) => {
          importing = { status: 'running', done, total };
        },
      }).then(
        (report) => {
          importing = { status: 'done', report };
        },
        (error: unknown) => {
          importing = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
        },
      );
      return json(importing, 202);
    }
    const plan = planImport(text, new Date().toISOString().slice(0, 10), { types: listed('types'), categories: listed('categories') });
    if (url.pathname === '/api/import/plan') return json(preview(plan));
    if (url.pathname !== '/api/import/run') return json({ error: 'not found' }, 404);
    if (importing.status === 'running') return json({ error: 'an import is already running' }, 409);
    importing = { status: 'running', done: 0, total: plan.images.length };
    void runImport(store, plan, {
      fetchImage: url.searchParams.get('images') === '0' ? null : (options.fetchImage ?? fetchOverNetwork),
      fresh: url.searchParams.get('settings') === '1',
      onImage: (done, total) => {
        importing = { status: 'running', done, total };
      },
    }).then(
      (report) => {
        importing = { status: 'done', report };
      },
      (error: unknown) => {
        importing = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
      },
    );
    return json(importing, 202);
  }

  /**
   * The site leaving (ADR 0057): its content in one open file, or the
   * published site as files in a ZIP for a static host. The owner's only.
   */
  async function exportApi(url: URL): Promise<Response> {
    if (url.pathname === '/api/export/parts') return json({ parts: await contentParts(store) });
    const day = new Date().toISOString().slice(0, 10);
    if (url.pathname === '/api/export/content') {
      const asked = (url.searchParams.get('parts') ?? '').split(',').map((p) => p.trim()).filter(Boolean);
      try {
        const file = await exportContent(store, asked);
        return new Response(JSON.stringify(file), {
          headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${contentFileName(await store.site())}"`, 'cache-control': 'no-store' },
        });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    }
    if (url.pathname === '/api/export/files') {
      try {
        const files = await exportedFiles(store);
        return new Response(zipFiles(files) as BodyInit, {
          headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="site-${day}.zip"`, 'cache-control': 'no-store' },
        });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    }
    return json({ error: 'not found' }, 404);
  }

  /**
   * A page action run for each of the site's other languages (ADR 0034): on
   * the page in that language, started when it is not there yet; what it gives
   * back fills in only the words that translation does not say. A language the
   * page is split for keeps its own blocks, and is left as it is.
   */
  async function eachLanguage(request: Request, name: string, manifest: ExtensionManifest, what: string, owner: boolean): Promise<Response> {
    const action = manifest.actions.find((a) => a.name === what && a.each === 'language');
    if (!action) return json({ error: `${manifest.displayName} has no action "${what}" for each language` }, 404);
    const body = (await request.json()) as Record<string, unknown>;
    // An entry is translated in every language as a page is (ADR 0054 d8).
    if (typeof body.kind === 'string' && body.kind !== 'page' && body.kind !== SECTION_KIND) return eachLanguageEntry(body, name, manifest, action);
    const kind = body.kind === SECTION_KIND ? 'section' : 'page';
    if (kind === 'section' && !owner) return json({ error: 'only the owner may change this' }, 403);
    const slug = String(body.slug ?? '');
    const site = await store.site();
    const main = kind === 'page' ? await store.draft(slug) : await store.sectionDraft(slug);
    if (!main || (kind === 'page' && languageOf(site, slug) !== site.language)) return json({ error: `no ${kind} "${slug}" in the main language` }, 404);
    const given = isObject(body.ask) ? body.ask : {};
    const ask = Object.fromEntries(action.ask.map((a) => [a.key, str(given[a.key], 2000)]));
    const done: string[] = [];
    const skipped: string[] = [];
    for (const language of site.languages) {
      const had = main.translations?.[language];
      if (had?.blocks) {
        skipped.push(language);
        continue;
      }
      const shown = had ? (translatedPage(site, main, language) as PlacedPage) : await store.translate(slug, language, kind);
      const answer = (await extensions.run(name, action.name, { page: asPage(shown), language, ask, site: { name: site.name, language: site.language, languages: site.languages } })) as Record<string, unknown> | null;
      if (!isObject(answer?.page)) return json({ error: `${manifest.displayName} did not give back a page`, done }, 400);
      await store.fillTranslation(slug, language, answer.page, kind);
      done.push(language);
    }
    return json({ done, skipped, ...(await lists()) });
  }

  /** The same for an entry: each language it is not split for, started where it is not there yet, filled in where it says nothing yet. */
  async function eachLanguageEntry(body: Record<string, unknown>, name: string, manifest: ExtensionManifest, action: ExtensionManifest['actions'][number]): Promise<Response> {
    const type = await store.type(body.kind === 'post' ? POSTS_TYPE : String(body.kind));
    const slug = String(body.slug ?? '');
    const site = await store.site();
    const main = await store.entryDraft(type.id, slug);
    if (!main) return json({ error: `no entry "${slug}" in the main language` }, 404);
    const given = isObject(body.ask) ? body.ask : {};
    const ask = Object.fromEntries(action.ask.map((a) => [a.key, str(given[a.key], 2000)]));
    const done: string[] = [];
    const skipped: string[] = [];
    for (const language of site.languages) {
      const had = main.translations?.[language];
      if (had?.blocks) {
        skipped.push(language);
        continue;
      }
      const shown = had ? await store.locateEntry(type.id, `${prefixOf(language)}/${had.slug || main.slug}`) : await store.translateEntry(type.id, slug, language);
      if (!shown) continue;
      const answer = (await extensions.run(name, action.name, { page: shown.post, language, ask, site: { name: site.name, language: site.language, languages: site.languages } })) as Record<string, unknown> | null;
      if (!isObject(answer?.page)) return json({ error: `${manifest.displayName} did not give back a page`, done }, 400);
      await store.fillEntryTranslation(type.id, slug, language, { ...answer.page, slug: main.slug });
      done.push(language);
    }
    return json({ done, skipped, ...(await lists()) });
  }

  /** Extensions (ADR 0026): installing them is the owner's; what they offer in the editor is everyone's. */
  async function extensionsApi(request: Request, url: URL, me: User): Promise<Response> {
    const owner = me.role === 'owner';
    const [, , , name = '', part = '', what = ''] = url.pathname.split('/');
    const refused = json({ error: 'only the owner may do this' }, 403);
    if (!name) return request.method === 'GET' ? json({ extensions: await extensionsFor(me) }) : json({ error: 'not found' }, 404);
    if (name === 'offer' || name === 'install') {
      if (!owner) return refused;
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      if (Number(request.headers.get('content-length') ?? 0) > EXTENSION_MAX_BYTES) return json({ error: 'an extension is at most 5 MB' }, 413);
      const text = await request.text();
      if (name === 'offer') return json({ offer: await extensions.offer(text) });
      await extensions.install(text, url.searchParams.get('sha256') ?? '');
      return json({ extensions: await extensionsFor(me) });
    }
    const installed = await store.extension(name);
    if (!installed) return json({ error: `no extension "${name}" is installed` }, 404);
    if (part === 'run' && request.method === 'POST') {
      const action = installed.manifest.actions.find((a) => a.name === what);
      if (!action) return json({ error: `${installed.manifest.displayName} has no action "${what}"` }, 404);
      if (!action.on && !owner && !(me.role === 'editor' && reportsOf(installed.manifest).includes(action.name))) return refused;
      const body = (await request.json()) as Record<string, unknown>;
      const site = await store.site();
      const given = isObject(body.ask) ? body.ask : {};
      const ask = Object.fromEntries(action.ask.map((a) => [a.key, str(given[a.key], 2000)]));
      if (action.on === 'block') {
        const [block] = normalizeBlocks([body.block]).blocks;
        if (!block) return json({ error: 'there is no block to give it' }, 400);
        const language = languageOf(site, String(body.slug ?? ''));
        const answer = (await extensions.run(name, action.name, { block, language, ask, site: { name: site.name, language: site.language, languages: site.languages } })) as Record<string, unknown> | null;
        // What comes back is a block like any other, cleaned by the same rules, in the same place.
        const [next] = normalizeBlocks([{ ...(isObject(answer?.block) ? answer.block : {}), id: block.id }]).blocks;
        if (!next) return json({ error: `${installed.manifest.displayName} did not give back a block` }, 400);
        // On a translation, only its words change (ADR 0034).
        return json({ block: body.fixed === true ? takeWords([block], [next])[0] : next });
      }
      if (action.on === 'page') {
        const { page } = normalizePage(body.page);
        const language = languageOf(site, page.slug);
        const answer = (await extensions.run(name, action.name, { page, language, ask, site: { name: site.name, language: site.language, languages: site.languages } })) as Record<string, unknown> | null;
        if (!isObject(answer?.page)) return json({ error: `${installed.manifest.displayName} did not give back a page` }, 400);
        const next = normalizePage({ ...answer.page }).page;
        return json({ page: body.fixed === true ? { ...next, slug: page.slug, blocks: takeWords(page.blocks, next.blocks) } : next });
      }
      return json({ answer: (await extensions.run(name, action.name, body.input ?? null)) ?? null });
    }
    if (part === 'each' && request.method === 'POST') return eachLanguage(request, name, installed.manifest, what, owner);
    if (!owner) return refused;
    if (!part) {
      if (request.method === 'PUT') {
        const body = (await request.json()) as Record<string, unknown>;
        await extensions.enable(name, body.enabled === true);
      } else if (request.method === 'DELETE') await extensions.uninstall(name);
      else return json({ error: 'not found' }, 404);
      return json({ extensions: await extensionsFor(me) });
    }
    if (part !== 'rows') return json({ error: 'not found' }, 404);
    // A screen shows its collection: the owner reads and writes it through it, as its screens allow (ADR 0031).
    const may = rowWrites(installed.manifest.views, what);
    const of = installed.manifest.collections.find((c) => c.name === what);
    if (!may.read || !of) return json({ error: 'not found' }, 404);
    const rows = async () => json({ rows: (await store.extensionRows(name, of.name)).map((row) => shownRow(of, row)) });
    if (request.method === 'GET') return rows();
    if (request.method === 'DELETE') {
      if (!may.delete) return json({ error: 'no screen removes these rows' }, 403);
      await store.deleteExtensionRow(name, of.name, url.searchParams.get('id') ?? '');
      return rows();
    }
    if (request.method !== 'PUT') return json({ error: 'not found' }, 404);
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === 'string' && body.id ? body.id : null;
    if (id ? !may.edit : !may.create) return json({ error: id ? 'no screen changes these rows' : 'no screen adds these rows' }, 403);
    const before = id ? await store.extensionRow(name, of.name, id) : null;
    if (id && !before) return json({ error: 'no such row' }, 404);
    const { row, problems } = cleanRow(of, body.row, before);
    if (problems.length) return json({ error: problems.join('; ') }, 400);
    try {
      await store.saveExtensionRow(name, of.name, row, id, new Date(), uniqueFields(of));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 409);
    }
    return rows();
  }

  /**
   * What extensions do on an order (ADR 0076 d4.2, d4.4), for whoever handles
   * the orders: the actions offered on it, run with the order as `orders`
   * lends it, and the files they put on it, downloaded.
   */
  async function orderExtensions(request: Request, url: URL, me: User, body: Record<string, unknown>): Promise<Response> {
    const settings = await shop.settings();
    if (!settings.on) return json({ error: 'the shop is off' }, 404);
    if (!(me.role === 'owner' || (me.role === 'editor' && settings.editors))) return json({ error: 'only the owner handles orders' }, 403);
    const what = url.pathname.slice('/api/shop/orders/'.length);
    const offered = async () => {
      const out: { extension: string; action: string; label: string }[] = [];
      for (const e of await store.extensions()) if (e.enabled) for (const a of e.manifest.actions) if (a.on === 'order') out.push({ extension: e.manifest.name, action: a.name, label: extensionWord(e.manifest, (url.searchParams.get('l') ?? '').slice(0, 20) || 'en', a.label) });
      return out;
    };
    const files = async (id: string) => (await store.orderFiles(id)).map(({ id, name, type, size, buyer, extension, createdAt }) => ({ id, name, type, size, buyer, extension, createdAt }));
    if (what === 'extensions' && request.method === 'GET') {
      const order = await shop.lent.get(url.searchParams.get('id') ?? '');
      if (!order) return json({ error: 'there is no such order' }, 404);
      return json({ actions: await offered(), files: await files(order.id) });
    }
    if (what === 'run' && request.method === 'POST') {
      const order = await shop.lent.get(String(body.id ?? ''));
      if (!order) return json({ error: 'there is no such order' }, 404);
      const chosen = (await offered()).find((o) => o.extension === body.extension && o.action === body.action);
      if (!chosen) return json({ error: 'no extension that is on offers that on an order' }, 404);
      let answer: unknown;
      try {
        answer = await extensions.run(chosen.extension, chosen.action, { order });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 502);
      }
      // What it says back is words for the person, nothing more.
      const said = typeof answer === 'string' ? answer : isObject(answer) && typeof answer.message === 'string' ? answer.message : '';
      return json({ said: str(said, 500), order: await shop.lent.get(order.id), files: await files(order.id) });
    }
    if (what === 'file' && request.method === 'GET') {
      const file = await store.extensionFile(url.searchParams.get('id') ?? '');
      if (!file) return json({ error: 'there is no such file' }, 404);
      return new Response(file.bytes as Uint8Array<ArrayBuffer>, {
        headers: { 'content-type': file.type, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      });
    }
    return json({ error: 'not found' }, 404);
  }

  /**
   * The Statistics screen (ADR 0062 d8): the statistics are an extension the
   * program carries. Read by the owner and the editors, it says whether it is
   * installed and on, and offers the owner the packed one when it is not, or
   * when the program carries a newer one. The owner's browser gives the time
   * zone the days begin in (ADR 0053 d3).
   */
  async function statsApi(request: Request, url: URL, me: User): Promise<Response> {
    const owner = me.role === 'owner';
    if (url.pathname === '/api/stats/install') {
      if (!owner) return json({ error: 'only the owner may do this' }, 403);
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      await extensions.install(SHIPPED_STATS, url.searchParams.get('sha256') ?? '');
    } else if (request.method !== 'GET') return json({ error: 'not found' }, 404);
    const zone = await zoneFor(store, url.searchParams.get('zone') ?? '', owner);
    const installed = await store.extension(STATS);
    const offer = owner ? await extensions.offer(SHIPPED_STATS) : null;
    return json({
      zone,
      installed: installed ? { version: installed.manifest.version, enabled: installed.enabled } : null,
      offer: offer && (!installed || newer(offer.manifest.version, installed.manifest.version)) ? offer : null,
      extensions: await extensionsFor(me),
    });
  }

  /**
   * What an author or a contributor may not do (ADR 0055 d1): a refusal, or
   * null. They write their own entries; the pages, the sections and the rest
   * of the site are the owner's and the editors'. Read from a copy of the
   * request, so the call itself still has its body.
   */
  async function refusedTo(request: Request, url: URL, me: User): Promise<Response | null> {
    if (writesAll(me.role)) return null;
    const no = (error = 'an author writes their own entries only'): Response => json({ error }, 403);
    const path = url.pathname;
    const method = request.method;
    const reading = method === 'GET';
    if (path === '/api/me' || path === '/api/state' || path === '/api/check' || path === '/api/render' || path === '/api/versions' || path === '/api/version' || path === '/api/forms') return reading || path === '/api/me' || path === '/api/render' ? null : no();
    if (path === '/api/media/used') return null;
    if (path === '/api/media' || path === '/api/media/variant') return method === 'DELETE' ? no('only the owner and the editors delete from the library') : method === 'PUT' ? no('only the owner and the editors rename files and describe pictures') : null;
    if (path.startsWith('/api/extensions')) return path.split('/')[4] === 'each' ? no() : null;
    if (path === '/api/locks') return reading ? null : no();
    const body = reading || method === 'DELETE' ? {} : ((await request.clone().json().catch(() => ({}))) as Record<string, unknown>);
    const kind = String(url.searchParams.get('kind') ?? body.kind ?? 'page');
    if (path === '/api/schedule') {
      if (reading) return null;
      if (me.role === 'contributor') return no('a contributor sends an entry for review; an editor publishes it');
      return method === 'POST' ? mine(kind, String(body.slug ?? '')) : mine(url.searchParams.get('kind') ?? '', url.searchParams.get('slug') ?? '');
    }
    if (path === '/api/review') return method === 'POST' ? mine(kind, String(body.slug ?? '')) : no();
    if (!['/api/page', '/api/publish', '/api/translate', '/api/split'].includes(path)) return no();
    if (reading) return null;
    if (path === '/api/publish' && me.role === 'contributor') return no('a contributor sends an entry for review; an editor publishes it');
    const translation = isObject(body.translation) ? body.translation : null;
    const page = isObject(body.page) ? body.page : {};
    const at =
      method === 'DELETE' ? (url.searchParams.get('slug') ?? '') : path === '/api/split' ? String(body.of ?? '') : translation ? String(translation.of ?? '') : path === '/api/page' ? String(page.slug ?? '') : String(body.slug ?? '');
    // A new entry is theirs from the start.
    if (method === 'PUT' && !translation && body.create === true && kind !== 'page' && kind !== SECTION_KIND && !kind.startsWith('template:')) return null;
    return mine(kind, at);

    /** Whether the entry at this address is theirs to change: written by them, and for a contributor never published. */
    async function mine(asked: string, where: string): Promise<Response | null> {
      if (asked === 'page' || asked === SECTION_KIND || asked.startsWith('template:')) return no('the pages and the sections are the owner\'s and the editors\'');
      const type = await store.type(asked === 'post' ? POSTS_TYPE : asked);
      const slug = (await store.locateEntry(type.id, where))?.of ?? where;
      if ((await store.entryAuthor(type.id, slug)) !== me.id) return no('this entry is someone else\'s');
      if (me.role === 'contributor' && (await store.entryPublished(type.id, slug))) return no('this entry is published; an editor changes it now');
      return null;
    }
  }

  /** Search Console as the admin shows it: whom it reads as, and its report, kept an hour (ADR 0077 d3). */
  async function searchConsoleState(fresh: boolean): Promise<{ connected: false } | { connected: true; email: string; property: string; report?: SearchReport; error?: string }> {
    const settings = await store.searchConsole();
    if (!settings) return { connected: false };
    const shown = { connected: true as const, email: settings.clientEmail, property: settings.property };
    const kept = fresh ? null : await shared.get(SEARCH_REPORT);
    if (kept) return { ...shown, report: JSON.parse(kept) as SearchReport };
    try {
      const report = await searchReport(settings, { fetch: options.searchConsoleFetch });
      await shared.set(SEARCH_REPORT, JSON.stringify(report), SEARCH_REPORT_MS);
      return { ...shown, report };
    } catch (error) {
      return { ...shown, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Settings → E-mail (ADR 0064 d5): the site's mail server, the sender, a test
   * message, and the words of each message to visitors. UHLAKA_SMTP and
   * UHLAKA_MAIL_FROM are stronger, and the screen says so.
   */
  async function mailApi(request: Request, url: URL, me: User, body: Record<string, unknown>): Promise<Response> {
    const environment = { mailer: options.mailer ?? null, from: options.from };
    const described = async () => {
      const { password, ...saved } = normalizeMailSettings(await store.mailSettings());
      return { settings: { ...saved, passwordSet: password !== '' }, fromEnvironment: { server: Boolean(options.mailer), from: Boolean(options.from) }, ready: (await siteMailer(store, environment)) !== null };
    };
    const route = `${request.method} ${url.pathname}`;
    if (route === 'GET /api/mail') return json(await described());
    if (route === 'PUT /api/mail') {
      const before = normalizeMailSettings(await store.mailSettings());
      // A password not given again is the one saved.
      const asked = normalizeMailSettings({ ...body, password: typeof body.password === 'string' && body.password ? body.password : before.password });
      if (!asked.host) asked.password = '';
      if (typeof body.from === 'string' && body.from.trim() && !isEmail(body.from.trim())) return json({ error: 'the sender is not an email address' }, 400);
      try {
        smtpMailer(mailAddress(asked) || undefined);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
      await store.setMailSettings(asked);
      return json(await described());
    }
    if (route === 'POST /api/mail/test') {
      const to = String(body.to ?? me.email ?? '').trim();
      if (!isEmail(to)) return json({ error: 'give the address the test is sent to' }, 400);
      const sending = await siteMailer(store, environment);
      if (!sending) return json({ error: 'no mail server and sender are set yet' }, 409);
      const site = await store.site();
      try {
        await sending.mailer({ from: sending.from, to, subject: `A test message from ${site.name}`, text: `This message was sent from Settings → E-mail of ${site.name}. Mail to visitors will go the same way.` });
        return json({ sent: true });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 502);
      }
    }
    if (url.pathname === '/api/mail/templates') {
      const site = await store.site();
      const all = [site.language, ...site.languages];
      const saved = normalizeTemplates(await store.mailTemplates());
      // The site's messages, then those the installed extensions declare (ADR 0064), each with the words it has by itself.
      // The shop's messages are offered only while it is on (ADR 0065 d10).
      const selling = (await shop.settings()).on;
      const program = new Map<string, { label: string; words: (language: string) => Template }>(
        TEMPLATES.filter((n) => selling || !ORDER_TEMPLATES.includes(n)).map((n) => [n, { label: '', words: (l: string) => defaultMail(n, l) }]),
      );
      for (const extension of await store.extensions()) {
        const manifest = extension.manifest;
        for (const mail of manifest.mails) {
          program.set(extensionMailKey(manifest.name, mail.name), {
            label: `${manifest.displayName}: ${extensionWord(manifest, site.language, mail.subject)}`,
            words: (l) => ({ subject: extensionWord(manifest, l, mail.subject), text: extensionWord(manifest, l, mail.text) }),
          });
        }
      }
      if (request.method === 'PUT') {
        const language = String(body.language ?? '');
        const name = String(body.name ?? '');
        const known = program.get(name);
        if (!all.includes(language) || !known) return json({ error: 'no such message' }, 400);
        const subject = String(body.subject ?? '').trim();
        const text = String(body.text ?? '');
        const own = { ...(saved[language] ?? {}) };
        // Left empty, or the same as the program's (or the extension's), it is theirs again.
        const theirs = known.words(language);
        if (!subject || !text.trim() || (subject === theirs.subject && text === theirs.text)) delete own[name];
        else own[name] = { subject, text };
        await store.setMailTemplates(normalizeTemplates({ ...saved, [language]: own }));
      } else if (request.method !== 'GET') return json({ error: 'not found' }, 404);
      const names = [...program.keys()];
      return json({
        languages: all,
        names,
        labels: Object.fromEntries([...program].filter(([, p]) => p.label).map(([n, p]) => [n, p.label])),
        defaults: Object.fromEntries(all.map((l) => [l, Object.fromEntries(names.map((n) => [n, (program.get(n) as { words: (l: string) => Template }).words(l)]))])),
        saved: normalizeTemplates(await store.mailTemplates()),
      });
    }
    return json({ error: 'not found' }, 404);
  }

  async function api(request: Request, url: URL, me: User): Promise<Response> {
    const refused = await refusedTo(request, url, me);
    if (refused) return refused;
    if (url.pathname === '/api/extensions' || url.pathname.startsWith('/api/extensions/')) return extensionsApi(request, url, me);
    if (url.pathname.startsWith('/api/import')) return importApi(request, url);
    if (url.pathname.startsWith('/api/export/') && request.method === 'GET') return exportApi(url);
    if (url.pathname === '/api/stats' || url.pathname === '/api/stats/install') return statsApi(request, url, me);
    if (url.pathname === '/api/backups' || url.pathname.startsWith('/api/backups/')) return backed ? backed.api(request, url) : json({ error: 'backups are not kept here' }, 404);
    if (url.pathname === '/api/messages') {
      const email = url.searchParams.get('email') ?? '';
      if (request.method === 'DELETE') {
        if (email) await store.deleteMessagesFrom(email);
        else await store.deleteMessage(url.searchParams.get('id') ?? '');
      }
      if (request.method === 'DELETE' && email) await store.deleteCommentsFrom(email);
      await store.forgetOldMessages();
      const keep = (await store.site()).keepMessages;
      // Asked for one address: what that visitor sent, messages and comments, to give them or to check before erasing.
      if (request.method === 'GET' && email) return json({ messages: await store.messages(email), comments: await store.comments(email), keep });
      return json({ messages: await store.messages(), keep });
    }
    if (url.pathname === '/api/comments') {
      // Moderating is an editor's work too: approve what may be shown, delete the rest (ADR 0040).
      const id = url.searchParams.get('id') ?? '';
      if (request.method === 'POST') await store.approveComment(id);
      if (request.method === 'DELETE') await store.deleteComment(id);
      await store.forgetOldMessages();
      return json({ comments: await store.comments() });
    }
    if (url.pathname === '/api/media/variant' && request.method === 'POST') {
      // A smaller copy the browser made of a stored picture (ADR 0005 d8); what it is, is read from its bytes.
      if (Number(request.headers.get('content-length') ?? 0) > MEDIA_MAX_BYTES) return json({ error: 'the image is too large' }, 413);
      const item = await store.addVariant(url.searchParams.get('name') ?? '', new Uint8Array(await request.arrayBuffer()));
      return json({ item });
    }
    if (url.pathname === '/api/media/used' && request.method === 'GET') {
      // Where a file is shown or linked to, as its details say (ADR 0072 d4).
      return json({ usedBy: await store.mediaUsedBy(url.searchParams.get('name') ?? '') });
    }
    if (url.pathname === '/api/media') {
      if (request.method === 'GET') return json({ media: await store.media() });
      if (request.method === 'DELETE') {
        await store.deleteMedia(url.searchParams.get('name') ?? '');
        return json({ media: await store.media() });
      }
      if (request.method === 'POST') {
        // The body is the file itself. What it is, is read from its bytes.
        if (Number(request.headers.get('content-length') ?? 0) > UPLOAD_MAX_BYTES) return json({ error: `the file is too large: at most ${UPLOAD_MAX_BYTES / 1024 / 1024} MB` }, 413);
        const item = await store.addMedia(new Uint8Array(await request.arrayBuffer()), url.searchParams.get('label'));
        return json({ item, media: await store.media() });
      }
    }
    const body = request.method === 'GET' || request.method === 'DELETE' ? {} : ((await request.json()) as Record<string, unknown>);
    if (url.pathname === '/api/media' && request.method === 'PUT') {
      // A file renamed, a picture described (ADR 0072 d2, d3).
      const item = await store.setMediaTexts(url.searchParams.get('name') ?? '', { label: body.label, alt: body.alt });
      return json({ item, media: await store.media() });
    }
    // Settings → Visitor accounts (ADR 0064): nothing of them is loaded until the owner turns them on.
    if (url.pathname === '/api/visitors' || url.pathname.startsWith('/api/visitors/')) return site.visitors.admin(request, url, me, body);
    if (url.pathname === '/api/mail' || url.pathname.startsWith('/api/mail/')) return mailApi(request, url, me, body);
    // The shop (ADR 0065): nothing of it is loaded until the owner turns it on.
    if (url.pathname.startsWith('/api/shop/orders/')) return orderExtensions(request, url, me, body);
    if (url.pathname === '/api/shop' || url.pathname.startsWith('/api/shop/')) return shop.admin(request, url, me, body);
    if (url.pathname === '/api/me' && request.method === 'PUT') {
      // Their own name, the few words about them (ADR 0055 d3) and their picture (ADR 0056 d2).
      if (!people) return json({ error: 'accounts are for a served admin' }, 404);
      await store.setProfile(me.id, body.name, body.bio, body.picture ?? '', body.bar);
      await people.changed();
      return json(await state((await store.user(me.id)) as User));
    }
    if (url.pathname === '/api/review' || url.pathname === '/api/review/return' || url.pathname === '/api/author') {
      const type = await store.type(String(body.kind ?? '') === 'post' ? POSTS_TYPE : String(body.kind ?? ''));
      const at = String(body.slug ?? '');
      const slug = (await store.locateEntry(type.id, at))?.of ?? at;
      if (url.pathname === '/api/author' && request.method === 'PUT') await store.setEntryAuthor(type.id, slug, String(body.id ?? ''));
      // Sent for review by its contributor, or sent back with a note by an editor (ADR 0055 d4).
      else if (url.pathname === '/api/review' && request.method === 'POST') await store.askReview(type.id, slug);
      else if (url.pathname === '/api/review/return' && request.method === 'POST') await store.returnReview(type.id, slug, body.note);
      else return json({ error: 'not found' }, 404);
      return json(await lists());
    }
    if (url.pathname === '/api/performance') {
      // Settings → Performance (ADR 0044 d4): where the processes share what they keep, a test, and a new address.
      const saved = await store.valkeyAddress();
      const described = () => ({ status: shared.status(), address: shownAddress(fromEnvironment || saved), fromEnvironment: fromEnvironment !== '' });
      if (request.method === 'POST') {
        const asked = String(body.address ?? '').trim();
        return json({ test: await testValkey(asked && !asked.includes('***') ? asked : fromEnvironment || saved) });
      }
      if (request.method === 'PUT') {
        if (fromEnvironment) return json({ error: 'Valkey is set by UHLAKA_VALKEY_URL on the server; change it there' }, 409);
        const address = String(body.address ?? '').trim();
        if (address.includes('***') && shownAddress(saved) === address) return json(described());
        if (address && !isValkeyAddress(address)) return json({ error: 'an address starts with redis:// or valkey://' }, 400);
        await store.setValkeyAddress(address);
        shared.use(openShared(address, keptAt));
        // Asked once now, so what the owner sees is whether it answers.
        await shared.count('performance:asked');
        return json({ ...described(), address: shownAddress(address) });
      }
      return json(described());
    }
    if (url.pathname === '/api/locks') {
      // Pages behind a password (ADR 0043): set, changed or taken away; the password itself is never given back.
      if (request.method === 'POST') return json({ locked: await store.lockPage(String(body.slug ?? ''), String(body.password ?? '')) });
      if (request.method === 'DELETE') return json({ locked: await store.lockPage(url.searchParams.get('slug') ?? '', null) });
      return json({ locked: await store.lockedPages() });
    }
    if (url.pathname === '/api/audiences') {
      // Who sees a page, an entry or a whole type (ADR 0064 d4), with the levels to choose from. Nothing of it while the accounts are off (d8).
      const settings = await site.visitors.settings();
      // Asked by every page's panel: off is an answer, not an error.
      if (!settings.on) return request.method === 'GET' ? json({ on: false }) : json({ error: 'visitor accounts are off' }, 404);
      if (request.method === 'PUT') {
        const kind = String(body.kind ?? '');
        if (kind !== 'page' && kind !== 'entry' && kind !== 'type') return json({ error: 'say whether it is a page, an entry or a type' }, 400);
        // A whole type is the site's settings, which are the owner's.
        if (kind === 'type' && me.role !== 'owner') return json({ error: 'only the owner may do this' }, 403);
        await store.setAudience(kind, String(body.key ?? ''), body.audience ?? null);
      }
      return json({ audiences: await store.audiences(), levels: settings.levels });
    }
    if (url.pathname === '/api/schedule') {
      // A page or an entry published at a set time (ADR 0039).
      if (request.method === 'POST') return json({ scheduled: await store.schedule(String(body.kind ?? 'page'), String(body.slug ?? ''), String(body.at ?? '')) });
      if (request.method === 'DELETE') return json({ scheduled: await store.unschedule(url.searchParams.get('kind') ?? 'page', url.searchParams.get('slug') ?? '') });
      return json({ scheduled: await store.scheduled() });
    }
    const slug = url.searchParams.get('slug') ?? '';
    const route = `${request.method} ${url.pathname}`;
    // An entry of a content type is edited through the same calls as a page; `kind` names its type.
    const asked = String(url.searchParams.get('kind') ?? body.kind ?? 'page');
    // A section (ADR 0033) is written through the same calls, as `_section`; its translations as a page's are.
    if (asked === SECTION_KIND) {
      switch (route) {
        case 'GET /api/page': {
          const section = await store.sectionDraft(slug);
          if (section) return json({ page: section });
          const found = await store.locateSection(slug);
          return found ? json({ page: asPage(found), translation: translationOf(found) }) : json({ error: 'no such section' }, 404);
        }
        case 'PUT /api/page': {
          if (isObject(body.translation)) {
            const found = await store.saveTranslation(String(body.translation.of ?? ''), String(body.translation.language ?? ''), body.page, 'section');
            return json({ page: asPage(found), translation: translationOf(found), issues: [], ...(await lists()) });
          }
          const { page, issues } = normalizePage(body.page);
          if (body.create === true && (await store.sectionDraft(page.slug))) return json({ error: 'a section with this name already exists' }, 409);
          return json({ page: await store.saveSection(body.page), issues, ...(await lists()) });
        }
        case 'DELETE /api/page':
          await store.deleteSection(slug);
          return json(await lists());
        case 'POST /api/publish':
          await store.publishSection(String(body.slug ?? ''));
          return json(await lists());
        case 'POST /api/translate': {
          const found = await store.translate(String(body.slug ?? ''), String(body.language ?? ''), 'section');
          return json({ page: asPage(found), translation: translationOf(found), ...(await lists()) });
        }
        case 'POST /api/split': {
          const found = await store.splitTranslation(String(body.of ?? ''), String(body.language ?? ''), 'section');
          return json({ page: asPage(found), translation: translationOf(found), ...(await lists()) });
        }
        case 'POST /api/render': {
          // A section is drawn as a page of its own, in its language, with nothing around it but the site.
          const { page } = normalizePage(body.page);
          const site = await store.site();
          const language = languageOf(site, page.slug);
          return json(renderParts(siteIn(site, language), await theme(), page, [], true, await entryLists()));
        }
        case 'GET /api/versions':
        case 'GET /api/version': {
          const found = await store.locateSection(slug);
          const name = found?.translated ? found.of : slug;
          if (route === 'GET /api/versions') return json({ versions: await store.versions('section', name) });
          const raw = await store.version('section', name, url.searchParams.get('at') ?? '');
          if (!raw) return json({ error: 'no such version' }, 404);
          const kept = normalizePage(raw).page;
          const shown = found?.translated ? translatedPage(await store.site(), kept, found.language) : null;
          return json({ page: shown ? asPage(shown) : kept });
        }
      }
    }
    // A type's own page (ADR 0015) is edited through the same calls, as `template:<type>`.
    if (asked.startsWith('template:')) {
      // How a type's page looks is the owner's; an editor sees it around what they write.
      if (me.role !== 'owner' && route !== 'GET /api/page' && route !== 'POST /api/render') return json({ error: 'only the owner may change this' }, 403);
      const type = await store.type(asked.slice(9));
      switch (route) {
        case 'GET /api/page':
          return json({ page: await templateDoc(type) });
        case 'PUT /api/page': {
          const { page, issues } = normalizePage({ ...(body.page as object), title: 'template' });
          await store.setTemplate(type.id, page.blocks);
          return json({ page: await templateDoc(type), issues, ...(await lists()) });
        }
        case 'DELETE /api/page':
          // Back to the default page. Visitors keep what is published until it is published.
          await store.setTemplate(type.id, null);
          return json(await lists());
        case 'POST /api/publish':
          await store.publishTemplate(type.id);
          return json(await lists());
        case 'POST /api/render': {
          const { page } = normalizePage({ ...(body.page as object), title: 'template' });
          return json(renderPostParts(await framed(), await theme(), await sampleEntry(type), await menu(), true, type, await entryLists(), await filled(page.blocks), true));
        }
      }
    }
    // What was published before, kept to be brought back into the editor.
    if (route === 'GET /api/versions' || route === 'GET /api/version') {
      const type = asked === 'page' ? null : await store.type(asked === 'post' ? POSTS_TYPE : asked);
      const kind = type?.id ?? 'page';
      if (route === 'GET /api/versions') return json({ versions: await store.versions(kind, slug) });
      const raw = await store.version(kind, slug, url.searchParams.get('at') ?? '');
      if (!raw) return json({ error: 'no such version' }, 404);
      if (type) return json({ page: normalizePost(raw, undefined, type).post });
      // A translation's versions are its page's (ADR 0032 d5): shown in its language.
      const found = await store.locate(slug);
      const kept = normalizePage(raw).page;
      const shown = found?.translated ? translatedPage(await store.site(), kept, found.language) : null;
      return json({ page: shown ? asPage(shown) : kept });
    }
    if (asked !== 'page') {
      const type = await store.type(asked === 'post' ? POSTS_TYPE : asked);
      /** What the editor is told of an entry in another language (ADR 0054): the entry, at `ro/<address>`, and what it is a translation of. */
      const asTranslation = (found: Awaited<ReturnType<Store['locateEntry']>>) =>
        found ? json({ page: found.post, translation: { of: found.of, language: found.language, split: found.split } }) : json({ error: 'no such entry' }, 404);
      switch (route) {
        case 'GET /api/page': {
          const post = await store.entryDraft(type.id, slug);
          return post ? json({ page: post }) : asTranslation(await store.locateEntry(type.id, slug));
        }
        case 'POST /api/translate': {
          const found = await store.translateEntry(type.id, String(body.slug ?? ''), String(body.language ?? ''));
          return json({ page: found.post, translation: { of: found.of, language: found.language, split: found.split }, ...(await lists()) });
        }
        case 'POST /api/split': {
          const found = await store.splitEntryTranslation(type.id, String(body.of ?? ''), String(body.language ?? ''));
          return json({ page: found.post, translation: { of: found.of, language: found.language, split: found.split }, ...(await lists()) });
        }
        case 'PUT /api/page': {
          if (isObject(body.translation)) {
            const found = await store.saveEntryTranslation(type.id, String(body.translation.of ?? ''), String(body.translation.language ?? ''), body.page);
            return json({ page: found.post, translation: { of: found.of, language: found.language, split: found.split }, issues: [], ...(await lists()) });
          }
          const { post, issues } = normalizePost(body.page, undefined, type);
          if (!post.title || !post.slug) return json({ error: 'an entry has a title', issues }, 400);
          if (body.create === true && (await store.entryDraft(type.id, post.slug))) return json({ error: 'an entry with this address already exists' }, 409);
          return json({ page: await store.saveEntry(type.id, body.page, me.id), issues, ...(await lists()) });
        }
        case 'DELETE /api/page': {
          // A translation goes alone; the entry stays (ADR 0054).
          const found = await store.locateEntry(type.id, slug);
          if (found) await store.deleteEntryTranslation(type.id, found.of, found.language);
          else await store.deleteEntry(type.id, slug);
          return json(await lists());
        }
        case 'POST /api/publish':
          await store.publishEntry(type.id, String(body.slug ?? ''));
          return json(await lists());
        case 'POST /api/render': {
          // An entry in another language is drawn in it: its type's name and address there, and that language's menu (ADR 0054).
          const site = await store.site();
          const at = isObject(body.page) ? String(body.page.slug ?? '') : '';
          const language = languageOf(site, at);
          const local = language === site.language ? type : typeIn(site, type, language);
          const raw = isObject(body.page) ? { ...body.page, slug: language === site.language ? at : at.slice(prefixOf(language).length + 1) } : body.page;
          const post = normalizePost(raw, new Date().toISOString().slice(0, 10), local).post;
          const template = await store.template(type.id);
          const setting = language === site.language ? null : pageSetting(site, prefixOf(language), await store.pages(), await menuLists());
          // Its byline as the site will show it (ADR 0055 d3); a translation's is its entry's.
          const author = (await store.bylines())[`${type.id}/${(await store.locateEntry(type.id, at))?.of ?? at}`];
          return json(renderPostParts(await framed(setting?.site), await theme(), { ...post, ...(author ? { author } : {}), blocks: await filled(post.blocks, language) }, setting?.menu ?? (await menu()), true, local, await entryLists(), template && (await filled(template, language))));
        }
      }
    }
    switch (route) {
      case 'GET /api/state':
        return json(await state(me));
      case 'GET /api/check':
        // The published site, built as an export would build it, and read for what it would get wrong (ADR 0029).
        try {
          const files = await publishedSite(store);
          return json({ check: await fullCheck(store, files) });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : String(error) }, 409);
        }
      case 'GET /api/page': {
        const page = await store.draft(slug);
        if (page) return json({ page });
        // A translation is a page of its own address, written over its page (ADR 0032).
        const found = await store.locate(slug);
        return found ? json({ page: asPage(found), translation: translationOf(found) }) : json({ error: 'no such page' }, 404);
      }
      case 'POST /api/translate': {
        const found = await store.translate(String(body.slug ?? ''), String(body.language ?? ''));
        return json({ page: asPage(found), translation: translationOf(found), ...(await lists()) });
      }
      case 'POST /api/split': {
        const found = await store.splitTranslation(String(body.of ?? ''), String(body.language ?? ''));
        return json({ page: asPage(found), translation: translationOf(found), ...(await lists()) });
      }
      case 'PUT /api/page': {
        if (isObject(body.translation)) {
          const found = await store.saveTranslation(String(body.translation.of ?? ''), String(body.translation.language ?? ''), body.page);
          return json({ page: asPage(found), translation: translationOf(found), issues: [], ...(await lists()) });
        }
        const { page, issues } = normalizePage(body.page);
        if (!page.title) return json({ error: 'a page has a title', issues }, 400);
        // A new page may not silently replace an existing one.
        if (body.create === true && (await store.draft(page.slug))) return json({ error: 'a page with this address already exists' }, 409);
        const site = await store.site();
        const problem = slugProblem(site, page.slug, reservedSlugs(site));
        if (problem) return json({ error: problem }, 409);
        return json({ page: await store.savePage(page), issues, ...(await lists()) });
      }
      case 'DELETE /api/page':
        await store.deletePage(slug);
        return json(await lists());
      case 'POST /api/move': {
        // A page at a new address (ADR 0036): what visitors knew leads there.
        const page = await store.movePage(String(body.from ?? ''), String(body.to ?? ''));
        return json({ page, ...(await lists()), redirects: await store.redirects() });
      }
      case 'GET /api/forms':
        return json(await formsState());
      case 'PUT /api/forms':
        // A form a page shows is kept (ADR 0049 d1): the reason says where.
        try {
          await store.setForms(body.forms);
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : String(error) }, 409);
        }
        return json(await formsState());
      case 'GET /api/redirects':
        return json({ redirects: await store.redirects() });
      case 'PUT /api/redirects':
        return json({ redirects: await store.setRedirects(body.redirects) });
      // What people searched for on Google, and the pages they found (ADR 0077 d3).
      case 'GET /api/search-console':
        return json(await searchConsoleState(url.searchParams.get('fresh') === '1'));
      case 'PUT /api/search-console': {
        const cleaned = cleanSearchConsole(body, (await store.site()).url);
        if ('problem' in cleaned) return json({ error: cleaned.problem }, 400);
        // Kept only once Google answers with it, so a key that does not work is said at once.
        try {
          const report = await searchReport(cleaned.settings, { fetch: options.searchConsoleFetch });
          await store.setSearchConsole(cleaned.settings);
          await shared.set(SEARCH_REPORT, JSON.stringify(report), SEARCH_REPORT_MS);
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : String(error) }, 400);
        }
        return json(await searchConsoleState(false));
      }
      case 'DELETE /api/search-console':
        await store.setSearchConsole(null);
        await shared.del(SEARCH_REPORT);
        return json(await searchConsoleState(false));
      // Every page and entry with what it says to search engines, written in one table (ADR 0077 d2).
      case 'GET /api/seo':
        return json({ rows: await seoRows(store) });
      case 'PUT /api/seo':
        return json({ row: await setSeo(store, body) });
      // The addresses visitors asked for that the site does not have (ADR 0063 d1).
      case 'GET /api/not-found':
        return json({ notFound: await store.notFound() });
      case 'DELETE /api/not-found':
        await store.forgetNotFound(url.searchParams.get('path'));
        return json({ notFound: await store.notFound() });
      case 'POST /api/publish':
        await store.publish(String(body.slug ?? ''));
        return json(await lists());
      case 'POST /api/render': {
        // Drawn from what the admin holds, cleaned first: the canvas shows what would be saved.
        const { page } = normalizePage(body.page);
        // Drawn in its own language, with that language's menu and words (ADR 0024).
        const setting = pageSetting(await store.site(), page.slug, await store.pages(), await menuLists());
        return json(renderParts(await framed(setting.site), await theme(), { ...page, blocks: await filled(page.blocks, setting.site.language) }, setting.menu, true, await entryLists(), setting.alternates));
      }
      case 'PUT /api/theme':
        await store.setTheme(body.theme);
        return json(await state(me));
      case 'POST /api/theme/publish':
        await store.publishTheme();
        return json(await state(me));
      case 'PUT /api/site':
        await store.setSite(body.site);
        return json(await state(me));
      default:
        return json({ error: 'not found' }, 404);
    }
  }

  /**
   * A page of the site, with the admin bar over it for a person signed in
   * (ADR 0075). Only a request that carries a session is asked about: a
   * visitor's page is the one the runtime made, untouched, with its headers.
   * A page with the bar is that person's alone, so no cache keeps it.
   */
  async function barred(request: Request, url: URL, answered: Response): Promise<Response> {
    if (!people || request.method !== 'GET' || !cookieOf(request)) return answered;
    if (!(answered.headers.get('content-type') ?? '').startsWith('text/html') || ![200, 403, 404].includes(answered.status)) return answered;
    const user = await people.user(request).catch(() => null);
    // Someone who turned the bar off sees the site as a visitor does.
    if (!user || user.bar === false) return answered;
    const current = await store.site();
    const language = current.adminLanguage || current.language;
    const words = barWords(packFor(language));
    const target = await site.editTarget(url.pathname);
    const facts = {
      target,
      author: target && target.kind !== 'page' ? await store.entryAuthor(target.kind, target.main).catch(() => null) : null,
      me: user.id,
      posts: contentTypes(current).find((type) => type.id === POSTS_TYPE) ?? null,
      changed: target ? await store.draftChanged(target.kind, target.main).catch(() => false) : false,
    };
    // What waits is the owner's and the editors' to see to.
    // The orders are the owner's, and the editors' when the owner lets them (ADR 0065).
    const shopNow = await site.shop.settings();
    const orders = shopNow.on && (user.role === 'owner' || (user.role === 'editor' && shopNow.editors === true));
    const waiting = writesAll(user.role) ? await store.waiting(orders).catch(() => ({ comments: 0, review: 0, orders: 0 })) : { comments: 0, review: 0, orders: 0 };
    const person = { name: user.name || user.email, role: user.role };
    const bar = barHtml(person, barLinks(person, facts, words, language), waiting, words, language, `${url.pathname}${url.search}`);
    const headers = new Headers(answered.headers);
    headers.delete('content-length');
    headers.set('cache-control', 'private, no-store');
    return new Response(withBar(await answered.text(), bar), { status: answered.status, headers });
  }

  /**
   * The admin's own addresses are never for search engines: whatever they answer, a page to
   * sign in or an error, carries noindex. The site's pages and its media are left as they are.
   */
  async function handle(request: Request, ip = ''): Promise<Response> {
    const response = await answer(request, ip);
    const path = new URL(request.url).pathname;
    if (ADMIN_PATHS.has(path) || path.startsWith('/admin/') || path.startsWith('/api/')) response.headers.set('x-robots-tag', 'noindex, nofollow');
    return response;
  }

  async function answer(request: Request, ip: string): Promise<Response> {
    const url = new URL(request.url);
    // A page that points its own domain at 127.0.0.1 arrives with its own host name.
    const host = request.headers.get('host') ?? url.host;
    if (people ? host !== new URL(publicAddress).host : host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return json({ error: 'wrong host' }, 403);

    if (url.pathname.startsWith('/api/')) {
      const origin = request.headers.get('origin');
      if (origin && origin !== (people ? publicAddress : `http://${host}`)) return json({ error: 'wrong origin' }, 403);
      // Each request knows its own person: two people's calls can be answered at once.
      let me = LOCAL_OWNER;
      try {
        if (people) {
          // A page of another site cannot send this header without asking first, and nothing here answers that question.
          if (request.headers.get('x-uhlaka-request') !== '1') return json({ error: 'not a call from the admin' }, 403);
          const open = await people.open(request, url);
          if (open) return open;
          const user = await people.user(request);
          if (!user) return json({ error: 'sign in first', signIn: true }, 401);
          me = user;
        } else if (!sameToken(request.headers.get('x-uhlaka-token'), token)) return json({ error: 'no token' }, 401);
        if (ownerOnly(request.method, url.pathname) && me.role !== 'owner') return json({ error: 'only the owner may do this' }, 403);
        if (url.pathname.startsWith('/api/users')) return people ? await people.people(request, url, me) : json({ error: 'accounts are for a served admin' }, 404);
        return await api(request, url, me);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    }
    if (url.pathname.startsWith(FONTS_PATH) && request.method === 'GET') {
      // The faces Uhlaka carries (ADR 0068 d1), for the canvas as for the site, published or not.
      const bytes = (await shippedFonts()).get(url.pathname.slice(FONTS_PATH.length));
      return bytes ? new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' } }) : json({ error: 'not found' }, 404);
    }
    if (!ADMIN_PATHS.has(url.pathname) && !url.pathname.startsWith('/admin/') && !url.pathname.startsWith(MEDIA_PREFIX)) return barred(request, url, await site.fetch(request, ip));
    if (url.pathname === SIGN_OUT_PATH && request.method === 'POST' && people) {
      // The admin bar's form (ADR 0075): the session ends, and the person is left on the page, as a visitor.
      // A form from another site is refused; the cookie is SameSite=Strict, so it would not come with one either.
      const origin = request.headers.get('origin');
      if (origin && origin !== publicAddress) return json({ error: 'wrong origin' }, 403);
      const fields = new URLSearchParams((await request.text()).slice(0, 4096));
      return new Response(null, { status: 303, headers: { location: backTo(fields.get('back')), 'set-cookie': await people.signOut(request), 'cache-control': 'no-store' } });
    }
    if (request.method !== 'GET') return json({ error: 'not found' }, 404);
    if (url.pathname.startsWith(MEDIA_PREFIX)) {
      // An <img> cannot carry the token, so a stored file is read without it. Its name is the hash of its bytes.
      const name = url.pathname.slice(MEDIA_PREFIX.length);
      const file = await store.mediaFile(name);
      return file ? mediaResponse(request, name, file, SECURITY) : json({ error: 'not found' }, 404);
    }
    switch (url.pathname) {
      case '/admin':
        return new Response(null, { status: 302, headers: { location: '/admin/' } });
      case '/admin/': {
        const site = await store.site();
        return html(adminPage(packFor(site.adminLanguage || site.language)));
      }
      case '/admin/app.js':
      case '/admin/frame.js':
        return text(assets.get(url.pathname.slice(7)) ?? '', 'text/javascript');
      case '/admin/admin.css':
        // The admin's design tokens and its face (ADR 0084), before the admin's own styles.
        return text(`${fontFacesCss(new Set(['Figtree']))}${ADMIN_TOKENS}`, 'text/css');
      case '/admin/icon.svg':
        return text(ADMIN_ICON, 'image/svg+xml');
      case '/preview':
        return html(previewPage((await store.site()).language));
      case '/admin/site.css':
        // The canvas's: the theme as it is being built. The structure first, the theme after it: where both set the same thing, the theme wins.
        return text(`${fontFacesCss()}${baseCss}${themeCss(await theme(), { preview: true })}`, 'text/css');
      default:
        return json({ error: 'not found' }, 404);
    }
  }

  const server =
    options.listen === false
      ? null
      : Bun.serve({
          hostname: options.hostname ?? '127.0.0.1',
          port,
          fetch: (request, srv) => handle(request, request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || srv.requestIP(request)?.address || ''),
          maxRequestBodySize: Math.max(IMPORT_MAX_BYTES, UPLOAD_MAX_BYTES) + 1024 * 1024,
        });
  if (server?.port) port = server.port;
  // What was set for later is published while the editor runs (ADR 0039).
  // So are the extensions' jobs, and what happens here is told to the extensions that listen (ADR 0041).
  // A backup that is due is made beside them, without holding up a publication (ADR 0051 d2).
  const jobs = async (now: Date): Promise<void> => {
    if (backed) void backed.tick(now).catch((error: unknown) => (options.log ?? console.log)(`The backup could not be made: ${error instanceof Error ? error.message : String(error)}`));
    await extensions.jobs(now);
    // What visitor accounts and the shop wait for: mail to send, accounts never confirmed, carts forgotten (ADR 0064, ADR 0065).
    await site.chores(now);
  };
  const clock = startClock(store, { run: server !== null, jobs, claim: (key, ms) => shared.claim(key, ms) });
  // Search engines told of what is published, when the owner asks for it (ADR 0063 d2).
  const told = indexNow(store, { files: () => publishedSite(store, true), claim: (key, ms) => shared.claim(key, ms), fetch: options.indexNowFetch, log: options.log });
  const unlisten = extensions.listen();
  return {
    url: people ? `${publicAddress}/admin/` : `http://127.0.0.1:${port}/admin/#token=${token}`,
    setupUrl: people ? await people.setupLink() : '',
    token,
    port,
    fetch: handle,
    stop: () => {
      clock.stop();
      told.stop();
      unlisten();
      site.stop();
      extensions.close();
      shared.close();
      server?.stop(true);
    },
  };
}
