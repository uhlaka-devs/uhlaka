/**
 * A site's settings, theme, pages, entries and images (ADR 0001 d9, ADR 0013).
 * By default it is one SQLite file, and copying the file is a backup. The same
 * store runs on Postgres or MySQL when it is given their address: the SQL here
 * is what the three share, and where they differ (an upsert, a column type) it
 * is said once, in a `Dialect`.
 *
 * A page, and the theme, each keep a working draft and, apart from it, a frozen
 * copy of what was last published. Visitors and the export only ever see the copy, so saving a
 * draft never changes the live site. (The same rule as in MYCMS, where it was
 * learned.)
 *
 * Everything is cleaned by the core on the way in and again on the way out:
 * a row written before a rule was tightened is read under today's rules.
 *
 * Who may do what is not decided here, nor by the database (no row-level
 * security): the three databases must be equally safe, so that rule lives in
 * the application, in one place, in front of this store.
 */
import { SQL } from 'bun';
import {
  authorPath,
  cleanFontFace,
  type FontFace,
  isSiteFont,
  siteFontFamily,
  type ExtensionBlockDef,
  authorSlugs,
  entrySlugProblem,
  type Byline,
  typeAuthorPath,
  commentKey,
  type EntryTranslation,
  entryIn,
  entrySlugIn,
  entryTranslationFrom,
  fillEntryTranslation,
  missingEntryWords,
  newEntryTranslation,
  type SlugsIn,
  slugsIn,
  typeIn,
  type Answer,
  contactForm,
  type Form,
  formBlocks,
  normalizeForms,
  type Block,
  type ExtensionPackage,
  fillTranslation,
  areaBlock,
  addRedirect,
  pageSlug,
  type MenuNode,
  LAYOUT_AREAS,
  READY_LAYOUTS,
  parseExtension,
  canVary,
  imageExt,
  imageSize,
  mediaSources,
  isMediaName,
  MAX_BYTES,
  MEDIA_MAX_BYTES,
  MEDIA_TYPES,
  mediaExt,
  type MediaKind,
  mediaKindOf,
  type MediaExt,
  mediaNameOf,
  type MediaSize,
  mediaPath,
  normalizePage,
  normalizePost,
  normalizeRedirects,
  normalizeSite,
  normalizeAudience,
  normalizeAudiences,
  type Audiences,
  variantName,
  variantOf,
  wantedWidths,
  type Page,
  type Post,
  parseTheme,
  postImageSources,
  type Redirect,
  POSTS_TYPE,
  contentTypes,
  reservedSlugs,
  languageName,
  prefixOf,
  slugProblem,
  baseSlug,
  keepWords,
  languageOf,
  localizeBlocks,
  missingWords,
  newTranslation,
  type PageTranslation,
  placePages,
  type PlacedPage,
  translatedPage,
  wordsFrom,
  sectionsIn,
  MAX_SECTIONS,
  isObject,
  pagePath,
  entryPath,
  listPath,
  typeById,
  linkFields,
  linkedSlugs,
  unlinked,
  type ContentType,
  listed,
  type ExtensionEventName,
  type ShownComment,
  type Site,
  str,
  type Theme,
} from '../core/index.ts';
import { wordsFor } from '../blocks/words.ts';
import { DAYS_KEPT, type Kind, KINDS, summed } from '../../extensions/stats/rows.ts';
import { isIndexNowKey } from './indexnow.ts';
import type { SearchConsoleSettings } from './search-console.ts';
import { BACKED_UP_VISITOR_TABLES, visitorSchema, visitorTable } from '../parts/visitors/schema.ts';
import { BACKED_UP_SHOP_TABLES, shopSchema, shopTable } from '../parts/shop/schema.ts';
import './languages.ts';

/** What is kept with translations: a page, or a section (ADR 0033). */
type Kept = 'page' | 'section';

/** An installed extension (ADR 0026). */
export interface InstalledExtension extends ExtensionPackage {
  sha256: string;
  enabled: boolean;
  installedAt: string;
}
/** A row an extension keeps: its fields and an id. */
export type ExtensionRow = Record<string, unknown> & { id: string };

/** A file an extension kept for an order (ADR 0076 d4.4), as it is listed. */
export interface ExtensionFile {
  id: string;
  extension: string;
  order: string;
  name: string;
  type: string;
  /** The buyer sees it on the order's page. */
  buyer: boolean;
  size: number;
  createdAt: string;
}

/** A unique field's value as it is kept (ADR 0076 d4.5): text up to 255 characters; empty is not kept. */
const uniqueValue = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : null;
  return text === null ? null : text.slice(0, 255);
};

/** A publication set for later (ADR 0039): a page (`page`) or an entry of a type, by its address, at an ISO time. */
export interface Scheduled {
  kind: string;
  slug: string;
  at: string;
}

/** One stored file, as the editor lists it: an image, or a document, sound or video (ADR 0046). */
export interface MediaItem {
  name: string;
  kind: MediaKind;
  /** Where a page points to show it. */
  path: string;
  type: string;
  size: number;
  /** The file's name in the library: the name it was uploaded under, until someone renames it (ADR 0072 d2). */
  label: string;
  /** The words for people who cannot see the picture, offered when it is put on a page (ADR 0072 d3); '' for none. */
  alt: string;
  /** When it was uploaded. */
  uploadedAt: string;
  /** How wide and high it is, when its bytes say (ADR 0005 d8); 0 when they do not. */
  width: number;
  height: number;
  /** The widths of the smaller copies it has. */
  variants: number[];
}

export type DatabaseKind = 'sqlite' | 'postgres' | 'mysql';

/** What differs between the three databases. Everything else is written once. */
interface Dialect {
  kind: DatabaseKind;
  schema: string[];
  /** `?` placeholders as this database wants them. */
  params: (query: string) => string;
  /** Insert, or when the key is taken set these columns. */
  upsert: (table: string, columns: string[], key: string[], update: string[]) => string;
  /** Insert, or do nothing when the key is taken. */
  insertNew: (table: string, columns: string[]) => string;
  /** The meta table's key column: a reserved word in MySQL. */
  key: string;
}

const marks = (columns: string[]): string => columns.map(() => '?').join(', ');

const SQLITE: Dialect = {
  kind: 'sqlite',
  // As files made before ADR 0013 have them: a site made then opens unchanged.
  schema: [
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS pages (slug TEXT PRIMARY KEY, position INTEGER NOT NULL, draft TEXT NOT NULL, published TEXT, published_at TEXT, updated_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS sections (slug TEXT PRIMARY KEY, position INTEGER NOT NULL, draft TEXT NOT NULL, published TEXT, published_at TEXT, updated_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS entries (type TEXT NOT NULL, slug TEXT NOT NULL, draft TEXT NOT NULL, published TEXT, published_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (type, slug))',
    'CREATE TABLE IF NOT EXISTS media (name TEXT PRIMARY KEY, label TEXT NOT NULL, size INTEGER NOT NULL, bytes BLOB NOT NULL, created_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, received_at TEXT NOT NULL, form TEXT NOT NULL, page TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, body TEXT NOT NULL, consent TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, password TEXT NOT NULL, created_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS extensions (name TEXT PRIMARY KEY, version TEXT NOT NULL, sha256 TEXT NOT NULL, package TEXT NOT NULL, enabled INTEGER NOT NULL, installed_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS extension_rows (extension TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (extension, collection, id))',
    'CREATE TABLE IF NOT EXISTS versions (kind TEXT NOT NULL, slug TEXT NOT NULL, at TEXT NOT NULL, doc TEXT NOT NULL, PRIMARY KEY (kind, slug, at))',
    'CREATE TABLE IF NOT EXISTS media_sizes (name TEXT PRIMARY KEY, width INTEGER NOT NULL, height INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS media_texts (name TEXT PRIMARY KEY, alt TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS schedule (kind TEXT NOT NULL, slug TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (kind, slug))',
    'CREATE TABLE IF NOT EXISTS media_variants (name TEXT PRIMARY KEY, original TEXT NOT NULL, width INTEGER NOT NULL, bytes BLOB NOT NULL)',
    'CREATE TABLE IF NOT EXISTS page_locks (slug TEXT PRIMARY KEY, hash TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS extension_jobs (extension TEXT NOT NULL, action TEXT NOT NULL, last_at TEXT NOT NULL, PRIMARY KEY (extension, action))',
    'CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, type TEXT NOT NULL, entry TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, body TEXT NOT NULL, consent TEXT NOT NULL, at TEXT NOT NULL, approved INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS message_answers (id TEXT PRIMARY KEY, answers TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS comment_languages (id TEXT PRIMARY KEY, language TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS entry_authors (type TEXT NOT NULL, slug TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (type, slug))',
    'CREATE TABLE IF NOT EXISTS entry_reviews (type TEXT NOT NULL, slug TEXT NOT NULL, state TEXT NOT NULL, note TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (type, slug))',
    'CREATE TABLE IF NOT EXISTS user_bios (id TEXT PRIMARY KEY, bio TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS user_pictures (id TEXT PRIMARY KEY, src TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS user_bar (id TEXT PRIMARY KEY, shown INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS not_found (path TEXT PRIMARY KEY, hits INTEGER NOT NULL, last_at TEXT NOT NULL, referrer TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS extension_unique (extension TEXT NOT NULL, collection TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (extension, collection, field, value))',
    'CREATE TABLE IF NOT EXISTS extension_later (id TEXT PRIMARY KEY, extension TEXT NOT NULL, action TEXT NOT NULL, input TEXT NOT NULL, due_at TEXT NOT NULL, tries INTEGER NOT NULL, made_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS extension_files (id TEXT PRIMARY KEY, extension TEXT NOT NULL, order_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, buyer INTEGER NOT NULL, size INTEGER NOT NULL, bytes BLOB NOT NULL, created_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS fonts (name TEXT PRIMARY KEY, label TEXT NOT NULL, faces TEXT NOT NULL, created_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS font_files (name TEXT PRIMARY KEY, bytes BLOB NOT NULL)',
  ],
  params: (query) => query,
  upsert: (table, columns, key, update) =>
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${marks(columns)}) ON CONFLICT (${key.join(', ')}) DO UPDATE SET ${update.map((c) => `${c} = excluded.${c}`).join(', ')}`,
  insertNew: (table, columns) => `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${marks(columns)}) ON CONFLICT DO NOTHING`,
  key: 'key',
};

// An address or a name is at most 255 characters here; the core cuts them far shorter.
const POSTGRES: Dialect = {
  ...SQLITE,
  kind: 'postgres',
  schema: [
    'CREATE TABLE IF NOT EXISTS meta (key VARCHAR(255) PRIMARY KEY, value TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS pages (slug VARCHAR(255) PRIMARY KEY, position INTEGER NOT NULL, draft TEXT NOT NULL, published TEXT, published_at VARCHAR(40), updated_at VARCHAR(40) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS sections (slug VARCHAR(255) PRIMARY KEY, position INTEGER NOT NULL, draft TEXT NOT NULL, published TEXT, published_at VARCHAR(40), updated_at VARCHAR(40) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS entries (type VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL, draft TEXT NOT NULL, published TEXT, published_at VARCHAR(40), updated_at VARCHAR(40) NOT NULL, PRIMARY KEY (type, slug))',
    'CREATE TABLE IF NOT EXISTS media (name VARCHAR(255) PRIMARY KEY, label TEXT NOT NULL, size INTEGER NOT NULL, bytes BYTEA NOT NULL, created_at VARCHAR(40) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS messages (id VARCHAR(40) PRIMARY KEY, received_at VARCHAR(40) NOT NULL, form VARCHAR(255) NOT NULL, page TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, body TEXT NOT NULL, consent TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS users (id VARCHAR(40) PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, name TEXT NOT NULL, role VARCHAR(20) NOT NULL, password TEXT NOT NULL, created_at VARCHAR(40) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS sessions (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(40) NOT NULL, expires_at VARCHAR(40) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS links (id VARCHAR(64) PRIMARY KEY, kind VARCHAR(20) NOT NULL, user_id VARCHAR(40) NOT NULL, expires_at VARCHAR(40) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS extensions (name VARCHAR(64) PRIMARY KEY, version VARCHAR(40) NOT NULL, sha256 VARCHAR(64) NOT NULL, package TEXT NOT NULL, enabled INTEGER NOT NULL, installed_at VARCHAR(40) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS extension_rows (extension VARCHAR(64) NOT NULL, collection VARCHAR(64) NOT NULL, id VARCHAR(40) NOT NULL, data TEXT NOT NULL, updated_at VARCHAR(40) NOT NULL, PRIMARY KEY (extension, collection, id))',
    'CREATE TABLE IF NOT EXISTS versions (kind VARCHAR(64) NOT NULL, slug VARCHAR(255) NOT NULL, at VARCHAR(40) NOT NULL, doc TEXT NOT NULL, PRIMARY KEY (kind, slug, at))',
    'CREATE TABLE IF NOT EXISTS media_sizes (name VARCHAR(255) PRIMARY KEY, width INTEGER NOT NULL, height INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS media_texts (name VARCHAR(255) PRIMARY KEY, alt TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS schedule (kind VARCHAR(64) NOT NULL, slug VARCHAR(255) NOT NULL, at VARCHAR(40) NOT NULL, PRIMARY KEY (kind, slug))',
    'CREATE TABLE IF NOT EXISTS media_variants (name VARCHAR(255) PRIMARY KEY, original VARCHAR(255) NOT NULL, width INTEGER NOT NULL, bytes BYTEA NOT NULL)',
    'CREATE TABLE IF NOT EXISTS page_locks (slug VARCHAR(255) PRIMARY KEY, hash TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS extension_jobs (extension VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL, last_at VARCHAR(40) NOT NULL, PRIMARY KEY (extension, action))',
    'CREATE TABLE IF NOT EXISTS comments (id VARCHAR(40) PRIMARY KEY, type VARCHAR(255) NOT NULL, entry VARCHAR(255) NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, body TEXT NOT NULL, consent TEXT NOT NULL, at VARCHAR(40) NOT NULL, approved INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS message_answers (id VARCHAR(40) PRIMARY KEY, answers TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS comment_languages (id VARCHAR(40) PRIMARY KEY, language VARCHAR(20) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS entry_authors (type VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL, user_id VARCHAR(40) NOT NULL, PRIMARY KEY (type, slug))',
    'CREATE TABLE IF NOT EXISTS entry_reviews (type VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL, state VARCHAR(20) NOT NULL, note TEXT NOT NULL, at VARCHAR(40) NOT NULL, PRIMARY KEY (type, slug))',
    'CREATE TABLE IF NOT EXISTS user_bios (id VARCHAR(40) PRIMARY KEY, bio TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS user_pictures (id VARCHAR(40) PRIMARY KEY, src TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS user_bar (id VARCHAR(40) PRIMARY KEY, shown INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS not_found (path VARCHAR(255) PRIMARY KEY, hits INTEGER NOT NULL, last_at VARCHAR(40) NOT NULL, referrer VARCHAR(255) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS extension_unique (extension VARCHAR(64) NOT NULL, collection VARCHAR(64) NOT NULL, field VARCHAR(64) NOT NULL, value VARCHAR(255) NOT NULL, id VARCHAR(40) NOT NULL, PRIMARY KEY (extension, collection, field, value))',
    'CREATE TABLE IF NOT EXISTS extension_later (id VARCHAR(40) PRIMARY KEY, extension VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL, input TEXT NOT NULL, due_at VARCHAR(40) NOT NULL, tries INTEGER NOT NULL, made_at VARCHAR(40) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS extension_files (id VARCHAR(40) PRIMARY KEY, extension VARCHAR(64) NOT NULL, order_id VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL, type VARCHAR(100) NOT NULL, buyer INTEGER NOT NULL, size INTEGER NOT NULL, bytes BYTEA NOT NULL, created_at VARCHAR(40) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS fonts (name VARCHAR(64) PRIMARY KEY, label VARCHAR(255) NOT NULL, faces TEXT NOT NULL, created_at VARCHAR(40) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS font_files (name VARCHAR(255) PRIMARY KEY, bytes BYTEA NOT NULL)',
  ],
  params: (query) => {
    let n = 0;
    return query.replace(/\?/g, () => `$${++n}`);
  },
};

// Binary collation: an address compares as its bytes, as it does in the other two.
const MYSQL_TABLE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';
const MYSQL: Dialect = {
  kind: 'mysql',
  schema: [
    `CREATE TABLE IF NOT EXISTS meta (\`key\` VARCHAR(255) PRIMARY KEY, value LONGTEXT NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS pages (slug VARCHAR(255) PRIMARY KEY, position INTEGER NOT NULL, draft LONGTEXT NOT NULL, published LONGTEXT, published_at VARCHAR(40), updated_at VARCHAR(40) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS sections (slug VARCHAR(255) PRIMARY KEY, position INTEGER NOT NULL, draft LONGTEXT NOT NULL, published LONGTEXT, published_at VARCHAR(40), updated_at VARCHAR(40) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS entries (type VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL, draft LONGTEXT NOT NULL, published LONGTEXT, published_at VARCHAR(40), updated_at VARCHAR(40) NOT NULL, PRIMARY KEY (type, slug)) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS media (name VARCHAR(255) PRIMARY KEY, label TEXT NOT NULL, size INTEGER NOT NULL, bytes LONGBLOB NOT NULL, created_at VARCHAR(40) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS messages (id VARCHAR(40) PRIMARY KEY, received_at VARCHAR(40) NOT NULL, form VARCHAR(255) NOT NULL, page TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, body TEXT NOT NULL, consent TEXT NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS users (id VARCHAR(40) PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, name TEXT NOT NULL, role VARCHAR(20) NOT NULL, password TEXT NOT NULL, created_at VARCHAR(40) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS sessions (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(40) NOT NULL, expires_at VARCHAR(40) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS links (id VARCHAR(64) PRIMARY KEY, kind VARCHAR(20) NOT NULL, user_id VARCHAR(40) NOT NULL, expires_at VARCHAR(40) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS extensions (name VARCHAR(64) PRIMARY KEY, version VARCHAR(40) NOT NULL, sha256 VARCHAR(64) NOT NULL, package LONGTEXT NOT NULL, enabled INTEGER NOT NULL, installed_at VARCHAR(40) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS extension_rows (extension VARCHAR(64) NOT NULL, collection VARCHAR(64) NOT NULL, id VARCHAR(40) NOT NULL, data LONGTEXT NOT NULL, updated_at VARCHAR(40) NOT NULL, PRIMARY KEY (extension, collection, id)) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS versions (kind VARCHAR(64) NOT NULL, slug VARCHAR(255) NOT NULL, at VARCHAR(40) NOT NULL, doc LONGTEXT NOT NULL, PRIMARY KEY (kind, slug, at)) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS media_sizes (name VARCHAR(255) PRIMARY KEY, width INTEGER NOT NULL, height INTEGER NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS media_texts (name VARCHAR(255) PRIMARY KEY, alt TEXT NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS schedule (kind VARCHAR(64) NOT NULL, slug VARCHAR(255) NOT NULL, at VARCHAR(40) NOT NULL, PRIMARY KEY (kind, slug)) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS media_variants (name VARCHAR(255) PRIMARY KEY, original VARCHAR(255) NOT NULL, width INTEGER NOT NULL, bytes LONGBLOB NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS page_locks (slug VARCHAR(255) PRIMARY KEY, hash TEXT NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS extension_jobs (extension VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL, last_at VARCHAR(40) NOT NULL, PRIMARY KEY (extension, action)) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS comments (id VARCHAR(40) PRIMARY KEY, type VARCHAR(255) NOT NULL, entry VARCHAR(255) NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, body TEXT NOT NULL, consent TEXT NOT NULL, at VARCHAR(40) NOT NULL, approved INTEGER NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS message_answers (id VARCHAR(40) PRIMARY KEY, answers LONGTEXT NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS comment_languages (id VARCHAR(40) PRIMARY KEY, language VARCHAR(20) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS entry_authors (type VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL, user_id VARCHAR(40) NOT NULL, PRIMARY KEY (type, slug)) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS entry_reviews (type VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL, state VARCHAR(20) NOT NULL, note TEXT NOT NULL, at VARCHAR(40) NOT NULL, PRIMARY KEY (type, slug)) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS user_bios (id VARCHAR(40) PRIMARY KEY, bio TEXT NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS user_pictures (id VARCHAR(40) PRIMARY KEY, src TEXT NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS user_bar (id VARCHAR(40) PRIMARY KEY, shown INTEGER NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS not_found (path VARCHAR(255) PRIMARY KEY, hits INTEGER NOT NULL, last_at VARCHAR(40) NOT NULL, referrer VARCHAR(255) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS extension_unique (extension VARCHAR(64) NOT NULL, collection VARCHAR(64) NOT NULL, field VARCHAR(64) NOT NULL, value VARCHAR(255) NOT NULL, id VARCHAR(40) NOT NULL, PRIMARY KEY (extension, collection, field, value)) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS extension_later (id VARCHAR(40) PRIMARY KEY, extension VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL, input LONGTEXT NOT NULL, due_at VARCHAR(40) NOT NULL, tries INTEGER NOT NULL, made_at VARCHAR(40) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS extension_files (id VARCHAR(40) PRIMARY KEY, extension VARCHAR(64) NOT NULL, order_id VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL, type VARCHAR(100) NOT NULL, buyer INTEGER NOT NULL, size INTEGER NOT NULL, bytes LONGBLOB NOT NULL, created_at VARCHAR(40) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS fonts (name VARCHAR(64) PRIMARY KEY, label VARCHAR(255) NOT NULL, faces LONGTEXT NOT NULL, created_at VARCHAR(40) NOT NULL) ${MYSQL_TABLE}`,
    `CREATE TABLE IF NOT EXISTS font_files (name VARCHAR(255) PRIMARY KEY, bytes LONGBLOB NOT NULL) ${MYSQL_TABLE}`,
  ],
  params: (query) => query,
  upsert: (table, columns, _key, update) =>
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${marks(columns)}) ON DUPLICATE KEY UPDATE ${update.map((c) => `${c} = VALUES(${c})`).join(', ')}`,
  insertNew: (table, columns) => `INSERT IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${marks(columns)})`,
  key: '`key`',
};

const DIALECTS: Record<DatabaseKind, Dialect> = { sqlite: SQLITE, postgres: POSTGRES, mysql: MYSQL };

/** Which database an address names. A plain path is a SQLite file, as it always was; `postgres://` and `mysql://` are servers. */
export function databaseKind(address: string): DatabaseKind {
  if (/^postgres(ql)?:\/\//i.test(address)) return 'postgres';
  if (/^(mysql|mariadb):\/\//i.test(address)) return 'mysql';
  return 'sqlite';
}

/** An address as it may be shown: the password left out. */
export function shownAddress(address: string): string {
  return databaseKind(address) === 'sqlite' ? address : address.replace(/\/\/([^:/@]*):[^@/]*@/, '//$1:***@');
}

type Row = Record<string, unknown>;

/** What a visitor sent through a form (ADR 0019). */
export interface Message {
  id: string;
  /** When it arrived, as an ISO time. */
  receivedAt: string;
  /** The name of the form it was sent with (ADR 0049). */
  form: string;
  /** The address of the page the form was on. */
  page: string;
  name: string;
  email: string;
  body: string;
  /** The words of the consent the visitor ticked. */
  consent: string;
  /** What was sent, field by field, with each label as the visitor read it (ADR 0049 d5). A message from before has none. */
  answers?: Answer[];
}

/**
 * One total the program kept before the statistics were an extension (ADR
 * 0053): read from an old database or an old backup, and moved into the
 * extension's rows (ADR 0062 d8).
 */
export interface VisitRow {
  day: string;
  kind: Kind;
  name: string;
  hits: number;
}

/** Something that happened in the site, for the extensions that listen to it (ADR 0041). Never a visitor's address. */
export interface SiteEvent {
  name: ExtensionEventName;
  data: Record<string, unknown>;
}

/** What a visitor wrote under an entry (ADR 0040). Shown on the site once approved; the address never is. */
export interface Comment {
  id: string;
  /** The entry's type and address. */
  type: string;
  entry: string;
  name: string;
  email: string;
  body: string;
  /** The words of the consent the visitor ticked. */
  consent: string;
  /** When it was sent, as an ISO time. */
  at: string;
  approved: boolean;
  /** Kept apart, as an extension judged it (ADR 0062 d3): not shown, until the owner approves it. */
  spam?: boolean;
  /** The language of the entry it was written under, when not the main one (ADR 0054 d6). */
  language?: string;
}

/**
 * Someone who may sign in to the admin (ADR 0022). The owner can do
 * everything; an editor writes and publishes content and nothing else.
 */
export type Role = 'owner' | 'editor' | 'author' | 'contributor';
/** Every role, from the one who may do most (ADR 0055 d1). */
export const ROLES: readonly Role[] = ['owner', 'editor', 'author', 'contributor'];
/** A role as stored or asked for; anything unknown is the one who may do least. */
export const cleanRole = (value: unknown): Role => (ROLES.includes(value as Role) ? (value as Role) : 'contributor');
/** Whether a role writes the whole site's content, or only its own entries (ADR 0055 d1). */
export const writesAll = (role: Role): boolean => role === 'owner' || role === 'editor';
/** Where an entry is in its review (ADR 0055 d4): sent by its contributor, or sent back with a note. */
export interface Review {
  type: string;
  slug: string;
  state: 'waiting' | 'returned';
  note: string;
  at: string;
}
/** The longest description of a person (ADR 0055 d3), and of a note sent back with an entry (d4). */
export const BIO_MAX = 300;
export const NOTE_MAX = 500;
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** False while an invitation has not been taken up. */
  active: boolean;
  createdAt: string;
  /** A few words about them, shown under what they wrote (ADR 0055 d3). */
  bio?: string;
  /** Their picture, an image of the media library (ADR 0056 d2); '' for none. */
  picture?: string;
  /** Whether the admin bar is shown to them over the site (ADR 0075); on unless they turned it off. */
  bar?: boolean;
}
/** What a one-time link is for: the first owner, someone invited, a new password. */
export type LinkKind = 'setup' | 'invite' | 'reset';

/** How many publications of one page or entry are kept, to bring back. */
export const VERSIONS_KEPT = 20;

export const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;
/** An address as it is kept, lower case; empty when it is not one. */
export const cleanEmail = (value: string): string => {
  const email = value.trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) && email.length <= 254 ? email : '';
};
/** What is wrong with a password, or nothing. Said before a one-time link is spent. */
export const passwordProblem = (password: string): string =>
  password.length < PASSWORD_MIN ? `a password has at least ${PASSWORD_MIN} characters` : password.length > PASSWORD_MAX ? `a password has at most ${PASSWORD_MAX} characters` : '';
const SESSION_DAYS = 30;
/** A secret is kept only as its hash: a copy of the database does not sign anyone in. */
const hashOf = (secret: string): string => new Bun.CryptoHasher('sha256').update(secret).digest('hex');
const newSecret = (): string => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
/** Checked against when nobody has the address, so a wrong address takes as long as a wrong password. */
let decoy: Promise<string> | null = null;

/** A type's page is cleaned as a page's blocks are: the same rules, the same limits. */
const cleanTemplate = (blocks: unknown[]): Block[] => normalizePage({ slug: '', title: 'template', blocks }).page.blocks;

export class Store {
  readonly kind: DatabaseKind;
  private readonly dialect: Dialect;

  private readonly listeners = new Set<(event: SiteEvent) => void>();

  private constructor(private readonly sql: SQL, kind: DatabaseKind) {
    this.kind = kind;
    this.dialect = DIALECTS[kind];
  }

  /** Hears what happens in the site from now on (ADR 0041). Returns how to stop hearing it. */
  onEvent(listener: (event: SiteEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Tells what visitor accounts (ADR 0064 d7) and the shop (ADR 0065 d9) did:
   * they keep their tables apart and are loaded only while on, so they say it
   * themselves.
   */
  tell(name: 'account.made' | 'account.removed' | 'member.changed' | OrderEvent, data: Record<string, unknown>): void {
    this.emit(name, data);
  }

  /** Tells whoever listens. A listener's failure is its own: what happened has happened. */
  private emit(name: ExtensionEventName, data: Record<string, unknown>): void {
    for (const listener of this.listeners) {
      try {
        listener({ name, data });
      } catch {
        // The change is made; a listener that throws is not the store's to answer for.
      }
    }
  }

  /** Opens a site's database, creating its tables when they are not there. */
  static async open(address: string): Promise<Store> {
    const kind = databaseKind(address);
    const sql =
      kind === 'sqlite'
        ? new SQL({ adapter: 'sqlite', filename: address.replace(/^sqlite:\/\//i, ''), create: true } as unknown as ConstructorParameters<typeof SQL>[0])
        : new SQL(address.replace(/^mariadb:/i, 'mysql:'));
    const store = new Store(sql, kind);
    await store.prepare();
    return store;
  }

  private async prepare(): Promise<void> {
    if (this.kind === 'sqlite') await this.sql.unsafe('PRAGMA journal_mode = WAL');
    for (const statement of this.dialect.schema) await this.sql.unsafe(statement);
    // A site made before there were content types kept its posts in a table of their own (ADR 0010). Only SQLite files are that old.
    if (this.kind === 'sqlite' && (await this.rows("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'posts'")).length) {
      await this.sql.begin(async (tx) => {
        await tx.unsafe(`INSERT OR IGNORE INTO entries (type, slug, draft, published, published_at, updated_at)
          SELECT '${POSTS_TYPE}', slug, draft, published, published_at, updated_at FROM posts`);
        await tx.unsafe('DROP TABLE posts');
      });
    }
    await this.moveCopies();
    await this.keepOldContactForm();
    await this.moveVisits();
  }

  /**
   * The totals kept before the statistics were an extension (ADR 0062 d8):
   * moved into its rows, where it finds them once it is installed, and the
   * table goes. A database that never had them has nothing to move.
   */
  private async moveVisits(): Promise<void> {
    let rows: VisitRow[];
    try {
      rows = await this.rows<VisitRow>('SELECT day, kind, name, hits FROM visits');
    } catch {
      return;
    }
    await this.sql.begin(async (tx) => {
      const run = (query: string, params: unknown[] = []) => tx.unsafe(this.dialect.params(query), params);
      await this.addStatsRows(run, rows);
      await run('DROP TABLE visits');
    });
  }

  /**
   * Adds old totals to the statistics' rows: every month's, and the days'
   * that the extension still keeps. Its own code adds the same way, to rows of
   * the same names (`extensions/stats/rows.ts`).
   */
  private async addStatsRows(run: (query: string, params?: unknown[]) => Promise<unknown>, rows: readonly VisitRow[], now = Date.now()): Promise<void> {
    const oldest = new Date(now - (DAYS_KEPT + 1) * 86_400_000).toISOString().slice(0, 10);
    const totals = rows.filter((r) => (KINDS as readonly string[]).includes(r.kind) && /^\d{4}-\d{2}-\d{2}$/.test(r.day)).map((r) => ({ day: r.day, kind: r.kind, name: r.name, hits: Number(r.hits) || 0 }));
    const at = new Date(now).toISOString();
    for (const one of summed(totals)) {
      if (one.collection === 'days' && (one.row as { day: string }).day < oldest) continue;
      const [before] = (await run('SELECT data FROM extension_rows WHERE extension = ? AND collection = ? AND id = ?', [STATS, one.collection, one.id])) as { data: string }[];
      if (before) {
        const data = JSON.parse(before.data) as Record<string, unknown>;
        await run('UPDATE extension_rows SET data = ?, updated_at = ? WHERE extension = ? AND collection = ? AND id = ?', [JSON.stringify({ ...data, hits: (Number(data.hits) || 0) + one.hits }), at, STATS, one.collection, one.id]);
      } else {
        await run('INSERT INTO extension_rows (extension, collection, id, data, updated_at) VALUES (?, ?, ?, ?, ?)', [STATS, one.collection, one.id, JSON.stringify({ ...one.row, hits: one.hits }), at]);
      }
    }
  }

  /**
   * A translation made as a copy under its language's prefix (ADR 0024) moves
   * into the page it is of (ADR 0032 d7): as words by field when it has the
   * same blocks, as the page split for its language otherwise. Its draft and
   * its publication move separately. A page only in another language stays.
   */
  private async moveCopies(): Promise<void> {
    const site = await this.site();
    if (site.languages.length === 0) return;
    const rows = await this.rows<{ slug: string; draft: string; published: string | null }>('SELECT slug, draft, published FROM pages');
    const bySlug = new Map(rows.map((row) => [String(row.slug), row]));
    for (const row of rows) {
      const slug = String(row.slug);
      const language = languageOf(site, slug);
      const main = bySlug.get(baseSlug(site, slug));
      if (language === site.language || !main) continue;
      const into = (target: string, copy: string): string => {
        const page = normalizePage(JSON.parse(target)).page;
        page.translations = { ...page.translations, [language]: copyAsTranslation(page, normalizePage(JSON.parse(copy)).page) };
        return JSON.stringify(page);
      };
      main.draft = into(main.draft, row.draft);
      if (main.published && row.published) main.published = into(main.published, row.published);
      await this.run('UPDATE pages SET draft = ?, published = ? WHERE slug = ?', [main.draft, main.published, main.slug]);
      await this.run('DELETE FROM pages WHERE slug = ?', [slug]);
      await this.run('DELETE FROM versions WHERE kind = ? AND slug = ?', ['page', slug]);
    }
  }

  async close(): Promise<void> {
    await this.sql.close();
  }

  /** Every row a query returns. Written with `?`; the dialect turns that into what the database wants. */
  private async rows<T = Row>(query: string, params: unknown[] = []): Promise<T[]> {
    return [...((await this.sql.unsafe(this.dialect.params(query), params)) as T[])];
  }

  private async row<T = Row>(query: string, params: unknown[] = []): Promise<T | null> {
    return (await this.rows<T>(query, params))[0] ?? null;
  }

  private async run(query: string, params: unknown[] = []): Promise<void> {
    await this.sql.unsafe(this.dialect.params(query), params);
  }

  /** How many rows a change touched: the database's own answer, so two requests cannot both win. */
  private async changed(query: string, params: unknown[] = []): Promise<number> {
    return Number(((await this.sql.unsafe(this.dialect.params(query), params)) as { count?: number }).count ?? 0);
  }

  private async getMeta(key: string): Promise<unknown> {
    const row = await this.row<{ value: string }>(`SELECT value FROM meta WHERE ${this.dialect.key} = ?`, [key]);
    return row ? JSON.parse(row.value) : null;
  }

  private async setMeta(key: string, value: unknown): Promise<void> {
    await this.run(this.dialect.upsert('meta', [this.dialect.key, 'value'], [this.dialect.key], ['value']), [key, JSON.stringify(value)]);
  }

  /** Nothing was ever saved here: no settings, no page, no entry. A new site starts from this. */
  async isEmpty(): Promise<boolean> {
    return !(await this.row(`SELECT 1 AS found FROM meta WHERE ${this.dialect.key} = ?`, ['site'])) && !(await this.row('SELECT 1 AS found FROM pages')) && !(await this.row('SELECT 1 AS found FROM entries'));
  }

  async site(): Promise<Site> {
    return normalizeSite(await this.getMeta('site'));
  }

  /**
   * Sets the site's settings. A content type may not take the address of a
   * page, and one that still has entries may not be removed: either would
   * leave something at an address nobody chose.
   */
  async setSite(input: unknown): Promise<Site> {
    const site = normalizeSite(input);
    for (const type of site.types) {
      if (await this.draft(type.path)) throw new Error(`a page already lives at "/${type.path}/"; give the content type "${type.name}" another address`);
    }
    // In each other language, two types never answer at one address, and no page lives where a type does (ADR 0054 d3).
    const placed = new Set(placePages(site, await this.drafts()).map((p) => p.slug));
    for (const language of site.languages) {
      const seen = new Set<string>();
      for (const type of site.types) {
        const path = typeIn(site, type, language).path;
        if (seen.has(path) || placed.has(path)) throw new Error(`"/${path}/" is already taken in ${languageName(language)}; give the content type "${type.name}" another address there`);
        seen.add(path);
      }
    }
    // A language takes its prefix as an address, and keeps its pages while it has any (ADR 0024).
    const slugs = (await this.rows<{ slug: string }>('SELECT slug FROM pages')).map((row) => String(row.slug));
    for (const language of site.languages) {
      if (slugs.includes(prefixOf(language)) && !(await this.site()).languages.includes(language)) throw new Error(`a page already lives at "/${prefixOf(language)}/"; give it another address before adding ${languageName(language)}`);
    }
    const translated = (await this.drafts()).flatMap((page) => Object.keys(page.translations ?? {}).filter((language) => !site.languages.includes(language)).map((language) => ({ page, language })))[0];
    if (translated) throw new Error(`"${translated.page.title}" is still in ${languageName(translated.language)}; remove its translation before removing the language`);
    // So is an entry (ADR 0054).
    for (const row of await this.rows<{ draft: string }>('SELECT draft FROM entries')) {
      const doc = JSON.parse(row.draft) as { title?: unknown; translations?: Record<string, unknown> };
      const language = Object.keys(isObject(doc.translations) ? doc.translations : {}).find((l) => !site.languages.includes(l));
      if (language) throw new Error(`"${String(doc.title ?? '')}" is still in ${languageName(language)}; remove its translation before removing the language`);
    }
    const left = slugs.find((slug) => slug.includes('/') && !site.languages.some((language) => slug.startsWith(`${prefixOf(language)}/`)));
    if (left) throw new Error(`"/${left}/" is still in ${languageName(left.split('/')[0] as string)}; delete the pages of a language before removing it`);
    const kept = new Set([...site.types.map((t) => t.id)]);
    const orphans = (await this.rows<{ type: string; n: number | string }>('SELECT type, COUNT(*) AS n FROM entries GROUP BY type')).filter((row) => !kept.has(row.type));
    const first = orphans[0];
    if (first) {
      const n = Number(first.n);
      const gone = (await this.site()).types.find((t) => t.id === first.type);
      throw new Error(`"${gone?.name ?? first.type}" still has ${n === 1 ? '1 entry' : `${n} entries`}; delete what it holds before removing the content type`);
    }
    // A layout a page or a content type is drawn in stays while they are (ADR 0035).
    const layouts = new Set((site.layouts ?? READY_LAYOUTS).map((l) => l.id));
    const before = (await this.site()).layouts ?? READY_LAYOUTS;
    const gone = (id: string | undefined): string => (id && !layouts.has(id) ? (before.find((l) => l.id === id)?.name ?? id) : '');
    const page = (await this.drafts()).find((p) => gone(p.layout));
    if (page) throw new Error(`"${page.title}" is drawn in the layout "${gone(page.layout)}"; give it another layout before removing this one`);
    const type = site.types.find((t) => gone(t.layout));
    if (type) throw new Error(`"${type.name}" is drawn in the layout "${gone(type.layout)}"; give it another layout before removing this one`);
    await this.setMeta('site', site);
    return site;
  }

  /** Old addresses that lead to new ones (ADR 0009). The export writes a small page for each. */
  async redirects(): Promise<Redirect[]> {
    return normalizeRedirects(await this.getMeta('redirects'));
  }

  async setRedirects(input: unknown): Promise<Redirect[]> {
    const redirects = normalizeRedirects(input);
    await this.setMeta('redirects', redirects);
    // An address that now leads somewhere is no longer one that is not found (ADR 0063 d1).
    for (const { from } of redirects) await this.run('DELETE FROM not_found WHERE path = ?', [from]);
    return redirects;
  }

  private async readTheme(key: string): Promise<Theme | null> {
    const raw = await this.getMeta(key);
    if (raw === null) return null;
    const { theme, issues } = parseTheme(raw);
    // A stored theme that no longer passes is an error, not a silent default.
    if (!theme) throw new Error(`the stored theme is not valid: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
    return theme;
  }

  /**
   * The theme being worked on: what the editor shows. Like a page, a theme has
   * a draft and a published copy, so trying a colour never repaints the live
   * site. Null when none was ever set.
   */
  theme(): Promise<Theme | null> {
    return this.readTheme('theme');
  }

  /** The theme visitors see: what the export uses. Null until one is published. */
  publishedTheme(): Promise<Theme | null> {
    return this.readTheme('theme:published');
  }

  /** Replaces the theme being worked on. Refuses a document with any issue and says which. */
  async setTheme(input: unknown): Promise<Theme> {
    const { theme, issues } = parseTheme(input);
    if (!theme) throw new Error(`not a valid theme: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
    await this.setMeta('theme', theme);
    return theme;
  }

  /** Freezes the theme being worked on as the one visitors see. */
  async publishTheme(): Promise<Theme> {
    const theme = await this.theme();
    if (!theme) throw new Error('this site has no theme yet');
    await this.setMeta('theme:published', theme);
    return theme;
  }

  /** Whether the theme being worked on differs from the published one. */
  async themeChanged(): Promise<boolean> {
    return JSON.stringify(await this.theme()) !== JSON.stringify(await this.publishedTheme());
  }

  /**
   * The page a content type draws its entries with (ADR 0015), as it is being
   * worked on. Like the theme it has a draft and a published copy, so
   * changing it never changes the live site until it is published. Null: the
   * type uses the default page.
   */
  async template(typeId: string): Promise<Block[] | null> {
    return this.readTemplate(`template:${(await this.type(typeId)).id}`);
  }

  /** The page visitors see entries of this type in. */
  async publishedTemplate(typeId: string): Promise<Block[] | null> {
    return this.readTemplate(`template:${(await this.type(typeId)).id}:published`);
  }

  private async readTemplate(key: string): Promise<Block[] | null> {
    const raw = await this.getMeta(key);
    return Array.isArray(raw) ? cleanTemplate(raw) : null;
  }

  /** Replaces a type's page being worked on; null goes back to the default page. */
  async setTemplate(typeId: string, blocks: unknown): Promise<Block[] | null> {
    const type = await this.type(typeId);
    const clean = Array.isArray(blocks) ? cleanTemplate(blocks) : null;
    await this.setMeta(`template:${type.id}`, clean);
    return clean;
  }

  async publishTemplate(typeId: string): Promise<void> {
    await this.setMeta(`template:${(await this.type(typeId)).id}:published`, await this.template(typeId));
  }

  /** Whether a type's page differs from what visitors see. */
  async templateChanged(typeId: string): Promise<boolean> {
    return JSON.stringify(await this.template(typeId)) !== JSON.stringify(await this.publishedTemplate(typeId));
  }

  /** Saves a page's draft. The published copy, if any, is left as it is. */
  async savePage(input: unknown): Promise<Page> {
    const { page } = normalizePage(input);
    if (!page.title) throw new Error('a page has a title');
    // Words kept for a block the page no longer has are words of nothing.
    for (const translation of Object.values(page.translations ?? {})) translation.fields = keepWords(page.blocks, translation.fields);
    const site = await this.site();
    const problem = slugProblem(site, page.slug, reservedSlugs(site));
    if (problem) throw new Error(problem);
    const next = await this.row<{ n: number | string }>('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM pages');
    await this.run(this.dialect.upsert('pages', ['slug', 'position', 'draft', 'updated_at'], ['slug'], ['draft', 'updated_at']), [
      page.slug,
      Number(next?.n ?? 1),
      JSON.stringify(page),
      new Date().toISOString(),
    ]);
    return page;
  }

  /** Freezes the current draft as what visitors see. */
  async publish(where: string, now = new Date()): Promise<void> {
    // A translation is published with its page (ADR 0032 d5).
    const found = await this.locate(where);
    const slug = found?.translated ? found.of : where;
    // Asked before, not counted after: MySQL counts a row that already held these values as unchanged.
    if (!(await this.row('SELECT 1 AS found FROM pages WHERE slug = ?', [slug]))) throw new Error(`no page "${slug}"`);
    const before = await this.liveAddresses(slug);
    const at = now.toISOString();
    await this.run('UPDATE pages SET published = draft, published_at = ? WHERE slug = ?', [at, slug]);
    const row = await this.row<{ published: string }>('SELECT published FROM pages WHERE slug = ?', [slug]);
    await this.keepVersion('page', slug, String(row?.published), at);
    // A translation published at a new address leaves a way from the old one (ADR 0036).
    await this.followMoves(before, await this.liveAddresses(slug));
    this.emit('page.published', { slug, title: String((JSON.parse(String(row?.published)) as { title?: unknown }).title ?? '') });
  }

  /**
   * Publishes a page or an entry at a set time (ADR 0039): what its draft is
   * then is what is published. One time for each; set again, it moves.
   */
  async schedule(kind: string, slug: string, at: string, now = new Date()): Promise<Scheduled[]> {
    const when = new Date(at);
    if (Number.isNaN(when.getTime())) throw new Error('give the date and hour to publish at');
    if (when.getTime() <= now.getTime()) throw new Error('that time has passed; publish it now instead');
    if (when.getTime() > now.getTime() + 2 * 365 * 24 * 3600 * 1000) throw new Error('a publication is set at most two years ahead');
    if (kind === 'page') {
      if (!(await this.row('SELECT 1 AS found FROM pages WHERE slug = ?', [slug]))) throw new Error(`no page "${slug}"`);
    } else {
      await this.type(kind);
      if (!(await this.row('SELECT 1 AS found FROM entries WHERE type = ? AND slug = ?', [kind, slug]))) throw new Error(`no entry "${slug}"`);
    }
    await this.run(this.dialect.upsert('schedule', ['kind', 'slug', 'at'], ['kind', 'slug'], ['at']), [kind, slug, when.toISOString()]);
    return this.scheduled();
  }

  async unschedule(kind: string, slug: string): Promise<Scheduled[]> {
    await this.run('DELETE FROM schedule WHERE kind = ? AND slug = ?', [kind, slug]);
    return this.scheduled();
  }

  /** Every publication set for later, soonest first. */
  async scheduled(): Promise<Scheduled[]> {
    return this.rows<Scheduled>('SELECT kind, slug, at FROM schedule ORDER BY at, kind, slug');
  }

  /**
   * Publishes what is due. Each one is claimed by deleting it first, so two
   * processes with a clock (the editor and the runtime) never both publish it.
   */
  async publishDue(now = new Date()): Promise<Scheduled[]> {
    const done: Scheduled[] = [];
    for (const due of await this.rows<Scheduled>('SELECT kind, slug, at FROM schedule WHERE at <= ? ORDER BY at', [now.toISOString()])) {
      if ((await this.changed('DELETE FROM schedule WHERE kind = ? AND slug = ? AND at = ?', [due.kind, due.slug, due.at])) !== 1) continue;
      if (due.kind === 'page') await this.publish(due.slug, now);
      else await this.publishEntry(due.kind, due.slug, now);
      done.push(due);
    }
    return done;
  }

  /** Where a page and each of its translations are published, by language. */
  private async liveAddresses(of: string): Promise<Map<string, string>> {
    return new Map((await this.published()).filter((p) => p.of === of).map((p) => [p.language, p.slug]));
  }

  /** Each address visitors knew that moved, kept as a redirect to where it went (ADR 0036). */
  private async followMoves(before: Map<string, string>, after: Map<string, string>): Promise<void> {
    let redirects = await this.redirects();
    const start = JSON.stringify(redirects);
    for (const [language, old] of before) {
      const now = after.get(language);
      if (now !== undefined && now !== old) redirects = addRedirect(redirects, pagePath(old), pagePath(now));
    }
    if (JSON.stringify(redirects) !== start) await this.setRedirects(redirects);
  }

  /**
   * Gives a page another address (ADR 0036): its draft, what is published,
   * its versions and the menu go with it, and every address of it visitors
   * knew leads to the new one.
   */
  async movePage(from: string, input: string): Promise<Page> {
    const site = await this.site();
    const to = pageSlug(input);
    const page = await this.draft(from);
    if (!page) throw new Error(`no page "${from}"`);
    if (from === '') throw new Error('the home page stays at /');
    if (!to || to === from) throw new Error('a page moves to another address');
    if (languageOf(site, to) !== languageOf(site, from)) throw new Error(`a page in ${languageName(languageOf(site, from))} stays under its language`);
    const problem = slugProblem(site, to, reservedSlugs(site));
    if (problem) throw new Error(problem);
    const moved = { ...page, slug: to };
    const others = (await this.drafts()).filter((p) => p.slug !== from);
    const taken = placePages(site, others).find((p) => placePages(site, [moved]).some((m) => m.slug === p.slug));
    if (taken) throw new Error(`"/${taken.slug}/" is already the address of "${taken.title}"`);
    const before = await this.liveAddresses(from);
    const row = await this.row<{ published: string | null }>('SELECT published FROM pages WHERE slug = ?', [from]);
    const published = row?.published ? JSON.stringify({ ...JSON.parse(row.published), slug: to }) : null;
    await this.run('UPDATE pages SET slug = ?, draft = ?, published = ?, updated_at = ? WHERE slug = ?', [to, JSON.stringify(moved), published, new Date().toISOString(), from]);
    await this.run('UPDATE versions SET slug = ? WHERE kind = ? AND slug = ?', [to, 'page', from]);
    await this.run('UPDATE page_locks SET slug = ? WHERE slug = ?', [to, from]);
    await this.run('UPDATE schedule SET slug = ? WHERE kind = ? AND slug = ?', [to, 'page', from]);
    // Who sees it goes with the page (ADR 0064 d4).
    const audiences = await this.audiences();
    if (audiences.pages[from]) {
      audiences.pages[to] = audiences.pages[from];
      delete audiences.pages[from];
      await this.setMeta(AUDIENCES, audiences);
    }
    // The menu names a page by its address: it follows the page.
    if (site.menu) {
      const follow = (nodes: MenuNode[]): MenuNode[] => nodes.map((n) => ({ ...n, target: n.target.kind === 'page' && n.target.slug === from ? { kind: 'page', slug: to } : n.target, children: follow(n.children) }));
      await this.setMeta('site', { ...site, menu: follow(site.menu) });
    }
    await this.followMoves(before, await this.liveAddresses(to));
    return moved;
  }

  async draft(slug: string): Promise<Page | null> {
    const row = await this.row<{ draft: string }>('SELECT draft FROM pages WHERE slug = ?', [slug]);
    return row ? normalizePage(JSON.parse(row.draft)).page : null;
  }

  /** Every page's draft, as kept, in menu order. */
  private async drafts(): Promise<Page[]> {
    return (await this.rows<{ draft: string }>('SELECT draft FROM pages ORDER BY position, slug')).map((row) => normalizePage(JSON.parse(row.draft)).page);
  }

  /** The page at an address, as it is being written: a page kept there, or a translation of one (ADR 0032). */
  async locate(slug: string): Promise<PlacedPage | null> {
    return placePages(await this.site(), await this.drafts()).find((p) => p.slug === slug) ?? null;
  }

  /**
   * Every page at its address, in menu order, with whether its draft differs
   * from what is published. A translation is listed at its own address, with
   * the page it is of and how much of it still shows the main language.
   */
  async pages(): Promise<{ slug: string; title: string; inMenu: boolean; published: boolean; changed: boolean; of: string; language: string; translated: boolean; split: boolean; missing: number }[]> {
    const site = await this.site();
    const rows = await this.rows<{ slug: string; draft: string; published: string | null }>('SELECT slug, draft, published FROM pages ORDER BY position, slug');
    const drafts = rows.map((row) => normalizePage(JSON.parse(row.draft)).page);
    const live = new Set(placePages(site, rows.flatMap((row) => (row.published === null ? [] : [normalizePage(JSON.parse(row.published)).page]))).map((p) => p.slug));
    const changed = new Map(rows.map((row) => [String(row.slug), row.published !== row.draft]));
    const byslug = new Map(drafts.map((page) => [page.slug, page]));
    return placePages(site, drafts).map((p) => {
      const owner = p.translated ? byslug.get(p.of) : undefined;
      const translation = owner?.translations?.[p.language];
      return {
        slug: p.slug,
        title: p.title,
        inMenu: p.inMenu,
        published: live.has(p.slug),
        changed: changed.get(p.translated ? p.of : p.slug) ?? true,
        of: p.of,
        language: p.language,
        translated: p.translated,
        split: p.split,
        missing: owner && translation ? missingWords(owner, translation).length : 0,
      };
    });
  }

  /** A page's or a section's translation into a language, changed by `change` and kept in its draft (ADR 0032 d5). */
  private async withTranslation(of: string, language: string, change: (page: Page, translation: PageTranslation | undefined) => PageTranslation | null, kind: Kept = 'page'): Promise<PlacedPage | null> {
    const site = await this.site();
    if (!site.languages.includes(language)) throw new Error(`${languageName(language)} is not one of the site's languages`);
    const page = kind === 'page' ? await this.draft(of) : await this.sectionDraft(of);
    if (!page || (kind === 'page' && languageOf(site, of) !== site.language)) throw new Error(`no ${kind} "${of}"`);
    const next = change(page, page.translations?.[language]);
    const translations = { ...page.translations };
    if (next) translations[language] = next;
    else delete translations[language];
    const changed = { ...page, translations };
    if (next && kind === 'page') {
      const at = translatedPage(site, changed, language) as PlacedPage;
      const taken = placePages(site, await this.drafts()).find((p) => p.slug === at.slug && !(p.of === of && p.language === language));
      if (taken) throw new Error(`"/${at.slug}/" is already the address of "${taken.title}"`);
      const problem = slugProblem(site, at.slug, reservedSlugs(site));
      if (problem) throw new Error(problem);
    }
    if (kind === 'page') await this.savePage(changed);
    else await this.saveSection(changed);
    return next ? translatedPage(site, changed, language) : null;
  }

  /** Starts a page (or a section) in another language: all in the main language's words until they are written. */
  async translate(of: string, language: string, kind: Kept = 'page'): Promise<PlacedPage> {
    return (await this.withTranslation(
      of,
      language,
      (_page, had) => {
        if (had) throw new Error(`this ${kind} is already in that language`);
        return newTranslation();
      },
      kind,
    )) as PlacedPage;
  }

  /**
   * Keeps a translation as written in the builder: its address, title and
   * description, and its words, or its blocks when it is split. A translation
   * that is not split keeps the main blocks (ADR 0032 d3).
   */
  async saveTranslation(of: string, language: string, input: unknown, kind: Kept = 'page'): Promise<PlacedPage> {
    const site = await this.site();
    const { page: written } = normalizePage(input);
    if (!written.title) throw new Error('a page has a title');
    if (languageOf(site, written.slug) !== language) throw new Error(`a page in ${languageName(language)} stays under /${prefixOf(language)}/`);
    return (await this.withTranslation(
      of,
      language,
      (page, had) => {
        if (!had) throw new Error(`this ${kind} is not in that language yet`);
        const address = of === '' || kind === 'section' ? '' : baseSlug(site, written.slug);
        const next: PageTranslation = {
          slug: address === of ? '' : address,
          title: written.title === page.title ? '' : written.title,
          description: written.description === page.description ? '' : written.description,
          ...(written.seoTitle && written.seoTitle !== page.seoTitle ? { seoTitle: written.seoTitle } : {}),
          fields: {},
          blocks: had.blocks ? written.blocks : null,
        };
        if (!had.blocks) {
          const { fields, problem } = wordsFrom(page.blocks, written.blocks);
          if (problem) throw new Error(problem);
          next.fields = fields;
        }
        return next;
      },
      kind,
    )) as PlacedPage;
  }

  /** Fills in what a translation does not say yet from a page written in that language (ADR 0034); words already written stay. */
  async fillTranslation(of: string, language: string, input: unknown, kind: Kept = 'page'): Promise<PlacedPage> {
    const { page: written } = normalizePage(input);
    return (await this.withTranslation(
      of,
      language,
      (page, had) => {
        if (!had || had.blocks) throw new Error(`this ${kind} has no translation into that language to fill in`);
        return fillTranslation(page, had, written);
      },
      kind,
    )) as PlacedPage;
  }

  /** Splits a page (or a section) for one language (ADR 0032 d4): the translation keeps its own blocks, as they show now. */
  async splitTranslation(of: string, language: string, kind: Kept = 'page'): Promise<PlacedPage> {
    return (await this.withTranslation(
      of,
      language,
      (page, had) => {
        if (!had) throw new Error(`this ${kind} is not in that language yet`);
        return had.blocks ? had : { ...had, fields: {}, blocks: localizeBlocks(page.blocks, had.fields) };
      },
      kind,
    )) as PlacedPage;
  }

  /** Takes a page (or a section) out of one language. What is published stays until it is published again. */
  async deleteTranslation(of: string, language: string, kind: Kept = 'page'): Promise<void> {
    await this.withTranslation(of, language, () => null, kind);
  }

  async deletePage(at: string): Promise<void> {
    const found = await this.locate(at);
    if (found?.translated) return this.deleteTranslation(found.of, found.language);
    const slug = at;
    if (slug === '') throw new Error('the home page cannot be deleted');
    await this.run('DELETE FROM pages WHERE slug = ?', [slug]);
    await this.run('DELETE FROM versions WHERE kind = ? AND slug = ?', ['page', slug]);
    await this.run('DELETE FROM schedule WHERE kind = ? AND slug = ?', ['page', slug]);
    await this.run('DELETE FROM page_locks WHERE slug = ?', [slug]);
    await this.forgetAudience('pages', slug);
  }

  // Pages behind a password (ADR 0043).

  /**
   * Puts a page, with each of its translations, behind a password, or takes
   * it away (null). The password is kept only as its hash.
   */
  async lockPage(at: string, password: string | null): Promise<string[]> {
    const found = await this.locate(at);
    const slug = found?.translated ? found.of : at;
    if (slug === '') throw new Error('the home page is open to everyone');
    if (!(await this.row('SELECT 1 AS found FROM pages WHERE slug = ?', [slug]))) throw new Error(`no page "${slug}"`);
    if (password === null) await this.run('DELETE FROM page_locks WHERE slug = ?', [slug]);
    else {
      if (password.length < 4 || password.length > 200) throw new Error('a password has 4 to 200 characters');
      await this.run(this.dialect.upsert('page_locks', ['slug', 'hash'], ['slug'], ['hash']), [slug, await Bun.password.hash(password, { algorithm: 'argon2id' })]);
    }
    return this.lockedPages();
  }

  // Who sees a page, an entry or a whole type (ADR 0064 d4). Kept beside the content, not in it:
  // it applies at once to what is published, as a password does.

  /** Each page, entry and type that is not for everyone, with who sees it. */
  async audiences(): Promise<Audiences> {
    return normalizeAudiences(await this.getMeta(AUDIENCES));
  }

  /**
   * Who sees a page (by any of its addresses: it goes with each translation),
   * an entry (`type/entry`) or a type (its id); null is everyone. The home
   * page is for everyone.
   */
  async setAudience(kind: 'page' | 'entry' | 'type', key: string, audience: unknown): Promise<Audiences> {
    const all = await this.audiences();
    const clean = normalizeAudience(audience);
    let at = key;
    let part: keyof Audiences;
    if (kind === 'page') {
      const found = await this.locate(key);
      at = found?.translated ? found.of : key;
      if (at === '') throw new Error('the home page is for everyone');
      if (!(await this.row('SELECT 1 AS found FROM pages WHERE slug = ?', [at]))) throw new Error(`no page "${at}"`);
      part = 'pages';
    } else if (kind === 'entry') {
      const [typeId = '', slug = ''] = key.split('/');
      if (!(await this.row('SELECT 1 AS found FROM entries WHERE type = ? AND slug = ?', [typeId, slug]))) throw new Error(`no entry "${key}"`);
      part = 'entries';
    } else {
      await this.type(key);
      part = 'types';
    }
    if (clean) all[part][at] = clean;
    else delete all[part][at];
    await this.setMeta(AUDIENCES, all);
    return all;
  }

  private async forgetAudience(part: keyof Audiences, key: string): Promise<void> {
    const all = await this.audiences();
    if (!all[part][key]) return;
    delete all[part][key];
    await this.setMeta(AUDIENCES, all);
  }

  /** The pages behind a password, by the address of their main language. */
  async lockedPages(): Promise<string[]> {
    return (await this.rows<{ slug: string }>('SELECT slug FROM page_locks ORDER BY slug')).map((r) => String(r.slug));
  }

  /**
   * Is this the page's password? When it is, the key a visitor keeps to see
   * it: it changes with the password, so a new password shuts out everyone
   * who had the old one. Null otherwise.
   */
  async unlockPage(slug: string, password: string): Promise<string | null> {
    const row = await this.row<{ hash: string }>('SELECT hash FROM page_locks WHERE slug = ?', [slug]);
    if (!row || !(await Bun.password.verify(password, String(row.hash)))) return null;
    return this.pageKey(slug);
  }

  /** The key that opens a page for a visitor who gave its password, or null for a page that has none. */
  async pageKey(slug: string): Promise<string | null> {
    const row = await this.row<{ hash: string }>('SELECT hash FROM page_locks WHERE slug = ?', [slug]);
    if (!row) return null;
    let secret = (await this.getMeta('unlock')) as string | null;
    if (!secret) {
      secret = newSecret();
      await this.setMeta('unlock', secret);
    }
    return new Bun.CryptoHasher('sha256', secret).update(`${slug}\n${String(row.hash)}`).digest('base64url');
  }

  /** Every published page at its address, translations with them, in menu order (ADR 0032). */
  async published(): Promise<PlacedPage[]> {
    const pages = (await this.rows<{ published: string }>('SELECT published FROM pages WHERE published IS NOT NULL ORDER BY position, slug')).map((row) => normalizePage(JSON.parse(row.published)).page);
    return placePages(await this.site(), pages);
  }

  /** When each published page and entry was last published (ADR 0058 d3): the sitemap's dates. */
  async publishedTimes(): Promise<{ pages: Record<string, string>; entries: Record<string, string> }> {
    const pages = await this.rows<{ slug: string; published_at: string | null }>('SELECT slug, published_at FROM pages WHERE published IS NOT NULL');
    const entries = await this.rows<{ type: string; slug: string; published_at: string | null }>('SELECT type, slug, published_at FROM entries WHERE published IS NOT NULL');
    return {
      pages: Object.fromEntries(pages.filter((row) => row.published_at).map((row) => [row.slug, String(row.published_at)])),
      entries: Object.fromEntries(entries.filter((row) => row.published_at).map((row) => [`${row.type}/${row.slug}`, String(row.published_at)])),
    };
  }

  /** What each published translation still shows in the main language, by its address (ADR 0032 d6). */
  async untranslated(): Promise<{ slug: string; language: string; missing: number }[]> {
    const site = await this.site();
    const pages = (await this.rows<{ published: string }>('SELECT published FROM pages WHERE published IS NOT NULL ORDER BY position, slug')).map((row) => normalizePage(JSON.parse(row.published)).page);
    const byslug = new Map(pages.map((page) => [page.slug, page]));
    return placePages(site, pages).flatMap((p) => {
      const owner = p.translated ? byslug.get(p.of) : undefined;
      const translation = owner?.translations?.[p.language];
      const missing = owner && translation ? missingWords(owner, translation).length : 0;
      return missing ? [{ slug: p.slug, language: p.language, missing }] : [];
    }).concat(await this.untranslatedEntries(site));
  }

  /** The same for each published entry's translations (ADR 0054 d7): by its address on the site. */
  private async untranslatedEntries(site: Site): Promise<{ slug: string; language: string; missing: number }[]> {
    const out: { slug: string; language: string; missing: number }[] = [];
    for (const type of contentTypes(site)) {
      for (const post of await this.publishedEntries(type.id)) {
        for (const [language, translation] of Object.entries(post.translations ?? {})) {
          const missing = site.languages.includes(language) ? missingEntryWords(type, post, translation).length : 0;
          if (missing) out.push({ slug: entryPath(typeIn(site, type, language), entrySlugIn(post, language)).slice(1, -1), language, missing });
        }
      }
    }
    return out;
  }

  /** A section as it is being written (ADR 0033). */
  async sectionDraft(slug: string): Promise<Page | null> {
    const row = await this.row<{ draft: string }>('SELECT draft FROM sections WHERE slug = ?', [slug]);
    return row ? normalizePage(JSON.parse(row.draft)).page : null;
  }

  /** Every section as it is being written, in order. */
  async draftSections(): Promise<Page[]> {
    return (await this.rows<{ draft: string }>('SELECT draft FROM sections ORDER BY position, slug')).map((row) => normalizePage(JSON.parse(row.draft)).page);
  }

  /** Every published section, in order: what the export draws. */
  async publishedSections(): Promise<Page[]> {
    return (await this.rows<{ published: string }>('SELECT published FROM sections WHERE published IS NOT NULL ORDER BY position, slug')).map((row) => normalizePage(JSON.parse(row.published)).page);
  }

  /** A section's translation as the builder edits it: by its name under the language's prefix, as a page's would be. */
  async locateSection(slug: string): Promise<PlacedPage | null> {
    return placePages(await this.site(), await this.draftSections()).find((p) => p.slug === slug) ?? null;
  }

  /** Saves a section's draft. It has a name and a title, and holds no section of its own. */
  async saveSection(input: unknown): Promise<Page> {
    const { page } = normalizePage({ ...(isObject(input) ? input : {}), inMenu: false });
    if (!page.title) throw new Error('a section has a title');
    if (!page.slug || page.slug.includes('/')) throw new Error('a section has a name');
    if (sectionsIn(page.blocks).length) throw new Error('a section holds no other section');
    for (const translation of Object.values(page.translations ?? {})) translation.fields = keepWords(page.blocks, translation.fields);
    const exists = await this.row('SELECT 1 AS found FROM sections WHERE slug = ?', [page.slug]);
    if (!exists && Number((await this.row<{ n: number | string }>('SELECT COUNT(*) AS n FROM sections'))?.n ?? 0) >= MAX_SECTIONS) throw new Error(`a site keeps at most ${MAX_SECTIONS} sections`);
    const next = await this.row<{ n: number | string }>('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM sections');
    await this.run(this.dialect.upsert('sections', ['slug', 'position', 'draft', 'updated_at'], ['slug'], ['draft', 'updated_at']), [
      page.slug,
      Number(next?.n ?? 1),
      JSON.stringify(page),
      new Date().toISOString(),
    ]);
    return page;
  }

  /** Publishes a section: every page that shows it shows this, from the next export. */
  async publishSection(where: string, now = new Date()): Promise<void> {
    const found = await this.locateSection(where);
    const slug = found?.translated ? found.of : where;
    if (!(await this.row('SELECT 1 AS found FROM sections WHERE slug = ?', [slug]))) throw new Error(`no section "${slug}"`);
    const at = now.toISOString();
    await this.run('UPDATE sections SET published = draft, published_at = ? WHERE slug = ?', [at, slug]);
    const row = await this.row<{ published: string }>('SELECT published FROM sections WHERE slug = ?', [slug]);
    await this.keepVersion('section', slug, String(row?.published), at);
  }

  /** Where each section is shown: the title and address of every page, entry or type's page that has it, drafts and published alike. */
  async sectionUses(): Promise<Map<string, string[]>> {
    const uses = new Map<string, Set<string>>();
    const add = (blocks: Block[], where: string): void => {
      for (const name of sectionsIn(blocks)) uses.set(name, (uses.get(name) ?? new Set()).add(where));
    };
    for (const { blocks, where } of await this.placedBlocks()) add(blocks, where);
    // A layout's places show sections too (ADR 0035).
    for (const layout of (await this.site()).layouts ?? READY_LAYOUTS) add(LAYOUT_AREAS.map((area) => layout[area]).filter(Boolean).map(areaBlock), `the layout "${layout.name}"`);
    return new Map([...uses].map(([name, at]) => [name, [...at].sort()]));
  }

  /** The blocks of every page, entry and type's page, in their drafts and as published, with where each is. */
  private async placedBlocks(): Promise<{ blocks: Block[]; where: string }[]> {
    const out: { blocks: Block[]; where: string }[] = [];
    for (const row of await this.rows<{ slug: string; draft: string; published: string | null }>('SELECT slug, draft, published FROM pages ORDER BY position, slug')) {
      for (const doc of [row.draft, row.published]) if (doc) out.push({ blocks: normalizePage(JSON.parse(doc)).page.blocks, where: pagePath(String(row.slug)) });
    }
    const site = await this.site();
    for (const type of contentTypes(site)) {
      for (const row of await this.rows<{ slug: string; draft: string; published: string | null }>('SELECT slug, draft, published FROM entries WHERE type = ?', [type.id])) {
        for (const doc of [row.draft, row.published]) if (doc) out.push({ blocks: normalizePost(JSON.parse(doc), undefined, type).post.blocks, where: entryPath(type, String(row.slug)) });
      }
      out.push({ blocks: [...((await this.template(type.id)) ?? []), ...((await this.publishedTemplate(type.id)) ?? [])], where: listPath(type) });
    }
    return out;
  }

  // Forms (ADR 0049).

  /** The site's forms. A site that never saved any has the ready contact form, in its language. */
  async forms(): Promise<Form[]> {
    const site = await this.site();
    const words = wordsFor(site.language);
    const raw = await this.getMeta('forms');
    return raw === null ? [contactForm(words)] : normalizeForms(raw, words);
  }

  /** The forms, by name: what a page is drawn with. */
  async formsByName(): Promise<Record<string, Form>> {
    return Object.fromEntries((await this.forms()).map((form) => [form.name, form]));
  }

  /** Where each form is shown (ADR 0049 d1): pages, entries, types' pages and sections, drafts and published. */
  async formUses(): Promise<Map<string, string[]>> {
    const uses = new Map<string, Set<string>>();
    const add = (blocks: Block[], where: string): void => {
      for (const { form } of formBlocks(blocks)) uses.set(form, (uses.get(form) ?? new Set()).add(where));
    };
    for (const { blocks, where } of await this.placedBlocks()) add(blocks, where);
    for (const row of await this.rows<{ slug: string; draft: string; published: string | null }>('SELECT slug, draft, published FROM sections ORDER BY position, slug')) {
      for (const doc of [row.draft, row.published]) if (doc) add(normalizePage(JSON.parse(doc)).page.blocks, `the section "${row.slug}"`);
    }
    return new Map([...uses].map(([name, at]) => [name, [...at].sort()]));
  }

  /** Keeps the forms. One a page shows is not taken away: the reason says where it is shown. */
  async setForms(input: unknown): Promise<Form[]> {
    const forms = normalizeForms(input, wordsFor((await this.site()).language));
    const kept = new Set(forms.map((f) => f.name));
    for (const [name, where] of await this.formUses()) {
      if (!kept.has(name)) throw new Error(`the form "${name}" is shown on ${where.join(', ')}; take it off there first`);
    }
    await this.setMeta('forms', forms);
    return forms;
  }

  /**
   * A site from before forms were built (ADR 0049) had one contact form, its
   * words written in each block. It becomes the ready Contact form, with the
   * words of the first such block, and its messages become Contact's.
   */
  private async keepOldContactForm(): Promise<void> {
    if ((await this.getMeta('forms')) !== null || (await this.isEmpty())) return;
    const site = await this.site();
    const form = contactForm(wordsFor(site.language));
    const rows = await this.rows<{ draft: string }>('SELECT draft FROM pages ORDER BY position, slug');
    // Read as it was written: cleaned now, a form block keeps none of these words.
    const find = (blocks: unknown): Record<string, unknown> | undefined => {
      for (const block of Array.isArray(blocks) ? blocks : []) {
        if (!isObject(block)) continue;
        if (block.type === 'form' && isObject(block.content)) return block.content;
        const inner = find(block.children);
        if (inner) return inner;
      }
      return undefined;
    };
    const old = rows.map((row) => find((JSON.parse(row.draft) as { blocks?: unknown }).blocks)).find(Boolean);
    if (old) {
      for (const key of ['consent', 'button', 'sent', 'failed'] as const) if (typeof old[key] === 'string' && (old[key] as string).trim()) form[key] = (old[key] as string).trim();
    }
    await this.setMeta('forms', normalizeForms([form], wordsFor(site.language)));
    await this.run('UPDATE messages SET form = ?', ['contact']);
  }

  /** Every section, with whether it differs from what is published, where it is shown, and its translations. */
  async sections(): Promise<{ slug: string; title: string; published: boolean; changed: boolean; usedOn: string[]; languages: string[] }[]> {
    const uses = await this.sectionUses();
    return (await this.rows<{ slug: string; draft: string; published: string | null }>('SELECT slug, draft, published FROM sections ORDER BY position, slug')).map((row) => {
      const page = normalizePage(JSON.parse(row.draft)).page;
      return { slug: page.slug, title: page.title, published: row.published !== null, changed: row.published !== row.draft, usedOn: uses.get(page.slug) ?? [], languages: Object.keys(page.translations ?? {}) };
    });
  }

  /** Deletes a section no page shows (ADR 0033); one still shown is kept, with where. */
  async deleteSection(at: string): Promise<void> {
    const found = await this.locateSection(at);
    if (found?.translated) return this.deleteTranslation(found.of, found.language, 'section');
    const used = (await this.sectionUses()).get(at) ?? [];
    if (used.length) throw new Error(`this section is shown on ${used.join(', ')}; take it off there first`);
    await this.run('DELETE FROM sections WHERE slug = ?', [at]);
    await this.run('DELETE FROM versions WHERE kind = ? AND slug = ?', ['section', at]);
  }

  /** A content type of this site, by name. Asking for one it does not have is an error, not an empty list. */
  async type(id: string): Promise<ContentType> {
    const type = typeById(await this.site(), id);
    if (!type) throw new Error(`this site has no content type "${id}"`);
    return type;
  }

  /** Saves an entry's draft. Like a page, what is published is left as it is. An entry with no valid date is dated today. */
  async saveEntry(typeId: string, input: unknown, author = ''): Promise<Post> {
    const type = await this.type(typeId);
    const { post } = normalizePost(input, new Date().toISOString().slice(0, 10), type);
    if (!post.title) throw new Error('an entry has a title');
    if (!post.slug) throw new Error('an entry has an address');
    const problem = entrySlugProblem(type, post.slug) || Object.values(post.translations ?? {}).map((t) => (t.slug ? entrySlugProblem(type, t.slug) : '')).find(Boolean);
    if (problem) throw new Error(problem);
    // Words kept for a block the entry no longer has are words of nothing (ADR 0032).
    for (const translation of Object.values(post.translations ?? {})) translation.fields = keepWords(post.blocks, translation.fields);
    // Whoever creates an entry is its author (ADR 0055 d2); saving it again changes nothing of that.
    const created = author !== '' && !(await this.row('SELECT 1 AS found FROM entries WHERE type = ? AND slug = ?', [type.id, post.slug]));
    await this.run(this.dialect.upsert('entries', ['type', 'slug', 'draft', 'updated_at'], ['type', 'slug'], ['draft', 'updated_at']), [
      type.id,
      post.slug,
      JSON.stringify(post),
      new Date().toISOString(),
    ]);
    if (created) await this.run(this.dialect.insertNew('entry_authors', ['type', 'slug', 'user_id']), [type.id, post.slug, author]);
    return post;
  }

  // Authors and review (ADR 0055).

  /** Who wrote each entry, by `type/slug`: their account's id. An entry made before ADR 0055 has none. */
  async entryAuthors(): Promise<Map<string, string>> {
    return new Map((await this.rows<Row>('SELECT type, slug, user_id FROM entry_authors')).map((r) => [`${r.type}/${r.slug}`, String(r.user_id)]));
  }

  /** The id of whoever wrote an entry, '' when nobody is named. */
  async entryAuthor(typeId: string, slug: string): Promise<string> {
    return String((await this.row<Row>('SELECT user_id FROM entry_authors WHERE type = ? AND slug = ?', [typeId, slug]))?.user_id ?? '');
  }

  /** Gives an entry to someone who has an account (ADR 0055 d2); '' leaves it without one. */
  async setEntryAuthor(typeId: string, slug: string, userId: string): Promise<void> {
    if (!(await this.row('SELECT 1 AS found FROM entries WHERE type = ? AND slug = ?', [typeId, slug]))) throw new Error(`no entry "${slug}"`);
    if (!userId) {
      await this.run('DELETE FROM entry_authors WHERE type = ? AND slug = ?', [typeId, slug]);
      await this.touch();
      return;
    }
    if (!(await this.user(userId))) throw new Error('nobody has that account');
    await this.run(this.dialect.upsert('entry_authors', ['type', 'slug', 'user_id'], ['type', 'slug'], ['user_id']), [typeId, slug, userId]);
    await this.touch();
  }

  /** Who wrote each entry, as the site shows them, by `type/slug`: only those with a name. */
  async bylines(): Promise<Record<string, Byline>> {
    const users = await this.users();
    const people = new Map(users.map((u) => [u.id, u]));
    const slugs = authorSlugs(users);
    const out: Record<string, Byline> = {};
    for (const [key, id] of await this.entryAuthors()) {
      const who = people.get(id);
      if (who?.name) out[key] = { name: who.name, bio: who.bio ?? '', slug: slugs.get(id) ?? '', ...(who.picture ? { picture: { src: who.picture, alt: who.name } } : {}) };
    }
    return out;
  }

  /** Whether an entry was ever published: then a contributor's part in it is over (ADR 0055 d1). */
  async entryPublished(typeId: string, slug: string): Promise<boolean> {
    return (await this.row('SELECT 1 AS found FROM entries WHERE type = ? AND slug = ? AND published IS NOT NULL', [typeId, slug])) !== null;
  }

  /** Whether a page (by its main address) or an entry (by its type and main address) has a draft that is not what visitors see (ADR 0075). */
  async draftChanged(kind: string, slug: string): Promise<boolean> {
    const row =
      kind === 'page'
        ? await this.row<Row>('SELECT draft, published FROM pages WHERE slug = ?', [slug])
        : await this.row<Row>('SELECT draft, published FROM entries WHERE type = ? AND slug = ?', [kind, slug]);
    return row !== null && row.published !== null && row.published !== undefined && row.published !== row.draft;
  }

  /** What waits for the owner and the editors, as numbers for the admin bar (ADR 0075): comments to approve, entries sent for review, orders to see to. */
  async waiting(shop: boolean): Promise<{ comments: number; review: number; orders: number }> {
    const count = async (query: string, params: unknown[] = []): Promise<number> => Number((await this.row<{ n: number | string }>(query, params))?.n ?? 0);
    return {
      comments: await count('SELECT COUNT(*) AS n FROM comments WHERE approved = 0'),
      review: await count("SELECT COUNT(*) AS n FROM entry_reviews WHERE state = 'waiting'"),
      // The shop's tables are there only once it was turned on (ADR 0065 d10).
      orders: shop ? await count("SELECT COUNT(*) AS n FROM shop_orders WHERE state IN ('waiting', 'paid')").catch(() => 0) : 0,
    };
  }

  /** Every entry in review, the oldest sent first. */
  async reviews(): Promise<Review[]> {
    return (await this.rows<Row>('SELECT type, slug, state, note, at FROM entry_reviews ORDER BY at, type, slug')).map((r) => ({
      type: String(r.type),
      slug: String(r.slug),
      state: r.state === 'returned' ? 'returned' : 'waiting',
      note: String(r.note),
      at: String(r.at),
    }));
  }

  /** A contributor's entry, sent to be read and published (ADR 0055 d4). */
  async askReview(typeId: string, slug: string, now = new Date()): Promise<void> {
    if (!(await this.row('SELECT 1 AS found FROM entries WHERE type = ? AND slug = ?', [typeId, slug]))) throw new Error(`no entry "${slug}"`);
    await this.run(this.dialect.upsert('entry_reviews', ['type', 'slug', 'state', 'note', 'at'], ['type', 'slug'], ['state', 'note', 'at']), [typeId, slug, 'waiting', '', now.toISOString()]);
  }

  /** Sent back to its contributor, with a note on what to change. */
  async returnReview(typeId: string, slug: string, note: unknown, now = new Date()): Promise<void> {
    if (!(await this.row("SELECT 1 AS found FROM entry_reviews WHERE type = ? AND slug = ? AND state = 'waiting'", [typeId, slug]))) throw new Error('this entry is not waiting for review');
    await this.run('UPDATE entry_reviews SET state = ?, note = ?, at = ? WHERE type = ? AND slug = ?', ['returned', str(note, NOTE_MAX).trim(), now.toISOString(), typeId, slug]);
  }

  async publishEntry(typeId: string, where: string, now = new Date()): Promise<void> {
    // A translation is published with its entry (ADR 0054 d4).
    const slug = (await this.locateEntry(typeId, where))?.of ?? where;
    if (!(await this.row('SELECT 1 AS found FROM entries WHERE type = ? AND slug = ?', [typeId, slug]))) throw new Error(`no entry "${slug}"`);
    const at = now.toISOString();
    await this.run('UPDATE entries SET published = draft, published_at = ? WHERE type = ? AND slug = ?', [at, typeId, slug]);
    // Published, its review is over (ADR 0055 d4).
    await this.run('DELETE FROM entry_reviews WHERE type = ? AND slug = ?', [typeId, slug]);
    const row = await this.row<{ published: string }>('SELECT published FROM entries WHERE type = ? AND slug = ?', [typeId, slug]);
    await this.keepVersion(typeId, slug, String(row?.published), at);
    this.emit('entry.published', { type: typeId, slug, title: String((JSON.parse(String(row?.published)) as { title?: unknown }).title ?? '') });
  }

  /**
   * What was published, kept: each publication of a page (kind `page`) or of
   * an entry (kind: its type), the newest {@link VERSIONS_KEPT}. The owner
   * can bring one back into the editor, as a change to look at before saving.
   */
  private async keepVersion(kind: string, slug: string, doc: string, at: string): Promise<void> {
    await this.run(this.dialect.insertNew('versions', ['kind', 'slug', 'at', 'doc']), [kind, slug, at, doc]);
    const kept = await this.rows<{ at: string }>('SELECT at FROM versions WHERE kind = ? AND slug = ? ORDER BY at DESC', [kind, slug]);
    const oldest = kept[VERSIONS_KEPT - 1];
    if (kept.length > VERSIONS_KEPT && oldest) await this.run('DELETE FROM versions WHERE kind = ? AND slug = ? AND at < ?', [kind, slug, oldest.at]);
  }

  /** The kept publications of a page or an entry, newest first: when, and the title it had. */
  async versions(kind: string, at: string): Promise<{ at: string; title: string }[]> {
    const found = kind === 'page' ? await this.locate(at) : null;
    const slug = found?.translated ? found.of : at;
    const rows = await this.rows<{ at: string; doc: string }>('SELECT at, doc FROM versions WHERE kind = ? AND slug = ? ORDER BY at DESC', [kind, slug]);
    return rows.map((row) => ({ at: row.at, title: String((JSON.parse(row.doc) as { title?: unknown }).title ?? '') }));
  }

  /** One kept publication, as it was saved; the caller cleans it as a page or an entry. */
  async version(kind: string, where: string, at: string): Promise<unknown> {
    const found = kind === 'page' ? await this.locate(where) : null;
    const slug = found?.translated ? found.of : where;
    const row = await this.row<{ doc: string }>('SELECT doc FROM versions WHERE kind = ? AND slug = ? AND at = ?', [kind, slug, at]);
    return row ? JSON.parse(row.doc) : null;
  }

  /**
   * The entry at an address in the editor, as it is being written: an entry
   * of the main language, or a translation of one at `ro/<its address>`
   * (ADR 0054), with the entry it is of, its language and whether it is split.
   */
  async locateEntry(typeId: string, at: string): Promise<{ post: Post; of: string; language: string; split: boolean } | null> {
    const site = await this.site();
    const language = languageOf(site, at);
    if (language === site.language) return null;
    const type = await this.type(typeId);
    const slug = at.slice(prefixOf(language).length + 1);
    const drafts = await this.draftEntries(typeId);
    const main = drafts.find((p) => p.translations?.[language] && entrySlugIn(p, language) === slug);
    if (!main) return null;
    const post = entryIn(site, type, main, language, await this.draftSlugs(language)) as Post;
    return { post: { ...post, slug: at }, of: main.slug, language, split: main.translations?.[language]?.blocks != null };
  }

  /** Where each draft entry is in a language, for the links between them there. */
  private async draftSlugs(language: string): Promise<SlugsIn> {
    const all: Record<string, Post[]> = {};
    for (const type of contentTypes(await this.site())) all[type.id] = await this.draftEntries(type.id);
    return slugsIn(language, all);
  }

  /** An entry's translation into a language, changed by `change` and kept in its draft (ADR 0054). */
  private async withEntryTranslation(typeId: string, of: string, language: string, change: (post: Post, translation: EntryTranslation | undefined) => EntryTranslation | null): Promise<{ post: Post; of: string; language: string; split: boolean } | null> {
    const site = await this.site();
    if (!site.languages.includes(language)) throw new Error(`${languageName(language)} is not one of the site's languages`);
    const type = await this.type(typeId);
    const post = await this.entryDraft(typeId, of);
    if (!post) throw new Error(`no entry "${of}"`);
    const next = change(post, post.translations?.[language]);
    const translations = { ...post.translations };
    if (next) translations[language] = next;
    else delete translations[language];
    if (next) {
      const slug = next.slug || post.slug;
      const taken = (await this.draftEntries(typeId)).find((p) => p.slug !== post.slug && p.translations?.[language] && entrySlugIn(p, language) === slug);
      if (taken) throw new Error(`"${entryPath(typeIn(site, type, language), slug)}" is already the address of "${taken.title}"`);
    }
    await this.saveEntry(typeId, { ...post, translations });
    return next ? this.locateEntry(typeId, `${prefixOf(language)}/${next.slug || post.slug}`) : null;
  }

  /** Starts an entry in another language: all in the main language's words until they are written (ADR 0054 d1). */
  async translateEntry(typeId: string, of: string, language: string): Promise<{ post: Post; of: string; language: string; split: boolean }> {
    return (await this.withEntryTranslation(typeId, of, language, (_post, had) => {
      if (had) throw new Error('this entry is already in that language');
      return newEntryTranslation();
    })) as { post: Post; of: string; language: string; split: boolean };
  }

  /** Keeps a translation as written in the editor: its address, its words, or its blocks when it is split. */
  async saveEntryTranslation(typeId: string, of: string, language: string, input: unknown): Promise<{ post: Post; of: string; language: string; split: boolean }> {
    const site = await this.site();
    const type = await this.type(typeId);
    const raw = isObject(input) ? input : {};
    const at = String(raw.slug ?? '');
    const own = languageOf(site, at) === language ? at.slice(prefixOf(language).length + 1) : at;
    const { post: written } = normalizePost({ ...raw, slug: own }, undefined, type);
    if (!written.title) throw new Error('an entry has a title');
    return (await this.withEntryTranslation(typeId, of, language, (post, had) => {
      if (!had) throw new Error('this entry is not in that language yet');
      const { translation, problem } = entryTranslationFrom(type, post, had, { ...written, slug: written.slug || post.slug });
      if (problem || entrySlugProblem(type, translation.slug)) throw new Error(problem || entrySlugProblem(type, translation.slug));
      return translation;
    })) as { post: Post; of: string; language: string; split: boolean };
  }

  /** Fills in what a translation does not say yet from the entry written in that language (ADR 0034); words already written stay. */
  async fillEntryTranslation(typeId: string, of: string, language: string, input: unknown): Promise<void> {
    const type = await this.type(typeId);
    const { post: written } = normalizePost(input, undefined, type);
    await this.withEntryTranslation(typeId, of, language, (post, had) => {
      if (!had || had.blocks) throw new Error('this entry has no translation into that language to fill in');
      return fillEntryTranslation(type, post, had, written);
    });
  }

  /** Splits an entry for one language (ADR 0032 d4): its translation keeps its own blocks, as they show now. */
  async splitEntryTranslation(typeId: string, of: string, language: string): Promise<{ post: Post; of: string; language: string; split: boolean }> {
    return (await this.withEntryTranslation(typeId, of, language, (post, had) => {
      if (!had) throw new Error('this entry is not in that language yet');
      return had.blocks ? had : { ...had, fields: {}, blocks: localizeBlocks(post.blocks, had.fields) };
    })) as { post: Post; of: string; language: string; split: boolean };
  }

  /** Takes an entry out of one language. What is published stays until the entry is published again. */
  async deleteEntryTranslation(typeId: string, of: string, language: string): Promise<void> {
    await this.withEntryTranslation(typeId, of, language, () => null);
  }

  async entryDraft(typeId: string, slug: string): Promise<Post | null> {
    const type = await this.type(typeId);
    const row = await this.row<{ draft: string }>('SELECT draft FROM entries WHERE type = ? AND slug = ?', [typeId, slug]);
    return row ? normalizePost(JSON.parse(row.draft), undefined, type).post : null;
  }

  /** Every entry of a type, in the order its list shows them, with whether its draft differs from what is published. */
  async entries(typeId: string): Promise<{ slug: string; title: string; date: string; published: boolean; changed: boolean; translations?: { language: string; slug: string; missing: number; split: boolean }[]; terms?: string[] }[]> {
    const type = await this.type(typeId);
    const rows = (await this.rows<{ draft: string; published: string | null }>('SELECT draft, published FROM entries WHERE type = ?', [typeId])).map((row) => ({
      post: normalizePost(JSON.parse(row.draft), undefined, type).post,
      published: row.published !== null,
      changed: row.published !== row.draft,
    }));
    const state = new Map(rows.map((row) => [row.post.slug, row]));
    return listed(type, rows.map((row) => row.post)).map((post) => {
      const { published, changed } = state.get(post.slug) as { published: boolean; changed: boolean };
      // Each language it is in, at its address in the editor, with how much still shows the main language (ADR 0054).
      const translations = Object.entries(post.translations ?? {}).map(([language, t]) => ({ language, slug: `${prefixOf(language)}/${t.slug || post.slug}`, missing: missingEntryWords(type, post, t).length, split: t.blocks !== null }));
      const terms = [...post.categories, ...post.tags];
      return { slug: post.slug, title: post.title, date: post.date, published, changed, ...(translations.length ? { translations } : {}), ...(terms.length ? { terms } : {}) };
    });
  }

  /** Every entry of a type as the author last left it, in the order its list shows them: what the editor's canvas lists. */
  async draftEntries(typeId: string): Promise<Post[]> {
    const type = await this.type(typeId);
    const rows = await this.rows<{ draft: string }>('SELECT draft FROM entries WHERE type = ?', [typeId]);
    return listed(type, rows.map((row) => normalizePost(JSON.parse(row.draft), undefined, type).post));
  }

  async deleteEntry(typeId: string, slug: string): Promise<void> {
    await this.run('DELETE FROM entries WHERE type = ? AND slug = ?', [typeId, slug]);
    await this.run('DELETE FROM entry_authors WHERE type = ? AND slug = ?', [typeId, slug]);
    await this.run('DELETE FROM entry_reviews WHERE type = ? AND slug = ?', [typeId, slug]);
    await this.unlink(typeId, slug);
    await this.run('DELETE FROM versions WHERE kind = ? AND slug = ?', [typeId, slug]);
    await this.run('DELETE FROM schedule WHERE kind = ? AND slug = ?', [typeId, slug]);
    await this.run('DELETE FROM comments WHERE type = ? AND entry = ?', [typeId, slug]);
    await this.run('DELETE FROM comment_languages WHERE id NOT IN (SELECT id FROM comments)');
    await this.forgetAudience('entries', `${typeId}/${slug}`);
  }

  /**
   * Takes a deleted entry out of every entry that links to it (ADR 0052 d4),
   * in the draft and in what is published, so nothing is left pointing
   * nowhere, and a later entry at the same address is not linked by mistake.
   */
  private async unlink(typeId: string, slug: string): Promise<void> {
    for (const type of contentTypes(await this.site())) {
      if (!linkFields(type, typeId).length) continue;
      const rows = await this.rows<{ slug: string; draft: string; published: string | null }>('SELECT slug, draft, published FROM entries WHERE type = ?', [type.id]);
      for (const row of rows) {
        const draft = this.without(type, row.draft, typeId, slug);
        const published = row.published === null ? null : this.without(type, row.published, typeId, slug);
        if (draft === null && published === null) continue;
        // A draft that was what is published stays so: both are written the same.
        await this.run('UPDATE entries SET draft = ?, published = ? WHERE type = ? AND slug = ?', [draft ?? row.draft, published ?? row.published, type.id, row.slug]);
      }
    }
  }

  /** A stored entry without the link to `typeId/slug`, as stored again; null when it had none. */
  private without(type: ContentType, doc: string, typeId: string, slug: string): string | null {
    const raw = JSON.parse(doc) as Record<string, unknown>;
    const fields = unlinked(type, isObject(raw.fields) ? raw.fields : {}, typeId, slug);
    return fields ? JSON.stringify({ ...raw, fields }) : null;
  }

  /** Which entries link to which (ADR 0052 d4): by `type/slug`, the titles of the drafts that link to it. */
  async linkedFrom(): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    for (const type of contentTypes(await this.site())) {
      const fields = linkFields(type);
      if (!fields.length) continue;
      for (const post of await this.draftEntries(type.id)) {
        for (const field of fields) {
          for (const target of linkedSlugs(post, field)) {
            const key = `${field.to}/${target}`;
            const titles = out.get(key) ?? [];
            if (!titles.includes(post.title)) titles.push(post.title);
            out.set(key, titles);
          }
        }
      }
    }
    return out;
  }

  /** Every published entry of a type, in the order its list shows them. */
  async publishedEntries(typeId: string): Promise<Post[]> {
    const type = await this.type(typeId);
    const rows = await this.rows<{ published: string }>('SELECT published FROM entries WHERE type = ? AND published IS NOT NULL', [typeId]);
    return listed(type, rows.map((row) => normalizePost(JSON.parse(row.published), undefined, type).post));
  }

  /** One entry as visitors see it: what was last published, or null. The shop reads a product's price here (ADR 0065 d3). */
  async publishedEntry(typeId: string, slug: string): Promise<Post | null> {
    const type = await this.type(typeId);
    const row = await this.row('SELECT published FROM entries WHERE type = ? AND slug = ? AND published IS NOT NULL', [typeId, slug]);
    return row ? normalizePost(JSON.parse(String(row.published)), undefined, type).post : null;
  }

  // Posts are the content type every site has; these say so by name.
  savePost(input: unknown): Promise<Post> {
    return this.saveEntry(POSTS_TYPE, input);
  }
  publishPost(slug: string): Promise<void> {
    return this.publishEntry(POSTS_TYPE, slug);
  }
  postDraft(slug: string): Promise<Post | null> {
    return this.entryDraft(POSTS_TYPE, slug);
  }
  posts(): Promise<{ slug: string; title: string; date: string; published: boolean; changed: boolean }[]> {
    return this.entries(POSTS_TYPE);
  }
  deletePost(slug: string): Promise<void> {
    return this.deleteEntry(POSTS_TYPE, slug);
  }
  publishedPosts(): Promise<Post[]> {
    return this.publishedEntries(POSTS_TYPE);
  }

  /**
   * Stores a file and returns where a page points to show it or link to it.
   * The name is the hash of the bytes, so the same file uploaded twice is
   * stored once and a name never comes to mean another file. What it is, is
   * read from its bytes (ADR 0046). `images`: only an image is taken, as
   * where a picture is expected.
   */
  async addMedia(bytes: Uint8Array, label: unknown = '', images = false): Promise<MediaItem> {
    const ext = images ? imageExt(bytes) : mediaExt(bytes);
    if (!ext && images) throw new Error('not an image this site can show (PNG, JPEG, GIF, WebP or AVIF)');
    if (!ext) throw new Error('not a file this site takes: an image (PNG, JPEG, GIF, WebP, AVIF), a document (PDF, Word, Excel, PowerPoint, OpenDocument, ZIP), sound (MP3, M4A, OGG, WAV) or video (MP4, WebM)');
    const kind = mediaKindOf(`x.${ext}`);
    const max = MAX_BYTES[kind];
    if (bytes.length > max) throw new Error(`${kind === 'image' ? 'an image' : kind === 'document' ? 'a document' : kind === 'audio' ? 'a sound file' : 'a video'} is at most ${max / 1024 / 1024} MB${kind === 'video' ? '; a longer film goes on a video service, and the page shows it from there' : ''}`);
    const name = `${new Bun.CryptoHasher('sha256').update(bytes).digest('hex').slice(0, 32)}.${ext}`;
    await this.run(this.dialect.insertNew('media', ['name', 'label', 'size', 'bytes', 'created_at']), [name, str(label, 200).trim(), bytes.length, bytes, new Date().toISOString()]);
    if (kind === 'image') await this.recordSize(name, bytes);
    return (await this.media()).find((m) => m.name === name) as MediaItem;
  }

  /** Keeps how wide and high a picture is, as its bytes say. */
  private async recordSize(name: string, bytes: Uint8Array): Promise<{ width: number; height: number }> {
    const size = imageSize(bytes) ?? { width: 0, height: 0 };
    await this.run(this.dialect.upsert('media_sizes', ['name', 'width', 'height'], ['name'], ['width', 'height']), [name, size.width, size.height]);
    return size;
  }

  /** How wide and high each stored picture is, read once from its bytes for a picture stored before this was kept. */
  private async sizes(): Promise<Map<string, { width: number; height: number }>> {
    const known = new Map(
      (await this.rows<{ name: string; width: number | string; height: number | string }>('SELECT name, width, height FROM media_sizes')).map((r) => [r.name, { width: Number(r.width), height: Number(r.height) }]),
    );
    for (const { name } of await this.rows<{ name: string }>('SELECT name FROM media')) {
      if (known.has(name) || mediaKindOf(name) !== 'image') continue;
      const file = await this.mediaFile(name);
      if (file) known.set(name, await this.recordSize(name, file.bytes));
    }
    return known;
  }

  /** The widths of each picture's smaller copies, by the picture's name. */
  private async variantWidths(): Promise<Map<string, { name: string; width: number }[]>> {
    const all = new Map<string, { name: string; width: number }[]>();
    for (const row of await this.rows<{ name: string; original: string; width: number | string }>('SELECT name, original, width FROM media_variants ORDER BY width')) {
      all.set(row.original, [...(all.get(row.original) ?? []), { name: row.name, width: Number(row.width) }]);
    }
    return all;
  }

  /** Every stored image, newest first. */
  async media(): Promise<MediaItem[]> {
    const sizes = await this.sizes();
    const variants = await this.variantWidths();
    const texts = new Map((await this.rows<{ name: string; alt: string }>('SELECT name, alt FROM media_texts')).map((r) => [r.name, r.alt]));
    return (await this.rows<{ name: string; label: string; size: number | string; created_at: string }>('SELECT name, label, size, created_at FROM media ORDER BY created_at DESC, name')).map((row) => ({
      name: row.name,
      kind: mediaKindOf(row.name),
      label: row.label,
      alt: texts.get(row.name) ?? '',
      uploadedAt: String(row.created_at),
      size: Number(row.size),
      path: mediaPath(row.name),
      type: MEDIA_TYPES[row.name.split('.').pop() as MediaExt],
      width: sizes.get(row.name)?.width ?? 0,
      height: sizes.get(row.name)?.height ?? 0,
      variants: (variants.get(row.name) ?? []).map((v) => v.width),
    }));
  }

  /** Each picture's size and smaller copies (ADR 0005 d8): what an exported page needs to offer the right one. */
  async mediaSizes(): Promise<Record<string, MediaSize>> {
    const sizes = await this.sizes();
    const variants = await this.variantWidths();
    const all: Record<string, MediaSize> = {};
    for (const [name, size] of sizes) if (size.width > 0) all[name] = { ...size, variants: (variants.get(name) ?? []).map((v) => v.name) };
    return all;
  }

  /**
   * Keeps a smaller copy of a stored picture, made by the browser (ADR 0005
   * d6). What it is, is read from its bytes: a WebP or JPEG at one of the
   * widths that picture wants, drawn in its proportions.
   */
  async addVariant(original: string, bytes: Uint8Array): Promise<MediaItem> {
    const item = (await this.media()).find((m) => m.name === original);
    if (!item) throw new Error('no such image');
    if (!canVary(original) || !item.width) throw new Error('this image keeps one size');
    if (bytes.length > MEDIA_MAX_BYTES) throw new Error('the image is too large');
    const ext = imageExt(bytes);
    const size = imageSize(bytes);
    if ((ext !== 'webp' && ext !== 'jpg') || !size) throw new Error('a smaller copy is a WebP or a JPEG');
    if (!wantedWidths(item.width).includes(size.width)) throw new Error(`a smaller copy of this image is ${wantedWidths(item.width).join(', ')} pixels wide`);
    if (Math.abs(size.height - (item.height * size.width) / item.width) > 2) throw new Error('a smaller copy keeps the proportions of the image');
    await this.run('DELETE FROM media_variants WHERE original = ? AND width = ?', [original, size.width]);
    await this.run(this.dialect.insertNew('media_variants', ['name', 'original', 'width', 'bytes']), [variantName(original, size.width, ext), original, size.width, bytes]);
    return (await this.media()).find((m) => m.name === original) as MediaItem;
  }

  /** A stored file, or a smaller copy of a picture: its type, its bytes, and the name it was uploaded under. */
  /**
   * The fonts of the site's own (ADR 0085 d6): Google families it downloaded
   * and faces the owner uploaded, each by its name (`google:…`, `own:…`).
   */
  async siteFonts(): Promise<SiteFont[]> {
    const rows = await this.rows<{ name: string; label: string; faces: string; created_at: string }>('SELECT name, label, faces, created_at FROM fonts ORDER BY label');
    return rows
      .filter((r) => isSiteFont(r.name))
      .map((r) => ({ name: r.name, label: r.label, faces: (JSON.parse(r.faces) as unknown[]).map(cleanFontFace).filter((f): f is FontFace => f !== null), at: r.created_at }));
  }

  /** Every face of the site's own fonts, for its stylesheet. */
  async siteFaces(): Promise<FontFace[]> {
    return (await this.siteFonts()).flatMap((f) => f.faces);
  }

  /**
   * Keeps a font's files and faces. Given a name it has, its faces are added to
   * the ones it had (an uploaded family is given one file at a time), a face of
   * the same weight and style taking the old one's place.
   */
  async addSiteFont(name: string, label: string, faces: { face: Omit<FontFace, 'file' | 'family'>; bytes: Uint8Array }[]): Promise<SiteFont> {
    if (!isSiteFont(name)) throw new Error('not a font name');
    const family = siteFontFamily(name);
    const kept: FontFace[] = [];
    for (const { face, bytes } of faces) {
      const file = `${new Bun.CryptoHasher('sha256').update(bytes).digest('hex').slice(0, 32)}.woff2`;
      if (!(await this.row('SELECT name FROM font_files WHERE name = ?', [file]))) await this.run(this.dialect.insertNew('font_files', ['name', 'bytes']), [file, bytes]);
      const clean = cleanFontFace({ ...face, family, file });
      if (!clean) throw new Error('not a face this site can declare');
      kept.push(clean);
    }
    const before = (await this.siteFonts()).find((f) => f.name === name);
    const same = (a: FontFace, b: FontFace): boolean => a.weight === b.weight && a.style === b.style && a.range === b.range;
    const all = [...(before?.faces ?? []).filter((old) => !kept.some((k) => same(k, old))), ...kept];
    await this.run(this.dialect.upsert('fonts', ['name', 'label', 'faces', 'created_at'], ['name'], ['label', 'faces']), [name, str(label, 120).trim() || name, JSON.stringify(all), new Date().toISOString()]);
    await this.forgetFontFiles();
    return (await this.siteFonts()).find((f) => f.name === name) as SiteFont;
  }

  /** A font of the site's own taken away, with its files; a style naming it falls back to the next face of its stack. */
  async deleteSiteFont(name: string): Promise<void> {
    await this.run('DELETE FROM fonts WHERE name = ?', [name]);
    await this.forgetFontFiles();
  }

  /** Takes away the files no font names any more. */
  private async forgetFontFiles(): Promise<void> {
    const used = new Set((await this.siteFaces()).map((f) => f.file));
    for (const { name } of await this.rows<{ name: string }>('SELECT name FROM font_files')) if (!used.has(name)) await this.run('DELETE FROM font_files WHERE name = ?', [name]);
  }

  /** The bytes of a file of the site's own fonts, or null. */
  async fontFile(name: string): Promise<Uint8Array | null> {
    if (!/^[0-9a-f]{32}\.woff2$/.test(name)) return null;
    const row = await this.row<{ bytes: Uint8Array }>('SELECT bytes FROM font_files WHERE name = ?', [name]);
    return row ? new Uint8Array(row.bytes) : null;
  }

  async mediaFile(name: string): Promise<{ type: string; bytes: Uint8Array; label: string } | null> {
    const variant = variantOf(name);
    if (variant) {
      const row = await this.row<{ bytes: Uint8Array }>('SELECT bytes FROM media_variants WHERE name = ?', [name]);
      return row ? { type: MEDIA_TYPES[name.split('.').pop() as MediaExt], bytes: new Uint8Array(row.bytes), label: '' } : null;
    }
    if (!isMediaName(name)) return null;
    const row = await this.row<{ bytes: Uint8Array; label: string }>('SELECT bytes, label FROM media WHERE name = ?', [name]);
    return row ? { type: MEDIA_TYPES[name.split('.').pop() as MediaExt], bytes: new Uint8Array(row.bytes), label: row.label } : null;
  }

  /** Whether the library holds this file, without reading it. */
  async hasMedia(name: string): Promise<boolean> {
    return isMediaName(name) && (await this.row<{ name: string }>('SELECT name FROM media WHERE name = ?', [name])) !== null;
  }

  /** Where this file is shown or linked to: the titles of pages (draft or published), and the header when it is the logo. */
  async mediaUsedBy(name: string): Promise<string[]> {
    const site = await this.site();
    const titles: string[] = mediaNameOf(site.logo?.src ?? '') === name ? ['the header (logo)'] : [];
    if (mediaNameOf(site.logoDark?.src ?? '') === name) titles.push('the header (logo for the dark)');
    if (mediaNameOf(site.background?.src ?? '') === name) titles.push('the picture around the page, in Design');
    if (mediaNameOf(site.shareImage?.src ?? '') === name) titles.push('the picture for sharing, in Settings');
    for (const row of await this.rows<{ draft: string; published: string | null }>('SELECT draft, published FROM pages ORDER BY position, slug')) {
      const copies = [row.draft, row.published].filter((c): c is string => c !== null).map((c) => normalizePage(JSON.parse(c)).page);
      if (copies.some((page) => [...mediaSources(page.blocks), page.shareImage?.src ?? ''].some((src) => mediaNameOf(src) === name))) titles.push((copies[0] as Page).title);
    }
    const types = new Map(contentTypes(site).map((t) => [t.id, t]));
    for (const row of await this.rows<{ type: string; draft: string; published: string | null }>('SELECT type, draft, published FROM entries ORDER BY type, slug')) {
      const copies = [row.draft, row.published].filter((c): c is string => c !== null).map((c) => normalizePost(JSON.parse(c), undefined, types.get(row.type)).post);
      if (copies.some((post) => postImageSources(post).some((src) => mediaNameOf(src) === name))) titles.push((copies[0] as Post).title);
    }
    for (const type of contentTypes(site)) {
      const copies = [await this.template(type.id), await this.publishedTemplate(type.id)];
      if (copies.some((blocks) => mediaSources(blocks ?? []).some((src) => mediaNameOf(src) === name))) titles.push(`the page of "${type.name}"`);
    }
    return titles;
  }

  /**
   * Renames a file in the library and sets the words a picture is offered with
   * (ADR 0072). Neither changes a page that already shows it: a page keeps the
   * words it was given, and the file's address stays the same.
   */
  async setMediaTexts(name: string, texts: { label?: unknown; alt?: unknown }): Promise<MediaItem> {
    if (!(await this.hasMedia(name))) throw new Error('no such file');
    if (texts.label !== undefined) {
      const label = str(texts.label, 200).trim();
      if (!label) throw new Error('a file in the library has a name');
      await this.run('UPDATE media SET label = ? WHERE name = ?', [label, name]);
    }
    if (texts.alt !== undefined) {
      const alt = str(texts.alt, 300).trim();
      if (alt && mediaKindOf(name) !== 'image') throw new Error('only a picture has words for people who cannot see it');
      if (alt) await this.run(this.dialect.upsert('media_texts', ['name', 'alt'], ['name'], ['alt']), [name, alt]);
      else await this.run('DELETE FROM media_texts WHERE name = ?', [name]);
    }
    return (await this.media()).find((m) => m.name === name) as MediaItem;
  }

  /** Deletes a file nothing shows or links to. One that a page still uses is refused, with the page named. */
  async deleteMedia(name: string): Promise<void> {
    const used = await this.mediaUsedBy(name);
    if (used.length) throw new Error(`this ${mediaKindOf(name) === 'image' ? 'image' : 'file'} is used on: ${used.join(', ')}`);
    await this.run('DELETE FROM media WHERE name = ?', [name]);
    await this.run('DELETE FROM media_sizes WHERE name = ?', [name]);
    await this.run('DELETE FROM media_texts WHERE name = ?', [name]);
    await this.run('DELETE FROM media_variants WHERE original = ?', [name]);
  }

  /**
   * Keeps what a visitor sent through a form (ADR 0019), with the words of the
   * consent they ticked, exactly as the page showed them.
   */
  async addMessage(input: { form: string; page: string; name: string; email: string; body: string; consent: string; answers?: Answer[] }, at = new Date()): Promise<Message> {
    const message: Message = {
      id: crypto.randomUUID(),
      receivedAt: at.toISOString(),
      form: str(input.form, 60),
      page: str(input.page, 300),
      name: str(input.name, 120).trim(),
      email: str(input.email, 254).trim(),
      body: str(input.body, 20000).trim(),
      consent: str(input.consent, 600).trim(),
      ...(input.answers ? { answers: input.answers.map((a) => ({ id: str(a.id, 40), label: str(a.label, 200), value: str(a.value, 5000) })) } : {}),
    };
    await this.run('INSERT INTO messages (id, received_at, form, page, name, email, body, consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      message.id,
      message.receivedAt,
      message.form,
      message.page,
      message.name,
      message.email,
      message.body,
      message.consent,
    ]);
    if (message.answers) await this.run('INSERT INTO message_answers (id, answers) VALUES (?, ?)', [message.id, JSON.stringify(message.answers)]);
    this.emit('message.received', { id: message.id, form: message.form, page: message.page, name: message.name, body: message.body });
    return message;
  }

  /** Every message kept, newest first; or those one address sent, for answering a request to see or erase them. */
  async messages(email?: string): Promise<Message[]> {
    const rows = await this.rows<Row>(
      `SELECT m.id, m.received_at, m.form, m.page, m.name, m.email, m.body, m.consent, a.answers FROM messages m LEFT JOIN message_answers a ON a.id = m.id${email ? ' WHERE LOWER(m.email) = ?' : ''} ORDER BY m.received_at DESC, m.id`,
      email ? [email.trim().toLowerCase()] : [],
    );
    return rows.map((r) => ({
      id: String(r.id),
      receivedAt: String(r.received_at),
      form: String(r.form),
      page: String(r.page),
      name: String(r.name),
      email: String(r.email),
      body: String(r.body),
      consent: String(r.consent),
      ...(r.answers ? { answers: JSON.parse(String(r.answers)) as Answer[] } : {}),
    }));
  }

  async deleteMessage(id: string): Promise<void> {
    await this.run('DELETE FROM messages WHERE id = ?', [id]);
    await this.forgetLooseAnswers();
  }

  /** Erases everything one address sent. Returns how many were erased. */
  async deleteMessagesFrom(email: string): Promise<number> {
    const found = (await this.messages(email)).length;
    await this.run('DELETE FROM messages WHERE LOWER(email) = ?', [email.trim().toLowerCase()]);
    await this.forgetLooseAnswers();
    return found;
  }

  /** Deletes what was kept longer than the site keeps messages: messages, and comments nobody approved. */
  async forgetOldMessages(now = new Date()): Promise<void> {
    const days = (await this.site()).keepMessages;
    const before = new Date(now.getTime() - days * 86_400_000).toISOString();
    await this.run('DELETE FROM messages WHERE received_at < ?', [before]);
    await this.run('DELETE FROM comments WHERE approved <> 1 AND at < ?', [before]);
    await this.forgetLooseAnswers();
  }

  /** A message's answers go with it. */
  private async forgetLooseAnswers(): Promise<void> {
    await this.run('DELETE FROM message_answers WHERE id NOT IN (SELECT id FROM messages)');
    await this.run('DELETE FROM comment_languages WHERE id NOT IN (SELECT id FROM comments)');
  }

  // Comments (ADR 0040).

  /**
   * Keeps a comment, with the consent its writer ticked. It waits for the
   * owner, unless an earlier comment from the same address was approved:
   * someone the owner already let speak is not held each time.
   */
  async addComment(
    input: { type: string; entry: string; name: string; email: string; body: string; consent: string; language?: string },
    at = new Date(),
    /** What the extensions that check comments answered (ADR 0062 d3); the strictest wins. */
    judged: 'hold' | 'approve' | 'spam' | null = null,
  ): Promise<Comment> {
    const email = str(input.email, 254).trim();
    const known = judged === 'approve' ? true : judged ? null : await this.row('SELECT 1 AS found FROM comments WHERE LOWER(email) = ? AND approved = 1', [email.toLowerCase()]);
    const comment: Comment = {
      id: crypto.randomUUID(),
      type: str(input.type, 60),
      entry: str(input.entry, 200),
      name: str(input.name, 120).trim(),
      email,
      body: str(input.body, 3000).trim(),
      consent: str(input.consent, 600).trim(),
      at: at.toISOString(),
      approved: known !== null,
      ...(judged === 'spam' ? { spam: true } : {}),
      ...(input.language ? { language: str(input.language, 20) } : {}),
    };
    await this.run('INSERT INTO comments (id, type, entry, name, email, body, consent, at, approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      comment.id,
      comment.type,
      comment.entry,
      comment.name,
      comment.email,
      comment.body,
      comment.consent,
      comment.at,
      comment.approved ? 1 : comment.spam ? -1 : 0,
    ]);
    // Kept beside it, as a message's answers are: a comment is shown under the entry in the language it was written in.
    if (comment.language) await this.run('INSERT INTO comment_languages (id, language) VALUES (?, ?)', [comment.id, comment.language]);
    this.emit('comment.created', { id: comment.id, type: comment.type, entry: comment.entry, name: comment.name, body: comment.body, approved: comment.approved, spam: comment.spam === true });
    return comment;
  }

  /** Every comment, those waiting first and then newest first; or those one address sent. */
  async comments(email?: string): Promise<Comment[]> {
    const rows = await this.rows<Row>(
      `SELECT c.id, c.type, c.entry, c.name, c.email, c.body, c.consent, c.at, c.approved, l.language FROM comments c LEFT JOIN comment_languages l ON l.id = c.id${email ? ' WHERE LOWER(c.email) = ?' : ''} ORDER BY CASE c.approved WHEN 0 THEN 0 WHEN 1 THEN 1 ELSE 2 END, c.at DESC, c.id`,
      email ? [email.trim().toLowerCase()] : [],
    );
    return rows.map((r) => ({
      id: String(r.id),
      type: String(r.type),
      entry: String(r.entry),
      name: String(r.name),
      email: String(r.email),
      body: String(r.body),
      consent: String(r.consent),
      at: String(r.at),
      approved: Number(r.approved) === 1,
      ...(Number(r.approved) === -1 ? { spam: true } : {}),
      ...(r.language ? { language: String(r.language) } : {}),
    }));
  }

  async approveComment(id: string): Promise<void> {
    if ((await this.changed('UPDATE comments SET approved = 1 WHERE id = ? AND approved <> 1', [id])) !== 1) return;
    const c = (await this.comments()).find((one) => one.id === id);
    if (c) this.emit('comment.approved', { id, type: c.type, entry: c.entry, name: c.name, body: c.body });
  }

  async deleteComment(id: string): Promise<void> {
    await this.run('DELETE FROM comments WHERE id = ?', [id]);
    await this.run('DELETE FROM comment_languages WHERE id = ?', [id]);
  }

  /** Erases every comment one address sent. Returns how many were erased. */
  async deleteCommentsFrom(email: string): Promise<number> {
    const found = (await this.comments(email)).length;
    await this.run('DELETE FROM comments WHERE LOWER(email) = ?', [email.trim().toLowerCase()]);
    await this.run('DELETE FROM comment_languages WHERE id NOT IN (SELECT id FROM comments)');
    return found;
  }

  /**
   * Keeps a comment that was already shown on another site (ADR 0057 d3): approved, at the time it
   * was written, and without the address it was sent from, which a content export never holds.
   */
  async keepShownComment(input: { type: string; entry: string; name: string; body: string; at: string; language?: string }): Promise<void> {
    const at = new Date(input.at);
    const id = crypto.randomUUID();
    await this.run('INSERT INTO comments (id, type, entry, name, email, body, consent, at, approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      id,
      str(input.type, 60),
      str(input.entry, 200),
      str(input.name, 120).trim(),
      '',
      str(input.body, 3000).trim(),
      '',
      (Number.isNaN(at.getTime()) ? new Date() : at).toISOString(),
      1,
    ]);
    if (input.language) await this.run('INSERT INTO comment_languages (id, language) VALUES (?, ?)', [id, str(input.language, 20)]);
  }

  /**
   * Every page, section or entry as it is kept: its draft and what is published, as stored
   * (ADR 0057 d1). What a content export writes, before it is cleaned for the file.
   */
  async documents(table: 'pages' | 'sections' | 'entries'): Promise<{ type: string; slug: string; draft: unknown; published: unknown }[]> {
    const order = table === 'entries' ? 'type, slug' : 'position, slug';
    const rows = await this.rows<Row>(`SELECT ${table === 'entries' ? 'type, ' : ''}slug, draft, published FROM ${table} ORDER BY ${order}`);
    return rows.map((r) => ({ type: table === 'entries' ? String(r.type) : '', slug: String(r.slug), draft: JSON.parse(String(r.draft)), published: r.published === null || r.published === undefined ? null : JSON.parse(String(r.published)) }));
  }

  /** What the site shows: the approved comments of each entry, by `type/entry`, oldest first, without their addresses. */
  async shownComments(): Promise<Record<string, ShownComment[]>> {
    const rows = await this.rows<Row>('SELECT c.id, c.type, c.entry, c.name, c.body, c.at, l.language FROM comments c LEFT JOIN comment_languages l ON l.id = c.id WHERE c.approved = 1 ORDER BY c.at, c.id');
    const out: Record<string, ShownComment[]> = {};
    for (const r of rows) (out[commentKey(String(r.type), String(r.entry), r.language ? String(r.language) : '')] ??= []).push({ id: String(r.id), name: String(r.name), body: String(r.body), at: String(r.at) });
    return out;
  }

  /** Runs a query as it is written, for a test that needs to put a row in a state the store never would. */
  // Accounts (ADR 0022).

  async users(): Promise<User[]> {
    const rows = await this.rows<Row>(
      'SELECT u.id, u.email, u.name, u.role, u.password, u.created_at, b.bio, p.src, ub.shown FROM users u LEFT JOIN user_bios b ON b.id = u.id LEFT JOIN user_pictures p ON p.id = u.id LEFT JOIN user_bar ub ON ub.id = u.id ORDER BY u.created_at, u.email',
    );
    return rows.map((r) => ({
      id: String(r.id),
      email: String(r.email),
      name: String(r.name),
      role: cleanRole(r.role),
      active: String(r.password) !== '',
      createdAt: String(r.created_at),
      bio: r.bio ? String(r.bio) : '',
      picture: r.src ? String(r.src) : '',
      bar: r.shown === null || r.shown === undefined || Number(r.shown) !== 0,
    }));
  }

  async user(id: string): Promise<User | null> {
    return (await this.users()).find((u) => u.id === id) ?? null;
  }

  /** Someone new. Without a password they are invited, and choose one through their link. */
  async addUser(input: { email: string; name?: string; role: Role; password?: string }): Promise<User> {
    const email = cleanEmail(input.email);
    if (!email) throw new Error('that is not an email address');
    if ((await this.users()).some((u) => u.email === email)) throw new Error('someone with this address already has an account');
    const id = crypto.randomUUID();
    const password = input.password === undefined ? '' : await this.hashPassword(input.password);
    await this.run('INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      email,
      str(input.name ?? '', 120).trim(),
      cleanRole(input.role),
      password,
      new Date().toISOString(),
    ]);
    return (await this.user(id)) as User;
  }

  private async hashPassword(password: string): Promise<string> {
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);
    return Bun.password.hash(password, { algorithm: 'argon2id' });
  }

  /** Sets someone's password and name, and signs them out everywhere else. */
  async setPassword(id: string, password: string, name?: string): Promise<void> {
    const hash = await this.hashPassword(password);
    if (name !== undefined) await this.run('UPDATE users SET password = ?, name = ? WHERE id = ?', [hash, str(name, 120).trim(), id]);
    else await this.run('UPDATE users SET password = ? WHERE id = ?', [hash, id]);
    await this.run('DELETE FROM sessions WHERE user_id = ?', [id]);
  }

  /** The person this address and password belong to, or null. It takes as long either way. */
  async checkPassword(email: string, password: string): Promise<User | null> {
    const row = await this.row<Row>('SELECT id, password FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    const hash = row && String(row.password) ? String(row.password) : await (decoy ??= Bun.password.hash(newSecret(), { algorithm: 'argon2id' }));
    const right = password.length <= PASSWORD_MAX && (await Bun.password.verify(password, hash));
    return right && row && String(row.password) ? this.user(String(row.id)) : null;
  }

  /** Changes what someone may do. The site always keeps an owner. */
  async setRole(id: string, role: Role): Promise<void> {
    const users = await this.users();
    if (role !== 'owner' && users.filter((u) => u.role === 'owner' && u.active && u.id !== id).length === 0) throw new Error('the site needs an owner');
    await this.run('UPDATE users SET role = ? WHERE id = ?', [cleanRole(role), id]);
  }

  /** Someone's name and the few words about them (ADR 0055 d3), set by themselves. */
  async setProfile(id: string, name: unknown, bio: unknown, picture?: unknown, bar?: unknown): Promise<User> {
    if (!(await this.user(id))) throw new Error('nobody has that account');
    const before = authorSlugs(await this.users());
    await this.run('UPDATE users SET name = ? WHERE id = ?', [str(name, 120).trim(), id]);
    await this.run(this.dialect.upsert('user_bios', ['id', 'bio'], ['id'], ['bio']), [id, str(bio, BIO_MAX).trim()]);
    // A picture is one of the library's images (ADR 0056 d2); left out, it stays as it was.
    if (picture !== undefined) {
      const name = typeof picture === 'string' ? mediaNameOf(picture) : '';
      if (picture && !(name && mediaKindOf(name) === 'image')) throw new Error('a picture of someone is an image from the media library');
      if (name) await this.run(this.dialect.upsert('user_pictures', ['id', 'src'], ['id'], ['src']), [id, mediaPath(name)]);
      else await this.run('DELETE FROM user_pictures WHERE id = ?', [id]);
    }
    // The admin bar over the site (ADR 0075): left out, it stays as it was.
    if (typeof bar === 'boolean') await this.run(this.dialect.upsert('user_bar', ['id', 'shown'], ['id'], ['shown']), [id, bar ? 1 : 0]);
    await this.keepAuthorAddresses(before);
    // Shown on every post of theirs at once, without publishing them again (ADR 0055 d3).
    await this.touch();
    return (await this.user(id)) as User;
  }

  /**
   * A person whose name changed keeps their old pages' addresses (ADR 0056 d1):
   * each leads to the new one, as a redirect the owner sees with the others.
   */
  private async keepAuthorAddresses(before: Map<string, string>): Promise<void> {
    const after = authorSlugs(await this.users());
    const moved = [...before].flatMap(([id, old]): [string, string][] => {
      const now = after.get(id);
      return now && now !== old ? [[old, now]] : [];
    });
    if (!moved.length) return;
    const site = await this.site();
    const prefixes = ['', ...site.languages.map((language) => `/${prefixOf(language)}`)];
    const dated = [site.language, ...site.languages].flatMap((language) => contentTypes(site).filter((t) => t.dated).map((t) => typeIn(site, t, language)));
    const found: Redirect[] = moved.flatMap(([old, now]) => [
      ...prefixes.map((prefix) => ({ from: authorPath(prefix, old), to: authorPath(prefix, now) })),
      ...dated.map((t) => ({ from: typeAuthorPath(t, old), to: typeAuthorPath(t, now) })),
    ]);
    // An address someone has now is theirs again, not a way to somewhere else.
    const current = new Set([...after.values()]);
    const stale = (r: Redirect): boolean => found.some((f) => f.from === r.from) || [...current].some((slug) => prefixes.some((p) => r.from === authorPath(p, slug)) || dated.some((t) => r.from === typeAuthorPath(t, slug)));
    await this.setRedirects([...(await this.redirects()).filter((r) => !stale(r)), ...found]);
  }

  /**
   * Removes someone, with their sessions and links. The last owner stays.
   * What they wrote passes to `heir` (ADR 0055 d5): nothing is unpublished.
   */
  async removeUser(id: string, heir = ''): Promise<void> {
    const users = await this.users();
    if (users.find((u) => u.id === id)?.role === 'owner' && users.filter((u) => u.role === 'owner' && u.active && u.id !== id).length === 0) throw new Error('the site needs an owner');
    if (heir === id || (heir && !users.some((u) => u.id === heir))) throw new Error('give what they wrote to someone who stays');
    if (heir) await this.run('UPDATE entry_authors SET user_id = ? WHERE user_id = ?', [heir, id]);
    else await this.run('DELETE FROM entry_authors WHERE user_id = ?', [id]);
    await this.run('DELETE FROM user_bios WHERE id = ?', [id]);
    await this.run('DELETE FROM user_pictures WHERE id = ?', [id]);
    await this.run('DELETE FROM user_bar WHERE id = ?', [id]);
    await this.run('DELETE FROM sessions WHERE user_id = ?', [id]);
    await this.run('DELETE FROM links WHERE user_id = ?', [id]);
    await this.run('DELETE FROM users WHERE id = ?', [id]);
    await this.touch();
  }

  /** A new session: the secret goes in the person's cookie, its hash stays here. */
  async startSession(userId: string, now = new Date()): Promise<string> {
    const secret = newSecret();
    await this.run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [hashOf(secret), userId, new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString()]);
    return secret;
  }

  /** Who a session's secret signs in, while it has not run out. */
  async sessionUser(secret: string, now = new Date()): Promise<User | null> {
    if (!secret) return null;
    const row = await this.row<Row>('SELECT user_id, expires_at FROM sessions WHERE id = ?', [hashOf(secret)]);
    if (!row) return null;
    if (String(row.expires_at) <= now.toISOString()) {
      await this.endSession(secret);
      return null;
    }
    const user = await this.user(String(row.user_id));
    return user?.active ? user : null;
  }

  async endSession(secret: string): Promise<void> {
    await this.run('DELETE FROM sessions WHERE id = ?', [hashOf(secret)]);
  }

  /** A link that works once, for a while. A new link of the same kind for the same person replaces the old one. */
  async makeLink(kind: LinkKind, userId: string, hours: number, now = new Date()): Promise<string> {
    const secret = newSecret();
    await this.run('DELETE FROM links WHERE kind = ? AND user_id = ?', [kind, userId]);
    await this.run('DELETE FROM links WHERE expires_at <= ?', [now.toISOString()]);
    await this.run('INSERT INTO links (id, kind, user_id, expires_at) VALUES (?, ?, ?, ?)', [hashOf(secret), kind, userId, new Date(now.getTime() + hours * 3_600_000).toISOString()]);
    return secret;
  }

  /** What a link is for, while it works. `use` spends it. */
  async link(secret: string, use = false, now = new Date()): Promise<{ kind: LinkKind; user: User | null } | null> {
    if (!secret) return null;
    const row = await this.row<Row>('SELECT kind, user_id, expires_at FROM links WHERE id = ?', [hashOf(secret)]);
    if (!row || String(row.expires_at) <= now.toISOString()) return null;
    // Spent by whoever deletes it: of two requests with the same link, one gets nothing.
    if (use && (await this.changed('DELETE FROM links WHERE id = ?', [hashOf(secret)])) !== 1) return null;
    const kind = String(row.kind) as LinkKind;
    return { kind, user: kind === 'setup' ? null : await this.user(String(row.user_id)) };
  }

  /** The extensions installed (ADR 0026), each with the package it was installed from. */
  async extensions(): Promise<InstalledExtension[]> {
    const rows = await this.rows<{ name: string; sha256: string; package: string; enabled: number | string; installed_at: string }>('SELECT name, sha256, package, enabled, installed_at FROM extensions ORDER BY name');
    return rows.flatMap((row) => {
      const { pkg } = parseExtension(JSON.parse(row.package));
      return pkg ? [{ ...pkg, sha256: row.sha256, enabled: Number(row.enabled) === 1, installedAt: row.installed_at }] : [];
    });
  }

  async extension(name: string): Promise<InstalledExtension | null> {
    return (await this.extensions()).find((e) => e.manifest.name === name) ?? null;
  }

  /** The blocks the extensions that are on add to the public site (ADR 0062 d6), by `<extension>/<block>`. */
  async extensionBlocks(): Promise<Record<string, ExtensionBlockDef>> {
    return Object.fromEntries(
      (await this.extensions()).filter((e) => e.enabled).flatMap((e) => e.manifest.blocks.map((block) => [`${e.manifest.name}/${block.name}`, { extension: e.manifest.name, block, messages: e.manifest.messages }])),
    );
  }

  /**
   * Installs a package, or a new version of one. Its rows stay; a collection
   * the new version no longer declares keeps its rows until it is uninstalled.
   */
  async installExtension(raw: unknown, sha256: string, at = new Date()): Promise<InstalledExtension> {
    const { pkg, problems } = parseExtension(raw);
    if (!pkg) throw new Error(problems.join('; '));
    const before = await this.extension(pkg.manifest.name);
    await this.run(this.dialect.upsert('extensions', ['name', 'version', 'sha256', 'package', 'enabled', 'installed_at'], ['name'], ['version', 'sha256', 'package', 'installed_at']), [
      pkg.manifest.name,
      pkg.manifest.version,
      sha256,
      JSON.stringify(raw),
      before ? (before.enabled ? 1 : 0) : 1,
      at.toISOString(),
    ]);
    // The pages draw the blocks it adds (ADR 0062 d6): they are built again.
    if (pkg.manifest.blocks.length || before?.manifest.blocks.length) await this.touch();
    return (await this.extension(pkg.manifest.name)) as InstalledExtension;
  }

  async enableExtension(name: string, enabled: boolean): Promise<void> {
    if (!(await this.changed('UPDATE extensions SET enabled = ? WHERE name = ?', [enabled ? 1 : 0, name]))) throw new Error(`no extension "${name}" is installed`);
    if ((await this.extension(name))?.manifest.blocks.length) await this.touch();
  }

  /** Removes an extension and everything it kept. */
  async uninstallExtension(name: string): Promise<void> {
    const blocks = (await this.extension(name))?.manifest.blocks.length ?? 0;
    await this.sql.begin(async (tx) => {
      await tx.unsafe(this.dialect.params('DELETE FROM extension_rows WHERE extension = ?'), [name]);
      await tx.unsafe(this.dialect.params('DELETE FROM extensions WHERE name = ?'), [name]);
      await tx.unsafe(this.dialect.params('DELETE FROM extension_jobs WHERE extension = ?'), [name]);
      // What the fourth format keeps goes with it too (ADR 0076 d4): its unique values, its queued work and its files.
      for (const table of ['extension_unique', 'extension_later', 'extension_files']) await tx.unsafe(this.dialect.params(`DELETE FROM ${table} WHERE extension = ?`), [name]);
    });
    if (blocks) await this.touch();
  }

  /**
   * Claims one run of an extension's job (ADR 0041): true when it is due, and
   * this process is the one that marked it run. Two clocks on one database
   * never both run it: the row says which one changed it.
   */
  async claimJob(extension: string, action: string, everyMinutes: number, now = new Date()): Promise<boolean> {
    const at = now.toISOString();
    const last = await this.row<{ last_at: string }>('SELECT last_at FROM extension_jobs WHERE extension = ? AND action = ?', [extension, action]);
    if (!last) return (await this.changed(this.dialect.insertNew('extension_jobs', ['extension', 'action', 'last_at']), [extension, action, at])) === 1;
    if (now.getTime() - Date.parse(last.last_at) < everyMinutes * 60_000) return false;
    return (await this.changed('UPDATE extension_jobs SET last_at = ? WHERE extension = ? AND action = ? AND last_at = ?', [at, extension, action, last.last_at])) === 1;
  }

  /** The rows of one of an extension's collections, oldest first. */
  async extensionRows(extension: string, collection: string): Promise<ExtensionRow[]> {
    const rows = await this.rows<{ id: string; data: string; updated_at: string }>('SELECT id, data, updated_at FROM extension_rows WHERE extension = ? AND collection = ? ORDER BY id', [extension, collection]);
    return rows.map((row) => ({ ...(JSON.parse(row.data) as Record<string, unknown>), id: row.id }));
  }

  async extensionRow(extension: string, collection: string, id: string): Promise<ExtensionRow | null> {
    const row = await this.row<{ data: string }>('SELECT data FROM extension_rows WHERE extension = ? AND collection = ? AND id = ?', [extension, collection, id]);
    return row ? { ...(JSON.parse(row.data) as Record<string, unknown>), id } : null;
  }

  /**
   * Keeps a row, already cleaned by its collection's fields. A new one gets an
   * id that sorts after the ones before it. The fields named `unique` (ADR 0076
   * d4.5) are kept in the same step: a value another row has refuses the row.
   */
  async saveExtensionRow(extension: string, collection: string, data: Record<string, unknown>, id: string | null = null, at = new Date(), unique: readonly string[] = []): Promise<ExtensionRow> {
    const key = id ?? `${at.getTime().toString(36).padStart(9, '0')}${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
    if (id !== null && !(await this.extensionRow(extension, collection, id))) throw new Error('no such row');
    const { id: _ignored, ...rest } = data;
    await this.sql.begin(async (tx) => {
      const run = (query: string, params: unknown[]) => tx.unsafe(this.dialect.params(query), params);
      await run(this.dialect.upsert('extension_rows', ['extension', 'collection', 'id', 'data', 'updated_at'], ['extension', 'collection', 'id'], ['data', 'updated_at']), [extension, collection, key, JSON.stringify(rest), at.toISOString()]);
      if (!unique.length) return;
      await run('DELETE FROM extension_unique WHERE extension = ? AND collection = ? AND id = ?', [extension, collection, key]);
      for (const field of unique) {
        const value = uniqueValue(rest[field]);
        if (value === null) continue;
        const kept = Number(((await run(this.dialect.insertNew('extension_unique', ['extension', 'collection', 'field', 'value', 'id']), [extension, collection, field, value, key])) as { count?: number }).count ?? 0);
        if (kept !== 1) throw new Error(`another row already has ${field} "${value.slice(0, 80)}"`);
      }
    });
    return { ...rest, id: key };
  }

  /** The row whose unique field has this value (ADR 0076 d4.5), or null. */
  async extensionRowBy(extension: string, collection: string, field: string, value: unknown): Promise<ExtensionRow | null> {
    const asKept = uniqueValue(value);
    if (asKept === null) return null;
    const found = await this.row<{ id: string }>('SELECT id FROM extension_unique WHERE extension = ? AND collection = ? AND field = ? AND value = ?', [extension, collection, field, asKept]);
    return found ? this.extensionRow(extension, collection, found.id) : null;
  }

  /**
   * Takes from the number fields of a row (ADR 0076 d4.6), only if each stays
   * at zero or above: in one step, so two buyers never take the last seat both.
   * Like `addToExtensionRow`, each try writes only over the row as it was read.
   */
  async takeFromExtensionRow(extension: string, collection: string, id: string, by: Record<string, number>, at = new Date()): Promise<ExtensionRow> {
    for (let tries = 0; tries < 50; tries++) {
      const row = await this.row<{ data: string }>('SELECT data FROM extension_rows WHERE extension = ? AND collection = ? AND id = ?', [extension, collection, id]);
      if (!row) throw new Error('no such row');
      const next = JSON.parse(row.data) as Record<string, unknown>;
      for (const [key, value] of Object.entries(by)) {
        const left = (Number(next[key]) || 0) - value;
        if (left < 0) throw new Error(`not enough ${key} left`);
        next[key] = left;
      }
      const kept = await this.changed('UPDATE extension_rows SET data = ?, updated_at = ? WHERE extension = ? AND collection = ? AND id = ? AND data = ?', [JSON.stringify(next), at.toISOString(), extension, collection, id, row.data]);
      if (kept === 1) return { ...next, id };
    }
    throw new Error('the row is changed by too many at once; try again');
  }

  /** Queues an action of an extension to run once, when `due` (ADR 0076 d4.3). */
  async queueLater(extension: string, action: string, input: unknown, due: Date, now = new Date()): Promise<string> {
    const id = `${now.getTime().toString(36).padStart(9, '0')}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await this.run('INSERT INTO extension_later (id, extension, action, input, due_at, tries, made_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, extension, action, JSON.stringify(input ?? null), due.toISOString(), 0, now.toISOString()]);
    return id;
  }

  /** How many of an extension's actions wait to run once. */
  async laterCount(extension: string): Promise<number> {
    const row = await this.row<{ n: number | string }>('SELECT COUNT(*) AS n FROM extension_later WHERE extension = ?', [extension]);
    return Number(row?.n ?? 0);
  }

  /** The work queued once that is due, oldest first. */
  async laterDue(now = new Date(), limit = 20): Promise<{ id: string; extension: string; action: string; input: unknown; dueAt: string; tries: number }[]> {
    const rows = await this.rows<{ id: string; extension: string; action: string; input: string; due_at: string; tries: number | string }>(`SELECT id, extension, action, input, due_at, tries FROM extension_later WHERE due_at <= ? ORDER BY due_at, id LIMIT ${Math.max(1, Math.floor(limit))}`, [now.toISOString()]);
    return rows.map((r) => ({ id: r.id, extension: r.extension, action: r.action, input: JSON.parse(r.input) as unknown, dueAt: r.due_at, tries: Number(r.tries) }));
  }

  /**
   * Claims one run of work queued once: true when this process moved it from
   * when it was due to `until`, so another clock does not run it meanwhile.
   */
  async claimLater(id: string, dueAt: string, until: Date): Promise<boolean> {
    return (await this.changed('UPDATE extension_later SET due_at = ? WHERE id = ? AND due_at = ?', [until.toISOString(), id, dueAt])) === 1;
  }

  /** Work queued once that ran: gone. That failed: tried again at `due`, or gone when `due` is null. */
  async laterRan(id: string, retry: { tries: number; due: Date } | null): Promise<void> {
    if (retry) await this.run('UPDATE extension_later SET tries = ?, due_at = ? WHERE id = ?', [retry.tries, retry.due.toISOString(), id]);
    else await this.run('DELETE FROM extension_later WHERE id = ?', [id]);
  }

  /** Keeps a file an extension made for an order (ADR 0076 d4.4); its id. */
  async saveExtensionFile(file: { extension: string; order: string; name: string; type: string; buyer: boolean; bytes: Uint8Array }, at = new Date()): Promise<string> {
    const id = `${at.getTime().toString(36).padStart(9, '0')}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await this.run('INSERT INTO extension_files (id, extension, order_id, name, type, buyer, size, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      id,
      file.extension,
      file.order,
      file.name,
      file.type,
      file.buyer ? 1 : 0,
      file.bytes.length,
      file.bytes,
      at.toISOString(),
    ]);
    return id;
  }

  /** The files kept for an order, without their bytes, oldest first. */
  async orderFiles(order: string): Promise<ExtensionFile[]> {
    const rows = await this.rows<{ id: string; extension: string; order_id: string; name: string; type: string; buyer: number | string; size: number | string; created_at: string }>(
      'SELECT id, extension, order_id, name, type, buyer, size, created_at FROM extension_files WHERE order_id = ? ORDER BY id',
      [order],
    );
    return rows.map((r) => ({ id: r.id, extension: r.extension, order: r.order_id, name: r.name, type: r.type, buyer: Number(r.buyer) === 1, size: Number(r.size), createdAt: r.created_at }));
  }

  /** One file an extension kept, with its bytes. */
  async extensionFile(id: string): Promise<(ExtensionFile & { bytes: Uint8Array }) | null> {
    const r = await this.row<{ id: string; extension: string; order_id: string; name: string; type: string; buyer: number | string; size: number | string; created_at: string; bytes: Uint8Array }>('SELECT * FROM extension_files WHERE id = ?', [id]);
    return r ? { id: r.id, extension: r.extension, order: r.order_id, name: r.name, type: r.type, buyer: Number(r.buyer) === 1, size: Number(r.size), createdAt: r.created_at, bytes: new Uint8Array(r.bytes) } : null;
  }

  /** Removes one of an extension's files; another's is left. */
  async deleteExtensionFile(extension: string, id: string): Promise<boolean> {
    return (await this.changed('DELETE FROM extension_files WHERE extension = ? AND id = ?', [extension, id])) === 1;
  }

  /**
   * Adds to the number fields of a row (ADR 0062 d5), making it from `fresh`
   * when there is none. Each try writes only over the row as it was read, so
   * two processes adding at once both count: the one that lost reads again.
   */
  async addToExtensionRow(extension: string, collection: string, id: string, fresh: Record<string, unknown>, by: Record<string, number>, at = new Date()): Promise<ExtensionRow> {
    const sum = (base: Record<string, unknown>): Record<string, unknown> => {
      const next = { ...base };
      for (const [key, value] of Object.entries(by)) next[key] = (Number(next[key]) || 0) + value;
      return next;
    };
    for (let tries = 0; tries < 50; tries++) {
      const row = await this.row<{ data: string }>('SELECT data FROM extension_rows WHERE extension = ? AND collection = ? AND id = ?', [extension, collection, id]);
      if (!row) {
        const made = sum(fresh);
        const kept = await this.changed(this.dialect.insertNew('extension_rows', ['extension', 'collection', 'id', 'data', 'updated_at']), [extension, collection, id, JSON.stringify(made), at.toISOString()]);
        if (kept === 1) return { ...made, id };
        continue;
      }
      const next = sum(JSON.parse(row.data) as Record<string, unknown>);
      const kept = await this.changed('UPDATE extension_rows SET data = ?, updated_at = ? WHERE extension = ? AND collection = ? AND id = ? AND data = ?', [JSON.stringify(next), at.toISOString(), extension, collection, id, row.data]);
      if (kept === 1) return { ...next, id };
    }
    throw new Error('the row is changed by too many at once; try again');
  }

  async deleteExtensionRow(extension: string, collection: string, id: string): Promise<void> {
    await this.run('DELETE FROM extension_rows WHERE extension = ? AND collection = ? AND id = ?', [extension, collection, id]);
    await this.run('DELETE FROM extension_unique WHERE extension = ? AND collection = ? AND id = ?', [extension, collection, id]);
  }

  async rawForTests(query: string, params: unknown[] = []): Promise<void> {
    await this.run(query, params);
  }

  /**
   * Which build of the published site is current (ADR 0044): it changes with
   * anything visitors would see differently. The server builds the site again
   * only when it has changed, whichever process changed it.
   */
  async siteVersion(): Promise<string> {
    return String((await this.getMeta('published:version')) ?? '');
  }

  /** Says that what visitors see has changed. */
  async touch(): Promise<void> {
    await this.setMeta('published:version', crypto.randomUUID());
  }

  /** Valkey's address set in Settings → Performance (ADR 0044 d4); UHLAKA_VALKEY_URL, when set, comes first. */
  async valkeyAddress(): Promise<string> {
    return String((await this.getMeta('valkey')) ?? '');
  }

  async setValkeyAddress(address: string): Promise<void> {
    await this.setMeta('valkey', address);
  }

  /**
   * Plain queries, for a part of the program that is off until the owner turns
   * it on (ADR 0060 d3): it makes its own tables the first time, and only then.
   */
  database(): Database {
    return {
      kind: this.kind,
      rows: <T = Row>(query: string, params: unknown[] = []) => this.rows<T>(query, params),
      run: (query: string, params: unknown[] = []) => this.run(query, params),
      changed: (query: string, params: unknown[] = []) => this.changed(query, params),
      upsert: (table: string, columns: string[], key: string[], update: string[]) => this.dialect.upsert(table, columns, key, update),
      make: async (statements: string[]) => {
        for (const statement of statements) await this.sql.unsafe(statement);
      },
    };
  }

  /** Whether a table is there: a part that is off has none (ADR 0060 d3). */
  async hasTable(table: string): Promise<boolean> {
    const query =
      this.kind === 'sqlite'
        ? "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?"
        : this.kind === 'postgres'
          ? 'SELECT 1 AS found FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?'
          : 'SELECT 1 AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?';
    return (await this.rows(query, [table])).length > 0;
  }

  /** Visitor accounts' settings as saved (ADR 0064 d2, d8); the accounts read them whole. */
  async visitorSettings(): Promise<unknown> {
    return this.getMeta(VISITOR_SETTINGS);
  }

  async setVisitorSettings(value: unknown): Promise<void> {
    await this.setMeta(VISITOR_SETTINGS, value);
  }

  /** The shop's settings as saved (ADR 0065 d10); the shop reads them whole. */
  async shopSettings(): Promise<unknown> {
    return this.getMeta(SHOP_SETTINGS);
  }

  async setShopSettings(value: unknown): Promise<void> {
    await this.setMeta(SHOP_SETTINGS, value);
  }

  /** The mail server set in Settings → E-mail (ADR 0064 d5), and the owner's words for each message to visitors. */
  async mailSettings(): Promise<unknown> {
    return this.getMeta(MAIL_SETTINGS);
  }

  async setMailSettings(value: unknown): Promise<void> {
    await this.setMeta(MAIL_SETTINGS, value);
  }

  async mailTemplates(): Promise<unknown> {
    return this.getMeta(MAIL_TEMPLATES);
  }

  async setMailTemplates(value: unknown): Promise<void> {
    await this.setMeta(MAIL_TEMPLATES, value);
  }

  /** The backup settings as saved (ADR 0051); the backup module reads them whole. */
  async backupSettings(): Promise<unknown> {
    return this.getMeta(BACKUP_SETTINGS);
  }

  async setBackupSettings(value: unknown): Promise<void> {
    await this.setMeta(BACKUP_SETTINGS, value);
  }

  /** How the last backup went (ADR 0051 d6). */
  async lastBackup(): Promise<unknown> {
    return this.getMeta(BACKUP_LAST);
  }

  async setLastBackup(value: unknown): Promise<void> {
    await this.setMeta(BACKUP_LAST, value);
  }

  /**
   * An address a visitor asked for that the site does not have (ADR 0063 d1):
   * counted, with when it was last asked for and where the visitor came from.
   * The oldest are forgotten beyond {@link NOT_FOUND_KEPT}.
   */
  async addNotFound(path: string, referrer: string, now = new Date()): Promise<void> {
    const add =
      this.kind === 'mysql'
        ? 'INSERT INTO not_found (path, hits, last_at, referrer) VALUES (?, 1, ?, ?) ON DUPLICATE KEY UPDATE hits = hits + 1, last_at = VALUES(last_at), referrer = IF(VALUES(referrer) = \'\', referrer, VALUES(referrer))'
        : "INSERT INTO not_found (path, hits, last_at, referrer) VALUES (?, 1, ?, ?) ON CONFLICT (path) DO UPDATE SET hits = not_found.hits + 1, last_at = excluded.last_at, referrer = CASE WHEN excluded.referrer = '' THEN not_found.referrer ELSE excluded.referrer END";
    await this.run(add, [path.slice(0, 255), now.toISOString(), referrer.slice(0, 255)]);
    const count = Number((await this.row<{ n: number | string }>('SELECT COUNT(*) AS n FROM not_found'))?.n ?? 0);
    if (count <= NOT_FOUND_KEPT) return;
    const oldest = await this.rows<{ path: string }>(`SELECT path FROM not_found ORDER BY last_at, path LIMIT ${count - NOT_FOUND_KEPT}`);
    for (const row of oldest) await this.run('DELETE FROM not_found WHERE path = ?', [row.path]);
  }

  /** The service account and property Search Console is read with (ADR 0077 d3), when the owner connected it. */
  async searchConsole(): Promise<SearchConsoleSettings | null> {
    const kept = await this.getMeta(SEARCH_CONSOLE);
    return isObject(kept) && typeof kept.clientEmail === 'string' && typeof kept.privateKey === 'string' && typeof kept.property === 'string' ? (kept as unknown as SearchConsoleSettings) : null;
  }

  async setSearchConsole(settings: SearchConsoleSettings | null): Promise<void> {
    if (settings) await this.setMeta(SEARCH_CONSOLE, settings);
    else await this.run(`DELETE FROM meta WHERE ${this.dialect.key} = ?`, [SEARCH_CONSOLE]);
  }

  /** The key that proves to IndexNow the site is the one telling it (ADR 0063 d2), made the first time it is asked for. */
  async indexNowKey(): Promise<string> {
    const kept = await this.getMeta(INDEXNOW_KEY);
    if (typeof kept === 'string' && isIndexNowKey(kept)) return kept;
    const key = crypto.randomUUID().replace(/-/g, '');
    await this.setMeta(INDEXNOW_KEY, key);
    return key;
  }

  /** The addresses not found, the most asked for first. */
  async notFound(): Promise<NotFound[]> {
    const rows = await this.rows<{ path: string; hits: number | string; last_at: string; referrer: string }>('SELECT path, hits, last_at, referrer FROM not_found ORDER BY hits DESC, last_at DESC, path');
    return rows.map((r) => ({ path: r.path, hits: Number(r.hits), lastAt: r.last_at, referrer: r.referrer }));
  }

  /** Forgets one address not found, or all of them. */
  async forgetNotFound(path: string | null): Promise<void> {
    if (path === null) await this.run('DELETE FROM not_found');
    else await this.run('DELETE FROM not_found WHERE path = ?', [path]);
  }

  /** The owner's time zone, in which the statistics' days begin (ADR 0053 d3); UTC until the owner opens them. */
  async statsZone(): Promise<string> {
    const zone = await this.getMeta('stats:zone');
    return typeof zone === 'string' ? zone : 'UTC';
  }

  async setStatsZone(zone: string): Promise<void> {
    await this.setMeta('stats:zone', zone);
  }

  /** The tables of the parts turned on at least once, which a backup holds besides the site's own. */
  private async optionalTables(): Promise<string[]> {
    const optional: string[] = [];
    for (const table of [...BACKED_UP_VISITOR_TABLES, ...BACKED_UP_SHOP_TABLES]) if (await this.hasTable(table)) optional.push(table);
    return optional;
  }

  /**
   * Every row a backup holds (ADR 0051 d1), table by table, a few at a time so
   * that a site with many pictures is never all in memory. Bytes come as
   * Uint8Array, whichever database gave them.
   */
  async *backupRows(): AsyncGenerator<{ table: string; row: Row }> {
    // The visitors' tables, once the owner has turned the accounts on (ADR 0064 d6); the shop's, once it was (ADR 0065).
    const optional = await this.optionalTables();
    for (const table of [...BACKUP_TABLES, ...optional]) {
      const key = TABLE_KEYS[table] as string[];
      const order = key.map((column) => (column === 'key' ? this.dialect.key : column)).join(', ');
      const step = table === 'media' || table === 'media_variants' || table === 'extension_files' || table === 'font_files' ? 20 : 500;
      for (let offset = 0; ; offset += step) {
        const rows = await this.rows(`SELECT * FROM ${table} ORDER BY ${order} LIMIT ${step} OFFSET ${offset}`);
        for (const row of rows) {
          if (table === 'meta' && NOT_BACKED_UP_META.includes(String(row.key))) continue;
          // Only a file's bytes are bytes; a text a database gives as bytes is read as text, so it goes back into any of the three.
          const asRead = (column: string, value: unknown): unknown =>
            !(value instanceof Uint8Array) ? value : column === 'bytes' ? new Uint8Array(value) : new TextDecoder().decode(value);
          yield { table, row: Object.fromEntries(Object.entries(row).map(([column, value]) => [column, asRead(column, value)])) };
        }
        if (rows.length < step) break;
      }
    }
  }

  /**
   * Replaces everything the site keeps with the rows given (ADR 0051 d5), in
   * one transaction: rows that cannot be read leave the site as it was. What
   * belongs to this server and not to the site stays: who is signed in (while
   * their account is still there), the backup settings and Valkey's address.
   * A row of a table or a column this program does not know is refused.
   */
  async restoreRows(rows: AsyncIterable<{ table: string; row: Row }>): Promise<number> {
    let count = 0;
    // The settings come first in a backup. A site whose visitor accounts were ever turned on has their
    // tables, made before the transaction: on MySQL, making a table ends one (ADR 0064 d6).
    const iterator = rows[Symbol.asyncIterator]();
    const ahead: { table: string; row: Row }[] = [];
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
      ahead.push(next.value);
      if (next.value.table !== 'meta') break;
    }
    if (ahead.some(({ table, row }) => table === 'meta' && row.key === VISITOR_SETTINGS)) await this.database().make(visitorSchema(this.kind));
    // So does a site whose shop was ever turned on (ADR 0065).
    if (ahead.some(({ table, row }) => table === 'meta' && row.key === SHOP_SETTINGS)) await this.database().make(shopSchema(this.kind));
    const optional = await this.optionalTables();
    const all = async function* (): AsyncGenerator<{ table: string; row: Row }> {
      yield* ahead;
      for (let next = await iterator.next(); !next.done; next = await iterator.next()) yield next.value;
    };
    await this.sql.begin(async (tx) => {
      const run = (query: string, params: unknown[] = []) => tx.unsafe(this.dialect.params(query), params);
      await run(`DELETE FROM meta WHERE ${this.dialect.key} NOT IN (${marks(NOT_BACKED_UP_META)})`, NOT_BACKED_UP_META);
      for (const table of [...BACKUP_TABLES, ...optional]) if (table !== 'meta') await run(`DELETE FROM ${table}`);
      // A backup from before the statistics were an extension holds their totals: they go to its rows (ADR 0062 d8).
      const visits: VisitRow[] = [];
      for await (const { table, row } of all()) {
        if (table === 'visits') {
          visits.push({ day: String(row.day), kind: String(row.kind) as Kind, name: String(row.name ?? ''), hits: Number(row.hits) || 0 });
          count++;
          continue;
        }
        const columns = TABLE_COLUMNS[table];
        if (!columns || !([...BACKUP_TABLES, ...optional] as readonly string[]).includes(table)) throw new Error(`a backup holds a table this program does not know: ${table}`);
        if (table === 'meta' && NOT_BACKED_UP_META.includes(String(row.key))) continue;
        const names = Object.keys(row);
        const unknown = names.find((name) => !columns.includes(name));
        if (unknown) throw new Error(`a backup holds a column this program does not know: ${table}.${unknown}`);
        await run(`INSERT INTO ${table} (${names.map((n) => (n === 'key' ? this.dialect.key : n)).join(', ')}) VALUES (${marks(names)})`, names.map((n) => row[n]));
        count++;
      }
      await this.addStatsRows(run, visits);
      await run('DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)');
      await run('DELETE FROM links WHERE user_id NOT IN (SELECT id FROM users) AND user_id <> ?', ['']);
      if (optional.includes('visitors')) {
        await run('DELETE FROM visitor_sessions WHERE visitor_id NOT IN (SELECT id FROM visitors)');
        await run('DELETE FROM visitor_links WHERE visitor_id NOT IN (SELECT id FROM visitors)');
        if (optional.includes('visitor_levels')) await run('DELETE FROM visitor_levels WHERE visitor_id NOT IN (SELECT id FROM visitors)');
      }
    });
    await this.touch();
    return count;
  }
}

/** What the shop tells extensions about an order (ADR 0065 d9). */
export type OrderEvent = 'order.made' | 'order.paid' | 'order.sent' | 'order.refunded';

/** An address visitors asked for that the site does not have (ADR 0063 d1). */
export interface NotFound {
  path: string;
  hits: number;
  /** When it was last asked for. */
  lastAt: string;
  /** The page that last led to it, as its host and path; empty when nothing did. */
  referrer: string;
}

/** Who sees each page, entry and type that is not for everyone (ADR 0064 d4). */
const AUDIENCES = 'audiences';

/** Where visitor accounts' settings, the mail server and the messages' words are kept (ADR 0064). */
const VISITOR_SETTINGS = 'visitors';
const MAIL_SETTINGS = 'mail';
const MAIL_TEMPLATES = 'mail:templates';
/** Where the shop's settings are kept (ADR 0065). */
const SHOP_SETTINGS = 'shop';

/** Plain queries, for a part of the program with tables of its own (ADR 0060 d3). Written with `?`. */
export interface Database {
  kind: DatabaseKind;
  rows: <T = Row>(query: string, params?: unknown[]) => Promise<T[]>;
  run: (query: string, params?: unknown[]) => Promise<void>;
  /** How many rows a change touched: the database's own answer. */
  changed: (query: string, params?: unknown[]) => Promise<number>;
  upsert: (table: string, columns: string[], key: string[], update: string[]) => string;
  /** Makes tables, as statements for this database. */
  make: (statements: string[]) => Promise<void>;
}

/** Where the IndexNow key is kept (ADR 0063 d2). */
const INDEXNOW_KEY = 'indexnow:key';
/** Where the Search Console settings are kept (ADR 0077 d3). */
const SEARCH_CONSOLE = 'searchconsole';
/** How many addresses not found are kept (ADR 0063 d1). */
export const NOT_FOUND_KEPT = 500;
/** Where the backup settings and the last backup are kept; neither is in a backup (ADR 0051 d1). */
const BACKUP_SETTINGS = 'backups';
const BACKUP_LAST = 'backups:last';
/** Meta that belongs to the server the site runs on, not to the site. */
const NOT_BACKED_UP_META = [BACKUP_SETTINGS, BACKUP_LAST, 'valkey'];
/** The statistics extension (ADR 0062 d8), whose rows the totals kept before it are moved into. */
export const STATS = 'stats';
/** Every table a backup holds, in the order it is written and read back. Sessions and one-time links are not in it. */
export const BACKUP_TABLES = [
  'meta',
  'pages',
  'sections',
  'entries',
  'versions',
  'schedule',
  'media',
  'media_sizes',
  'media_variants',
  'media_texts',
  'messages',
  'message_answers',
  'comments',
  'comment_languages',
  'users',
  'page_locks',
  'extensions',
  'extension_rows',
  'extension_jobs',
  'extension_unique',
  'extension_later',
  'extension_files',
  'entry_authors',
  'entry_reviews',
  'user_bios',
  'user_pictures',
  'user_bar',
  'fonts',
  'font_files',
] as const;
/** Each table's columns and key, read from the schema, which says them once. */
const TABLE_COLUMNS: Record<string, string[]> = {};
const TABLE_KEYS: Record<string, string[]> = {};
for (const statement of [...SQLITE.schema, ...BACKED_UP_VISITOR_TABLES.map((t) => visitorTable(t) as string), ...BACKED_UP_SHOP_TABLES.map((t) => shopTable(t) as string)]) {
  const [, table, inside] = statement.match(/^CREATE TABLE IF NOT EXISTS (\w+) \((.*)\)$/) as RegExpMatchArray;
  const parts = (inside as string).split(/, (?![^()]*\))/);
  const key = parts.find((p) => p.startsWith('PRIMARY KEY'));
  TABLE_COLUMNS[table as string] = parts.filter((p) => !p.startsWith('PRIMARY KEY')).map((p) => p.split(' ')[0] as string);
  TABLE_KEYS[table as string] = key ? (key.match(/\((.*)\)/)?.[1] ?? '').split(', ') : parts.filter((p) => p.includes('PRIMARY KEY')).map((p) => p.split(' ')[0] as string);
}

/** A font of the site's own (ADR 0085 d6): its name, what the admin calls it, its faces. */
export interface SiteFont {
  name: string;
  label: string;
  faces: FontFace[];
  at: string;
}

/** What changes what visitors see: each says so once it is done (ADR 0044). */
const TOUCHING = [
  'setSite',
  'addSiteFont',
  'deleteSiteFont',
  'setForms',
  'setRedirects',
  'publishTheme',
  'publishTemplate',
  'publish',
  'movePage',
  'splitTranslation',
  'deleteTranslation',
  'deletePage',
  'lockPage',
  'setAudience',
  // Turning visitor accounts on or off shows or hides "My account" in the menu (ADR 0064 d8).
  'setVisitorSettings',
  // Turning the shop on or off shows or hides each product's Buy part (ADR 0065 d10).
  'setShopSettings',
  'publishSection',
  'deleteSection',
  'publishEntry',
  'deleteEntry',
  'addVariant',
  'deleteMedia',
  'addComment',
  'approveComment',
  'deleteComment',
  'deleteCommentsFrom',
  'setEntryAuthor',
  'setProfile',
  'removeUser',
] as const;
for (const name of TOUCHING) {
  const done = Store.prototype[name] as (this: Store, ...args: unknown[]) => Promise<unknown>;
  Object.defineProperty(Store.prototype, name, {
    value: async function (this: Store, ...args: unknown[]): Promise<unknown> {
      const result = await done.apply(this, args);
      await this.touch();
      return result;
    },
    writable: true,
    configurable: true,
  });
}

/** A translation made as a copy (ADR 0024), as the page's translation (ADR 0032 d7). */
function copyAsTranslation(page: Page, copy: Page): PageTranslation {
  const { fields, problem } = wordsFrom(page.blocks, copy.blocks);
  return {
    slug: '',
    title: copy.title === page.title ? '' : copy.title,
    description: copy.description === page.description ? '' : copy.description,
    fields: problem ? {} : fields,
    blocks: problem ? copy.blocks : null,
  };
}
