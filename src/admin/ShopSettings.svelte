<script lang="ts">
/**
 * Settings → Shop (ADR 0065 d4–d7, d10): one switch, whether the site charges
 * VAT and its rates, how buyers pay and how orders are delivered, the terms
 * of sale, and who handles orders. While off, nothing else is shown, and
 * nothing of the shop is loaded on the server.
 */
import { INVOICES_WHEN, moneyOf, type ShippingMethod, type ShopSettings, typedMoney } from '../core/index.ts';
import { api } from './api.ts';
import { t } from './messages.ts';

let { settings, onchange }: { settings: ShopSettings; /** Told once the server has saved: turning the shop on may add a type. */ onchange: () => void } = $props();
let problem = $state('');

async function save(patch: Partial<ShopSettings>): Promise<void> {
  try {
    await api.setShop(patch);
    problem = '';
    onchange();
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}
// Typed here, saved when a field is left; the panel is drawn again once the server has them.
// svelte-ignore state_referenced_locally
let transfer = $state({ ...settings.transfer });
// svelte-ignore state_referenced_locally
let methods = $state(settings.shipping.map((m) => ({ ...m, price: typedMoney(m.price), free: typedMoney(m.free) })));
const saveMethods = (): Promise<void> =>
  save({ shipping: methods.filter((m) => m.name.trim()).map((m) => ({ ...m, price: moneyOf(m.price) ?? 0, free: moneyOf(m.free) })) as ShippingMethod[] });
const addMethod = (): void => {
  methods = [...methods, { id: '', name: '', price: '', free: '', pickup: '' }];
};
const removeMethod = (at: number): void => {
  methods = methods.filter((_, i) => i !== at);
  void saveMethods();
};
const rates = (typed: string): number[] => typed.split(/[;,\s]+/).filter(Boolean).map((r) => Number(r.replace(',', '.')));
</script>

<h3>{t.shop.heading}</h3>
<p class="hint">{t.shop.intro}</p>
<label class="check">
  <input type="checkbox" checked={settings.on} onchange={(e) => save({ on: e.currentTarget.checked })} data-shop-on />
  <span>{t.shop.on}</span>
</label>
{#if !settings.on}
  <small>{t.shop.offHint}</small>
{:else}
  <small>{t.shop.onHint}</small>
  <label class="check">
    <input type="checkbox" checked={settings.vat} onchange={(e) => save({ vat: e.currentTarget.checked })} data-shop-vat />
    <span>{t.shop.vat}</span>
  </label>
  <small>{t.shop.vatHint}</small>
  {#if settings.vat}
    <label class="field">
      <span>{t.shop.rates}</span>
      <input type="text" value={settings.rates.join(', ')} onchange={(e) => save({ rates: rates(e.currentTarget.value) })} data-shop-rates />
      <small>{t.shop.ratesHint}</small>
    </label>
  {/if}
  <h4>{t.shop.payments}</h4>
  <label class="check">
    <input type="checkbox" checked={transfer.on} onchange={(e) => { transfer.on = e.currentTarget.checked; void save({ transfer: { ...transfer } }); }} data-shop-transfer />
    <span>{t.shop.transfer}</span>
  </label>
  <small>{t.shop.transferHint}</small>
  <label class="field"><span>{t.shop.holder}</span><input type="text" maxlength="120" bind:value={transfer.holder} onchange={() => transfer.on && save({ transfer: { ...transfer } })} data-shop-holder /></label>
  <label class="field"><span>{t.shop.iban}</span><input type="text" maxlength="60" bind:value={transfer.iban} onchange={() => transfer.on && save({ transfer: { ...transfer } })} data-shop-iban /></label>
  <label class="field"><span>{t.shop.bank}</span><input type="text" maxlength="120" bind:value={transfer.bank} onchange={() => transfer.on && save({ transfer: { ...transfer } })} data-shop-bank /></label>
  <label class="check">
    <input type="checkbox" checked={settings.cod} onchange={(e) => save({ cod: e.currentTarget.checked })} data-shop-cod />
    <span>{t.shop.cod}</span>
  </label>

  <h4>{t.shop.shipping}</h4>
  <small>{t.shop.shippingHint}</small>
  {#each methods as m, i (i)}
    <div class="method" data-shop-method>
      <label class="field"><span>{t.shop.methodName}</span><input type="text" maxlength="80" bind:value={m.name} onchange={saveMethods} data-shop-method-name /></label>
      <label class="field"><span>{t.shop.methodPrice}</span><input type="text" inputmode="decimal" bind:value={m.price} onchange={saveMethods} data-shop-method-price /></label>
      <label class="field"><span>{t.shop.methodFree}</span><input type="text" inputmode="decimal" bind:value={m.free} onchange={saveMethods} data-shop-method-free /></label>
      <label class="field wide"><span>{t.shop.methodPickup}</span><input type="text" maxlength="300" bind:value={m.pickup} onchange={saveMethods} data-shop-method-pickup /></label>
      <button type="button" class="quiet" onclick={() => removeMethod(i)}>{t.shop.remove}</button>
    </div>
  {/each}
  <button type="button" onclick={addMethod} data-shop-add-method>{t.shop.addMethod}</button>
  {#if !(settings.transfer.on || settings.cod) || !settings.shipping.length}<p class="bad" data-shop-no-way>{t.shop.noWay}</p>{/if}

  <label class="field">
    <span>{t.shop.terms}</span>
    <input type="text" value={settings.terms} placeholder="/terms/" onchange={(e) => save({ terms: e.currentTarget.value })} data-shop-terms />
    <small>{t.shop.termsHint}</small>
  </label>
  <label class="check">
    <input type="checkbox" checked={settings.account} onchange={(e) => save({ account: e.currentTarget.checked })} data-shop-account />
    <span>{t.shop.account}</span>
  </label>
  <small>{t.shop.accountHint}</small>
  <label class="check">
    <input type="checkbox" checked={settings.editors} onchange={(e) => save({ editors: e.currentTarget.checked })} data-shop-editors />
    <span>{t.shop.editors}</span>
  </label>
  <label class="field">
    <span>{t.shop.notify}</span>
    <input type="email" value={settings.notify} onchange={(e) => save({ notify: e.currentTarget.value })} data-shop-notify />
    <small>{t.shop.notifyHint}</small>
  </label>
  <label class="field">
    <span>{t.shop.invoices}</span>
    <select value={settings.invoices} onchange={(e) => save({ invoices: e.currentTarget.value as ShopSettings['invoices'] })} data-shop-invoices>
      {#each INVOICES_WHEN as w (w)}<option value={w}>{t.shop.invoicesWhen[w]}</option>{/each}
    </select>
    <small>{t.shop.invoicesHint}</small>
  </label>
  <small>{t.shop.staticHint}</small>
{/if}
{#if problem}<p class="bad" role="alert">{problem}</p>{/if}

<style>
  h3 { margin: 1.1rem 0 0.5rem; font-size: 13px; }
  h4 { margin: 0.8rem 0 0.3rem; font-size: 12px; }
  .method { display: grid; grid-template-columns: 1fr 1fr; gap: 0 0.4rem; border-top: 1px solid var(--outline-variant); padding-top: 0.3rem; margin-top: 0.4rem; }
  .method .wide { grid-column: 1 / -1; }
  .field { display: grid; gap: 0.15rem; font-size: 12px; margin-top: 0.5rem; }
  .check { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.3rem; }
  .check span { margin: 0; }
  p { font-size: 13px; }
  .bad { color: var(--error); }
</style>
