<script lang="ts">
/**
 * A page behind a password (ADR 0043): set, changed, or taken away. It
 * applies at once to what is published; the password is never shown again.
 */
import { api } from './api.ts';
import { t } from './messages.ts';

let { slug }: { slug: string } = $props();

let locked = $state<boolean | null>(null);
let password = $state('');
let problem = $state('');
let done = $state(false);

async function attempt(work: () => Promise<{ locked: string[] }>, saved = false): Promise<void> {
  problem = '';
  done = false;
  try {
    locked = (await work()).locked.includes(slug);
    password = '';
    done = saved;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

$effect(() => {
  void attempt(api.locks);
});
</script>

<div class="lock" data-lock>
  <h3>{t.lock.heading}</h3>
  {#if locked !== null}
    <p data-lock-state={locked ? 'closed' : 'open'}>{locked ? t.lock.closed : t.lock.open}</p>
    <div class="row">
      <input type="password" placeholder={t.lock.password} autocomplete="new-password" bind:value={password} data-lock-password />
      <button type="button" disabled={password.length === 0} onclick={() => attempt(() => api.lock(slug, password), true)} data-lock-set>{t.lock.set}</button>
    </div>
    {#if locked}<button type="button" class="quiet" onclick={() => attempt(() => api.unlock(slug), true)} data-lock-remove>{t.lock.remove}</button>{/if}
    <p class="hint">{t.lock.runtime}</p>
  {/if}
  {#if done}<p class="good" role="status">{t.lock.done}</p>{/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</div>

<style>
  .lock { display: grid; gap: var(--sp-2); margin-top: var(--sp-5); padding-top: var(--sp-3); border-top: 1px solid var(--outline-variant); }
  h3 { margin: 0; font-size: var(--size-m); color: var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.04em; }
  p { margin: 0; }
  .row { display: flex; gap: var(--sp-2); }
  .row input { flex: 1; min-width: 0; }
  .lock > button { justify-self: start; }
  .good { color: var(--success); }
</style>
