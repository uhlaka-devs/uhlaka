<script lang="ts" module>
  /**
   * Light, dark or like the device (ADR 0084 d4). The choice is this person's
   * on this device, so it is kept in the browser and set on <html> as
   * `data-scheme`, which the tokens read.
   */
  export type Scheme = '' | 'light' | 'dark';
  const KEY = 'uhlaka.admin.scheme';

  export function storedScheme(): Scheme {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : '';
    } catch {
      return '';
    }
  }

  export function applyScheme(scheme: Scheme): void {
    if (scheme) document.documentElement.dataset.scheme = scheme;
    else delete document.documentElement.dataset.scheme;
  }
</script>

<script lang="ts">
  import { t } from './messages.ts';

  let scheme = $state<Scheme>(storedScheme());

  function choose(next: Scheme): void {
    scheme = next;
    try {
      if (next) localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch {
      // A browser that keeps nothing still shows the choice until the page is closed.
    }
    applyScheme(next);
  }
</script>

<div class="field" role="group" aria-labelledby="scheme-label">
  <span id="scheme-label" class="label">{t.scheme.label}</span>
  <div class="segments">
    {#each [['', t.scheme.device], ['light', t.scheme.light], ['dark', t.scheme.dark]] as [value, word] (value)}
      <button type="button" aria-pressed={scheme === value} onclick={() => choose(value as Scheme)} data-scheme-choice={value || 'device'}>{word}</button>
    {/each}
  </div>
  <small>{t.scheme.hint}</small>
</div>

<style>
  .label { display: block; margin-bottom: var(--sp-1); font: var(--label-m); color: var(--on-surface-variant); }
  .segments { display: inline-flex; margin-bottom: var(--sp-1); }
  .segments button { border-radius: 0; margin-inline-start: -1px; color: var(--on-surface); }
  .segments button:first-child { border-start-start-radius: var(--shape-full); border-end-start-radius: var(--shape-full); margin-inline-start: 0; }
  .segments button:last-child { border-start-end-radius: var(--shape-full); border-end-end-radius: var(--shape-full); }
  .segments button[aria-pressed='true'] { background: var(--secondary-container); color: var(--on-secondary-container); position: relative; }
</style>
