<script lang="ts">
/**
 * What the shop adds to an entry of a type that sells (ADR 0065 d2): its
 * price, sale price, code, weight, VAT rate and variants, written and published with
 * the entry; and its stock, which is not content and is saved at once.
 */
import { combinations, emptyProduct, moneyOf, type Product, type ProductOption, type ProductVariant, type ShopSettings, typedMoney, typedWeight, weightOf, MAX_PRODUCT_OPTIONS } from '../core/index.ts';
import { api } from './api.ts';
import { say, t } from './messages.ts';

let { product, shop, kind, slug, onchange }: { product: Product | undefined; shop: ShopSettings; kind: string; slug: string; onchange: (product: Product) => void } = $props();
const p = $derived(product ?? emptyProduct());
const keys = $derived(combinations(p.options));
const set = (patch: Partial<Product>): void => onchange({ ...p, ...patch });
/** A sum as typed: kept as typed only once it reads as a sum; an empty one is no sum. */
const money = (typed: string): number | null => moneyOf(typed.trim());
/** A weight as typed, in kilograms; an empty one is none. */
const kilos = (typed: string): number | null => weightOf(typed.trim());
const setOption = (i: number, patch: Partial<ProductOption>): void => set({ options: p.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
const variant = (key: string): ProductVariant => p.variants[key] ?? { price: null, sale: null, sku: '', weight: null };
const setVariant = (key: string, patch: Partial<ProductVariant>): void => set({ variants: { ...p.variants, [key]: { ...variant(key), ...patch } } });

/** What is left, by combination ('' for the product itself), as the server keeps it. */
let stock = $state<Record<string, string>>({});
let problem = $state('');
let saved = $state(false);
$effect(() => {
  if (!p.counted || !slug) return;
  api
    .stock(kind, slug)
    .then((answer) => (stock = Object.fromEntries(Object.entries(answer.stock).map(([k, v]) => [k, String(v)]))))
    .catch(() => (stock = {}));
});
async function saveStock(): Promise<void> {
  try {
    const given = Object.fromEntries((keys.length ? keys : ['']).map((k) => [k, stock[k]?.trim() ? Number(stock[k]) : null]));
    const answer = await api.setStock(kind, slug, given);
    stock = Object.fromEntries(Object.entries(answer.stock).map(([k, v]) => [k, String(v)]));
    problem = '';
    saved = true;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}
</script>

<fieldset class="product" data-product-form>
  <legend>{t.shop.product}</legend>
  <div class="two">
    <label class="field"><span>{t.shop.price}</span><input type="text" inputmode="decimal" value={typedMoney(p.price)} onchange={(e) => set({ price: money(e.currentTarget.value) })} data-product-price /></label>
    <label class="field"><span>{t.shop.sale}</span><input type="text" inputmode="decimal" value={typedMoney(p.sale)} onchange={(e) => set({ sale: money(e.currentTarget.value) })} data-product-sale /></label>
  </div>
  <small>{t.shop.saleHint}</small>
  <div class="two">
    <label class="field"><span>{t.shop.sku}</span><input type="text" maxlength="60" value={p.sku} onchange={(e) => set({ sku: e.currentTarget.value })} data-product-sku /></label>
    {#if shop.vat}
      <label class="field">
        <span>{t.shop.vatRate}</span>
        <select value={p.vat === null ? '' : String(p.vat)} onchange={(e) => set({ vat: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })} data-product-vat>
          <option value="">{say(t.shop.vatFirst, { rate: shop.rates[0] ?? 0 })}</option>
          {#each shop.rates as rate}<option value={String(rate)}>{rate}%</option>{/each}
        </select>
      </label>
    {/if}
  </div>
  <label class="field"><span>{t.shop.weight}</span><input type="text" inputmode="decimal" value={typedWeight(p.weight)} onchange={(e) => set({ weight: kilos(e.currentTarget.value) })} data-product-weight /></label>
  <small>{t.shop.weightHint}</small>

  <h4>{t.shop.options}</h4>
  <small>{t.shop.optionsHint}</small>
  {#each p.options as option, i (i)}
    <div class="two" data-product-option>
      <input type="text" maxlength="40" value={option.name} placeholder={t.shop.optionName} aria-label={t.shop.optionName} onchange={(e) => setOption(i, { name: e.currentTarget.value })} />
      <input type="text" value={option.values.join(', ')} placeholder={t.shop.optionValues} aria-label={t.shop.optionValues} onchange={(e) => setOption(i, { values: e.currentTarget.value.split(',').map((v) => v.trim()).filter(Boolean) })} />
      <button type="button" class="quiet" aria-label={t.actions.delete} onclick={() => set({ options: p.options.filter((_, j) => j !== i) })}>×</button>
    </div>
  {/each}
  {#if p.options.length < MAX_PRODUCT_OPTIONS}
    <button type="button" class="quiet" onclick={() => set({ options: [...p.options, { name: '', values: [] }] })} data-product-add-option>{t.shop.addOption}</button>
  {/if}

  <label class="check"><input type="checkbox" checked={p.counted} onchange={(e) => set({ counted: e.currentTarget.checked })} data-product-counted /><span>{t.shop.counted}</span></label>

  {#if keys.length}
    <table class="variants">
      <thead><tr><th>{t.shop.combination}</th><th>{t.shop.price}</th><th>{t.shop.sale}</th><th>{t.shop.sku}</th><th>{t.shop.weight}</th>{#if p.counted}<th>{t.shop.stock}</th>{/if}</tr></thead>
      <tbody>
        {#each keys as key (key)}
          <tr data-product-variant={key}>
            <td>{key}</td>
            <td><input type="text" inputmode="decimal" placeholder={t.shop.sameAsProduct} value={typedMoney(variant(key).price)} onchange={(e) => setVariant(key, { price: money(e.currentTarget.value) })} /></td>
            <td><input type="text" inputmode="decimal" value={typedMoney(variant(key).sale)} onchange={(e) => setVariant(key, { sale: money(e.currentTarget.value) })} /></td>
            <td><input type="text" maxlength="60" placeholder={p.sku} value={variant(key).sku} onchange={(e) => setVariant(key, { sku: e.currentTarget.value })} /></td>
            <td><input type="text" inputmode="decimal" placeholder={typedWeight(p.weight)} value={typedWeight(variant(key).weight)} onchange={(e) => setVariant(key, { weight: kilos(e.currentTarget.value) })} /></td>
            {#if p.counted}<td><input type="number" min="0" value={stock[key] ?? ''} oninput={(e) => ((stock = { ...stock, [key]: e.currentTarget.value }), (saved = false))} data-product-stock={key} /></td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {:else if p.counted}
    <label class="field"><span>{t.shop.stock}</span><input type="number" min="0" value={stock[''] ?? ''} oninput={(e) => ((stock = { ...stock, '': e.currentTarget.value }), (saved = false))} data-product-stock="" /></label>
  {/if}
  {#if p.counted}
    <div class="row">
      <button type="button" onclick={saveStock} data-product-save-stock>{t.shop.stockSave}</button>
      <small>{saved ? '✓ ' : ''}{t.shop.stockSaved}</small>
    </div>
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</fieldset>

<style>
  .product { min-width: 0; border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); padding: 0.6rem; margin: 0.8rem 0; display: grid; gap: 0.35rem; }
  legend { font-weight: 600; font-size: 13px; padding: 0 0.3rem; }
  h4 { margin: 0.5rem 0 0; font-size: 12px; }
  .field { display: grid; gap: 0.15rem; font-size: 12px; }
  .two { display: flex; gap: 0.4rem; align-items: end; }
  .two > * { flex: 1; min-width: 0; }
  .two > button { flex: none; }
  .check { display: flex; align-items: center; gap: 0.5rem; }
  .check span { margin: 0; }
  .variants { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11px; }
  .variants td:first-child { overflow-wrap: anywhere; }
  .variants th { text-align: left; font-weight: 600; overflow-wrap: anywhere; }
  .variants input { width: 100%; min-width: 0; box-sizing: border-box; }
  .two input, .two select { width: 100%; box-sizing: border-box; }
  .row { display: flex; gap: 0.5rem; align-items: center; }
  .bad { color: var(--error); }
</style>
