/**
 * The admin's calls to the editing server. On one's own computer they carry
 * the key from the address the command printed; on a served admin, the
 * session cookie and a header only the admin's own page sends (ADR 0022).
 */
import type { Audience, Audiences, Block, Level, ExtensionAction, Form, Redirect, RedirectProblem, ExtensionCollection, Page, Post, ShopSettings, Site, Theme, OrderState, Coupon } from '../core/index.ts';
import type { Order } from '../parts/shop/pages.ts';
import type { ViewDocument } from '../view/index.ts';
import type { ExtensionOffer } from '../site/extensions.ts';
import type { ImportPreview, ImportProgress } from '../site/server.ts';
import type { BackupSettings, BackupsShown } from '../site/backup.ts';
import type { SeoRow } from '../site/seo-table.ts';
import type { SearchReport, SearchRow } from '../site/search-console.ts';
export type { SearchReport, SearchRow, SeoRow };
/** Search Console as the admin shows it (ADR 0077 d3). */
export type SearchConsoleState = { connected: false } | { connected: true; email: string; property: string; report?: SearchReport; error?: string };
export type { BackupSettings, BackupsShown };

export type { ImportPreview, ImportProgress };
import type { Comment, Message, NotFound, Role, User } from '../site/store.ts';
export type { Comment, Message, NotFound, Role, User };

/** The person signed in, as the admin is told. */
export interface SharedStatus {
  kind: 'valkey' | 'local';
  address: string;
  up: boolean;
  error: string;
}

/** Settings → Performance: what is in use, and the address set (its password left out). */
export interface Performance {
  status: SharedStatus;
  address: string;
  /** Set by UHLAKA_VALKEY_URL on the server, which the admin cannot change. */
  fromEnvironment: boolean;
}

/** An action an extension offers on an order (ADR 0076 d4.2), in the admin's language. */
export interface OrderAction {
  extension: string;
  action: string;
  label: string;
}

/** An order's invoices (ADR 0081 d2): whether they are on, who makes them, and each asked for. */
export interface OrderInvoices {
  when: 'off' | 'auto' | 'manual';
  by: string;
  list: { id: string; kind: 'invoice' | 'storno'; state: 'waiting' | 'making' | 'made' | 'failed'; series: string; number: string; link: string; file: string; said: string; createdAt: string }[];
}

/** A file an extension put on an order (ADR 0076 d4.4). */
export interface OrderFile {
  id: string;
  name: string;
  type: string;
  size: number;
  buyer: boolean;
  extension: string;
  createdAt: string;
}

/** An order as the Orders screen lists it (ADR 0065 d7). */
export interface OrderListed {
  id: string;
  number: number;
  state: OrderState;
  createdAt: string;
  name: string;
  email: string;
  total: number;
  currency: string;
  items: number;
}
export type { Coupon, Order, OrderState };

/** Settings → Visitor accounts (ADR 0064): the switch, who may sign up, and, once on, the accounts and what could not be sent. */
export interface VisitorSettings {
  on: boolean;
  signup: 'open' | 'invite' | 'closed';
  privacy: string;
  /** The member levels the owner named (ADR 0064 d3), and the one each new account receives ('' for none). */
  levels: Level[];
  welcome: string;
}
export interface VisitorInfo {
  id: string;
  email: string;
  name: string;
  language: string;
  createdAt: string;
  confirmedAt: string | null;
  lastAt: string | null;
  invited: boolean;
  levels: string[];
}
export interface VisitorsShown {
  settings: VisitorSettings;
  /** Whether the site has a mail server and a sender. */
  mail: boolean;
  visitors?: VisitorInfo[];
  waiting?: number;
  failed?: { id: string; to: string; what: string; error: string; failedAt: string }[];
}
/** Settings → E-mail (ADR 0064 d5): the server, its password only said to be set. */
export interface MailShown {
  settings: { host: string; port: number; security: 'tls' | 'plain'; user: string; from: string; passwordSet: boolean };
  fromEnvironment: { server: boolean; from: boolean };
  ready: boolean;
}
export interface MailTemplate {
  subject: string;
  text: string;
}
export interface MailTemplates {
  languages: string[];
  names: string[];
  /** The messages extensions declare, by `extension:message`: the extension's name and the message's subject. */
  labels: Record<string, string>;
  defaults: Record<string, Record<string, MailTemplate>>;
  saved: Record<string, Record<string, MailTemplate>>;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** A few words about them, shown under what they wrote (ADR 0055 d3). */
  bio: string;
  /** Their picture from the media library (ADR 0056 d2); '' for none. */
  picture: string;
  /** Whether they see the admin bar over the site (ADR 0075). */
  bar: boolean;
}
/** Someone who may be named an entry's author (ADR 0055 d2). */
export interface Person {
  id: string;
  name: string;
  role: Role;
}
/** Where an entry is in its review (ADR 0055 d4). */
export interface ReviewInfo {
  state: 'waiting' | 'returned';
  note: string;
  at: string;
}
export interface People {
  users: User[];
  me: Me;
  /** A one-time link just made, for the owner to send. */
  link?: string;
}

/** Who is signed in, as the screens that hide what the server would refuse ask it (ADR 0055 d1); set once the admin knows. */
export const signedIn = { staff: true };

/** A call refused because nobody is signed in: the admin shows the sign-in form. */
export class SignInNeeded extends Error {}
export interface ImportChoices {
  /** Kinds of entry to bring as content types. */
  types: string[];
  /** Categories of posts to bring as content types of their own. */
  categories: string[];
  images: boolean;
  /** Take the site's name, language, address and menu from the old site. */
  settings: boolean;
}

/** What is being edited: `page`, or the name of a content type (`posts`, `projects`). All are made of blocks. */
export type Kind = string;
export type Doc = Page | Post;

export interface PageInfo {
  slug: string;
  title: string;
  /** Asked to be in the automatic menu. Posts have no such wish. */
  inMenu?: boolean;
  published: boolean;
  changed: boolean;
  /** A page: the main page it is of, its language, and how it is translated (ADR 0032). */
  of?: string;
  language?: string;
  translated?: boolean;
  split?: boolean;
  /** How many of its texts still show the main language's words. */
  missing?: number;
}
/** What the builder is told of a page that is a translation (ADR 0032). */
export interface TranslationInfo {
  of: string;
  language: string;
  split: boolean;
}
/** A section (ADR 0033): where it is shown, and the languages it is translated into. */
export interface SectionInfo {
  slug: string;
  title: string;
  published: boolean;
  changed: boolean;
  usedOn: string[];
  languages: string[];
}
export interface PostInfo extends PageInfo {
  date: string;
  /** The titles of the entries that link to it (ADR 0052 d4). */
  usedBy?: string[];
  /** The languages it is in besides the main one, each at its address in the editor (ADR 0054). */
  translations?: { language: string; slug: string; missing: number; split: boolean }[];
  /** Its categories and tags, which each language may write its own way (ADR 0054 d3). */
  terms?: string[];
  /** The id of whoever wrote it (ADR 0055 d2); none for an entry made before. */
  author?: string;
  /** Sent for review, or sent back (ADR 0055 d4). */
  review?: ReviewInfo;
}
/** A content type's own page (ADR 0015): whether it has one, and whether visitors see what is being worked on. */
export interface TemplateInfo {
  custom: boolean;
  published: boolean;
  changed: boolean;
}
/** The forms, where each is shown, and how many messages each has (ADR 0049). */
export interface FormsState {
  forms: Form[];
  usedOn: Record<string, string[]>;
  counts: Record<string, number>;
}
/** A form as a block chooses it (ADR 0049). */
export interface FormInfo {
  name: string;
  title: string;
}
interface Lists {
  templates: Record<string, TemplateInfo>;
  pages: PageInfo[];
  sections: SectionInfo[];
  forms: FormInfo[];
  posts: PostInfo[];
  /** Each content type's entries, by the type's name. */
  entries: Record<string, PostInfo[]>;
}
export interface State {
  site: Site;
  theme: Theme;
  /** The theme being worked on differs from the published one. */
  themeChanged: boolean;
  themes: Theme[];
  /** English, and every language pack the installation has (ADR 0021). */
  languages: LanguageInfo[];
  me: Me;
  /** Who has an account, for an entry's author and the names in the lists (ADR 0055). */
  people: Person[];
  /** The admin is served to others, with accounts; false on one's own computer. */
  accounts: boolean;
  /** Where the site's processes share what they keep, and whether Valkey answers (ADR 0044 d4). */
  shared: SharedStatus;
  /** The last backup failed (ADR 0051 d6); told to the owner only. */
  backupFailed: boolean;
  extensions: ExtensionInfo[];
  /** The shop's settings (ADR 0065 d10): while off, no "sells" on a type and no product fields. */
  shop: ShopSettings;
  templates: Record<string, TemplateInfo>;
  pages: PageInfo[];
  sections: SectionInfo[];
  forms: FormInfo[];
  posts: PostInfo[];
  entries: Record<string, PostInfo[]>;
}

/** An installed extension as the admin is told (ADR 0026). The owner is told more. */
export interface ExtensionInfo {
  name: string;
  displayName: string;
  description: string;
  version: string;
  publisher: string;
  enabled: boolean;
  actions: Pick<ExtensionAction, 'name' | 'label' | 'on' | 'ask' | 'each'>[];
  messages: Record<string, Record<string, string>>;
  /** The blocks it adds to the site's pages (ADR 0062 d6). */
  blocks?: { name: string; label: string }[];
  sha256?: string;
  asks?: ExtensionOffer['asks'];
  views?: ViewDocument[];
  collections?: ExtensionCollection[];
}
export type { ExtensionOffer };

/** The Statistics screen (ADR 0062 d8): the extension that keeps them, and the packed one the owner is offered. */
export interface StatsState {
  zone: string;
  installed: { version: string; enabled: boolean } | null;
  offer: ExtensionOffer | null;
  extensions: ExtensionInfo[];
}

export interface LanguageInfo {
  language: string;
  name: string;
  /** How much of English the pack says, from 0 to 1. */
  coverage: number;
}

export interface MediaItem {
  name: string;
  /** What it is (ADR 0046). */
  kind: 'image' | 'document' | 'audio' | 'video';
  path: string;
  type: string;
  size: number;
  /** Its name in the library (ADR 0072 d2). */
  label: string;
  /** The words a picture is offered with when put on a page (ADR 0072 d3). */
  alt: string;
  uploadedAt: string;
  width: number;
  height: number;
  /** The widths of its smaller copies (ADR 0005 d8). */
  variants: number[];
}

const hash = new URLSearchParams(location.hash.slice(1));
const token = hash.get('token') ?? '';
/** A one-time link's secret: the first owner, an invitation, a new password. */
export const linkSecret = hash.get('link') ?? '';
const who = (): Record<string, string> => (token ? { 'x-uhlaka-token': token } : { 'x-uhlaka-request': '1' });

async function answer<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string; signIn?: boolean };
  if (response.status === 401 && data.signIn) throw new SignInNeeded(data.error ?? 'sign in first');
  if (!response.ok) throw new Error(data.error ?? `request failed (${response.status})`);
  return data;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  return answer<T>(
    await fetch(path, {
      method,
      headers: { ...who(), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

/** A file as the whole body of a call. */
async function send<T>(path: string, file: Blob): Promise<T> {
  return answer<T>(await fetch(path, { method: 'POST', headers: { ...who(), 'content-type': 'application/octet-stream' }, body: file }));
}

/** A typeface of the site's own: a Google family it keeps, or a face the owner uploaded. */
export interface SiteFont {
  name: string;
  label: string;
  faces: { family: string; file: string; weight: string; style: 'normal' | 'italic'; range: string }[];
}
/** A family of the Google Fonts catalogue, and the scripts it has. */
export interface GoogleFamily {
  family: string;
  category: string;
  subsets: string[];
}

export const api = {
  hasToken: token !== '',
  offerExtension: (file: Blob) => send<{ offer: ExtensionOffer }>('/api/extensions/offer', file),
  installExtension: (file: Blob, sha256: string) => send<{ extensions: ExtensionInfo[] }>(`/api/extensions/install?sha256=${sha256}`, file),
  enableExtension: (name: string, enabled: boolean) => call<{ extensions: ExtensionInfo[] }>('PUT', `/api/extensions/${name}`, { enabled }),
  uninstallExtension: (name: string) => call<{ extensions: ExtensionInfo[] }>('DELETE', `/api/extensions/${name}`),
  extensionRows: (name: string, collection: string) => call<{ rows: Record<string, unknown>[] }>('GET', `/api/extensions/${name}/rows/${collection}`),
  saveExtensionRow: (name: string, collection: string, row: Record<string, unknown>, id: string | null) => call<{ rows: Record<string, unknown>[] }>('PUT', `/api/extensions/${name}/rows/${collection}`, { id, row }),
  deleteExtensionRow: (name: string, collection: string, id: string) => call<{ rows: Record<string, unknown>[] }>('DELETE', `/api/extensions/${name}/rows/${collection}?id=${encodeURIComponent(id)}`),
  runExtensionAction: (name: string, action: string, input: Record<string, unknown>) => call<{ answer: unknown }>('POST', `/api/extensions/${name}/run/${action}`, { input }),
  runOnBlock: (name: string, action: string, block: Block, slug: string, ask: Record<string, string>, fixed = false) => call<{ block: Block }>('POST', `/api/extensions/${name}/run/${action}`, { block, slug, ask, fixed }),
  runOnPage: (name: string, action: string, page: Doc, ask: Record<string, string>, fixed = false) => call<{ page: Page }>('POST', `/api/extensions/${name}/run/${action}`, { page, ask, fixed }),
  runEachLanguage: (name: string, action: string, slug: string, kind: Kind, ask: Record<string, string>) => call<{ done: string[]; skipped: string[] } & Lists>('POST', `/api/extensions/${name}/each/${action}`, { slug, kind, ask }),
  state: () => call<State>('GET', '/api/state'),
  move: (from: string, to: string) => call<{ page: Page } & Lists>('POST', '/api/move', { from, to }),
  forms: () => call<FormsState>('GET', '/api/forms'),
  setForms: (forms: Form[]) => call<FormsState>('PUT', '/api/forms', { forms }),
  redirects: () => call<{ redirects: Redirect[] }>('GET', '/api/redirects'),
  setRedirects: (redirects: Redirect[]) => call<{ redirects: Redirect[] }>('PUT', '/api/redirects', { redirects }),
  searchConsole: (fresh = false) => call<SearchConsoleState>('GET', `/api/search-console${fresh ? '?fresh=1' : ''}`),
  connectSearchConsole: (key: string, property: string) => call<SearchConsoleState>('PUT', '/api/search-console', { key, property }),
  disconnectSearchConsole: () => call<SearchConsoleState>('DELETE', '/api/search-console'),
  seoRows: () => call<{ rows: SeoRow[] }>('GET', '/api/seo'),
  setSeo: (row: { type: string; slug: string; seoTitle: string; description: string }) => call<{ row: SeoRow }>('PUT', '/api/seo', row),
  notFound: () => call<{ notFound: NotFound[] }>('GET', '/api/not-found'),
  forgetNotFound: (path: string | null) => call<{ notFound: NotFound[] }>('DELETE', path === null ? '/api/not-found' : `/api/not-found?path=${encodeURIComponent(path)}`),
  page: (slug: string, kind: Kind = 'page') => call<{ page: Doc; translation?: TranslationInfo }>('GET', `/api/page?kind=${kind}&slug=${encodeURIComponent(slug)}`),
  translate: (slug: string, language: string, kind: Kind = 'page') => call<{ page: Page; translation: TranslationInfo } & Lists>('POST', '/api/translate', { slug, language, kind }),
  split: (of: string, language: string, kind: Kind = 'page') => call<{ page: Page; translation: TranslationInfo } & Lists>('POST', '/api/split', { of, language, kind }),
  check: () => call<{ check: { broken: { href: string; from: string[] }[]; unnamed: { src: string; on: string[] }[]; untranslated?: { slug: string; language: string; missing: number }[]; redirects?: RedirectProblem[]; server?: string[]; seo?: { problem: 'long' | 'duplicate' | 'hidden' | 'blocked'; pages: string[]; title?: string }[] } }>('GET', '/api/check'),
  scheduled: () => call<{ scheduled: { kind: string; slug: string; at: string }[] }>('GET', '/api/schedule'),
  schedule: (kind: Kind, slug: string, at: string) => call<{ scheduled: { kind: string; slug: string; at: string }[] }>('POST', '/api/schedule', { kind, slug, at }),
  unschedule: (kind: Kind, slug: string) => call<{ scheduled: { kind: string; slug: string; at: string }[] }>('DELETE', `/api/schedule?kind=${encodeURIComponent(kind)}&slug=${encodeURIComponent(slug)}`),
  versions: (slug: string, kind: Kind = 'page') => call<{ versions: { at: string; title: string }[] }>('GET', `/api/versions?kind=${kind}&slug=${encodeURIComponent(slug)}`),
  version: (slug: string, at: string, kind: Kind = 'page') => call<{ page: Doc }>('GET', `/api/version?kind=${kind}&slug=${encodeURIComponent(slug)}&at=${encodeURIComponent(at)}`),
  save: (page: Doc, create = false, kind: Kind = 'page', translation: TranslationInfo | null = null) => call<{ page: Doc; translation?: TranslationInfo } & Lists>('PUT', '/api/page', { page, create, kind, ...(translation ? { translation } : {}) }),
  remove: (slug: string, kind: Kind = 'page') => call<Lists>('DELETE', `/api/page?kind=${kind}&slug=${encodeURIComponent(slug)}`),
  publish: (slug: string, kind: Kind = 'page') => call<Lists>('POST', '/api/publish', { slug, kind }),
  render: (page: Doc, kind: Kind = 'page') => call<{ body: string; css: string }>('POST', '/api/render', { page, kind }),
  setSite: (site: Site) => call<State>('PUT', '/api/site', { site }),
  setTheme: (theme: Theme) => call<State>('PUT', '/api/theme', { theme }),
  /** The site's own typefaces (ADR 0085 d6): what it has, the Google catalogue, one added or taken away. */
  fonts: () => call<{ fonts: SiteFont[] }>('GET', '/api/fonts'),
  googleFonts: (q: string) => call<{ families: GoogleFamily[]; total: number }>('GET', `/api/fonts/google?q=${encodeURIComponent(q)}`),
  addGoogleFont: (family: string) => call<{ font: SiteFont; fonts: SiteFont[] }>('POST', '/api/fonts/google', { family }),
  uploadFont: (file: Blob, label: string, weight: string, style: string) =>
    send<{ font: SiteFont; fonts: SiteFont[] }>(`/api/fonts/own?label=${encodeURIComponent(label)}&weight=${encodeURIComponent(weight)}&style=${encodeURIComponent(style)}`, file),
  deleteFont: (name: string) => call<{ fonts: SiteFont[] }>('DELETE', `/api/fonts?name=${encodeURIComponent(name)}`),
  publishTheme: () => call<State>('POST', '/api/theme/publish', {}),
  media: () => call<{ media: MediaItem[] }>('GET', '/api/media'),
  messages: () => call<{ messages: Message[]; keep: number }>('GET', '/api/messages'),
  messagesFrom: (email: string) => call<{ messages: Message[]; comments: Comment[]; keep: number }>('GET', `/api/messages?email=${encodeURIComponent(email.trim())}`),
  removeMessage: (id: string) => call<{ messages: Message[]; keep: number }>('DELETE', `/api/messages?id=${encodeURIComponent(id)}`),
  eraseMessagesFrom: (email: string) => call<{ messages: Message[]; keep: number }>('DELETE', `/api/messages?email=${encodeURIComponent(email.trim())}`),
  shop: () => call<{ settings: ShopSettings }>('GET', '/api/shop'),
  setShop: (settings: Partial<ShopSettings>) => call<{ settings: ShopSettings }>('PUT', '/api/shop', settings),
  stock: (kind: string, slug: string) => call<{ stock: Record<string, number> }>('GET', `/api/shop/stock?kind=${encodeURIComponent(kind)}&slug=${encodeURIComponent(slug)}`),
  setStock: (kind: string, slug: string, stock: Record<string, number | null>) => call<{ stock: Record<string, number> }>('PUT', '/api/shop/stock', { kind, slug, stock }),
  orders: (state = '') => call<{ orders: OrderListed[] }>('GET', `/api/shop/orders${state ? `?state=${encodeURIComponent(state)}` : ''}`),
  order: (id: string) => call<{ order: Order; invoices: OrderInvoices }>('GET', `/api/shop/orders?id=${encodeURIComponent(id)}`),
  /** Asks for the order's invoice now, or again (ADR 0081 d2). */
  invoice: (id: string) => call<{ said: string; invoices: OrderInvoices }>('POST', '/api/shop/invoice', { id }),
  setOrder: (id: string, change: { state?: OrderState; tracking?: string }) => call<{ order: Order }>('PUT', '/api/shop/orders', { id, ...change }),
  /** What extensions do on an order (ADR 0076 d4.2, d4.4): the actions offered on it, and the files they put on it. */
  orderExtensions: (id: string, language: string) => call<{ actions: OrderAction[]; files: OrderFile[] }>('GET', `/api/shop/orders/extensions?id=${encodeURIComponent(id)}&l=${encodeURIComponent(language)}`),
  runOnOrder: (id: string, action: OrderAction) => call<{ said: string; files: OrderFile[] }>('POST', '/api/shop/orders/run', { id, extension: action.extension, action: action.action }),
  /** A file on an order: fetched, because a link could not carry the key. */
  async orderFile(id: string): Promise<Blob> {
    const response = await fetch(`/api/shop/orders/file?id=${encodeURIComponent(id)}`, { headers: who() });
    if (!response.ok) await answer(response);
    return response.blob();
  },
  coupons: () => call<{ coupons: Coupon[] }>('GET', '/api/shop/coupons'),
  saveCoupon: (coupon: Record<string, unknown>) => call<{ coupon: Coupon; coupons: Coupon[] }>('PUT', '/api/shop/coupons', coupon),
  deleteCoupon: (code: string) => call<{ coupons: Coupon[] }>('DELETE', `/api/shop/coupons?code=${encodeURIComponent(code)}`),
  /** The orders as a CSV file: fetched, because a link could not carry the key. */
  async ordersFile(): Promise<Blob> {
    const response = await fetch('/api/shop/orders.csv', { headers: who() });
    if (!response.ok) await answer(response);
    return response.blob();
  },
  visitors: () => call<VisitorsShown>('GET', '/api/visitors'),
  setVisitors: (settings: Partial<VisitorSettings>) => call<VisitorsShown>('PUT', '/api/visitors', settings),
  inviteVisitor: (email: string, name: string, language: string) => call<VisitorsShown>('POST', '/api/visitors', { email, name, language }),
  removeVisitor: (id: string) => call<VisitorsShown>('DELETE', `/api/visitors?id=${encodeURIComponent(id)}`),
  visitorData: (id: string) => call<{ visitor: Omit<VisitorInfo, 'invited'> }>('GET', `/api/visitors/data?id=${encodeURIComponent(id)}`),
  retryMail: (id: string) => call<VisitorsShown>('POST', `/api/visitors/retry?id=${encodeURIComponent(id)}`, {}),
  setVisitorLevels: (id: string, levels: string[]) => call<VisitorsShown>('PUT', `/api/visitors/levels?id=${encodeURIComponent(id)}`, { levels }),
  /** Who sees a page, an entry or a type (ADR 0064 d4): refused while visitor accounts are off. */
  audiences: () => call<{ on?: false; audiences?: Audiences; levels?: Level[] }>('GET', '/api/audiences'),
  setAudience: (kind: 'page' | 'entry' | 'type', key: string, audience: Audience | null) => call<{ audiences: Audiences; levels: Level[] }>('PUT', '/api/audiences', { kind, key, audience }),
  forgetMail: (id: string) => call<VisitorsShown>('DELETE', `/api/visitors/failed?id=${encodeURIComponent(id)}`),
  mail: () => call<MailShown>('GET', '/api/mail'),
  setMail: (settings: { host: string; port: number; security: 'tls' | 'plain'; user: string; password: string; from: string }) => call<MailShown>('PUT', '/api/mail', settings),
  testMail: (to: string) => call<{ sent: boolean }>('POST', '/api/mail/test', { to }),
  mailTemplates: () => call<MailTemplates>('GET', '/api/mail/templates'),
  setMailTemplate: (language: string, name: string, subject: string, text: string) => call<MailTemplates>('PUT', '/api/mail/templates', { language, name, subject, text }),
  performance: () => call<Performance>('GET', '/api/performance'),
  testValkey: (address: string) => call<{ test: { ok: boolean; ms: number; error: string } }>('POST', '/api/performance', { address }),
  setValkey: (address: string) => call<Performance>('PUT', '/api/performance', { address }),
  /** The statistics of a range (ADR 0053); the browser's time zone goes with it, and becomes the statistics' own when the owner asks. */
  stats: () => call<StatsState>('GET', `/api/stats?zone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`),
  installStats: (sha256: string) => call<StatsState>('POST', `/api/stats/install?sha256=${sha256}&zone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`),
  backups: () => call<BackupsShown>('GET', '/api/backups'),
  setBackups: (settings: BackupSettings) => call<BackupsShown>('PUT', '/api/backups', { settings }),
  backUpNow: () => call<BackupsShown>('POST', '/api/backups'),
  testBackups: (settings: BackupSettings) => call<{ test: { ok: boolean; error: string } }>('POST', '/api/backups/test', { settings }),
  removeBackup: (name: string) => call<BackupsShown>('DELETE', `/api/backups/file?name=${encodeURIComponent(name)}`),
  restoreBackup: (name: string) => call<BackupsShown & { restored: number }>('POST', `/api/backups/restore?name=${encodeURIComponent(name)}`),
  uploadBackup: (file: Blob) => send<BackupsShown & { restored: number }>('/api/backups/upload', file),
  /** A backup's bytes, to save: fetched, because a link could not carry the key. */
  async backupFile(name: string): Promise<Blob> {
    const response = await fetch(`/api/backups/file?name=${encodeURIComponent(name)}`, { headers: who() });
    if (!response.ok) await answer(response);
    return response.blob();
  },
  /** What a content export can hold (ADR 0057): pages, each content type, sections, forms, the design. */
  exportParts: () => call<{ parts: { id: string; name: string; apart?: true }[] }>('GET', '/api/export/parts'),
  /** The content file, or the published site as a ZIP: fetched, because a link could not carry the key. */
  async exportFile(what: 'content' | 'files', parts: string[] = []): Promise<{ blob: Blob; name: string }> {
    const response = await fetch(`/api/export/${what}${what === 'content' ? `?parts=${encodeURIComponent(parts.join(','))}` : ''}`, { headers: who() });
    if (!response.ok) await answer(response);
    const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? (what === 'content' ? 'site.uhlaka.json' : 'site.zip');
    return { blob: await response.blob(), name };
  },
  locks: () => call<{ locked: string[] }>('GET', '/api/locks'),
  lock: (slug: string, password: string) => call<{ locked: string[] }>('POST', '/api/locks', { slug, password }),
  unlock: (slug: string) => call<{ locked: string[] }>('DELETE', `/api/locks?slug=${encodeURIComponent(slug)}`),
  comments: () => call<{ comments: Comment[] }>('GET', '/api/comments'),
  approveComment: (id: string) => call<{ comments: Comment[] }>('POST', `/api/comments?id=${encodeURIComponent(id)}`),
  removeComment: (id: string) => call<{ comments: Comment[] }>('DELETE', `/api/comments?id=${encodeURIComponent(id)}`),
  setMedia: (name: string, texts: { label?: string; alt?: string }) => call<{ item: MediaItem; media: MediaItem[] }>('PUT', `/api/media?name=${encodeURIComponent(name)}`, texts),
  mediaUsedBy: (name: string) => call<{ usedBy: string[] }>('GET', `/api/media/used?name=${encodeURIComponent(name)}`),
  removeMedia: (name: string) => call<{ media: MediaItem[] }>('DELETE', `/api/media?name=${encodeURIComponent(name)}`),
  importPlan: (file: Blob, types: string[], categories: string[]) =>
    send<ImportPreview>(`/api/import/plan?types=${encodeURIComponent(types.join(','))}&categories=${encodeURIComponent(categories.join(','))}`, file),
  importRun: (file: Blob, choices: ImportChoices) =>
    send<ImportProgress>(
      `/api/import/run?types=${encodeURIComponent(choices.types.join(','))}&categories=${encodeURIComponent(choices.categories.join(','))}&images=${choices.images ? 1 : 0}&settings=${choices.settings ? 1 : 0}`,
      file,
    ),
  importProgress: () => call<ImportProgress>('GET', '/api/import'),
  importForget: () => call<ImportProgress>('DELETE', '/api/import'),
  /** The body is the file itself; the server reads what it is from its bytes. */
  async upload(file: Blob, label: string): Promise<{ item: MediaItem; media: MediaItem[] }> {
    return send(`/api/media?label=${encodeURIComponent(label)}`, file);
  },
  /** A smaller copy of a stored picture, made here (ADR 0005 d8). */
  addVariant: (name: string, file: Blob) => send<{ item: MediaItem }>(`/api/media/variant?name=${encodeURIComponent(name)}`, file),
  signIn: (email: string, password: string) => call<{ me: Me }>('POST', '/api/session', { email, password }),
  signOut: () => call<{ signedOut: boolean }>('DELETE', '/api/session'),
  link: (secret: string) =>
    call<{ kind: 'setup' | 'invite' | 'reset'; email: string; name: string; site?: { name: string; language: string }; languages?: { language: string; name: string }[] }>('POST', '/api/link', { secret }),
  useLink: (secret: string, fields: { name?: string; email?: string; password: string; siteName?: string; language?: string }) => call<{ me: Me }>('POST', '/api/link/use', { secret, ...fields }),
  people: () => call<People>('GET', '/api/users'),
  invite: (email: string, role: Role) => call<People>('POST', '/api/users', { email, role }),
  newLink: (id: string) => call<People>('POST', '/api/users/link', { id }),
  setRole: (id: string, role: Role) => call<People>('PUT', '/api/users', { id, role }),
  removeUser: (id: string, to = '') => call<People>('DELETE', `/api/users?id=${encodeURIComponent(id)}${to ? `&to=${encodeURIComponent(to)}` : ''}`),
  setProfile: (name: string, bio: string, picture: string, bar: boolean) => call<State>('PUT', '/api/me', { name, bio, picture, bar }),
  askReview: (slug: string, kind: Kind) => call<Lists>('POST', '/api/review', { slug, kind }),
  returnReview: (slug: string, kind: Kind, note: string) => call<Lists>('POST', '/api/review/return', { slug, kind, note }),
  setAuthor: (slug: string, kind: Kind, id: string) => call<Lists>('PUT', '/api/author', { slug, kind, id }),
};
