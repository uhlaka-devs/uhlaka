<script lang="ts">
/**
 * Settings → Performance (ADR 0044 d4): where the site's processes share the
 * pages they built, the counters that limit tries, the clock's lock and who is
 * signed in. Valkey on a server; without it, each process keeps its own.
 */
import { onMount } from 'svelte';
import { api, type Performance } from './api.ts';
import { say, t } from './messages.ts';

let shown = $state<Performance | null>(null);
let address = $state('');
let tested = $state('');
let good = $state(false);
let problem = $state('');

onMount(async () => {
  try {
    shown = await api.performance();
    address = shown.address;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
});

async function test(): Promise<void> {
  tested = '…';
  const { test: answer } = await api.testValkey(address.trim());
  good = answer.ok;
  tested = answer.ok ? say(t.performance.answered, { ms: answer.ms }) : say(t.performance.silent, { error: answer.error });
}

async function save(): Promise<void> {
  try {
    shown = await api.setValkey(address.trim());
    address = shown.address;
    problem = '';
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}
</script>

<h3>{t.performance.heading}</h3>
{#if shown}
  <p class="hint" data-valkey-state={shown.status.kind === 'local' ? 'local' : shown.status.up ? 'up' : 'down'}>
    {#if shown.status.kind === 'local'}
      {t.performance.local}
    {:else if shown.status.up}
      {say(t.performance.up, { address: shown.status.address })}
    {:else}
      <strong class="bad">{say(t.performance.down, { address: shown.status.address, error: shown.status.error })}</strong>
    {/if}
  </p>
  <label class="field">
    <span>{t.performance.address}</span>
    <input type="text" inputmode="url" bind:value={address} placeholder="redis://127.0.0.1:6379" readonly={shown.fromEnvironment} data-valkey-address />
  </label>
  {#if shown.fromEnvironment}<small>{t.performance.fromEnvironment}</small>{/if}
  <div class="row">
    <button type="button" onclick={test} data-valkey-test>{t.performance.test}</button>
    {#if !shown.fromEnvironment}<button type="button" onclick={save} disabled={address.trim() === shown.address} data-valkey-save>{t.performance.save}</button>{/if}
  </div>
  {#if tested}<p class:bad={!good && tested !== '…'} role="status" data-valkey-tested>{tested}</p>{/if}
{/if}
{#if problem}<p class="bad" role="alert">{problem}</p>{/if}

<style>
  h3 { margin: var(--sp-4) 0 var(--sp-2); font-size: var(--size-m); }
  .field { display: grid; gap: 0.15rem; font-size: var(--size-s); }
  .row { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
  p { font-size: var(--size-m); }
  .bad { color: var(--error); }
</style>
