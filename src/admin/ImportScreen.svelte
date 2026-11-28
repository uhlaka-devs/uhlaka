<script lang="ts">
/**
 * Bringing in a WordPress site from the admin (ADR 0012), or a content file
 * another Uhlaka site made (ADR 0057 d2). The file is read first and nothing
 * is written: the owner sees what would come over and what would not,
 * chooses, and only then starts it.
 */
import { onMount } from 'svelte';
import { api, type ImportPreview, type ImportProgress } from './api.ts';
import { say, t } from './messages.ts';

/** What the import brought over, in as many sentences as it needs. */
function summary(r: { pages: number; posts: number; entries: number; drafts: number; images: number; redirects: number; menu: boolean }): string {
  return [
    say(t.imp.summary, { pages: r.pages, posts: r.posts, drafts: r.drafts, images: r.images }),
    r.entries ? say(t.imp.summaryEntries, { count: r.entries }) : '',
    r.menu ? t.imp.summaryMenu : '',
    r.redirects ? say(t.imp.summaryRedirects, { count: r.redirects }) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

let { ondone }: { /** The site changed: read it again. */ ondone: () => Promise<void> } = $props();

let file = $state.raw<File | null>(null);
let preview = $state.raw<ImportPreview | null>(null);
let chosen = $state<string[]>([]);
let sections = $state<string[]>([]);
let images = $state(true);
let settings = $state(false);
let progress = $state.raw<ImportProgress>({ status: 'idle' });
let busy = $state(false);
let problem = $state('');
let fileInput: HTMLInputElement | undefined = $state();

const attempt = async (work: () => Promise<void>): Promise<void> => {
  problem = '';
  busy = true;
  try {
    await work();
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
  busy = false;
};

const read = (): Promise<void> =>
  attempt(async () => {
    if (file) preview = await api.importPlan(file, chosen, sections);
  });

function choose(event: Event): void {
  file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
  preview = null;
  chosen = [];
  sections = [];
  progress = { status: 'idle' };
  void read();
}

function toggle(type: string, on: boolean): void {
  chosen = on ? [...chosen, type] : chosen.filter((name) => name !== type);
  void read();
}

function section(nicename: string, on: boolean): void {
  sections = on ? [...sections, nicename] : sections.filter((name) => name !== nicename);
  void read();
}

async function watch(): Promise<void> {
  while (progress.status === 'running') {
    await new Promise((resolve) => setTimeout(resolve, 700));
    progress = await api.importProgress();
  }
  if (progress.status === 'done') await ondone();
}

const run = (): Promise<void> =>
  attempt(async () => {
    if (!file) return;
    progress = await api.importRun(file, { types: chosen, categories: sections, images, settings });
    await watch();
  });

function again(): void {
  void api.importForget();
  file = null;
  preview = null;
  progress = { status: 'idle' };
  if (fileInput) fileInput.value = '';
}

// An import started before this screen was left is still running, or has finished.
onMount(() =>
  void attempt(async () => {
    progress = await api.importProgress();
    await watch();
  }),
);
</script>

<section class="screen" data-list="import">
  <header>
    <h1>{t.imp.heading}</h1>
  </header>
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  <input type="file" accept=".xml,text/xml,application/xml,.json,application/json" bind:this={fileInput} onchange={choose} hidden data-import-file />

  {#if progress.status === 'running'}
    <p data-import-running>{progress.total ? say(t.imp.copying, { done: progress.done, total: progress.total }) : t.imp.writing}</p>
    {#if progress.total}<progress value={progress.done} max={progress.total}></progress>{/if}
    <p class="hint">{t.imp.stay}</p>
  {:else if progress.status === 'done'}
    {@const report = progress.report}
    <div class="card" data-import-done>
      <h2>{t.imp.done}</h2>
      <p>{summary(report)}</p>
      {#if report.notes.length}
        <h3>{t.imp.notes}</h3>
        <ul class="notes">
          {#each report.notes as note}<li>{note}</li>{/each}
        </ul>
      {/if}
      <button type="button" onclick={again}>{t.imp.another}</button>
    </div>
  {:else}
    {#if progress.status === 'failed'}<p class="bad" role="alert">{say(t.imp.failed, { reason: progress.error })}</p>{/if}
    <p class="intro">{t.imp.intro}</p>
    <p class="intro">{t.imp.introContent}</p>
    <p><button type="button" class={preview ? '' : 'primary'} onclick={() => fileInput?.click()} disabled={busy} data-import-choose>{file ? t.imp.other : t.imp.choose}</button> {#if file}<span class="quiet">{file.name}</span>{/if}</p>
    {#if file && !preview && busy}<p class="hint">{t.imp.reading}</p>{/if}
    {#if preview}
      <div class="card" data-import-preview>
        <h2>{say(t.imp.found, { name: preview.site.name })}</h2>
        {#if preview.site.url}<p class="quiet">{preview.site.url}</p>{/if}
        <ul class="counts">
          <li><strong>{preview.pages}</strong> {t.imp.pages}</li>
          <li><strong>{preview.posts}</strong> {t.imp.posts}</li>
          {#each preview.types as type (type.id)}<li><strong>{type.count}</strong> {type.name}</li>{/each}
          {#if preview.kind === 'uhlaka'}
            <li><strong>{preview.sections ?? 0}</strong> {t.imp.sectionCount}</li>
            <li><strong>{preview.forms ?? 0}</strong> {t.imp.formCount}</li>
          {/if}
          <li><strong>{preview.images}</strong> {preview.kind === 'uhlaka' ? t.imp.files : t.imp.images}</li>
          <li><strong>{preview.redirects}</strong> {t.imp.redirects}</li>
        </ul>

        {#if preview.others.length || chosen.length}
          <h3>{t.imp.others}</h3>
          <p class="hint">{t.imp.othersHint}</p>
          {#each [...chosen.map((type) => ({ type, count: preview?.types.find((p) => p.id === type)?.count ?? 0 })), ...preview.others.filter((o) => !chosen.includes(o.type))] as other (other.type)}
            <label class="check"><input type="checkbox" checked={chosen.includes(other.type)} onchange={(e) => toggle(other.type, e.currentTarget.checked)} disabled={busy} data-import-type={other.type} /> {other.type} <span class="quiet">({say(t.ctypes.entries, { count: other.count })})</span></label>
          {/each}
        {/if}

        {#if preview.categories.length}
          <h3>{t.imp.sections}</h3>
          <p class="hint">{t.imp.sectionsHint}</p>
          {#each preview.categories as category (category.nicename)}
            <label class="check"><input type="checkbox" checked={sections.includes(category.nicename)} onchange={(e) => section(category.nicename, e.currentTarget.checked)} disabled={busy} data-import-category={category.nicename} /> {category.name} <span class="quiet">({say(t.imp.postCount, { count: category.count })})</span></label>
          {/each}
        {/if}

        {#if preview.kind !== 'uhlaka' || preview.menu}<h3>{t.imp.choices}</h3>{/if}
        {#if preview.kind === 'uhlaka'}
          {#if preview.menu}
            <label class="check"><input type="checkbox" bind:checked={settings} data-import-settings /> {t.imp.settingsContent}</label>
            <p class="hint">{t.imp.settingsContentHint}</p>
          {/if}
        {:else}
          <label class="check"><input type="checkbox" bind:checked={images} data-import-images /> {t.imp.copyImages}</label>
          <p class="hint">{t.imp.copyImagesHint}</p>
          <label class="check"><input type="checkbox" bind:checked={settings} data-import-settings /> {t.imp.settings}</label>
          <p class="hint">{preview.menu ? t.imp.settingsHint : t.imp.settingsNoMenu}</p>
        {/if}

        {#if preview.notes.length}
          <h3>{t.imp.notes}</h3>
          <ul class="notes">
            {#each preview.notes as note}<li>{note}</li>{/each}
          </ul>
        {/if}
        <p class="hint">{t.imp.safe}</p>
        <button type="button" class="primary" onclick={run} disabled={busy} data-import-run>{t.imp.run}</button>
      </div>
    {/if}
  {/if}
</section>

<style>
  header { margin-bottom: var(--sp-4); }
  h1 { margin: 0; font-size: var(--size-2xl); }
  h2 { margin: 0 0 var(--sp-1); font-size: var(--size-l); }
  h3 { margin: var(--sp-5) 0 var(--sp-1); font-size: var(--size-l); }
  .intro { max-width: 46rem; }
  .card { max-width: 46rem; padding: var(--sp-5) var(--sp-6); background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  .counts { list-style: none; margin: var(--sp-3) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-6); }
  .counts strong { font-size: var(--size-xl); }
  .notes { margin: 0; padding-inline-start: var(--sp-5); display: grid; gap: var(--sp-2); white-space: pre-line; }
  .check { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-2); }
  .quiet { color: var(--on-surface-variant); }
  progress { width: min(100%, 30rem); }
  button.primary { margin-top: var(--sp-4); }
</style>
