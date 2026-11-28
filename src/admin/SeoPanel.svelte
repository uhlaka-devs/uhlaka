<script lang="ts">
/**
 * "Search and sharing" for one page or entry (ADR 0050 d1): a title for
 * search engines, a picture for link previews, and the choice to hide it;
 * with what a search result and a link preview would show. A translation
 * writes only its title: the picture and the choice are the main page's.
 */
import { type ImageValue, type LinkTarget, LONG_TITLE, MAX_SEO_TITLE, type Seo } from '../core/index.ts';
import ImageField from './ImageField.svelte';
import { say, t } from './messages.ts';

let {
  seo,
  title,
  description,
  address,
  fallback = null,
  translation = false,
  suggestions = [],
  onchange,
}: {
  seo: Seo;
  /** The title the page has without one for search engines. */
  title: string;
  description: string;
  /** Where the page is, as a search result shows it. */
  address: string;
  /** The picture a preview shows when the page has none: the cover, or the site's. */
  fallback?: ImageValue | null;
  translation?: boolean;
  /** Pages and entries its words name that it does not link to yet (ADR 0077 d1). */
  suggestions?: LinkTarget[];
  onchange: (seo: Seo) => void;
} = $props();

const shown = $derived(seo.seoTitle || title);
const picture = $derived(seo.shareImage?.src || fallback?.src || '');
let copied = $state('');
async function copy(path: string): Promise<void> {
  await navigator.clipboard?.writeText(path).catch(() => {});
  copied = path;
}
const short = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
</script>

<details class="seo" data-seo>
  <summary>{t.inspector.seo}</summary>
  <label class="field">
    <span>{t.inspector.seoTitle}</span>
    <input type="text" maxlength={MAX_SEO_TITLE} placeholder={title} value={seo.seoTitle ?? ''} oninput={(e) => onchange({ ...seo, seoTitle: e.currentTarget.value })} data-seo-title />
    <small>{say(t.inspector.seoTitleHint, { count: LONG_TITLE })}</small>
  </label>
  {#if !translation}
    <div class="field">
      <ImageField label={t.inspector.shareImage} value={seo.shareImage ?? null} onchange={(image) => onchange({ ...seo, shareImage: image.src ? image : undefined })} />
      <small>{t.inspector.shareImageHint}</small>
    </div>
    <label class="check">
      <input type="checkbox" checked={!!seo.noindex} onchange={(e) => onchange({ ...seo, noindex: e.currentTarget.checked ? true : undefined })} data-seo-noindex />
      <span>{t.inspector.noindex}</span>
    </label>
    <small>{t.inspector.noindexHint}</small>
  {/if}
  {#if suggestions.length}
    <p class="label">{t.inspector.linkSuggestions}</p>
    <ul class="links" data-link-suggestions>
      {#each suggestions as target (target.path)}
        <li data-link-suggestion={target.path}>
          <span>{target.title} <code>{target.path}</code></span>
          <button type="button" class="quiet" onclick={() => copy(target.path)} data-link-copy={target.path}>{copied === target.path ? t.inspector.linkCopied : t.inspector.linkCopy}</button>
        </li>
      {/each}
    </ul>
    <small>{t.inspector.linkSuggestionsHint}</small>
  {/if}
  <p class="label">{t.inspector.seoPreview}</p>
  <div class="result" class:hidden={seo.noindex} data-seo-preview>
    <small>{address}</small>
    <strong>{short(shown, LONG_TITLE)}</strong>
    <span>{short(description, 160)}</span>
  </div>
  <p class="label">{t.inspector.sharePreview}</p>
  <div class="card" data-share-preview>
    {#if picture}<img src={picture} alt="" />{/if}
    <strong>{shown}</strong>
    {#if description}<span>{short(description, 120)}</span>{/if}
  </div>
</details>

<style>
  .seo { margin: 0 0 var(--sp-3); padding: var(--sp-2) var(--sp-2); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  summary { cursor: pointer; font-weight: 600; }
  .seo[open] summary { margin-bottom: var(--sp-2); }
  .check { display: flex; align-items: center; gap: var(--sp-2); }
  .check span { margin: 0; }
  .links { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-1); font-size: var(--size-s); }
  .links li { display: flex; align-items: center; gap: var(--sp-2); justify-content: space-between; overflow-wrap: anywhere; }
  .label { margin: var(--sp-3) 0 var(--sp-1); font-size: var(--size-s); color: var(--on-surface-variant); }
  .result, .card { display: grid; gap: 0.15rem; padding: var(--sp-2) var(--sp-2); border-radius: var(--shape-sm); background: var(--surface-lowest); border: 1px solid var(--outline-variant); overflow-wrap: anywhere; }
  .result strong { color: #1a0dab; font-weight: 500; font-size: var(--size-l); }
  .result span, .card span { color: #4d5156; font-size: var(--size-s); }
  .result.hidden { opacity: 0.45; text-decoration: line-through; }
  .card { padding: 0 0 var(--sp-2); overflow: hidden; }
  .card img { width: 100%; aspect-ratio: 1.91; object-fit: cover; }
  .card strong, .card span { padding: 0 var(--sp-2); }
  .card strong:first-child { padding-top: var(--sp-2); }
</style>
