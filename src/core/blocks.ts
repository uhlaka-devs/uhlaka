/**
 * The block vocabulary: one list (ADR 0001 d7).
 *
 * The editor offers exactly these types and the renderer draws exactly these;
 * `test/contract.test.ts` fails when the two disagree. Adding a type means
 * adding it here first.
 *
 * Each type declares its content as typed fields. Cleaning untrusted input and,
 * later, the editor's forms both come from that one declaration, so they cannot
 * drift apart.
 */
import { normalizeRichText, paragraphs, type RichText, richTextPlain } from './richtext.ts';
import { embedOf } from './embed.ts';
import { mediaKindOf, mediaNameOf } from './media.ts';
import { type BlockStyle, isTokenName, normalizeStyle } from './style.ts';
import { POSTS_TYPE } from './types.ts';
import { type Issue, isId, isObject, newId, safeHref, safeSrc, slugify, str } from './util.ts';

export type Field =
  /** `common`: the same in every language, never translated (ADR 0032): an e-mail address, a price. */
  | { kind: 'text'; max?: number; multiline?: boolean; common?: true; code?: true }
  | { kind: 'richtext' }
  | { kind: 'image' }
  | { kind: 'link' }
  /** The name of a content type: where a block that lists entries takes them from. */
  | { kind: 'source' }
  | { kind: 'number'; min: number; max: number }
  /** Which part of an entry a block of an entry's page shows (ADR 0015): its title, its date, one of its fields. */
  | { kind: 'part' }
  /** A section the block shows (ADR 0033), by its name: blocks written once and shown on many pages. */
  | { kind: 'section' }
  /** A form the block shows (ADR 0049), by its name: built on the Forms screen. */
  | { kind: 'form' }
  /** A block an extension adds (ADR 0062 d6), as `<extension>/<block>`. */
  | { kind: 'extension' }
  | { kind: 'list'; max: number; item: Record<string, Field> }
  /**
   * A file from the library (ADR 0047): a document, a sound or a video. A
   * sound or a video may instead be the address of a known service's page
   * (`embedOf`), and is then played by that service.
   */
  | { kind: 'file'; accept: 'document' | 'audio' | 'video' }
  /** A table: rows of cells, plain text each, the first row its headings when `header` (ADR 0047). */
  | { kind: 'table' }
  /** A box to tick: on or off. */
  | { kind: 'check' }
  /** One name from a closed list, or '' for none (ADR 0085 d4). */
  | { kind: 'choice'; options: readonly string[] };

export interface ImageValue {
  src: string;
  alt: string;
}
export interface LinkValue {
  label: string;
  href: string;
  /** Search engines are asked not to follow it: `rel="nofollow"` (ADR 0058 d6). */
  nofollow?: true;
}

/** The `rel` a link is drawn with: `nofollow` when the owner ticked it (ADR 0058 d6). */
export const relOf = (link: { nofollow?: true } | null | undefined): string | undefined => (link?.nofollow ? 'nofollow' : undefined);

/** A file a block uses: where it is, and the words a link to it shows. */
export interface FileValue {
  src: string;
  label: string;
}
export interface TableValue {
  header: boolean;
  rows: string[][];
}
export const TABLE_MAX_ROWS = 60;
export const TABLE_MAX_COLUMNS = 8;
/** How long a code block may be (ADR 0067): a long file, not a whole program. */
export const CODE_MAX = 20000;

/** A code block's language as it may name it in a class (ADR 0067): `sh`, `ts`, `c++`; '' for anything else. */
export const codeLanguage = (raw: unknown): string => {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return /^[a-z0-9][a-z0-9+#.-]{0,39}$/.test(value) ? value : '';
};

/** A link a visitor can follow: it has words and an address. */
export const isLink = (v: LinkValue | null | undefined): v is LinkValue => !!v && !!v.label && !!v.href;

export interface BlockDef {
  /** Holds other blocks in `children`. */
  container?: true;
  fields: Record<string, Field>;
  /** What a block of this type holds when the author adds it. */
  create: () => Record<string, unknown>;
}

/** The proportions a group's columns take (ADR 0085 d4): each number is a column's share. */
export const GROUP_COLUMNS = ['1-1', '1-2', '2-1', '1-1-1', '1-1-1-1'] as const;
export type GroupColumns = (typeof GROUP_COLUMNS)[number];
/** How many columns a proportion has. */
export const columnCount = (columns: unknown): number => (typeof columns === 'string' && (GROUP_COLUMNS as readonly string[]).includes(columns) ? columns.split('-').length : 1);

const text = (max = 300): Field => ({ kind: 'text', max });
const multiline = (max = 2000): Field => ({ kind: 'text', max, multiline: true });
const common = (max = 300): Field => ({ kind: 'text', max, common: true });

export const BLOCKS = {
  hero: {
    fields: {
      eyebrow: text(120),
      title: text(200),
      subtitle: multiline(600),
      image: { kind: 'image' },
      action: { kind: 'link' },
      secondaryAction: { kind: 'link' },
    },
    create: () => ({ title: 'A headline that says what you do', subtitle: 'One or two sentences that say for whom.' }),
  },
  text: {
    fields: { body: { kind: 'richtext' } },
    create: () => ({ body: paragraphs('Write here.') }),
  },
  image: {
    fields: { image: { kind: 'image' }, caption: text(300) },
    create: () => ({}),
  },
  services: {
    fields: {
      title: text(200),
      intro: multiline(600),
      items: { kind: 'list', max: 24, item: { title: text(120), text: multiline(600) } },
    },
    create: () => ({
      title: 'What we do',
      items: [
        { title: 'First service', text: 'What it is, in a sentence.' },
        { title: 'Second service', text: 'What it is, in a sentence.' },
        { title: 'Third service', text: 'What it is, in a sentence.' },
      ],
    }),
  },
  contact: {
    fields: { title: text(200), text: multiline(600), email: common(254), phone: common(40), address: multiline(300) },
    create: () => ({ title: 'Get in touch' }),
  },
  /** A form a visitor writes to the owner with (ADR 0049): it names a form built on the Forms screen, and may say a few words above it. */
  form: {
    fields: { form: { kind: 'form' }, title: text(200), intro: multiline(600) },
    create: () => ({ form: 'contact', title: 'Write to us' }),
  },
  /**
   * A block an installed extension adds (ADR 0062 d6): a form drawn with the
   * theme and posted to the extension. It names the block and may say a few
   * words above it.
   */
  extension: {
    fields: { block: { kind: 'extension' }, title: text(200), intro: multiline(600) },
    create: () => ({ block: '' }),
  },
  /** A search field (ADR 0042): the site's runtime answers it with the pages that match. */
  search: {
    fields: { title: text(200), placeholder: text(120), button: text(60) },
    create: () => ({ placeholder: 'Search this site', button: 'Search' }),
  },
  /** Buttons in a row (ADR 0047): the first stands out, the others are quieter. */
  buttons: {
    fields: { items: { kind: 'list', max: 6, item: { action: { kind: 'link' } } } },
    create: () => ({ items: [{ action: { label: 'Get in touch', href: '' } }, { action: { label: 'See our work', href: '' } }] }),
  },
  /** A table of plain text (ADR 0047): prices, opening hours, a comparison. */
  table: {
    fields: { title: text(200), table: { kind: 'table' }, caption: text(300) },
    create: () => ({
      table: {
        header: true,
        rows: [
          ['Day', 'Hours'],
          ['Monday to Friday', '9:00 – 18:00'],
          ['Saturday', '10:00 – 14:00'],
        ],
      },
    }),
  },
  /**
   * Code, or any text that keeps its lines and spaces (ADR 0067): a command to
   * type, a file to copy. Drawn as written, in a fixed-width font, never run
   * and never translated; the language only names it.
   */
  code: {
    fields: { title: text(200), code: { kind: 'text', max: CODE_MAX, multiline: true, common: true, code: true }, language: common(40), caption: text(300) },
    create: () => ({ code: 'uhlaka --help', language: 'sh' }),
  },
  /** A player from another service (ADR 0047): a video, a song, a map, from the address the author pastes. */
  embed: {
    fields: { url: common(2000), title: text(200), caption: text(300) },
    create: () => ({}),
  },
  /** A video: one from the library, or from YouTube or Vimeo (ADR 0047). */
  video: {
    fields: { video: { kind: 'file', accept: 'video' }, title: text(200), poster: { kind: 'image' }, caption: text(300) },
    create: () => ({}),
  },
  /** Sound: a file from the library, or from Spotify or SoundCloud (ADR 0047). */
  audio: {
    fields: { audio: { kind: 'file', accept: 'audio' }, title: text(200), caption: text(300) },
    create: () => ({}),
  },
  /** Documents to read or download (ADR 0047): a menu, a price list, a form to fill in. */
  files: {
    fields: { title: text(200), intro: multiline(600), items: { kind: 'list', max: 30, item: { file: { kind: 'file', accept: 'document' }, text: multiline(300) } } },
    create: () => ({ title: 'Documents', items: [] }),
  },
  gallery: {
    fields: {
      title: text(200),
      intro: multiline(600),
      images: { kind: 'list', max: 48, item: { image: { kind: 'image' }, caption: text(300) } },
    },
    create: () => ({ title: 'Our work', images: [] }),
  },
  faq: {
    fields: {
      title: text(200),
      intro: multiline(600),
      items: { kind: 'list', max: 40, item: { question: text(300), answer: multiline(3000) } },
    },
    create: () => ({
      title: 'Questions people ask',
      items: [
        { question: 'A question people ask often?', answer: 'The answer, in a few sentences.' },
        { question: 'Another question?', answer: 'Its answer.' },
      ],
    }),
  },
  testimonials: {
    fields: {
      title: text(200),
      items: { kind: 'list', max: 24, item: { quote: multiline(1000), name: text(120), role: text(120), photo: { kind: 'image' } } },
    },
    create: () => ({
      title: 'What clients say',
      items: [
        { quote: 'What a client said about working with you, in their words.', name: 'A client', role: 'Their company' },
        { quote: 'Another client, another sentence.', name: 'Another client', role: '' },
      ],
    }),
  },
  pricing: {
    fields: {
      title: text(200),
      intro: multiline(600),
      plans: {
        kind: 'list',
        max: 6,
        item: { name: text(120), price: common(40), period: text(40), text: multiline(600), features: multiline(2000), action: { kind: 'link' } },
      },
    },
    create: () => ({
      title: 'Prices',
      plans: [
        { name: 'Basic', price: '€100', period: 'per month', features: 'What is included\nAnother thing' },
        { name: 'Full', price: '€200', period: 'per month', features: 'Everything in Basic\nOne more thing' },
      ],
    }),
  },
  entries: {
    fields: { title: text(200), source: { kind: 'source' }, count: { kind: 'number', min: 1, max: 24 }, more: text(80), related: { kind: 'check' } },
    create: () => ({ title: 'Latest posts', source: POSTS_TYPE, count: 3, more: 'See all', related: false }),
  },
  /** The months of a dated type, newest first, each with how many entries it holds and a link to them (ADR 0056 d4); or its years. */
  archive: {
    fields: { title: text(200), source: { kind: 'source' }, years: { kind: 'check' } },
    create: () => ({ title: 'Archive', source: POSTS_TYPE, years: false }),
  },
  /** A part of the entry being shown, on the page a content type designs for its entries (ADR 0015). Draws nothing anywhere else. */
  entry: {
    fields: { part: { kind: 'part' } },
    create: () => ({ part: 'header' }),
  },
  /** A section (ADR 0033): its blocks, written once, shown here. */
  section: {
    fields: { section: { kind: 'section' } },
    create: () => ({ section: '' }),
  },
  /**
   * Blocks held together (ADR 0085 d4): one under another, or each as a
   * column in one of a few proportions, with a picture behind them if wanted.
   */
  group: {
    container: true,
    fields: { columns: { kind: 'choice', options: GROUP_COLUMNS }, reverse: { kind: 'check' }, image: { kind: 'image' } },
    create: () => ({}),
  },
} as const satisfies Record<string, BlockDef>;

export type BlockType = keyof typeof BLOCKS;

/**
 * The parts of an entry a page can show: everything above its own blocks as
 * the default page draws it (`header`), each piece of that alone, the
 * entry's own blocks (`body`), the entries linked to it (`related`, ADR 0052
 * d3), a product's price and "Add to cart" (`buy`, ADR 0065 d3), or one field
 * of its type (`field:client`).
 */
export const ENTRY_PARTS = ['header', 'title', 'meta', 'cover', 'fields', 'body', 'related', 'buy'] as const;
export const ENTRY_PART = /^(header|title|meta|cover|fields|body|related|buy|field:[a-z0-9_]{1,40})$/;

/** What a type's page starts as when the owner first opens it: the default page, as blocks to change. */
export const defaultTemplate = (): Block[] => [
  { id: newId(), type: 'entry', content: { part: 'header' } },
  { id: newId(), type: 'entry', content: { part: 'body' } },
];
export const BLOCK_TYPES = Object.keys(BLOCKS) as BlockType[];

/** How an extension block is named (ADR 0062 d6): the extension's name and the block's. */
export const EXTENSION_BLOCK = /^[a-z][a-z0-9-]{1,39}\/[a-z][a-z0-9-]{1,39}$/;

export const isBlockType = (v: unknown): v is BlockType => typeof v === 'string' && Object.hasOwn(BLOCKS, v);

export const isContainerType = (type: BlockType): boolean => (BLOCKS[type] as BlockDef).container === true;

export interface Block {
  id: string;
  type: BlockType;
  /** What the block says. Never a colour, a size or markup. */
  content: Record<string, unknown>;
  /** How this block departs from the theme. Left out when empty. */
  style?: BlockStyle;
  /** One of the theme's named variants for this type. */
  variant?: string;
  /** Only on a container. */
  children?: Block[];
}

const MAX_BLOCKS = 500;
/** How deep blocks nest: a block at the top is at depth 1. */
export const MAX_DEPTH = 4;

/**
 * A file a block may use, or null (ADR 0047). From the library, only a file of
 * the kind the field takes; a sound or a video may also be a known service's
 * address; a document may also be any address a link may lead to.
 */
export function cleanFile(accept: 'document' | 'audio' | 'video', raw: unknown): FileValue | null {
  const src = isObject(raw) ? safeHref(raw.src) : '';
  const label = isObject(raw) ? str(raw.label, 200).replace(/\s*\n\s*/g, ' ').trim() : '';
  if (!src) return null;
  const stored = mediaNameOf(src);
  if (stored) return mediaKindOf(stored) === accept ? { src, label } : null;
  if (src.startsWith('/media/')) return null;
  if (accept === 'document') return /^(https?:\/\/|\/)/i.test(src) ? { src, label } : null;
  return embedOf(src)?.kind === accept ? { src, label } : null;
}

/** A table, cleaned: every row as wide as the widest, plain text in each cell, at least one cell. */
export function cleanTable(raw: unknown): TableValue {
  const header = isObject(raw) ? raw.header !== false : true;
  const given = isObject(raw) && Array.isArray(raw.rows) ? raw.rows.slice(0, TABLE_MAX_ROWS) : [];
  const rows = given.map((row) => (Array.isArray(row) ? row.slice(0, TABLE_MAX_COLUMNS).map((cell) => str(cell, 500).replace(/\s*\n\s*/g, ' ')) : []));
  const width = Math.max(1, ...rows.map((row) => row.length));
  const filled = rows.map((row) => [...row, ...Array<string>(width - row.length).fill('')]);
  return { header, rows: filled.length ? filled : [Array<string>(width).fill('')] };
}

/** An image a page may show, or null: its address is checked, its description cut to length. */
export function cleanImage(raw: unknown): ImageValue | null {
  const src = isObject(raw) ? safeSrc(raw.src) : '';
  return src ? { src, alt: str((raw as Record<string, unknown>).alt, 300) } : null;
}

/**
 * A link, or null. Kept while half filled in (a label with no address yet), so
 * an author does not lose what they typed; `isLink` says when it can be followed.
 */
export function cleanLink(raw: unknown): LinkValue | null {
  const label = isObject(raw) ? str(raw.label, 80).trim() : '';
  const href = isObject(raw) ? safeHref(raw.href) : '';
  const nofollow = isObject(raw) && raw.nofollow === true && !!href;
  return label || href ? { label, href, ...(nofollow ? { nofollow: true as const } : {}) } : null;
}

function cleanField(field: Field, raw: unknown): unknown {
  switch (field.kind) {
    case 'text': {
      const value = str(raw, field.max ?? 300);
      // Code keeps every line and space as written, but not the blank lines around it (ADR 0067).
      if (field.code) return value.replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
      return field.multiline ? value : value.replace(/\s*\n\s*/g, ' ');
    }
    case 'richtext':
      return normalizeRichText(raw);
    case 'image':
      return cleanImage(raw);
    case 'link':
      return cleanLink(raw);
    case 'source':
      return slugify(raw) || POSTS_TYPE;
    case 'section':
      return slugify(raw);
    case 'form':
      return slugify(raw).slice(0, 60) || 'contact';
    case 'extension': {
      const value = str(raw, 81);
      return EXTENSION_BLOCK.test(value) ? value : '';
    }
    case 'part': {
      const value = str(raw, 60);
      return ENTRY_PART.test(value) ? value : 'header';
    }
    case 'number': {
      const n = Math.round(Number(raw));
      return Number.isFinite(n) ? Math.min(field.max, Math.max(field.min, n)) : field.min;
    }
    case 'list':
      return Array.isArray(raw)
        ? raw.slice(0, field.max).map((item) => cleanFields(field.item, isObject(item) ? item : {}))
        : [];
    case 'file':
      return cleanFile(field.accept, raw);
    case 'table':
      return cleanTable(raw);
    case 'check':
      return raw === true;
    case 'choice':
      return typeof raw === 'string' && field.options.includes(raw) ? raw : '';
  }
}

function cleanFields(fields: Record<string, Field>, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) out[name] = cleanField(field, raw[name]);
  return out;
}

/**
 * Untrusted input as clean blocks. A block of an unknown type is dropped and
 * reported, a content key the type does not declare is dropped silently, and
 * every block leaves with an id that is unique in the tree.
 */
export function normalizeBlocks(input: unknown): { blocks: Block[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  let count = 0;

  const walk = (list: unknown, path: string, depth: number): Block[] => {
    if (!Array.isArray(list)) return [];
    const out: Block[] = [];
    list.forEach((raw, i) => {
      const at = `${path}[${i}]`;
      if (!isObject(raw) || !isBlockType(raw.type)) {
        issues.push({ path: at, message: 'not a known block type' });
        return;
      }
      if (++count > MAX_BLOCKS) {
        if (count === MAX_BLOCKS + 1) issues.push({ path: at, message: `a page holds at most ${MAX_BLOCKS} blocks` });
        return;
      }
      const def: BlockDef = BLOCKS[raw.type];
      const id = isId(raw.id) && !seen.has(raw.id) ? raw.id : newId();
      seen.add(id);
      const block: Block = {
        id,
        type: raw.type,
        content: cleanFields(def.fields, isObject(raw.content) ? raw.content : {}),
      };
      const { style, issues: found } = normalizeStyle(raw.style, `${at}.style`);
      issues.push(...found);
      if (Object.keys(style).length) block.style = style;
      if (isTokenName(raw.variant)) block.variant = raw.variant;
      if (def.container) {
        if (depth >= MAX_DEPTH) issues.push({ path: at, message: `blocks nest at most ${MAX_DEPTH} deep` });
        block.children = depth >= MAX_DEPTH ? [] : walk(raw.children, `${at}.children`, depth + 1);
      }
      out.push(block);
    });
    return out;
  };

  return { blocks: walk(input, 'blocks', 1), issues };
}

/** A new block of this type, as the editor adds it. */
export function createBlock(type: BlockType): Block {
  const def: BlockDef = BLOCKS[type];
  const { blocks } = normalizeBlocks([{ type, content: def.create(), children: [] }]);
  return blocks[0] as Block;
}

function fieldText(field: Field, value: unknown): string {
  switch (field.kind) {
    case 'text':
      // Code is not words: it stays out of a description and an excerpt (ADR 0067).
      return typeof value === 'string' && !field.code ? value : '';
    case 'richtext':
      return richTextPlain((value as RichText) ?? []);
    case 'list':
      return Array.isArray(value)
        ? value.map((item) => Object.entries(field.item).map(([k, f]) => fieldText(f, (item as Record<string, unknown>)[k])).join(' ')).join(' ')
        : '';
    case 'table':
      return isObject(value) && Array.isArray(value.rows) ? (value.rows as string[][]).map((row) => row.join(' ')).join(' ') : '';
    case 'file':
      return isObject(value) && typeof value.label === 'string' ? value.label : '';
    default:
      return '';
  }
}

/** The words of a page, for a meta description or a search index. */
export function blocksText(blocks: Block[], max = 160): string {
  const parts: string[] = [];
  const walk = (list: Block[]): void => {
    for (const b of list) {
      const def: BlockDef = BLOCKS[b.type];
      for (const [name, field] of Object.entries(def.fields)) parts.push(fieldText(field, b.content[name]));
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return cutAt(parts.join(' ').replace(/\s+/g, ' ').trim(), max);
}

/** Each run of words a field holds on its own: a line of text, each paragraph, heading or list item of rich text. */
function fieldPieces(field: Field, value: unknown): string[] {
  if (field.kind === 'richtext') return ((value as RichText) ?? []).flatMap((node) => (node.type === 'list' ? node.items.map((item) => richTextPlain([{ type: 'paragraph', children: item }])) : [richTextPlain([node])]));
  if (field.kind === 'list') return Array.isArray(value) ? value.flatMap((item) => Object.entries(field.item).flatMap(([k, f]) => fieldPieces(f, (item as Record<string, unknown>)[k]))) : [];
  return [fieldText(field, value)];
}

/**
 * The description the site writes for a page that has none (ADR 0058 d1):
 * its words, each heading or line ended as a sentence, so that a title does
 * not run into the paragraph under it, cut where a description ends.
 */
export function describeBlocks(blocks: Block[], max = 160): string {
  const pieces: string[] = [];
  const walk = (list: Block[]): void => {
    for (const b of list) {
      const def: BlockDef = BLOCKS[b.type];
      for (const [name, field] of Object.entries(def.fields)) pieces.push(...fieldPieces(field, b.content[name]));
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  const sentences = pieces
    .map((piece) => piece.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((piece) => (/[.!?…:;]$/.test(piece) ? piece : `${piece}.`));
  return cutAt(sentences.join(' '), max);
}

/**
 * At most `max` letters of `text`: whole sentences when the first ones fill at
 * least half of it, or else whole words and "…" (ADR 0058 d1). A sentence ends
 * at ".", "!" or "?" followed by a space.
 */
export function cutAt(text: string, max: number): string {
  if (text.length <= max) return text;
  const within = text.slice(0, max + 1);
  let end = -1;
  for (const match of within.matchAll(/[.!?…](?=\s)/g)) end = match.index + 1;
  if (end >= max / 2) return text.slice(0, end);
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** The address of every image on a page, as written: for knowing which stored images a page uses. */
export function imageSources(blocks: Block[]): string[] {
  const out: string[] = [];
  const collect = (fields: Record<string, Field>, content: Record<string, unknown>): void => {
    for (const [name, field] of Object.entries(fields)) {
      const value = content[name];
      if (field.kind === 'image' && isObject(value) && typeof value.src === 'string') out.push(value.src);
      else if (field.kind === 'list' && Array.isArray(value)) for (const item of value) if (isObject(item)) collect(field.item, item);
    }
  };
  const walk = (list: Block[]): void => {
    for (const b of list) {
      collect((BLOCKS[b.type] as BlockDef).fields, b.content);
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/** The addresses a page links to or plays, in its link and file fields and its rich text: a file from the library among them (ADR 0046, 0047). */
export function linkTargets(blocks: Block[]): string[] {
  const out: string[] = [];
  const text = (doc: RichText): void => {
    for (const node of doc) {
      const lines = node.type === 'list' ? node.items : [node.children];
      for (const line of lines) for (const span of line) if (span.href) out.push(span.href);
    }
  };
  const collect = (fields: Record<string, Field>, content: Record<string, unknown>): void => {
    for (const [name, field] of Object.entries(fields)) {
      const value = content[name];
      if (field.kind === 'link' && isObject(value) && typeof value.href === 'string' && value.href) out.push(value.href);
      else if (field.kind === 'file' && isObject(value) && typeof value.src === 'string' && value.src) out.push(value.src);
      else if (field.kind === 'richtext' && Array.isArray(value)) text(value as RichText);
      else if (field.kind === 'list' && Array.isArray(value)) for (const item of value) if (isObject(item)) collect(field.item, item);
    }
  };
  const walk = (list: Block[]): void => {
    for (const b of list) {
      collect((BLOCKS[b.type] as BlockDef).fields, b.content);
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/** Every file of the library a page needs: the images it shows and the files it links to (ADR 0046). */
export const mediaSources = (blocks: Block[]): string[] => [...imageSources(blocks), ...linkTargets(blocks).filter((href) => href.startsWith('/media/'))];
