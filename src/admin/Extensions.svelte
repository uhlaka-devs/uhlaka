<script lang="ts">
/**
 * The extensions (ADR 0026), for the owner: what is installed, turned on or
 * off, removed; a new one installed from its file, after the owner has seen
 * what it asks for and accepted that very file. Above them, the parts of
 * Uhlaka (ADR 0076 d6): the shop and visitor accounts, our own code shipped
 * with the program, turned on and off here as an extension is.
 */
import { api, type ExtensionInfo, type ExtensionOffer } from './api.ts';
import ExtensionOfferBox from './ExtensionOffer.svelte';
import { adminLanguage, say, t } from './messages.ts';

let { extensions, shop, onchange, onopen, onparts, onsettings }: { extensions: ExtensionInfo[]; shop: boolean; onchange: (next: ExtensionInfo[]) => void; onopen: (name: string, screen: string) => void; onparts: () => void; onsettings: () => void } = $props();

/** Whether visitor accounts are on, read once the screen opens. */
let accounts = $state<boolean | null>(null);
$effect(() => {
  void api.visitors().then((shown) => (accounts = shown.settings.on), () => (accounts = null));
});

async function part(work: () => Promise<unknown>): Promise<void> {
  problem = '';
  try {
    await work();
    onparts();
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

let problem = $state('');
let file = $state.raw<File | null>(null);
let offer = $state.raw<ExtensionOffer | null>(null);
/** Removing asks once more, on the same button. */
let removing = $state('');

async function attempt(work: () => Promise<{ extensions: ExtensionInfo[] }>): Promise<void> {
  problem = '';
  try {
    onchange((await work()).extensions);
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

async function choose(chosen: File | undefined): Promise<void> {
  problem = '';
  offer = null;
  file = chosen ?? null;
  if (!chosen) return;
  try {
    offer = (await api.offerExtension(chosen)).offer;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

async function accept(): Promise<void> {
  if (!file || !offer) return;
  const [sent, sha] = [file, offer.sha256];
  await attempt(() => api.installExtension(sent, sha));
  if (!problem) {
    file = null;
    offer = null;
  }
}
</script>

<section class="screen" data-list="extensions">
  <h1>{t.ext.heading}</h1>
  <p class="hint">{t.ext.intro}</p>
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}

  <h2>{t.ext.parts}</h2>
  <p class="hint">{t.ext.partsIntro}</p>
  <ul class="cards" data-list="parts">
    <li data-part="shop">
      <div class="who"><strong>{t.ext.partShop}</strong><p>{t.ext.partShopHint}</p></div>
      <label class="check">
        <input type="checkbox" checked={shop} onchange={(e) => part(() => api.setShop({ on: e.currentTarget.checked }))} data-part-on />
        <span>{shop ? t.ext.on : t.ext.off}</span>
      </label>
      {#if shop}<button type="button" class="quiet" onclick={onsettings} data-part-settings>{t.ext.partSettings}</button>{/if}
    </li>
    {#if accounts !== null}
      <li data-part="visitors">
        <div class="who"><strong>{t.ext.partVisitors}</strong><p>{t.ext.partVisitorsHint}</p></div>
        <label class="check">
          <input type="checkbox" checked={accounts} onchange={(e) => part(async () => { accounts = (await api.setVisitors({ on: e.currentTarget.checked })).settings.on; })} data-part-on />
          <span>{accounts ? t.ext.on : t.ext.off}</span>
        </label>
        {#if accounts}<button type="button" class="quiet" onclick={onsettings} data-part-settings>{t.ext.partSettings}</button>{/if}
      </li>
    {/if}
  </ul>

  <h2>{t.ext.installed}</h2>
  {#if extensions.length === 0}
    <p data-no-extensions>{t.ext.none}</p>
  {:else}
    <ul class="cards">
      {#each extensions as extension (extension.name)}
        <li data-extension={extension.name}>
          <div class="who">
            <strong>{extension.displayName}</strong>
            <small>{extension.version}{extension.publisher ? ` · ${say(t.ext.by, { publisher: extension.publisher })}` : ''}</small>
            {#if extension.description}<p>{extension.description}</p>{/if}
          </div>
          <label class="check">
            <input type="checkbox" checked={extension.enabled} onchange={(e) => attempt(() => api.enableExtension(extension.name, e.currentTarget.checked))} data-extension-on />
            <span>{extension.enabled ? t.ext.on : t.ext.off}</span>
          </label>
          {#if extension.enabled}
            {#each extension.views ?? [] as screen (screen.id)}
              <button type="button" onclick={() => onopen(extension.name, screen.id)} data-extension-view={screen.id}>{extension.messages[adminLanguage()]?.[screen.title] || screen.title}</button>
            {/each}
          {/if}
          {#if removing === extension.name}
            <button type="button" class="quiet bad" onclick={() => attempt(() => api.uninstallExtension(extension.name))} data-extension-remove-sure>{t.ext.removeSure}</button>
          {:else}
            <button type="button" class="quiet" onclick={() => (removing = extension.name)} data-extension-remove>{t.ext.remove}</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <h2>{t.ext.install}</h2>
  <label class="field">
    <span>{t.ext.file}</span>
    <input type="file" accept=".uhlaka-extension,.thecms-extension,application/json" onchange={(e) => choose(e.currentTarget.files?.[0])} data-extension-file />
  </label>
  {#if offer}
    <ExtensionOfferBox {offer} onaccept={accept} oncancel={() => ((offer = null), (file = null))} />
  {/if}
</section>

<style>
  h1 { margin: 0 0 0.5rem; font-size: 1.4rem; }
  h2 { margin: 2rem 0 0.5rem; font-size: 1.05rem; }
  .cards { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.5rem; max-width: 46rem; }
  .cards li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.8rem; padding: 0.7rem 1rem; background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  .who { flex: 1 1 16rem; }
  .who p { margin: 0.2rem 0 0; color: var(--on-surface-variant); }
  .who small { margin-inline-start: 0.5rem; color: var(--on-surface-variant); }
  .field { display: grid; gap: 0.3rem; max-width: 46rem; }
</style>
