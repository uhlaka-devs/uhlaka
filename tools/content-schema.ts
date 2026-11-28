/**
 * The JSON Schema of a Uhlaka content file (`uhlaka.content/1`, ADR 0057), for
 * whoever writes one by hand or with an AI: a whole site, ready at its first
 * start, brought in by `uhlaka import` or the import screen.
 *
 * The blocks are made from the core's own list (`BLOCKS`), so a block type or
 * a field added there is in the schema the next time this runs, and
 * `test/content-schema.test.ts` fails while the file in docs/ is behind.
 *
 *   bun tools/content-schema.ts      writes docs/content-schema.json
 */
import { BLOCKS, type BlockDef, COUPON_CODE_MAX, COUPON_KINDS, ENTRY_PARTS, MAX_COMBINATIONS, MAX_PRODUCT_OPTIONS, MAX_SHIPPING, MAX_VALUES, ORDER_STATES, type Field, FORM_FIELD_KINDS, MARKS, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, TYPE_FIELD_KINDS } from '../src/core/index.ts';
import { CONTENT_FORMAT } from '../src/site/transfer.ts';

type Schema = Record<string, unknown>;

const SLUG = '^[a-z0-9]+(?:-[a-z0-9]+)*$';
const LANGUAGE = '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$';

const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });

/** What one field of a block holds, as `cleanField` in src/core/blocks.ts keeps it. */
function fieldSchema(field: Field): Schema {
  switch (field.kind) {
    case 'text':
      return {
        type: 'string',
        maxLength: field.max ?? 300,
        ...(field.code ? { description: 'Kept line by line, in a fixed-width font; never translated.' } : field.multiline ? { description: 'Line breaks are kept.' } : {}),
      };
    case 'richtext':
      return ref('richText');
    case 'image':
      return nullable(ref('image'));
    case 'link':
      return nullable(ref('link'));
    case 'source':
      return { type: 'string', pattern: SLUG, description: "A content type's id: `posts`, or one the file or the site defines." };
    case 'section':
      return { type: 'string', pattern: SLUG, description: 'The slug of a section in `sections`.' };
    case 'form':
      return { type: 'string', pattern: SLUG, maxLength: 60, description: 'The name of a form in `forms`; `contact` is made for every site.' };
    case 'extension':
      return { type: 'string', pattern: '^[a-z][a-z0-9-]{1,39}/[a-z][a-z0-9-]{1,39}$', description: '`<extension>/<block>`, from an extension installed on the site.' };
    case 'part':
      return { type: 'string', pattern: `^(${ENTRY_PARTS.join('|')}|field:[a-z0-9_]{1,40})$` };
    case 'number':
      return { type: 'integer', minimum: field.min, maximum: field.max };
    case 'list':
      return { type: 'array', maxItems: field.max, items: fieldsObject(field.item) };
    case 'file':
      return nullable({ ...ref('file'), description: field.accept === 'document' ? 'A document from the library, or any address.' : `A ${field.accept} file from the library, or the address of a page on a service that plays it.` });
    case 'table':
      return ref('table');
    case 'check':
      return { type: 'boolean' };
  }
}

const fieldsObject = (fields: Record<string, Field>): Schema => ({
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, fieldSchema(field)])),
});

/** One block type: its content, and children when it holds other blocks. */
function blockSchema(type: string, def: BlockDef): Schema {
  return {
    type: 'object',
    required: ['type', 'content'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', description: 'Optional: made when absent.' },
      type: { const: type },
      content: fieldsObject(def.fields),
      variant: { type: 'string', description: "One of the theme's variants for this type." },
      style: { type: 'object', description: "How the block departs from the theme (theme tokens only). Leave it out: the theme's look is the point." },
      ...(def.container ? { children: { type: 'array', items: ref('block') } } : {}),
    },
  };
}

const docSchema = (draft: Schema, description: string): Schema => ({
  type: 'object',
  description,
  required: ['slug', 'draft'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string', description: "The address. '' is the home page (pages only)." },
    draft: draft,
    published: { ...nullable(draft), description: 'What visitors see. Usually the same as `draft`; null or absent leaves it a draft.' },
    scheduled: { type: 'string', format: 'date-time', description: 'Published then, by the site.' },
    author: { type: 'string', description: 'A key into `people`.' },
  },
});

const seo = {
  seoTitle: { type: 'string', maxLength: 70, description: 'The title search engines and previews show, when it differs from the title.' },
  shareImage: ref('image'),
  noindex: { const: true },
};

export function contentSchema(): Schema {
  const blocks = Object.entries(BLOCKS as Record<string, BlockDef>);
  const span = {
    type: 'object',
    required: ['text'],
    additionalProperties: false,
    properties: { text: { type: 'string', minLength: 1 }, marks: { type: 'array', items: { enum: [...MARKS] } }, href: { type: 'string' }, nofollow: { const: true } },
  };
  const spans = { type: 'array', items: ref('span') };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: `A Uhlaka content file (${CONTENT_FORMAT})`,
    description:
      'A site, or part of one, in one file: what `uhlaka import <site.db> <file>` and the import screen take. Made from src/core by tools/content-schema.ts; do not edit by hand. Every value is cleaned again by the program when it comes in: what this schema forbids is dropped there, not trusted.',
    type: 'object',
    required: ['format', 'from', 'types', 'people', 'comments', 'media'],
    properties: {
      format: { const: CONTENT_FORMAT },
      program: { type: 'string', description: 'What wrote it: `uhlaka 0.1.0`, or the name of the tool or agent.' },
      madeAt: { type: 'string', format: 'date-time' },
      parts: { type: 'array', items: { type: 'string' }, description: '`pages`, `sections`, `forms`, `design`, `type:<id>`, `shop`, `orders`. Shown on the import screen.' },
      from: {
        type: 'object',
        required: ['name', 'language'],
        properties: { name: { type: 'string' }, url: { type: 'string' }, language: { type: 'string', pattern: LANGUAGE }, languages: { type: 'array', items: { type: 'string', pattern: LANGUAGE } } },
      },
      settings: ref('settings'),
      theme: {
        type: 'object',
        description: 'Taken only into a site with no pages yet. A theme is a document: start from one in themes/.',
        properties: { draft: nullable({ type: 'object' }), published: nullable({ type: 'object' }) },
      },
      layouts: { type: 'array', items: { type: 'object' }, description: "The site's layouts (ADR 0035). Leave it out for the ready ones." },
      redirects: { type: 'array', items: { type: 'object', required: ['from', 'to'], properties: { from: { type: 'string' }, to: { type: 'string' } } } },
      pages: { type: 'array', items: docSchema(ref('page'), 'A page.') },
      sections: { type: 'array', items: docSchema(ref('section'), 'Blocks written once and shown on many pages by a `section` block (ADR 0033).') },
      forms: { type: 'array', items: ref('form') },
      types: { type: 'array', items: ref('typePart'), description: 'Each kind of entry with its entries. `posts` is in every site; give it here to bring posts.' },
      people: {
        type: 'array',
        description: 'Who wrote the entries, as the site shows them. Never an account or a password.',
        items: { type: 'object', required: ['key', 'email', 'name'], properties: { key: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, bio: { type: 'string' }, picture: { type: 'string' } } },
      },
      comments: { type: 'array', items: { type: 'object' }, description: 'Approved comments. Usually empty in a new site.' },
      shop: ref('shop'),
      orders: { type: 'array', items: { type: 'object' }, description: `The shop's orders, as another Uhlaka site exported them (states: ${ORDER_STATES.join(', ')}). They name their buyers: never write them by hand.` },
      media: {
        type: 'array',
        description: 'Files carried in the file. A new site may leave it empty and use https addresses for pictures.',
        items: { type: 'object', required: ['label', 'data'], properties: { name: { type: 'string' }, label: { type: 'string' }, alt: { type: 'string', description: 'For a picture: the words offered for people who cannot see it (ADR 0072).' }, data: { type: 'string', contentEncoding: 'base64' }, variants: { type: 'array', items: { type: 'string', contentEncoding: 'base64' } } } },
      },
    },
    $defs: {
      image: { type: 'object', required: ['src', 'alt'], additionalProperties: false, properties: { src: { type: 'string', pattern: '^(https?://|/)', description: 'https://… or /media/…' }, alt: { type: 'string', maxLength: 300, description: 'What the picture shows, for someone who cannot see it.' } } },
      link: { type: 'object', required: ['label', 'href'], additionalProperties: false, properties: { label: { type: 'string', maxLength: 80 }, href: { type: 'string', description: '/a-page/, https://…, mailto:, tel:' }, nofollow: { const: true } } },
      file: { type: 'object', required: ['src', 'label'], additionalProperties: false, properties: { src: { type: 'string' }, label: { type: 'string' } } },
      table: {
        type: 'object',
        required: ['header', 'rows'],
        additionalProperties: false,
        properties: { header: { type: 'boolean', description: 'The first row is the headings.' }, rows: { type: 'array', maxItems: TABLE_MAX_ROWS, items: { type: 'array', maxItems: TABLE_MAX_COLUMNS, items: { type: 'string' } } } },
      },
      span,
      richText: {
        type: 'array',
        description: 'Text as typed nodes, never HTML.',
        items: {
          oneOf: [
            { type: 'object', required: ['type', 'children'], additionalProperties: false, properties: { type: { const: 'paragraph' }, children: spans } },
            { type: 'object', required: ['type', 'level', 'children'], additionalProperties: false, properties: { type: { const: 'heading' }, level: { enum: [2, 3, 4] }, children: spans } },
            { type: 'object', required: ['type', 'children'], additionalProperties: false, properties: { type: { const: 'quote' }, children: spans } },
            { type: 'object', required: ['type', 'ordered', 'items'], additionalProperties: false, properties: { type: { const: 'list' }, ordered: { type: 'boolean' }, items: { type: 'array', items: spans } } },
          ],
        },
      },
      block: { oneOf: blocks.map(([type]) => ref(`block-${type}`)) },
      ...Object.fromEntries(blocks.map(([type, def]) => [`block-${type}`, blockSchema(type, def)])),
      page: {
        type: 'object',
        required: ['title', 'blocks'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string', description: 'For search engines and previews; empty: taken from the words.' },
          inMenu: { type: 'boolean', description: 'In the menu the site makes while `settings.menu` is null.' },
          blocks: { type: 'array', items: ref('block') },
          layout: { type: 'string' },
          translations: { type: 'object', description: 'The page in the other languages, by language (ADR 0032).' },
          ...seo,
        },
      },
      section: { type: 'object', required: ['blocks'], properties: { title: { type: 'string' }, blocks: { type: 'array', items: ref('block') } } },
      money: { anyOf: [{ type: 'integer', minimum: 0, description: 'In the smallest unit: 4999 is 49.99.' }, { type: 'string', pattern: '^\\d{1,9}([.,]\\d{1,2})?$', description: 'As typed: "49.99" or "49,99".' }] },
      product: {
        type: 'object',
        description: 'What an entry of a type that `sells` is sold at (ADR 0065 d2). Prices include VAT.',
        properties: {
          price: ref('money'),
          sale: { ...ref('money'), description: 'The price it is sold at for now; below `price`.' },
          sku: { type: 'string', maxLength: 60 },
          weight: { anyOf: [{ type: 'integer', minimum: 1, maximum: 1000000, description: 'In grams: 500 is half a kilogram.' }, { type: 'string', pattern: '^\\d{1,4}([.,]\\d{1,3})?$', description: 'In kilograms, as typed: "0.5" or "0,5".' }] },
          vat: { type: 'number', minimum: 0, maximum: 100, description: "One of the shop's rates; left out, the first." },
          counted: { type: 'boolean', description: "Its stock is counted: give it in `shop.stock`." },
          options: {
            type: 'array',
            maxItems: MAX_PRODUCT_OPTIONS,
            description: `What it is sold in: \`{ "name": "Size", "values": ["S", "M"] }\`. At most ${MAX_COMBINATIONS} combinations.`,
            items: { type: 'object', required: ['name', 'values'], properties: { name: { type: 'string', maxLength: 40 }, values: { type: 'array', maxItems: MAX_VALUES, items: { type: 'string', maxLength: 40 } } } },
          },
          variants: { type: 'object', description: 'By combination (`M / Red`): its own price, sale, sku and weight, when they differ.' },
        },
      },
      shop: {
        type: 'object',
        description: "The shop (ADR 0065): its settings, taken with the old site's settings; what is left of each product counted, and the coupons, brought into a shop that is on.",
        properties: {
          settings: {
            type: 'object',
            description: 'Settings → Shop.',
            properties: {
              on: { type: 'boolean' },
              vat: { type: 'boolean', description: 'The site charges VAT.' },
              rates: { type: 'array', items: { type: 'number', minimum: 0, maximum: 100 } },
              transfer: { type: 'object', description: 'Paying by bank transfer.', properties: { on: { type: 'boolean' }, holder: { type: 'string' }, iban: { type: 'string' }, bank: { type: 'string' } } },
              cod: { type: 'boolean', description: 'Cash on delivery.' },
              shipping: {
                type: 'array',
                maxItems: MAX_SHIPPING,
                items: { type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 80 }, price: ref('money'), free: { ...ref('money'), description: 'Free from this much.' }, pickup: { type: 'string', description: 'Picked up at this address.' } } },
              },
              terms: { type: 'string', description: 'The terms page, as /terms/.' },
            },
          },
          stock: {
            type: 'array',
            items: { type: 'object', required: ['product', 'variant', 'quantity'], properties: { product: { type: 'string', description: '`<type>/<slug>`' }, variant: { type: 'string', description: "A combination (`M / Red`), or '' for the product." }, quantity: { type: 'integer', minimum: 0 } } },
          },
          coupons: {
            type: 'array',
            items: {
              type: 'object',
              required: ['code', 'kind', 'value'],
              description: 'A code a buyer types in the cart (ADR 0065 d8). One coupon an order; it takes off the products, never delivery.',
              properties: {
                code: { type: 'string', pattern: '^[A-Za-z0-9_-]+$', maxLength: COUPON_CODE_MAX },
                kind: { enum: [...COUPON_KINDS], description: '`percent`: `value` from 1 to 100; `amount`: `value` is a sum in the smallest unit.' },
                value: { type: 'integer', minimum: 1 },
                ends: { type: 'string', format: 'date', description: 'The last day it is taken; left out, it does not end.' },
                uses: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }], description: 'How many orders may use it; null for no limit.' },
                minimum: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }], description: 'The smallest sum of products, in the smallest unit.' },
              },
            },
          },
        },
      },
      entry: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          date: { type: 'string', format: 'date', description: 'YYYY-MM-DD, for a dated type.' },
          excerpt: { type: 'string' },
          cover: nullable(ref('image')),
          categories: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          fields: { type: 'object', description: "Values for the type's fields, by key." },
          product: ref('product'),
          blocks: { type: 'array', items: ref('block') },
          ...seo,
        },
      },
      contentType: {
        type: 'object',
        required: ['id', 'name', 'singular', 'path'],
        properties: {
          id: { type: 'string', pattern: SLUG },
          name: { type: 'string', description: '"Projects"' },
          singular: { type: 'string', description: '"Project"' },
          path: { type: 'string', pattern: SLUG, description: 'Its entries are at /<path>/<slug>/.' },
          dated: { type: 'boolean' },
          categories: { type: 'boolean' },
          feed: { type: 'boolean' },
          comments: { const: true },
          sells: { type: 'boolean', description: 'Its entries are products, each with a `product` (ADR 0065 d1). Only while the shop is on.' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              required: ['key', 'label', 'kind'],
              properties: { key: { type: 'string', pattern: '^[a-z0-9_]{1,40}$' }, label: { type: 'string' }, kind: { enum: [...TYPE_FIELD_KINDS] }, options: { type: 'array', items: { type: 'string' } }, to: { type: 'string' }, many: { const: true } },
            },
          },
        },
      },
      typePart: {
        type: 'object',
        required: ['type', 'entries'],
        properties: {
          type: ref('contentType'),
          template: { type: 'object', description: "The type's own page as blocks; null for the default one.", properties: { draft: nullable({ type: 'array', items: ref('block') }), published: nullable({ type: 'array', items: ref('block') }) } },
          entries: { type: 'array', items: docSchema(ref('entry'), 'An entry of the type.') },
        },
      },
      form: {
        type: 'object',
        required: ['name', 'title', 'fields', 'consent', 'button', 'sent', 'failed'],
        properties: {
          name: { type: 'string', pattern: SLUG, maxLength: 60 },
          title: { type: 'string' },
          fields: {
            type: 'array',
            maxItems: 30,
            items: {
              type: 'object',
              required: ['id', 'kind', 'label', 'required'],
              properties: { id: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,39}$', not: { enum: ['back', 'form', 'website', 'consent'] } }, kind: { enum: [...FORM_FIELD_KINDS] }, label: { type: 'string' }, required: { type: 'boolean' }, options: { type: 'array', items: { type: 'string' } } },
            },
          },
          consent: { type: 'string', description: 'What the visitor agrees to, ticked before anything is sent.' },
          button: { type: 'string' },
          sent: { type: 'string' },
          failed: { type: 'string' },
          translations: { type: 'object' },
        },
      },
      settings: {
        type: 'object',
        description: "The site's settings (the `Site` of src/core/page.ts). Taken only into a site with no pages yet; what is left out keeps its default.",
        required: ['name', 'language'],
        properties: {
          name: { type: 'string' },
          language: { type: 'string', pattern: LANGUAGE },
          languages: { type: 'array', items: { type: 'string', pattern: LANGUAGE }, description: 'The other languages, after `language`.' },
          url: { type: 'string', description: 'https://example.com, no trailing slash.' },
          logo: nullable(ref('image')),
          action: { ...nullable(ref('link')), description: 'The one button in the header.' },
          header: {
            type: 'object',
            description: 'What the header shows besides the logo, the menu and the button (ADR 0085 d3).',
            properties: {
              bar: { type: 'string', description: "The slug of a section shown in a bar above the header, such as a phone number and opening hours." },
              search: { type: 'boolean', description: 'A search in the header.' },
              cart: { type: 'boolean', description: 'A link to the cart in the header, while the shop is on.' },
            },
          },
          footer: { type: 'string' },
          footerLinks: { type: 'array', items: ref('link') },
          menu: { anyOf: [{ type: 'null' }, { type: 'array', items: { type: 'object' } }], description: 'null: the site makes the menu from the pages marked inMenu.' },
          types: { type: 'array', items: ref('contentType') },
          shareImage: ref('image'),
          business: { type: 'object', description: 'The business as a place people come to: address, hours (ADR 0061 d2).' },
        },
      },
    },
  };
}

/** The schema as the file in docs/ holds it. */
export const contentSchemaText = (): string => `${JSON.stringify(contentSchema(), null, 2)}\n`;

if (import.meta.main) {
  await Bun.write(new URL('../docs/content-schema.json', import.meta.url), contentSchemaText());
  console.log('Wrote docs/content-schema.json');
}
