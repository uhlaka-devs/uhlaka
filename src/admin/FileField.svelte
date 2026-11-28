<script lang="ts">
/**
 * One file field (ADR 0047): upload a document, a sound or a video, pick one
 * already uploaded, or, for sound and video, paste the address of a known
 * service's page. A document also takes the words its link shows.
 */
import { EMBED_SERVICES, embedOf, type FileValue } from '../core/index.ts';
import { api, type MediaItem } from './api.ts';
import { t } from './messages.ts';
import { uploadFile } from './sizes.ts';

let { label, accept, value, onchange }: { label: string; accept: 'document' | 'audio' | 'video'; value: FileValue | null; onchange: (value: FileValue | null) => void } = $props();

let library = $state.raw<MediaItem[] | null>(null);
let busy = $state(false);
let problem = $state('');
let fileInput: HTMLInputElement | undefined = $state();

const src = $derived(value?.src ?? '');
const words = $derived(value?.label ?? '');
const stored = $derived(src.startsWith('/media/'));
const ACCEPT = {
  document: 'application/pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.zip',
  audio: 'audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav',
  video: 'video/mp4,video/webm,.mp4,.webm',
};
const mine = (items: MediaItem[]): MediaItem[] => items.filter((item) => item.kind === accept);
/** The words a document's link starts with: its name, without what it ends in. */
const named = (item: MediaItem): string => (accept === 'document' ? words || item.label.replace(/\.[a-z0-9]{2,4}$/i, '') : '');

async function upload(event: Event): Promise<void> {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (!file) return;
  busy = true;
  problem = '';
  try {
    const { item, media } = await uploadFile(file);
    if (item.kind !== accept) throw new Error(t.files.wrongKind);
    if (library) library = mine(media);
    onchange({ src: item.path, label: named(item) });
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
  busy = false;
  if (fileInput) fileInput.value = '';
}

async function toggleLibrary(): Promise<void> {
  problem = '';
  if (library) {
    library = null;
    return;
  }
  try {
    library = mine((await api.media()).media);
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

/** A pasted address: a service's page for sound and video, any address for a document. */
function paste(address: string): void {
  problem = '';
  const trimmed = address.trim();
  if (!trimmed) return onchange(null);
  if (accept !== 'document' && embedOf(trimmed)?.kind !== accept) problem = t.files.notKnown.replace('{services}', EMBED_SERVICES);
  onchange({ src: trimmed, label: words });
}
</script>

<fieldset data-file-field={accept}>
  <legend>{label}</legend>
  {#if src}<p class="current" data-file-current>{stored ? (words || src.split('/').pop()) : src}</p>{/if}
  <div class="actions">
    <button type="button" onclick={() => fileInput?.click()} disabled={busy}>{busy ? t.media.uploading : t.files.upload[accept]}</button>
    <button type="button" onclick={toggleLibrary} aria-expanded={library !== null} data-file-library>{t.media.library}</button>
    {#if src}<button type="button" class="quiet" onclick={() => onchange(null)}>{t.inspector.remove}</button>{/if}
  </div>
  <input type="file" accept={ACCEPT[accept]} bind:this={fileInput} onchange={upload} hidden data-file-input />
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  {#if library}
    {#if library.length === 0}
      <p class="hint">{t.media.empty}</p>
    {:else}
      <ul class="list">
        {#each library as item (item.name)}
          <li><button type="button" class="pick" class:current={item.path === src} onclick={() => onchange({ src: item.path, label: named(item) })} data-file={item.name}>{item.label || item.name}</button></li>
        {/each}
      </ul>
    {/if}
  {/if}
  {#if accept === 'document'}
    <label><span>{t.files.words}</span>
      <input type="text" maxlength="200" value={words} oninput={(e) => onchange(src ? { src, label: e.currentTarget.value } : null)} data-file-words />
    </label>
  {/if}
  <details open={!!src && !stored}>
    <summary>{t.files.elsewhere[accept]}</summary>
    <label><span>{accept === 'document' ? t.files.address : t.files.service.replace('{services}', EMBED_SERVICES)}</span>
      <input type="url" value={stored ? '' : src} onchange={(e) => paste(e.currentTarget.value)} data-file-address />
    </label>
  </details>
</fieldset>

<style>
  .current { margin: 0 0 0.5rem; font-weight: 600; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
  .list { list-style: none; margin: 0 0 0.6rem; padding: 0; display: grid; gap: 0.25rem; max-height: 12rem; overflow: auto; }
  .pick { width: 100%; text-align: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pick.current { border-color: var(--primary) !important; box-shadow: 0 0 0 2px var(--primary); }
  summary { cursor: pointer; font-size: 12.5px; color: var(--on-surface-variant); margin-bottom: 0.4rem; }
</style>
