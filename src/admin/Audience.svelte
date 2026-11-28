<script lang="ts">
/**
 * Who sees a page, an entry or a whole content type (ADR 0064 d4): everyone,
 * visitors signed in, or members of chosen levels. It applies at once to
 * what is published. Nothing of it is shown while visitor accounts are off
 * (d8): the call is refused, and this stays empty.
 */
import type { Audience, Audiences, Level } from '../core/index.ts';
import { api } from './api.ts';
import { t } from './messages.ts';

let { kind, key }: { kind: 'page' | 'entry' | 'type'; key: string } = $props();

let levels = $state<Level[] | null>(null);
let audience = $state<Audience | null>(null);
let problem = $state('');
let done = $state(false);

const part = { page: 'pages', entry: 'entries', type: 'types' } as const;
const mine = (all: Audiences): Audience | null => all[part[kind]][key] ?? null;

$effect(() => {
  api.audiences().then(
    (shown) => {
      // Visitor accounts are off: no "Who sees it".
      if (!shown.audiences || !shown.levels) return;
      levels = shown.levels;
      audience = mine(shown.audiences);
    },
    // Visitor accounts are off: no "Who sees it".
    () => (levels = null),
  );
});

async function choose(next: Audience | null): Promise<void> {
  problem = '';
  done = false;
  try {
    const shown = await api.setAudience(kind, key, next);
    audience = mine(shown.audiences);
    done = true;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

const held = (id: string): boolean => audience?.who === 'members' && audience.levels.includes(id);
function toggle(id: string, on: boolean): void {
  const now = audience?.who === 'members' ? audience.levels : [];
  const next = on ? [...now, id] : now.filter((l) => l !== id);
  void choose(next.length ? { who: 'members', levels: next } : { who: 'signed' });
}
</script>

{#if levels !== null}
  <div class="audience" data-audience={kind}>
    <h3>{t.audience.heading}</h3>
    <label class="check"><input type="radio" name={`audience-${kind}-${key}`} checked={audience === null} onchange={() => choose(null)} data-audience-who="everyone" /><span>{t.audience.everyone}</span></label>
    <label class="check"><input type="radio" name={`audience-${kind}-${key}`} checked={audience?.who === 'signed'} onchange={() => choose({ who: 'signed' })} data-audience-who="signed" /><span>{t.audience.signed}</span></label>
    {#if levels.length}
      <label class="check">
        <input type="radio" name={`audience-${kind}-${key}`} checked={audience?.who === 'members'} onchange={() => choose({ who: 'members', levels: [(levels as Level[])[0]?.id ?? ''] })} data-audience-who="members" />
        <span>{t.audience.members}</span>
      </label>
      {#if audience?.who === 'members'}
        <div class="levels">
          {#each levels as level (level.id)}
            <label class="check"><input type="checkbox" checked={held(level.id)} onchange={(e) => toggle(level.id, e.currentTarget.checked)} data-audience-level={level.id} /><span>{level.name}</span></label>
          {/each}
        </div>
      {/if}
    {:else}
      <p class="hint">{t.audience.noLevels}</p>
    {/if}
    {#if kind === 'type'}<p class="hint">{t.audience.typeHint}</p>{/if}
    {#if audience !== null}<p class="hint" data-audience-closed>{t.audience.closed}</p>{/if}
    {#if done}<p class="good" role="status">{t.audience.done}</p>{/if}
    {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  </div>
{/if}

<style>
  .audience { display: grid; gap: var(--sp-1); margin-top: var(--sp-5); padding-top: var(--sp-3); border-top: 1px solid var(--outline-variant); }
  h3 { margin: 0; font-size: var(--size-m); color: var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.04em; }
  p { margin: 0; }
  .check { display: flex; align-items: center; gap: var(--sp-2); }
  .check span { margin: 0; }
  .levels { display: grid; gap: 0.2rem; padding-inline-start: var(--sp-6); }
  .good { color: var(--success); }
</style>
