<script lang="ts">
/**
 * One image field: upload a picture, pick one already uploaded, or point at
 * an address elsewhere. The words describing the picture belong to the place
 * it is used, so they are kept with the block, not with the file. A place
 * that has none is offered words from the file's name (ADR 0058 d2).
 */
import { altFromName, type ImageValue } from '../core/index.ts';
import { api, type MediaItem, signedIn } from './api.ts';
import { t } from './messages.ts';
import { uploadImage } from './sizes.ts';

let {
  label,
  value,
  onchange,
  library: only = false,
  named = true,
}: {
  label: string;
  value: ImageValue | null;
  onchange: (value: ImageValue) => void;
  /** Only an image of the media library, without words of its own: a person's picture (ADR 0056 d2). */
  library?: boolean;
  /** False: a picture whose words, left empty, are already right without them, such as the logo, read as the site's name. */
  named?: boolean;
} = $props();

let library = $state.raw<MediaItem[] | null>(null);
let busy = $state(false);
let problem = $state('');
let fileInput: HTMLInputElement | undefined = $state();

const src = $derived(value?.src ?? '');
const alt = $derived(value?.alt ?? '');
/** The words a picture keeps, or else those its file's name gives; a library-only field keeps none. A picture described in the library brings its own words (ADR 0072 d3). */
const offered = (name: string): string => (only || !named ? alt : alt || altFromName(name));

async function upload(event: Event): Promise<void> {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (!file) return;
  busy = true;
  problem = '';
  try {
    const { item, media } = await uploadImage(file);
    if (library) library = media.filter((m) => m.kind === 'image');
    onchange({ src: item.path, alt: offered(file.name) });
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
    library = (await api.media()).media.filter((item) => item.kind === 'image');
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

async function remove(name: string): Promise<void> {
  problem = '';
  try {
    library = (await api.removeMedia(name)).media.filter((item) => item.kind === 'image');
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}
</script>

<fieldset data-image-field>
  <legend>{label}</legend>
  {#if src}<img class="preview" {src} alt="" />{/if}
  <div class="actions">
    <button type="button" onclick={() => fileInput?.click()} disabled={busy}>{busy ? t.media.uploading : t.media.upload}</button>
    <button type="button" onclick={toggleLibrary} aria-expanded={library !== null} data-media-library>{t.media.library}</button>
    {#if src}<button type="button" class="quiet" onclick={() => onchange({ src: '', alt })}>{t.inspector.remove}</button>{/if}
  </div>
  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" bind:this={fileInput} onchange={upload} hidden data-media-file />
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  {#if library}
    {#if library.length === 0}
      <p class="hint">{t.media.empty}</p>
    {:else}
      <ul class="grid">
        {#each library as item (item.name)}
          <li>
            <button type="button" class="pick" class:current={item.path === src} onclick={() => onchange({ src: item.path, alt: !only && named && item.alt ? item.alt : offered(item.label) })} title={item.label} data-media={item.name}>
              <img src={item.path} alt={item.label} loading="lazy" />
            </button>
            {#if signedIn.staff}<button type="button" class="quiet drop" onclick={() => remove(item.name)} title={t.media.remove} aria-label={`${t.media.remove}: ${item.label}`}>✕</button>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
  {#if !only}
    <label><span>{t.inspector.imageAlt}</span>
      <input type="text" maxlength="300" value={alt} oninput={(e) => onchange({ src, alt: e.currentTarget.value })} data-image-alt />
    </label>
    <details>
      <summary>{t.media.elsewhere}</summary>
      <label><span>{t.inspector.imageSrc}</span>
        <input type="url" value={src} oninput={(e) => onchange({ src: e.currentTarget.value, alt })} data-image-src />
      </label>
    </details>
  {/if}
</fieldset>

<style>
  .preview { display: block; width: 100%; max-height: 9rem; object-fit: contain; margin-bottom: var(--sp-2); border-radius: var(--shape-xs); background: var(--surface-container); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--sp-1); margin-bottom: var(--sp-2); }
  .grid { list-style: none; margin: 0 0 var(--sp-2); padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-1); }
  .grid li { position: relative; }
  .pick { display: block; width: 100%; aspect-ratio: 1; padding: 2px !important; overflow: hidden; }
  .pick.current { border-color: var(--primary) !important; box-shadow: 0 0 0 2px var(--primary); }
  .pick img { width: 100%; height: 100%; object-fit: cover; border-radius: var(--shape-xs); }
  .drop { position: absolute; top: 2px; inset-inline-end: 2px; padding: 0 var(--sp-1) !important; background: color-mix(in oklch, var(--surface-lowest) 85%, transparent) !important; line-height: 1.4; }
  summary { cursor: pointer; font-size: var(--size-s); color: var(--on-surface-variant); margin-bottom: var(--sp-2); }
</style>
