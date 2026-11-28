<script lang="ts">
/**
 * Every page and entry with what it says to search engines, in one table
 * (ADR 0077 d2): the title for search engines and the description, written
 * here; those still missing written by an extension's AI, one after another.
 */
import { onMount } from 'svelte';
import { LONG_TITLE } from '../core/index.ts';
import { api, type ExtensionInfo, type SearchRow, type SeoRow } from './api.ts';
import { say, t } from './messages.ts';

let { extensions, onopen }: { extensions: ExtensionInfo[]; onopen: (slug: string, kind: string) => void } = $props();

let rows = $state<SeoRow[] | null>(null);
let missingOnly = $state(false);
/** What Google counted for each page, by its path, when Search Console is connected (ADR 0077 d3). */
let found = $state<Map<string, SearchRow>>(new Map());
let problem = $state('');
/** What the AI is writing: which, how far along, and whether it was asked to stop. */
let writing = $state<{ what: 'title' | 'describe'; done: number; of: number; stop: boolean } | null>(null);

const DESCRIPTION = 160;
const key = (row: SeoRow): string => `${row.type}/${row.slug}`;
const shown = $derived((rows ?? []).filter((row) => !missingOnly || !row.seoTitle || !row.description));
/** The extension that writes each, among those turned on: the first that offers it for a page. */
const writer = (action: 'title' | 'describe'): ExtensionInfo | undefined => extensions.find((e) => e.enabled && e.actions.some((a) => a.on === 'page' && a.name === action && !a.ask?.length));

onMount(async () => {
  try {
    rows = (await api.seoRows()).rows;
    const console = await api.searchConsole().catch(() => null);
    if (console?.connected && console.report) found = new Map(console.report.pages.map((p) => [p.key.replace(/^https?:\/\/[^/]+/, '') || '/', p]));
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
});

async function save(row: SeoRow, change: Partial<Pick<SeoRow, 'seoTitle' | 'description'>>): Promise<void> {
  try {
    const { row: kept } = await api.setSeo({ type: row.type, slug: row.slug, seoTitle: change.seoTitle ?? row.seoTitle, description: change.description ?? row.description });
    rows = (rows ?? []).map((r) => (key(r) === key(row) ? kept : r));
    problem = '';
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

/** Each page and entry still missing it, shown to search engines, written by the AI one after another. */
async function fill(what: 'title' | 'describe'): Promise<void> {
  const extension = writer(what);
  if (!extension || !rows) return;
  const todo = rows.filter((row) => !row.noindex && !(what === 'title' ? row.seoTitle : row.description));
  writing = { what, done: 0, of: todo.length, stop: false };
  try {
    for (const row of todo) {
      if (writing.stop) break;
      const { page } = await api.page(row.slug, row.type || 'page');
      const { page: written } = await api.runOnPage(extension.name, what, page, {});
      await save(row, what === 'title' ? { seoTitle: written.seoTitle ?? '' } : { description: written.description });
      writing.done += 1;
    }
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  } finally {
    writing = null;
  }
}
</script>

<section class="seo-table" data-seo-table>
  <h2>{t.seoTable.heading}</h2>
  <p class="hint">{t.seoTable.intro}</p>
  <div class="tools">
    <label class="check"><input type="checkbox" bind:checked={missingOnly} data-seo-missing /> <span>{t.seoTable.missingOnly}</span></label>
    {#if writer('title')}<button type="button" disabled={!!writing} onclick={() => fill('title')} data-seo-fill="title">{t.seoTable.fillTitles}</button>{/if}
    {#if writer('describe')}<button type="button" disabled={!!writing} onclick={() => fill('describe')} data-seo-fill="describe">{t.seoTable.fillDescriptions}</button>{/if}
    {#if writing}
      <span data-seo-writing>{say(t.seoTable.writing, { done: writing.done, count: writing.of })}</span>
      <button type="button" class="quiet" onclick={() => writing && (writing.stop = true)} data-seo-stop>{t.seoTable.stop}</button>
    {/if}
  </div>
  {#if !writer('title') && !writer('describe')}<p class="hint">{t.seoTable.noAi}</p>{/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  {#if rows}
    {#if shown.length}
      <table>
        <thead><tr><th>{t.seoTable.page}</th><th>{t.seoTable.title}</th><th>{t.seoTable.description}</th></tr></thead>
        <tbody>
          {#each shown as row (key(row))}
            <tr class:hidden={row.noindex} data-seo-row={key(row)}>
              <td>
                <button type="button" class="link" onclick={() => onopen(row.slug, row.type || 'page')}>{row.title}</button>
                <small><code>{row.path}</code>{#if row.noindex} · {t.seoTable.hidden}{/if}{#if !row.published} · {t.seoTable.draft}{/if}</small>
                {#if found.get(row.path)}{@const google = found.get(row.path) as SearchRow}<small data-seo-google>{say(t.seoTable.google, { clicks: google.clicks, position: google.position })}</small>{/if}
              </td>
              <td>
                <input type="text" maxlength="120" placeholder={row.title} value={row.seoTitle} onchange={(e) => save(row, { seoTitle: e.currentTarget.value })} data-seo-row-title />
                <small class:long={(row.seoTitle || row.title).length > LONG_TITLE}>{(row.seoTitle || row.title).length} / {LONG_TITLE}</small>
              </td>
              <td>
                <textarea rows="2" maxlength="300" placeholder={row.auto} value={row.description} onchange={(e) => save(row, { description: e.currentTarget.value })} data-seo-row-description></textarea>
                <small class:long={(row.description || row.auto).length > DESCRIPTION}>{row.description ? `${row.description.length} / ${DESCRIPTION}` : t.seoTable.auto}</small>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="hint" data-seo-none>{t.seoTable.none}</p>
    {/if}
  {/if}
</section>

<style>
  .seo-table { padding: 1rem 1.25rem; max-width: 1200px; }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin: 0.6rem 0; }
  .check { display: flex; align-items: center; gap: 0.35rem; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: start; vertical-align: top; padding: 0.45rem 0.4rem; border-bottom: 1px solid var(--outline-variant); }
  th:first-child, td:first-child { width: 24%; }
  td input, td textarea { width: 100%; box-sizing: border-box; }
  td small { display: block; color: var(--on-surface-variant); font-size: 11.5px; margin-top: 0.15rem; overflow-wrap: anywhere; }
  td small.long { color: var(--error); }
  tr.hidden { opacity: 0.55; }
  .link { background: none; border: 0; padding: 0; color: inherit; font-weight: 600; text-align: start; cursor: pointer; }
  .link:hover { text-decoration: underline; }
  .bad { color: var(--error); }
  @media (max-width: 700px) {
    table, tbody, tr, td { display: block; }
    thead { display: none; }
    th:first-child, td:first-child { width: auto; }
  }
</style>
