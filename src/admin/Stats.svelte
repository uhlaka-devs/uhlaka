<script lang="ts">
/**
 * Statistics (ADR 0053), kept by an extension the program carries (ADR 0062
 * d8): its report, drawn here for the owner and the editors. Without it, the
 * owner is shown what it asks for and installs it with one button; nothing is
 * counted until then, and what was counted before waits for it.
 */
import { onMount } from 'svelte';
import { api, type ExtensionInfo, type StatsState } from './api.ts';
import ExtensionOfferBox from './ExtensionOffer.svelte';
import { say, t } from './messages.ts';
import ViewPart from './ViewPart.svelte';

let { onchange }: { onchange?: (next: ExtensionInfo[]) => void } = $props();

let shown = $state.raw<StatsState | null>(null);
let problem = $state('');

async function attempt(work: () => Promise<StatsState>): Promise<void> {
  problem = '';
  try {
    shown = await work();
    onchange?.(shown.extensions);
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}
onMount(() => void attempt(() => api.stats()));

const extension = $derived(shown?.extensions.find((e) => e.name === 'stats') ?? null);
const report = $derived(extension?.views?.find((v) => v.type === 'report') ?? null);
</script>

<section class="stats" data-stats>
  <h1>{t.stats.heading}</h1>
  <p class="hint">{t.stats.intro}</p>
  {#if shown}
    {#if shown.offer}
      <p data-stats-offer={shown.installed ? 'update' : 'install'}>{shown.installed ? t.stats.update : t.stats.extension}</p>
      {@const offer = shown.offer}
      <ExtensionOfferBox {offer} onaccept={() => attempt(() => api.installStats(offer.sha256))} />
    {:else if !shown.installed}
      <p data-stats-missing>{t.stats.ownerInstalls}</p>
    {/if}
    {#if shown.installed && !shown.installed.enabled}
      <p data-stats-off>{t.stats.off}</p>
    {:else if extension && report}
      {#key extension.version}<ViewPart {extension} view={{ ...report, title: undefined }} onnavigate={() => {}} />{/key}
      <p class="hint">{t.stats.visitorsHint}</p>
      <p class="hint" data-stats-zone>{say(t.stats.zone, { zone: shown.zone })}</p>
    {/if}
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</section>

<style>
  .stats { max-width: 920px; padding: var(--sp-6) var(--sp-8); }
  h1 { font-size: var(--size-xl); margin: 0 0 var(--sp-2); }
  .hint { color: var(--on-surface-variant); font-size: var(--size-m); }
  .bad { color: var(--error); font-size: var(--size-m); }
</style>
