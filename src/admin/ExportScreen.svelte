<script lang="ts">
/**
 * The site leaving (ADR 0057): its content in one open file, all of it or
 * the parts chosen; the published site as files in a ZIP, with what a static
 * host cannot do said first; and where its data can be read as JSON. The
 * owner's only.
 */
import { onMount } from 'svelte';
import type { Site } from '../core/index.ts';
import { api } from './api.ts';
import { say, t } from './messages.ts';

let { site }: { site: Site } = $props();

let parts = $state<{ id: string; name: string; apart?: true }[]>([]);
let chosen = $state<string[]>([]);
/** The visitors (ADR 0064 d6) and the shop's orders (ADR 0065): offered apart from the whole site, never chosen for the owner. */
let apart = $state<{ id: string; name: string }[]>([]);
let apartChosen = $state<string[]>([]);
let lose = $state<string[] | null>(null);
let busy = $state('');
let problem = $state('');

const words: Record<string, string> = { pages: t.exp.pages, sections: t.exp.sections, forms: t.exp.forms, design: t.exp.design, shop: t.exp.shop };
const apartWords: Record<string, { name: string; hint: string }> = { visitors: { name: t.exp.visitors, hint: t.exp.visitorsHint }, orders: { name: t.exp.orders, hint: t.exp.ordersHint } };
const all = $derived(parts.length > 0 && chosen.length === parts.length);

async function attempt(what: string, work: () => Promise<void>): Promise<void> {
  busy = what;
  problem = '';
  try {
    await work();
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  } finally {
    busy = '';
  }
}

onMount(
  () =>
    void attempt('load', async () => {
      const offered = (await api.exportParts()).parts;
      parts = offered.filter((p) => !p.apart);
      apart = offered.filter((p) => p.apart);
      chosen = parts.map((p) => p.id);
      // What a static host would not do, as the check before publishing says it.
      lose = (await api.check()).check.server ?? [];
    }),
);

function save({ blob, name }: { blob: Blob; name: string }): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

const toggle = (id: string, on: boolean): void => {
  chosen = on ? parts.map((p) => p.id).filter((p) => p === id || chosen.includes(p)) : chosen.filter((p) => p !== id);
};
const content = () => attempt('content', async () => save(await api.exportFile('content', apartChosen.length ? [...chosen, ...apartChosen] : all ? [] : chosen)));
const files = () => attempt('files', async () => save(await api.exportFile('files')));
</script>

<section class="export" data-list="export">
  <h1>{t.exp.heading}</h1>
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}

  <h2>{t.exp.contentHeading}</h2>
  <p class="hint">{t.exp.contentIntro}</p>
  <label class="check"><input type="checkbox" checked={all} onchange={(e) => (chosen = e.currentTarget.checked ? parts.map((p) => p.id) : [])} data-export-all /> <strong>{t.exp.all}</strong></label>
  <div class="parts">
    {#each parts as part (part.id)}
      <label class="check"><input type="checkbox" checked={chosen.includes(part.id)} onchange={(e) => toggle(part.id, e.currentTarget.checked)} data-export-part={part.id} /> {words[part.id] ?? part.name}</label>
    {/each}
  </div>
  {#each apart as part (part.id)}
    <label class="check"><input type="checkbox" checked={apartChosen.includes(part.id)} onchange={(e) => (apartChosen = e.currentTarget.checked ? [...apartChosen, part.id] : apartChosen.filter((p) => p !== part.id))} data-export-apart={part.id} /> <strong>{apartWords[part.id]?.name ?? part.name}</strong></label>
    <p class="hint apart">{apartWords[part.id]?.hint ?? ''}</p>
  {/each}
  <button type="button" class="primary" onclick={content} disabled={busy !== '' || (chosen.length === 0 && apartChosen.length === 0)} data-export-content>{busy === 'content' ? t.exp.working : t.exp.downloadContent}</button>

  <h2>{t.exp.filesHeading}</h2>
  <p class="hint">{t.exp.filesIntro}</p>
  {#if lose !== null}
    {#if lose.length === 0}
      <p class="good" data-export-fine>{t.exp.filesFine}</p>
    {:else}
      <p>{t.exp.filesLose}</p>
      <ul data-export-lose>
        {#each lose as what (what)}<li data-server-only={what}>{t.check.serverOnly[what] ?? what}</li>{/each}
      </ul>
    {/if}
  {/if}
  <button type="button" onclick={files} disabled={busy !== ''} data-export-files>{busy === 'files' ? t.exp.working : t.exp.downloadFiles}</button>

  <h2>{t.exp.dataHeading}</h2>
  {#if site.data === false}
    <p class="hint" data-export-data="off">{t.exp.dataOff}</p>
  {:else}
    <p class="hint" data-export-data="on">{say(t.exp.dataOn, { address: '/site.json' })}</p>
  {/if}
</section>

<style>
  .export { max-width: 760px; padding: var(--sp-6) var(--sp-8); }
  h1 { font-size: var(--size-xl); margin: 0 0 var(--sp-2); }
  h2 { font-size: var(--size-m); margin: var(--sp-8) 0 var(--sp-2); }
  .hint { color: var(--on-surface-variant); font-size: var(--size-m); }
  .parts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.2rem var(--sp-3); margin: var(--sp-1) 0 var(--sp-3) var(--sp-6); }
  .apart { margin: 0.1rem 0 var(--sp-3) var(--sp-6); }
  .check { display: flex; gap: var(--sp-2); align-items: center; font-size: var(--size-m); }
  ul { font-size: var(--size-m); margin: 0.2rem 0 var(--sp-3); }
  .good { color: var(--success); font-size: var(--size-m); }
  .bad { color: var(--error); font-size: var(--size-m); }
</style>
