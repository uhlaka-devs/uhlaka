<script lang="ts">
/**
 * Every file the site holds, in one place: images (ADR 0005), documents, sound
 * and video (ADR 0046). Upload, look, delete. A file a page still shows or
 * links to is not deleted; the server says where it is used. A file chosen
 * opens its details beside the list (ADR 0072): its name, the words a picture
 * is offered with, what it is, its address, and where it is used.
 */
import { onMount } from 'svelte';
import { api, type MediaItem, signedIn } from './api.ts';
import { say, t } from './messages.ts';
import { ACCEPT_FILES, missing, prepareAll, uploadFile } from './sizes.ts';

let items = $state.raw<MediaItem[] | null>(null);
let busy = $state(false);
let problem = $state('');
let fileInput: HTMLInputElement | undefined = $state();
/** The smaller copies being made: how many pictures are done, of how many. */
let sizing = $state<{ done: number; count: number } | null>(null);
/** Which kind of file is shown; empty for all. */
let only = $state<'' | MediaItem['kind']>('');
const kinds = $derived([...new Set((items ?? []).map((item) => item.kind))]);
const shown = $derived((items ?? []).filter((item) => !only || item.kind === only));
/** What a file is, in a few letters: PDF, DOCX, MP3. */
const badge = (name: string): string => (name.split('.').pop() ?? '').toUpperCase();

/** The file whose details are open, and what is being written in them. */
let open = $state<string | null>(null);
const chosen = $derived(items?.find((item) => item.name === open) ?? null);
let label = $state('');
let alt = $state('');
let usedBy = $state<string[] | null>(null);
let note = $state('');
let copied = $state(false);
const changed = $derived(!!chosen && (label.trim() !== chosen.label || alt.trim() !== chosen.alt));

const attempt = async (work: () => Promise<{ media: MediaItem[] }>): Promise<void> => {
  problem = '';
  try {
    items = (await work()).media;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
};

async function upload(event: Event): Promise<void> {
  const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
  busy = true;
  for (const file of files) await attempt(() => uploadFile(file));
  busy = false;
  if (fileInput) fileInput.value = '';
}

const size = (bytes: number): string => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const day = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(document.documentElement.lang || undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

/** Pictures uploaded before they were made get their smaller copies here, once (ADR 0005 d8). */
async function prepare(): Promise<void> {
  if (!items || sizing) return;
  items = await prepareAll(items, (done, count) => (sizing = { done, count }));
  sizing = null;
}

async function show(item: MediaItem): Promise<void> {
  open = item.name;
  label = item.label || item.name;
  alt = item.alt;
  note = '';
  copied = false;
  usedBy = null;
  try {
    const { usedBy: where } = await api.mediaUsedBy(item.name);
    if (open === item.name) usedBy = where;
  } catch {
    usedBy = null;
  }
}

async function save(): Promise<void> {
  if (!chosen) return;
  note = '';
  await attempt(() => api.setMedia(chosen.name, { label: label.trim(), ...(chosen.kind === 'image' ? { alt: alt.trim() } : {}) }));
  if (!problem) note = t.media.saved;
}

async function remove(item: MediaItem): Promise<void> {
  await attempt(() => api.removeMedia(item.name));
  if (!problem && open === item.name) open = null;
}

async function copy(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(new URL(path, location.origin).href);
    copied = true;
  } catch {
    copied = false;
  }
}

onMount(async () => {
  await attempt(api.media);
  await prepare();
});
</script>

<section class="screen" data-list="media">
  <header>
    <h1>{t.nav.media}</h1>
    <button type="button" class="primary" onclick={() => fileInput?.click()} disabled={busy}>{busy ? t.media.uploading : t.media.uploadFile}</button>
    <input type="file" multiple accept={ACCEPT_FILES} bind:this={fileInput} onchange={upload} hidden data-library-file />
  </header>
  <p class="hint">{t.media.accepts}</p>
  {#if kinds.length > 1}
    <div class="kinds" role="group">
      <button type="button" class="quiet" aria-pressed={only === ''} onclick={() => (only = '')}>{t.media.all}</button>
      {#each kinds as kind (kind)}<button type="button" class="quiet" aria-pressed={only === kind} onclick={() => (only = kind)} data-media-kind={kind}>{t.media.kinds[kind] ?? kind}</button>{/each}
    </div>
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  {#if sizing}
    <p class="hint" data-media-sizing>{say(t.media.sizing, sizing)}</p>
  {:else if items?.some((item) => missing(item).length > 0)}
    <p><button type="button" class="quiet" onclick={prepare} data-media-sizes>{t.media.sizes}</button></p>
  {/if}
  {#if items && items.length === 0}
    <p class="hint">{t.media.empty}</p>
  {:else if items}
    <div class="split" class:open={chosen}>
      <ul>
        {#each shown as item (item.name)}
          <li data-media-item={item.name} class:current={item.name === open}>
            {#if item.kind === 'image'}
              <button type="button" class="thumb" onclick={() => show(item)} aria-label={say(t.media.open, { name: item.label || item.name })} data-media-open={item.name}><img src={item.path} alt="" loading="lazy" /></button>
            {:else if item.kind === 'video'}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video src={item.path} preload="metadata" controls></video>
            {:else}
              <button type="button" class="thumb file" onclick={() => show(item)} aria-label={say(t.media.open, { name: item.label || item.name })} data-media-open={item.name} data-kind={item.kind}>{badge(item.name)}</button>
            {/if}
            {#if item.kind === 'audio'}<audio src={item.path} preload="none" controls></audio>{/if}
            <button type="button" class="label" title={item.label} onclick={() => show(item)} data-media-name={item.name}>{item.label || item.name}</button>
            <small>{size(item.size)}</small>
            {#if signedIn.staff}<button type="button" class="quiet" onclick={() => remove(item)}>{item.kind === 'image' ? t.media.remove : t.media.removeFile}</button>{/if}
          </li>
        {/each}
      </ul>
      {#if chosen}
        <aside class="details" aria-label={t.media.details} data-media-details={chosen.name}>
          <header>
            <h2>{t.media.details}</h2>
            <button type="button" class="quiet" onclick={() => (open = null)} aria-label={t.media.close}>✕</button>
          </header>
          {#if chosen.kind === 'image'}
            <img class="big" src={chosen.path} alt={chosen.alt} />
          {:else if chosen.kind === 'video'}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video class="big" src={chosen.path} preload="metadata" controls></video>
          {:else if chosen.kind === 'audio'}
            <audio src={chosen.path} preload="none" controls></audio>
          {/if}
          {#if signedIn.staff}
            <form onsubmit={(e) => (e.preventDefault(), save())}>
              <label class="field">
                <span>{t.media.name}</span>
                <input type="text" maxlength="200" bind:value={label} required data-media-label />
                <small>{t.media.nameHint}</small>
              </label>
              {#if chosen.kind === 'image'}
                <label class="field">
                  <span>{t.media.alt}</span>
                  <textarea rows="3" maxlength="300" bind:value={alt} data-media-alt></textarea>
                  <small>{t.media.altHint}</small>
                </label>
              {/if}
              <p class="row">
                <button type="submit" class="primary" disabled={!changed || !label.trim()} data-media-save>{t.media.save}</button>
                {#if note}<span class="hint" role="status">{note}</span>{/if}
              </p>
            </form>
          {:else}
            <p class="title">{chosen.label || chosen.name}</p>
            {#if chosen.alt}<p class="hint">{chosen.alt}</p>{/if}
          {/if}
          <dl>
            <dt>{t.media.kind}</dt>
            <dd>{badge(chosen.name)}</dd>
            <dt>{t.media.fileSize}</dt>
            <dd>{size(chosen.size)}</dd>
            {#if chosen.width && chosen.height}
              <dt>{t.media.dimensions}</dt>
              <dd>{chosen.width} × {chosen.height} px</dd>
            {/if}
            {#if day(chosen.uploadedAt)}
              <dt>{t.media.uploaded}</dt>
              <dd>{day(chosen.uploadedAt)}</dd>
            {/if}
            <dt>{t.media.address}</dt>
            <dd class="address">
              <a href={chosen.path} target="_blank" rel="noopener" data-media-path>{chosen.path}</a>
              <button type="button" class="quiet" onclick={() => chosen && copy(chosen.path)} data-media-copy>{copied ? t.media.copied : t.media.copy}</button>
            </dd>
            <dt>{t.media.usedOn}</dt>
            <dd data-media-used>
              {#if usedBy === null}…{:else if usedBy.length === 0}<span class="hint">{t.media.unused}</span>{:else}<ul class="used">{#each usedBy as title, i (i)}<li>{title}</li>{/each}</ul>{/if}
            </dd>
          </dl>
          {#if signedIn.staff}<button type="button" class="danger" onclick={() => chosen && remove(chosen)}>{chosen.kind === 'image' ? t.media.remove : t.media.removeFile}</button>{/if}
        </aside>
      {/if}
    </div>
  {/if}
</section>

<style>
  header { display: flex; align-items: center; gap: var(--sp-4); margin-bottom: var(--sp-4); }
  h1 { margin: 0; font-size: var(--size-2xl); flex: 1; }
  .split { display: grid; gap: var(--sp-4); align-items: start; }
  .split.open { grid-template-columns: minmax(0, 1fr) 22rem; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: var(--sp-3); }
  li { display: grid; gap: var(--sp-1); padding: var(--sp-2); background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  li.current { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
  .thumb { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: pointer; }
  img, video, .file { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--shape-xs); background: var(--surface-container); }
  .file { display: grid; place-items: center; font-weight: 700; font-size: var(--size-xl); color: var(--on-surface-variant); }
  .thumb:focus-visible, .label:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  audio { width: 100%; }
  .kinds { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-4); }
  .kinds [aria-pressed='true'] { font-weight: 700; text-decoration: underline; }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; padding: 0; border: 0; background: none; text-align: start; cursor: pointer; }
  .label:hover { color: var(--primary); text-decoration: underline; }
  .details { position: sticky; top: 0; display: grid; gap: var(--sp-3); padding: var(--sp-4); background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  .details header { margin: 0; }
  .details h2 { flex: 1; margin: 0; font-size: var(--size-l); }
  .details .big { aspect-ratio: auto; max-height: 16rem; object-fit: contain; }
  .details form { display: grid; }
  .details .title { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
  .row { display: flex; align-items: center; gap: var(--sp-2); margin: 0; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: var(--sp-1) var(--sp-3); margin: 0; font-size: var(--size-m); }
  dt { color: var(--on-surface-variant); }
  dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .address { display: grid; justify-items: start; gap: 0.2rem; }
  .address a { max-width: 100%; color: var(--primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .address button { padding: 0.1rem 0; }
  .used { display: block; padding: 0; }
  .used li { display: list-item; padding: 0; border: 0; background: none; list-style: disc inside; }
  @media (max-width: 900px) {
    .split.open { grid-template-columns: 1fr; }
    .details { position: static; order: -1; }
  }
</style>
