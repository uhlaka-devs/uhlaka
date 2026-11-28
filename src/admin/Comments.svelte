<script lang="ts">
/**
 * What visitors wrote under entries (ADR 0040), those waiting first: approve
 * what may be shown on the site, delete the rest. The writer's address is
 * shown here, to answer them, and never on the site.
 */
import { onMount } from 'svelte';
import { contentTypes, entryPath, type Site } from '../core/index.ts';
import { api, type Comment } from './api.ts';
import { say, t } from './messages.ts';

let { site, entries }: { site: Site; entries: Record<string, { slug: string; title: string }[]> } = $props();
let items = $state.raw<Comment[] | null>(null);
let problem = $state('');

const attempt = async (work: () => Promise<{ comments: Comment[] }>): Promise<void> => {
  problem = '';
  try {
    items = (await work()).comments;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
};

const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
/** The entry a comment is on, by its title, and where it is on the site. */
const where = (c: Comment): { title: string; href: string } => {
  const type = contentTypes(site).find((ty) => ty.id === c.type);
  const title = entries[c.type]?.find((e) => e.slug === c.entry)?.title ?? c.entry;
  return { title, href: type && site.url ? `${site.url}${entryPath(type, c.entry)}` : '' };
};

onMount(() => void attempt(api.comments));
</script>

<section class="screen" data-list="comments">
  <header>
    <h1>{t.comments.heading}</h1>
  </header>
  <p class="hint">{t.comments.intro}</p>
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  {#if items && items.length === 0}
    <p class="hint">{t.comments.empty}</p>
  {:else if items}
    <ul class="comments">
      {#each items as c (c.id)}
        {@const on = where(c)}
        <li data-comment={c.id} data-approved={c.approved ? 'yes' : c.spam ? 'spam' : 'no'}>
          <p class="from">
            <span class="state" class:waiting={!c.approved}>{c.approved ? t.comments.shown : c.spam ? t.comments.spam : t.comments.waiting}</span>
            <strong>{c.name}</strong> <a href={`mailto:${c.email}`}>{c.email}</a>
            <small>{when(c.at)} · {#if on.href}<a href={on.href} target="_blank" rel="noopener">{say(t.comments.on, { entry: on.title })}</a>{:else}{say(t.comments.on, { entry: on.title })}{/if}</small>
          </p>
          <p class="body">{c.body}</p>
          <div class="actions">
            {#if !c.approved}<button type="button" onclick={() => attempt(() => api.approveComment(c.id))} data-comment-approve>{t.comments.approve}</button>{/if}
            <button type="button" class="quiet" onclick={() => attempt(() => api.removeComment(c.id))} data-comment-delete>{t.comments.remove}</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  header { margin-bottom: 0.5rem; }
  h1 { margin: 0; font-size: 1.4rem; }
  .comments { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.8rem; max-width: 46rem; }
  .comments li { padding: 1rem 1.2rem; background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  .from { margin: 0 0 0.4rem; display: flex; flex-wrap: wrap; gap: 0.3rem 0.8rem; align-items: baseline; }
  .from small { color: var(--on-surface-variant); }
  .state { font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: var(--shape-full); background: var(--success-container); color: var(--success); }
  .state.waiting { background: var(--warning-container); color: var(--warning); }
  .body { margin: 0 0 0.5rem; white-space: pre-line; }
  .actions { display: flex; gap: 0.5rem; }
</style>
