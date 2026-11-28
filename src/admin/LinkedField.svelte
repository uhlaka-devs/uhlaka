<script lang="ts">
/**
 * A field that links to other entries (ADR 0052 d2): the titles it holds, to
 * move or take out, and "Add", which finds one by its title. Nothing is typed
 * by hand and no address is shown.
 */
import type { ContentType } from '../core/index.ts';
import type { PostInfo } from './api.ts';
import { say, t } from './messages.ts';

let {
  label,
  type,
  entries,
  value,
  max,
  own = '',
  onchange,
}: {
  label: string;
  /** The type it links to. */
  type: ContentType | undefined;
  /** That type's entries, drafts among them. */
  entries: PostInfo[];
  value: string[];
  max: number;
  /** The address of the entry being edited, when it is of that type: it does not link to itself. */
  own?: string;
  onchange: (value: string[]) => void;
} = $props();

let finding = $state(false);
let query = $state('');

const titleOf = (slug: string): string => entries.find((e) => e.slug === slug)?.title ?? slug;
const fold = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const offered = $derived(
  entries.filter((e) => e.slug !== own && !value.includes(e.slug) && fold(e.title).includes(fold(query.trim()))).slice(0, 12),
);
const move = (i: number, by: -1 | 1): void => {
  const next = [...value];
  [next[i], next[i + by]] = [next[i + by] as string, next[i] as string];
  onchange(next);
};
const pick = (slug: string): void => {
  onchange(max === 1 ? [slug] : [...value, slug]);
  finding = false;
  query = '';
};
</script>

<fieldset class="linked">
  <legend>{label}</legend>
  {#if value.length}
    <ol>
      {#each value as slug, i (slug)}
        <li data-linked={slug}>
          <span>{titleOf(slug)}</span>
          {#if max > 1}
            <button type="button" class="quiet" disabled={i === 0} onclick={() => move(i, -1)} aria-label={t.actions.up} title={t.actions.up}>↑</button>
            <button type="button" class="quiet" disabled={i === value.length - 1} onclick={() => move(i, 1)} aria-label={t.actions.down} title={t.actions.down}>↓</button>
          {/if}
          <button type="button" class="quiet" onclick={() => onchange(value.filter((s) => s !== slug))} aria-label={t.inspector.remove} title={t.inspector.remove}>✕</button>
        </li>
      {/each}
    </ol>
  {/if}
  {#if finding}
    <!-- svelte-ignore a11y_autofocus -->
    <input type="search" placeholder={t.ctypes.findLinked} bind:value={query} autofocus data-linked-find />
    {#if offered.length}
      <ul>
        {#each offered as entry (entry.slug)}<li><button type="button" onclick={() => pick(entry.slug)} data-linked-pick={entry.slug}>{entry.title}</button></li>{/each}
      </ul>
    {:else}
      <p class="hint">{entries.some((e) => e.slug !== own) ? t.ctypes.noneFound : say(t.ctypes.noLinked, { type: type?.name ?? '' })}</p>
    {/if}
    <button type="button" class="quiet" onclick={() => ((finding = false), (query = ''))}>{t.app.cancel}</button>
  {:else if value.length < max || max === 1}
    <button type="button" onclick={() => (finding = true)} data-linked-add>+ {t.ctypes.addLinked}</button>
  {/if}
</fieldset>

<style>
  .linked ol, .linked ul { list-style: none; margin: 0 0 var(--sp-2); padding: 0; }
  .linked ol li { display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-1) 0; border-bottom: 1px solid var(--outline-variant); }
  .linked ol li span { flex: 1; }
  .linked ul li button { width: 100%; text-align: start; margin-bottom: 0.2rem; }
  .linked input { width: 100%; margin-bottom: var(--sp-2); }
</style>
