/**
 * The shop's words about a product (ADR 0065 d1, d2): what an entry of a type
 * that sells carries besides the fields its owner defined. Only data here; the
 * shop itself (its stock, cart and orders) is the site's, loaded only while it
 * is on (ADR 0060 d3).
 *
 * Money is kept in the currency's smallest unit (bani, cents) as a whole
 * number, so that no sum is ever a fraction a computer rounds.
 */
import { isObject, str } from './util.ts';

/** An option a product is sold in (ADR 0065 d2): `Size`, with `S`, `M`, `L`. */
export interface ProductOption {
  name: string;
  values: string[];
}

/** What one combination of the options changes from the product: empty, the product's own. */
export interface ProductVariant {
  price: number | null;
  sale: number | null;
  sku: string;
  /** In grams (ADR 0079 d6); null: the product's. */
  weight: number | null;
}

export interface Product {
  /** With VAT included, in the smallest unit; null while the owner has not given one (it cannot be bought then). */
  price: number | null;
  /** The price it is sold at for now; null for none. */
  sale: number | null;
  sku: string;
  /** In grams, for a courier's price and AWB (ADR 0079 d6); null when not given. */
  weight: number | null;
  /** The VAT rate, as a percentage (ADR 0065 d5); null: the site's first rate, whatever it is then. */
  vat: number | null;
  /** Its stock is counted (in the shop's table, not here); otherwise it is always there. */
  counted: boolean;
  /** At most {@link MAX_PRODUCT_OPTIONS}, each with at most {@link MAX_VALUES} values. */
  options: ProductOption[];
  /** By the combination's key (`M / Red`): only those that change something. */
  variants: Record<string, ProductVariant>;
}

export const MAX_PRODUCT_OPTIONS = 3;
export const MAX_VALUES = 20;
/** The most combinations a product is sold in: more is a catalogue, not a product. */
export const MAX_COMBINATIONS = 100;
/** The VAT rates a site starts with (Romania, from August 2025). */
export const DEFAULT_RATES: readonly number[] = [21, 11, 0];
/** The most rates a site names. */
export const MAX_RATES = 6;
/** What a variant's key joins its values with. */
export const VARIANT_JOIN = ' / ';

/**
 * A sum as typed (`49,99`, `49.9`, `1 250`) or stored, in the smallest unit:
 * `4999`. Null for nothing, a negative sum or what is not a sum.
 */
export function moneyOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const typed = value.replace(/[\s ]/g, '');
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(typed);
  if (!match) return null;
  return Number(match[1]) * 100 + Number(((match[2] ?? '') + '00').slice(0, 2));
}

/** The most a product weighs, in grams: 1 000 kg. */
export const MAX_WEIGHT = 1_000_000;

/**
 * A weight as typed, in kilograms (`0,5`, `2`, `1.25`) or stored in grams
 * (a whole number): `500`. Null for nothing, nought or what is not a weight.
 */
export function weightOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 && value <= MAX_WEIGHT ? value : null;
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,4})(?:[.,](\d{1,3}))?$/.exec(value.replace(/[\s ]/g, '').replace(/kg$/i, ''));
  if (!match) return null;
  const grams = Number(match[1]) * 1000 + Number(((match[2] ?? '') + '000').slice(0, 3));
  return grams > 0 && grams <= MAX_WEIGHT ? grams : null;
}

/** A weight in grams as typed in a form, in kilograms: `500` → `0.5`. */
export const typedWeight = (grams: number | null): string => (grams === null ? '' : String(grams / 1000));

/** A sum in the smallest unit as typed in a form: `4999` → `49.99`, `5000` → `50`. */
export const typedMoney = (value: number | null): string => (value === null ? '' : value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2));

/** A sum as a visitor reads it, in the site's language and currency: `49,99 lei`. */
export function moneyText(value: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language || 'en', { style: 'currency', currency: currency || 'RON' }).format(value / 100);
  } catch {
    return `${(value / 100).toFixed(2)} ${currency}`;
  }
}

/** A VAT rate: a percentage from 0 to 100, with at most two decimals. */
const rateOf = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.trim().replace(',', '.')) : Number.NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
};

/** The site's VAT rates, each once, the first the one a new product takes. */
export function normalizeRates(input: unknown): number[] {
  const out: number[] = [];
  for (const raw of Array.isArray(input) ? input : []) {
    const rate = rateOf(raw);
    if (rate !== null && !out.includes(rate) && out.length < MAX_RATES) out.push(rate);
  }
  return out.length ? out : [...DEFAULT_RATES];
}

const word = (value: unknown, max = 40): string => str(value, max).replace(/\s+/g, ' ').replace(/\//g, '-').trim();

function cleanOptions(input: unknown): ProductOption[] {
  const out: ProductOption[] = [];
  let combinations = 1;
  for (const raw of Array.isArray(input) ? input : []) {
    if (!isObject(raw) || out.length >= MAX_PRODUCT_OPTIONS) continue;
    const name = word(raw.name);
    const given = Array.isArray(raw.values) ? raw.values : typeof raw.values === 'string' ? raw.values.split(/[\n,]/) : [];
    const values: string[] = [];
    for (const v of given) {
      const value = word(v);
      if (value && !values.includes(value) && values.length < MAX_VALUES) values.push(value);
    }
    if (!name || !values.length || out.some((o) => o.name === name) || combinations * values.length > MAX_COMBINATIONS) continue;
    combinations *= values.length;
    out.push({ name, values });
  }
  return out;
}

/** Every combination of a product's options, in the order they are offered: `S / Red`, `S / Blue`, `M / Red`… None without options. */
export function combinations(options: ProductOption[]): string[] {
  if (!options.length) return [];
  let out: string[][] = [[]];
  for (const option of options) out = out.flatMap((before) => option.values.map((value) => [...before, value]));
  return out.map((values) => values.join(VARIANT_JOIN));
}

/**
 * Untrusted input as a product's shop data (ADR 0065 d2). A sale price that is not below the price
 * is no sale; a variant that changes nothing is not kept.
 */
export function normalizeProduct(input: unknown): Product {
  const raw = isObject(input) ? input : {};
  const price = moneyOf(raw.price);
  const sale = moneyOf(raw.sale);
  const vat = rateOf(raw.vat);
  const options = cleanOptions(raw.options);
  const keys = new Set(combinations(options));
  const variants: Record<string, ProductVariant> = {};
  for (const [key, given] of Object.entries(isObject(raw.variants) ? raw.variants : {})) {
    if (!keys.has(key) || !isObject(given)) continue;
    const own = { price: moneyOf(given.price), sale: moneyOf(given.sale), sku: str(given.sku, 60).trim(), weight: weightOf(given.weight) };
    const base = own.price ?? price;
    if (own.sale !== null && (base === null || own.sale >= base)) own.sale = null;
    if (own.price !== null || own.sale !== null || own.sku || own.weight !== null) variants[key] = own;
  }
  return {
    price,
    sale: sale !== null && price !== null && sale < price ? sale : null,
    sku: str(raw.sku, 60).trim(),
    weight: weightOf(raw.weight),
    vat,
    counted: raw.counted === true,
    options,
    variants,
  };
}

/** A product with nothing given yet: what a new entry of a type that sells starts with. */
export const emptyProduct = (): Product => normalizeProduct({});

/** The rate a product is taxed at: its own while the site still names it, otherwise the site's first. */
export const rateFor = (product: Product, rates: readonly number[]): number => (product.vat !== null && rates.includes(product.vat) ? product.vat : (rates[0] ?? 0));

/** Where the stock of a product, or of one combination of it, is kept: `products/mug`, `products/tee#M / Red`. */
export const stockKey = (type: string, slug: string, variant = ''): string => (variant ? `${type}/${slug}#${variant}` : `${type}/${slug}`);

/** What one combination costs, and is sold at: its own price, or the product's. */
export function priceOf(product: Product, variant = ''): { price: number | null; sale: number | null; sku: string } {
  const own = variant ? product.variants[variant] : undefined;
  if (!own) return { price: product.price, sale: product.sale, sku: product.sku };
  const price = own.price ?? product.price;
  // A variant with a price of its own has only its own sale; one without takes the product's.
  const sale = own.price !== null ? own.sale : (own.sale ?? product.sale);
  return { price, sale: sale !== null && price !== null && sale < price ? sale : null, sku: own.sku || product.sku };
}

/** What one combination weighs, in grams: its own weight, or the product's; 0 when neither is given. */
export const weightFor = (product: Product, variant = ''): number => (variant ? product.variants[variant]?.weight : null) ?? product.weight ?? 0;

/** What a visitor pays for one: the sale price when there is one. */
export const paid = (p: { price: number | null; sale: number | null }): number | null => p.sale ?? p.price;

/** A way an order is delivered (ADR 0065 d6): at a fixed price, free above a sum, or picked up at an address. */
export interface ShippingMethod {
  id: string;
  name: string;
  /** With VAT included, in the smallest unit. */
  price: number;
  /** An order of at least this much is sent free; null for never. */
  free: number | null;
  /** Picked up here: no delivery address is asked for. '' for a method that sends. */
  pickup: string;
}

/** Paying by bank transfer (ADR 0065 d6): the account the buyer is told to pay into. */
export interface BankTransfer {
  on: boolean;
  /** Whose the account is: the business's name. */
  holder: string;
  iban: string;
  bank: string;
}

/**
 * The shop's settings (ADR 0065 d4–d7, d10): the switch, VAT, how buyers pay
 * and how orders are delivered, the terms they agree to, and who handles the
 * orders.
 */
export interface ShopSettings {
  /** The one switch of Settings → Shop. */
  on: boolean;
  /** The site charges VAT: the cart and the order show it. */
  vat: boolean;
  rates: number[];
  transfer: BankTransfer;
  /** Cash on delivery. */
  cod: boolean;
  shipping: ShippingMethod[];
  /** The site's terms page, which a buyer agrees to; '' for none yet. */
  terms: string;
  /** Only a visitor signed in buys (when visitor accounts are on). */
  account: boolean;
  /** Editors handle orders too, not the owner alone (ADR 0065 d7). */
  editors: boolean;
  /** Where each new order is told; '' for the owner's own address. */
  notify: string;
  /**
   * Invoices (ADR 0081 d2), made by the owner's invoicing app through an
   * extension: off; asked for by themselves when an order is paid (or sent,
   * when paid on delivery); or only by the button on the order.
   */
  invoices: InvoicesWhen;
}

export const INVOICES_WHEN = ['off', 'auto', 'manual'] as const;
export type InvoicesWhen = (typeof INVOICES_WHEN)[number];

export const MAX_SHIPPING = 10;

export const SHOP_OFF: ShopSettings = {
  on: false,
  vat: true,
  rates: [...DEFAULT_RATES],
  transfer: { on: false, holder: '', iban: '', bank: '' },
  cod: false,
  shipping: [],
  terms: '',
  account: false,
  editors: false,
  notify: '',
  invoices: 'off',
};

/** An IBAN as people type it, in groups or not: `RO49 AAAA 1B31…` → `RO49AAAA1B31…`; '' for what is not one. */
export function ibanOf(value: unknown): string {
  const typed = str(value, 60).replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(typed)) return '';
  // The check digits: the country and digits moved to the end, read as a number, leave 1 over 97.
  const moved = `${typed.slice(4)}${typed.slice(0, 4)}`.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of moved) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1 ? typed : '';
}

/** A link to a page of the site, or to an address on the web: nothing a link could run. */
export const pageLink = (value: unknown): string => {
  const typed = str(value, 500).trim();
  return /^(\/(?!\/)|https?:\/\/)[^\s"<>]*$/.test(typed) ? typed : '';
};

const line = (value: unknown, max: number): string => str(value, max).replace(/\s+/g, ' ').trim();

function cleanShipping(input: unknown): ShippingMethod[] {
  const out: ShippingMethod[] = [];
  for (const raw of Array.isArray(input) ? input : []) {
    if (!isObject(raw) || out.length >= MAX_SHIPPING) continue;
    const name = line(raw.name, 80);
    if (!name) continue;
    let id = /^[a-z0-9-]{1,40}$/.test(String(raw.id ?? '')) ? String(raw.id) : '';
    if (!id || out.some((m) => m.id === id)) {
      let n = out.length + 1;
      while (out.some((m) => m.id === `m${n}`)) n++;
      id = `m${n}`;
    }
    const free = moneyOf(raw.free);
    out.push({ id, name, price: moneyOf(raw.price) ?? 0, free: free && free > 0 ? free : null, pickup: line(raw.pickup, 300) });
  }
  return out;
}

export function normalizeShopSettings(input: unknown): ShopSettings {
  const raw = isObject(input) ? input : {};
  const transfer = isObject(raw.transfer) ? raw.transfer : {};
  const iban = ibanOf(transfer.iban);
  const notify = line(raw.notify, 254).toLowerCase();
  return {
    on: raw.on === true,
    vat: raw.vat !== false,
    rates: normalizeRates(raw.rates),
    // Without an account to pay into, there is no paying by transfer.
    transfer: { on: transfer.on === true && iban !== '', holder: line(transfer.holder, 120), iban, bank: line(transfer.bank, 120) },
    cod: raw.cod === true,
    shipping: cleanShipping(raw.shipping),
    terms: pageLink(raw.terms),
    account: raw.account === true,
    editors: raw.editors === true,
    notify: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(notify) ? notify : '',
    invoices: (INVOICES_WHEN as readonly unknown[]).includes(raw.invoices) ? (raw.invoices as InvoicesWhen) : 'off',
  };
}

/** What a shipping method costs an order of this much: nothing above its sum, or when picked up for free. */
export const shippingCost = (method: ShippingMethod, subtotal: number): number => (method.free !== null && subtotal >= method.free ? 0 : method.price);

/** The states of an order (ADR 0065 d7), in the order an order usually goes through them. */
export const ORDER_STATES = ['waiting', 'paid', 'preparing', 'sent', 'completed', 'cancelled', 'refunded'] as const;
export type OrderState = (typeof ORDER_STATES)[number];

/** A cancelled order has given its stock back and is not taken up again; a refunded one is over. */
export const isFinal = (state: OrderState): boolean => state === 'cancelled' || state === 'refunded';

/** The VAT inside a sum that includes it, at a rate: 121 at 21% holds 21. */
export const vatIn = (gross: number, rate: number): number => (rate > 0 ? Math.round((gross * rate) / (100 + rate)) : 0);

/**
 * What a page is drawn with while the shop is on (ADR 0065 d3): the currency,
 * whether VAT is said, and what was left of each product counted when the
 * site was built. Filled in to draw, never kept.
 */
export interface ShopShown {
  currency: string;
  vat: boolean;
  /** By {@link stockKey}: only products whose stock is counted. Absent: none left. */
  stock: Record<string, number>;
}

/** Whether one combination of a product can be bought, as the site was built. */
export function inStock(shop: ShopShown, product: Product, key: string): boolean {
  return !product.counted || (shop.stock[key] ?? 0) > 0;
}

/** How a coupon takes off (ADR 0065 d8): a percentage of the products, or a sum. */
export const COUPON_KINDS = ['percent', 'amount'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];
/** The longest code a coupon has. */
export const COUPON_CODE_MAX = 40;
/** The most coupons a shop keeps at once: more is a campaign for an extension. */
export const MAX_COUPONS = 500;

/**
 * A coupon (ADR 0065 d8): a code a buyer types in the cart, that takes a
 * percentage or a sum off the products (never off delivery), until a day, a
 * number of times, from a smallest order. One coupon an order.
 */
export interface Coupon {
  /** What the buyer types, in capitals: `SUMMER-10`. Letters, digits, `-` and `_`. */
  code: string;
  kind: CouponKind;
  /** A percentage from 1 to 100 for `percent`; a sum in the smallest unit for `amount`. */
  value: number;
  /** The last day it is taken (`2026-12-31`, by the site's clock, UTC); '' for no end. */
  ends: string;
  /** How many orders may use it; null for no limit. */
  uses: number | null;
  /** How many orders have used it: kept by the shop, never typed. Cancelling an order gives its use back. */
  used: number;
  /** The smallest sum of products it is taken from, in the smallest unit; null for any. */
  minimum: number | null;
}

/** A coupon's code as people type it: ` summer-10 ` → `SUMMER-10`; '' for what is not one. */
export function couponCode(value: unknown): string {
  const typed = str(value, COUPON_CODE_MAX + 20).trim().toUpperCase();
  return /^[A-Z0-9_-]+$/.test(typed) && typed.length <= COUPON_CODE_MAX ? typed : '';
}

/** Untrusted input as a coupon, or null when it is not one: no code, or nothing taken off. */
export function normalizeCoupon(input: unknown): Coupon | null {
  const raw = isObject(input) ? input : {};
  const code = couponCode(raw.code);
  const kind: CouponKind = raw.kind === 'amount' ? 'amount' : 'percent';
  const percent = typeof raw.value === 'number' ? raw.value : typeof raw.value === 'string' ? Number(raw.value.trim()) : Number.NaN;
  const value = kind === 'percent' ? (Number.isInteger(percent) && percent >= 1 && percent <= 100 ? percent : null) : moneyOf(raw.value);
  if (!code || !value) return null;
  const ends = typeof raw.ends === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.ends) && !Number.isNaN(Date.parse(raw.ends)) ? raw.ends : '';
  const count = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim()) : Number.NaN;
    return Number.isInteger(n) && n >= 0 ? Math.min(n, 1_000_000_000) : null;
  };
  const uses = count(raw.uses);
  const minimum = moneyOf(raw.minimum);
  return { code, kind, value, ends, uses: uses === 0 ? null : uses, used: count(raw.used) ?? 0, minimum: minimum ? minimum : null };
}

/** Why a coupon is not taken from products of this much, on this day: `ended`, `used` up, under its `minimum`; null when it is. */
export function couponProblem(coupon: Coupon, subtotal: number, now = new Date()): 'ended' | 'used' | 'minimum' | null {
  if (coupon.ends && coupon.ends < now.toISOString().slice(0, 10)) return 'ended';
  if (coupon.uses !== null && coupon.used >= coupon.uses) return 'used';
  if (coupon.minimum !== null && subtotal < coupon.minimum) return 'minimum';
  return null;
}

/** What a coupon takes off products of this much: never more than they cost. */
export const couponOff = (coupon: Pick<Coupon, 'kind' | 'value'>, subtotal: number): number =>
  Math.max(0, Math.min(subtotal, coupon.kind === 'percent' ? Math.round((subtotal * coupon.value) / 100) : coupon.value));

/**
 * What a product's card and the bar that keeps "Add to cart" in view say of
 * its price (ADR 0085 d8): the lowest a combination costs, and whether they
 * differ; the old price when the one shown is on sale; whether any is left.
 * Null when it cannot be bought (no price).
 */
export function shownPrice(shop: ShopShown, product: Product, type: string, slug: string): { price: number; sale: number | null; from: boolean; left: boolean } | null {
  if (!product.options.length) {
    const own = priceOf(product);
    return own.price === null ? null : { price: own.price, sale: own.sale, from: false, left: inStock(shop, product, stockKey(type, slug)) };
  }
  const offered = combinations(product.options)
    .map((key) => ({ ...priceOf(product, key), left: inStock(shop, product, stockKey(type, slug, key)) }))
    .filter((c): c is { price: number; sale: number | null; sku: string; left: boolean } => c.price !== null);
  if (!offered.length) return null;
  const cheapest = offered.reduce((a, b) => ((paid(b) as number) < (paid(a) as number) ? b : a));
  return { price: cheapest.price, sale: cheapest.sale, from: new Set(offered.map((c) => paid(c))).size > 1, left: offered.some((c) => c.left) };
}
