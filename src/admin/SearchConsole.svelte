<script lang="ts">
/**
 * Google Search Console beside the statistics (ADR 0077 d3): what people
 * searched for when Google showed the site, and the pages they found. The
 * owner connects it once with a service account; everyone on the staff reads it.
 */
import { onMount } from 'svelte';
import { api, type SearchConsoleState, type SearchRow } from './api.ts';
import { say, t } from './messages.ts';

let { owner }: { owner: boolean } = $props();

let shown = $state<SearchConsoleState | null>(null);
let key = $state('');
let property = $state('');
let busy = $state(false);
let problem = $state('');

onMount(() => load(false));

async function load(fresh: boolean): Promise<void> {
  try {
    shown = await api.searchConsole(fresh);
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

async function act(run: () => Promise<SearchConsoleState>): Promise<void> {
  busy = true;
  try {
    shown = await run();
    problem = '';
    key = '';
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  } finally {
    busy = false;
  }
}

async function readFile(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
  const file = event.currentTarget.files?.[0];
  if (file) key = await file.text();
}

const percent = (value: number): string => `${Math.round(value * 1000) / 10}%`;
const path = (url: string): string => url.replace(/^https?:\/\/[^/]+/, '') || '/';
</script>

{#snippet table(heading: string, rows: SearchRow[], page: boolean)}
  <div class="list">
    <h3>{heading}</h3>
    {#if rows.length}
      <table>
        <thead><tr><th></th><th>{t.searchConsole.clicks}</th><th>{t.searchConsole.impressions}</th><th>{t.searchConsole.ctr}</th><th>{t.searchConsole.position}</th></tr></thead>
        <tbody>
          {#each rows as row (row.key)}
            <tr><td>{page ? path(row.key) : row.key}</td><td>{row.clicks}</td><td>{row.impressions}</td><td>{percent(row.ctr)}</td><td>{row.position}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="hint">{t.searchConsole.nothing}</p>
    {/if}
  </div>
{/snippet}

<section class="search-console" data-search-console>
  <h2>{t.searchConsole.heading}</h2>
  {#if shown?.connected}
    <p class="hint">{say(t.searchConsole.readsAs, { property: shown.property, email: shown.email })}</p>
    {#if shown.report}
      <p class="hint" data-search-console-days>{say(t.searchConsole.days, { from: shown.report.from, to: shown.report.to })}</p>
      <div class="lists" data-search-console-report>
        {@render table(t.searchConsole.queries, shown.report.queries, false)}
        {@render table(t.searchConsole.pages, shown.report.pages, true)}
      </div>
    {:else if shown.error}
      <p class="bad" role="alert" data-search-console-error>{shown.error}</p>
    {/if}
    <div class="tools">
      <button type="button" class="quiet" disabled={busy} onclick={() => act(() => api.searchConsole(true))} data-search-console-refresh>{t.searchConsole.refresh}</button>
      {#if owner}<button type="button" class="quiet" disabled={busy} onclick={() => act(() => api.disconnectSearchConsole())} data-search-console-disconnect>{t.searchConsole.disconnect}</button>{/if}
    </div>
  {:else if shown && owner}
    <p class="hint">{t.searchConsole.intro}</p>
    <ol class="steps">
      <li>{t.searchConsole.step1}</li>
      <li>{t.searchConsole.step2}</li>
      <li>{t.searchConsole.step3}</li>
    </ol>
    <form
      class="connect"
      onsubmit={(e) => {
        e.preventDefault();
        act(() => api.connectSearchConsole(key, property));
      }}
    >
      <label><span>{t.searchConsole.key}</span><input type="file" accept="application/json,.json" onchange={readFile} data-search-console-file /></label>
      <label><span>{t.searchConsole.keyText}</span><textarea rows="3" bind:value={key} data-search-console-key></textarea></label>
      <label><span>{t.searchConsole.property}</span><input type="text" bind:value={property} placeholder="https://example.com/" data-search-console-property /></label>
      <button type="submit" disabled={busy || !key.trim()} data-search-console-connect>{t.searchConsole.connect}</button>
    </form>
  {:else if shown}
    <p class="hint">{t.searchConsole.notConnected}</p>
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</section>

<style>
  .search-console { padding: 0 var(--sp-5) var(--sp-6); max-width: 1100px; }
  .lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--sp-4); }
  table { width: 100%; border-collapse: collapse; font-size: var(--size-m); }
  th, td { text-align: end; padding: var(--sp-1) var(--sp-1); border-bottom: 1px solid var(--outline-variant); }
  th:first-child, td:first-child { text-align: start; overflow-wrap: anywhere; }
  h3 { font-size: var(--size-m); margin: var(--sp-2) 0 var(--sp-1); }
  .steps { font-size: var(--size-m); padding-inline-start: var(--sp-5); }
  .connect { display: grid; gap: var(--sp-2); max-width: 560px; }
  .connect label { display: grid; gap: 0.15rem; font-size: var(--size-s); }
  .tools { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
  .bad { color: var(--error); }
</style>
