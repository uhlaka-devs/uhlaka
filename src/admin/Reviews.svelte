<script lang="ts">
/**
 * To review (ADR 0055 d4): what contributors sent to be read, the oldest
 * first, with who wrote it. Opening one leads to the editor, where it is
 * published or sent back.
 */
import type { ContentType } from '../core/index.ts';
import type { Person, PostInfo } from './api.ts';
import { say, t } from './messages.ts';

let { types, entries, people, onopen }: { types: ContentType[]; entries: Record<string, PostInfo[]>; people: Person[]; onopen: (slug: string, kind: string) => void } = $props();

const waiting = $derived(
  types
    .flatMap((type) => (entries[type.id] ?? []).filter((e) => e.review?.state === 'waiting').map((entry) => ({ type, entry })))
    .sort((a, b) => (a.entry.review?.at ?? '').localeCompare(b.entry.review?.at ?? '')),
);
const nameOf = (id = ''): string => people.find((p) => p.id === id)?.name ?? '';
</script>

<section class="screen" data-list="review">
  <h1>{t.review.heading}</h1>
  <p class="hint">{t.review.intro}</p>
  {#if waiting.length === 0}
    <p class="hint" data-review-none>{t.review.none}</p>
  {:else}
    <ul class="waiting">
      {#each waiting as { type, entry } (`${type.id}/${entry.slug}`)}
        <li data-review={entry.slug}>
          <button type="button" class="open" onclick={() => onopen(entry.slug, type.id)}>{entry.title}</button>
          <small>{type.singular}{nameOf(entry.author) ? ` · ${say(t.review.by, { name: nameOf(entry.author) })}` : ''}</small>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h1 { margin: 0 0 0.5rem; font-size: 1.4rem; }
  .waiting { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.5rem; max-width: 46rem; }
  .waiting li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem 0.8rem; padding: 0.7rem 1rem; background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  .open { border: 0 !important; padding: 0 !important; background: none !important; font-weight: 600 !important; color: var(--primary) !important; text-align: start; }
  small { color: var(--on-surface-variant); }
</style>
