<script lang="ts">
/**
 * Coupons (ADR 0065 d8): the codes buyers type in their cart, each with what
 * it takes off, until when, how many times and from how much; how many orders
 * used it so far. Whoever handles the orders handles them.
 */
import { onMount } from 'svelte';
import { type Coupon, moneyText, typedMoney } from '../core/index.ts';
import { api } from './api.ts';
import { adminLanguage, say, t } from './messages.ts';

let { currency = 'RON' }: { currency?: string } = $props();

let coupons = $state.raw<Coupon[] | null>(null);
let problem = $state('');
let note = $state('');
/** The coupon being written: a new one, or one opened to change. */
let open = $state(false);
let code = $state('');
let kind = $state<'percent' | 'amount'>('percent');
let value = $state('');
let ends = $state('');
let uses = $state('');
let minimum = $state('');
let known = $state(false);

const money = (n: number): string => moneyText(n, currency, adminLanguage());
const today = new Date().toISOString().slice(0, 10);
const off = (c: Coupon): string => (c.kind === 'percent' ? `${c.value}%` : money(c.value));

const attempt = async (work: () => Promise<void>): Promise<void> => {
  problem = '';
  try {
    await work();
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
    note = '';
  }
};

const write = (c: Coupon | null): void => {
  open = true;
  known = c !== null;
  code = c?.code ?? '';
  kind = c?.kind ?? 'percent';
  value = c ? (c.kind === 'percent' ? String(c.value) : typedMoney(c.value)) : '';
  ends = c?.ends ?? '';
  uses = c?.uses === null || !c ? '' : String(c.uses);
  minimum = c?.minimum ? typedMoney(c.minimum) : '';
  note = '';
};

const save = (): Promise<void> =>
  attempt(async () => {
    coupons = (await api.saveCoupon({ code, kind, value, ends, uses, minimum })).coupons;
    open = false;
    note = t.coupons.saved;
  });

const remove = (c: Coupon): Promise<void> =>
  attempt(async () => {
    if (!confirm(say(t.coupons.removeConfirm, { code: c.code }))) return;
    coupons = (await api.deleteCoupon(c.code)).coupons;
  });

onMount(() => void attempt(async () => void (coupons = (await api.coupons()).coupons)));
</script>

<section class="coupons">
  <h2>{t.coupons.heading}</h2>
  <p class="hint">{t.coupons.intro}</p>
  {#if open}
    <form class="write" onsubmit={(e) => (e.preventDefault(), void save())} data-coupon-form>
      <label class="field"><span>{t.coupons.code}</span><input type="text" maxlength="40" required bind:value={code} readonly={known} autocapitalize="characters" data-coupon-code /><small>{t.coupons.codeHint}</small></label>
      <fieldset class="field">
        <legend>{t.coupons.off}</legend>
        <label><input type="radio" value="percent" bind:group={kind} data-coupon-kind="percent" /> {t.coupons.percent}</label>
        <label><input type="radio" value="amount" bind:group={kind} data-coupon-kind="amount" /> {t.coupons.amount}</label>
      </fieldset>
      <label class="field"><span>{t.coupons.value} ({kind === 'percent' ? '%' : currency})</span><input type="text" inputmode="decimal" required bind:value data-coupon-value /></label>
      <label class="field"><span>{t.coupons.ends}</span><input type="date" bind:value={ends} data-coupon-ends /><small>{t.coupons.endsHint}</small></label>
      <label class="field"><span>{t.coupons.uses}</span><input type="number" min="0" step="1" bind:value={uses} data-coupon-uses /><small>{t.coupons.usesHint}</small></label>
      <label class="field"><span>{t.coupons.minimum} ({currency})</span><input type="text" inputmode="decimal" bind:value={minimum} data-coupon-minimum /><small>{t.coupons.minimumHint}</small></label>
      <div class="row">
        <button type="submit" class="primary" data-coupon-save>{t.coupons.save}</button>
        <button type="button" class="quiet" onclick={() => (open = false)}>{t.coupons.cancel}</button>
      </div>
    </form>
  {:else}
    <p><button type="button" class="primary" onclick={() => write(null)} data-coupon-add>{t.coupons.add}</button></p>
  {/if}
  {#if note}<p role="status">{note}</p>{/if}
  {#if coupons && !coupons.length}
    <p data-coupons-none>{t.coupons.none}</p>
  {:else if coupons}
    <table data-coupons>
      <thead><tr><th>{t.coupons.code}</th><th>{t.coupons.off}</th><th>{t.coupons.ends}</th><th>{t.coupons.used}</th><th>{t.coupons.minimum}</th><th></th></tr></thead>
      <tbody>
        {#each coupons as c (c.code)}
          <tr data-coupon={c.code}>
            <td><strong>{c.code}</strong></td>
            <td>{off(c)}</td>
            <td>{c.ends || t.coupons.never}{c.ends && c.ends < today ? ` · ${t.coupons.ended}` : ''}</td>
            <td>{c.uses === null ? c.used : say(t.coupons.usedOf, { used: c.used, uses: c.uses })}</td>
            <td>{c.minimum ? money(c.minimum) : ''}</td>
            <td class="n">
              <button type="button" class="link" onclick={() => write(c)} data-coupon-edit={c.code}>{t.coupons.edit}</button>
              <button type="button" class="link" onclick={() => remove(c)} data-coupon-remove={c.code}>{t.coupons.remove}</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</section>

<style>
  .coupons { max-width: 56rem; margin: 0 auto; padding: var(--sp-4); }
  .write { display: grid; gap: var(--sp-2); max-width: 28rem; margin: var(--sp-2) 0 var(--sp-4); }
  .field { display: grid; gap: 0.2rem; border: 0; padding: 0; margin: 0; }
  .field small { color: var(--on-surface-variant); }
  fieldset.field label { display: inline-flex; gap: var(--sp-1); margin-inline-end: var(--sp-4); }
  table { width: 100%; border-collapse: collapse; font-size: var(--size-m); }
  th, td { text-align: start; padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--outline-variant); vertical-align: top; }
  .n { text-align: end; white-space: nowrap; }
  .row { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
  .link { background: none; border: 0; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; font: inherit; margin-inline-start: var(--sp-2); }
  .bad { color: var(--error); }
</style>
