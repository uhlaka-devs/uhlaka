<script lang="ts">
/**
 * Publish later (ADR 0039): a page or an entry is published at the hour
 * chosen, with what its draft holds then. The editor or the site's runtime
 * does it, whichever is running.
 */
import { api, type Kind } from './api.ts';
import { say, t } from './messages.ts';

let { slug, kind }: { slug: string; kind: Kind } = $props();

let set = $state<string | null>(null);
let chosen = $state('');
let problem = $state('');

const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const mine = (list: { kind: string; slug: string; at: string }[]): string | null => list.find((s) => s.kind === kind && s.slug === slug)?.at ?? null;

async function attempt(work: () => Promise<{ scheduled: { kind: string; slug: string; at: string }[] }>): Promise<void> {
  problem = '';
  try {
    set = mine((await work()).scheduled);
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

$effect(() => {
  void attempt(api.scheduled);
});
</script>

<div class="schedule" data-schedule>
  <h3>{t.schedule.heading}</h3>
  {#if set}
    <p data-schedule-set>{say(t.schedule.set, { when: when(set) })}</p>
    <button type="button" class="quiet" onclick={() => attempt(() => api.unschedule(kind, slug))} data-schedule-cancel>{t.schedule.cancel}</button>
  {:else}
    <div class="row">
      <input type="datetime-local" bind:value={chosen} data-schedule-at />
      <button type="button" disabled={!chosen} onclick={() => attempt(() => api.schedule(kind, slug, new Date(chosen).toISOString()))} data-schedule-save>{t.schedule.save}</button>
    </div>
    <p class="hint">{t.schedule.hint}</p>
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</div>

<style>
  .schedule { display: grid; gap: 0.4rem; margin-top: 1.2rem; padding-top: 0.8rem; border-top: 1px solid var(--outline-variant); }
  h3 { margin: 0; font-size: 0.85rem; color: var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.04em; }
  p { margin: 0; }
  .row { display: flex; gap: 0.4rem; }
  .row input { min-width: 0; flex: 1; }
  .schedule > button { justify-self: start; }
</style>
