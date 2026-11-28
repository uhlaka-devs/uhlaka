<script lang="ts">
/**
 * What an extension asks for, shown before it is installed (ADR 0026 d3): the
 * owner accepts this very file, by its checksum, or does not.
 */
import { type ExtensionOffer } from './api.ts';
import { say, t } from './messages.ts';

let { offer, onaccept, oncancel }: { offer: ExtensionOffer; onaccept: () => void; oncancel?: () => void } = $props();
</script>

<div class="offer" data-offer>
  <p>
    <strong>{offer.manifest.displayName} {offer.manifest.version}</strong>
    {#if offer.manifest.publisher}<small>{say(t.ext.by, { publisher: offer.manifest.publisher })}</small>{/if}
  </p>
  {#if offer.manifest.description}<p>{offer.manifest.description}</p>{/if}
  {#if offer.replaces}<p>{say(t.ext.replaces, { version: offer.replaces })}</p>{/if}
  <p>{t.ext.asks}</p>
  <ul data-asks>
    {#if offer.asks.collections.length}<li>{say(t.ext.keeps, { list: offer.asks.collections.join(', ') })}</li>{/if}
    {#if offer.asks.secrets.length}<li>{say(t.ext.secrets, { list: offer.asks.secrets.join(', ') })}</li>{/if}
    <li>{offer.asks.egress.length ? say(t.ext.calls, { list: offer.asks.egress.join(', ') }) : t.ext.callsNothing}</li>
    {#each offer.asks.points as point}
      <li>{say(point.on === 'page' ? t.ext.onPage : t.ext.onBlock, { action: point.action })}</li>
    {/each}
    {#if offer.asks.routes.length}<li>{say(t.ext.routes, { list: offer.asks.routes.join(', ') })}</li>{/if}
    {#each offer.asks.jobs as job}
      <li>{say(t.ext.job, { action: job.action, count: job.everyMinutes })}</li>
    {/each}
    {#if offer.asks.pictures?.length}<li>{say(t.ext.pictures, { list: offer.asks.pictures.join(', ') })}</li>{/if}
    {#if offer.asks.events.length}<li>{say(t.ext.events, { list: offer.asks.events.join(', ') })}</li>{/if}
    {#if offer.asks.answers?.length}<li>{say(t.ext.answers, { list: offer.asks.answers.join(', ') })}</li>{/if}
    {#if offer.asks.uses?.length}<li>{say(t.ext.uses, { list: offer.asks.uses.join(', ') })}</li>{/if}
    {#if offer.asks.blocks?.length}<li>{say(t.ext.blocks, { list: offer.asks.blocks.join(', ') })}</li>{/if}
    {#if offer.asks.mails?.length}<li>{say(t.ext.mails, { list: offer.asks.mails.join(', ') })}</li>{/if}
  </ul>
  {#if offer.accountsOff}<p data-accounts-off>{t.ext.accountsOff}</p>{/if}
  {#if offer.shopOff}<p data-shop-off>{t.ext.shopOff}</p>{/if}
  <small class="sum">{say(t.ext.checksum, { sha: offer.sha256 })}</small>
  <div class="row">
    <button type="button" class="primary" onclick={onaccept} data-accept>{t.ext.accept}</button>
    {#if oncancel}<button type="button" class="quiet" onclick={oncancel}>{t.ext.cancel}</button>{/if}
  </div>
</div>

<style>
  .offer { max-width: 46rem; margin: var(--sp-4) 0; padding: var(--sp-3) var(--sp-4); background: var(--secondary-container); border: 1px solid var(--primary); border-radius: var(--shape-sm); }
  .offer p { margin: 0 0 var(--sp-2); }
  .offer ul { margin: 0 0 var(--sp-2); }
  .sum { display: block; margin-bottom: var(--sp-2); color: var(--on-surface-variant); overflow-wrap: anywhere; }
  .row { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
</style>
