<script lang="ts">
/**
 * Old addresses that lead to new ones (ADR 0036): those an import brought,
 * those made when a page moved, and those the owner writes here. Each change
 * is kept at once; the site cleans what it is given. Below them, the addresses
 * visitors asked for that the site does not have (ADR 0063 d1): one is a
 * redirect away from the right page.
 */
import { onMount } from 'svelte';
import type { Redirect } from '../core/index.ts';
import { api, type NotFound } from './api.ts';
import { say, t } from './messages.ts';

let redirects = $state<Redirect[]>([]);
let from = $state('');
let to = $state('');
let problem = $state('');
let missing = $state<NotFound[] | null>(null);
let toInput = $state<HTMLInputElement>();

onMount(async () => {
  try {
    redirects = (await api.redirects()).redirects;
    missing = (await api.notFound()).notFound;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
});

async function keep(next: Redirect[]): Promise<boolean> {
  try {
    const before = next.length;
    redirects = (await api.setRedirects(next)).redirects;
    problem = redirects.length < before ? t.redirects.refused : '';
    return true;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
    return false;
  }
}

async function add(): Promise<void> {
  const path = (value: string): string => (value.trim().startsWith('/') ? value.trim() : `/${value.trim()}`);
  if (!from.trim() || !to.trim()) return;
  if (await keep([...redirects.filter((r) => r.from !== path(from)), { from: path(from), to: path(to) }])) {
    from = to = '';
    // A redirect made takes its address off the list.
    missing = (await api.notFound()).notFound;
  }
}

async function forget(path: string | null): Promise<void> {
  try {
    missing = (await api.forgetNotFound(path)).notFound;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

function lead(path: string): void {
  from = path;
  to = '';
  toInput?.focus();
}
</script>

<h3>{t.redirects.heading}</h3>
<p class="hint">{t.redirects.intro}</p>
{#if redirects.length}
  <ul class="redirects" data-redirects>
    {#each redirects as redirect (redirect.from)}
      <li data-redirect={redirect.from}>
        <code>{redirect.from}</code> → <code>{redirect.to}</code>
        <button type="button" class="quiet" title={t.redirects.remove} aria-label={t.redirects.remove} onclick={() => keep(redirects.filter((r) => r.from !== redirect.from))} data-redirect-remove={redirect.from}>✕</button>
      </li>
    {/each}
  </ul>
{/if}
<form
  class="add"
  onsubmit={(e) => {
    e.preventDefault();
    add();
  }}
>
  <label><span>{t.redirects.from}</span><input type="text" bind:value={from} placeholder="/servicii/" data-redirect-from /></label>
  <label><span>{t.redirects.to}</span><input type="text" bind:value={to} bind:this={toInput} placeholder="/ce-facem/" data-redirect-to /></label>
  <button type="submit" disabled={!from.trim() || !to.trim()} data-redirect-add>{t.redirects.add}</button>
</form>
{#if problem}<p class="bad" role="alert">{problem}</p>{/if}

{#if missing}
  <h3>{t.notFound.heading}</h3>
  <p class="hint">{t.notFound.intro}</p>
  {#if missing.length}
    <ul class="redirects" data-not-found>
      {#each missing as item (item.path)}
        <li data-not-found-path={item.path}>
          <span class="missing">
            <code>{item.path}</code>
            <small>{say(t.notFound.hits, { count: item.hits })} · {new Date(item.lastAt).toLocaleDateString()}{#if item.referrer} · {say(t.notFound.from, { page: item.referrer })}{/if}</small>
          </span>
          <button type="button" class="quiet" onclick={() => lead(item.path)} data-not-found-lead={item.path}>{t.notFound.lead}</button>
          <button type="button" class="quiet" title={t.notFound.forget} aria-label={t.notFound.forget} onclick={() => forget(item.path)} data-not-found-forget={item.path}>✕</button>
        </li>
      {/each}
    </ul>
    <button type="button" class="quiet" onclick={() => forget(null)} data-not-found-forget-all>{t.notFound.forgetAll}</button>
  {:else}
    <p class="hint" data-not-found-none>{t.notFound.none}</p>
  {/if}
{/if}

<style>
  h3 { margin: var(--sp-4) 0 var(--sp-2); font-size: var(--size-m); }
  .redirects { list-style: none; padding: 0; margin: 0 0 var(--sp-2); display: grid; gap: var(--sp-1); font-size: var(--size-m); }
  .redirects li { display: flex; align-items: center; gap: var(--sp-1); overflow-wrap: anywhere; }
  .redirects button { margin-inline-start: auto; padding: 0 var(--sp-2) !important; }
  .missing { flex: 1; display: grid; gap: 0.1rem; }
  .missing small { color: var(--on-surface-variant); font-size: var(--size-xs); }
  .add { display: grid; gap: var(--sp-2); }
  .add label { display: grid; gap: 0.15rem; font-size: var(--size-s); }
  .bad { color: var(--error); font-size: var(--size-m); }
</style>
