<script lang="ts">
/**
 * What the extensions turned on offer here in the editor (ADR 0026): on the
 * block being edited, or on the page. What one gives back is put in the
 * editor as a change, to look at, undo or save like any other.
 */
import type { ExtensionPoint } from '../core/index.ts';
import type { ExtensionInfo } from './api.ts';
import { adminLanguage, say, t } from './messages.ts';

let {
  extensions,
  on,
  languages,
  onrun,
  oneach,
}: {
  extensions: ExtensionInfo[];
  on: ExtensionPoint;
  languages: { language: string; name: string }[];
  onrun: (extension: string, action: string, ask: Record<string, string>) => Promise<void>;
  /** Given on a page of the main language: an action for each language runs on every translation (ADR 0034), and says what it did. */
  oneach?: (extension: string, action: string, ask: Record<string, string>) => Promise<string>;
} = $props();

const word = (extension: ExtensionInfo, text: string): string => extension.messages[adminLanguage()]?.[text] || extension.messages[adminLanguage().split('-')[0] ?? '']?.[text] || text;
const offered = $derived(extensions.filter((e) => e.enabled).flatMap((extension) => extension.actions.filter((a) => a.on === on).map((action) => ({ extension, action }))));
/** The action whose questions are open, and the answers so far. */
let asking = $state<{ key: string; answers: Record<string, string> } | null>(null);
let working = $state('');
/** What the last action for each language did. */
let said = $state('');

const each = (action: ExtensionInfo['actions'][number]): boolean => action.each === 'language' && oneach !== undefined;
const label = (extension: ExtensionInfo, action: ExtensionInfo['actions'][number]): string => (each(action) ? say(t.ext.eachLanguage, { action: word(extension, action.label) }) : word(extension, action.label));

async function run(extension: string, action: string, ask: Record<string, string>): Promise<void> {
  working = `${extension}/${action}`;
  said = '';
  try {
    const found = offered.find((o) => o.extension.name === extension && o.action.name === action);
    if (found && oneach && each(found.action)) said = await oneach(extension, action, ask);
    else await onrun(extension, action, ask);
    asking = null;
  } finally {
    working = '';
  }
}
</script>

{#if offered.length}
  <div class="tools" data-extension-tools={on}>
    <h3>{t.ext.tools}</h3>
    {#each offered as { extension, action } (`${extension.name}/${action.name}`)}
      {@const key = `${extension.name}/${action.name}`}
      {#if asking?.key === key}
        {@const answers = asking.answers}
        <form class="ask" onsubmit={(e) => (e.preventDefault(), run(extension.name, action.name, answers))}>
          <strong>{label(extension, action)}</strong>
          {#each action.ask as question (question.key)}
            <label class="field">
              <span>{word(extension, question.label)}</span>
              {#if question.kind === 'language'}
                <select bind:value={answers[question.key]} data-ask={question.key}>
                  {#each languages as l}<option value={l.language}>{l.name}</option>{/each}
                </select>
              {:else}
                <input type="text" bind:value={answers[question.key]} data-ask={question.key} />
              {/if}
            </label>
          {/each}
          <div class="row">
            <button type="submit" class="primary" disabled={working !== ''} data-run>{working === key ? t.ext.working : t.ext.run}</button>
            <button type="button" class="quiet" onclick={() => (asking = null)}>{t.ext.cancel}</button>
          </div>
        </form>
      {:else}
        <button
          type="button"
          disabled={working !== ''}
          onclick={() => (action.ask.length ? (asking = { key, answers: Object.fromEntries(action.ask.map((q) => [q.key, q.kind === 'language' ? (languages[0]?.language ?? '') : ''])) }) : run(extension.name, action.name, {}))}
          data-extension-action={key}
          data-each-language={each(action) ? '' : undefined}>{working === key ? t.ext.working : `✦ ${label(extension, action)}`}</button>
      {/if}
    {/each}
    {#if said}<p class="said" data-each-said>{said}</p>{/if}
  </div>
{/if}

<style>
  .tools { display: grid; gap: var(--sp-2); margin-top: var(--sp-5); padding-top: var(--sp-3); border-top: 1px solid var(--outline-variant); }
  h3 { margin: 0; font-size: var(--size-m); color: var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.04em; }
  .tools > button { text-align: start; }
  .ask { display: grid; gap: var(--sp-2); padding: var(--sp-2); background: var(--secondary-container); border-radius: var(--shape-sm); }
  .field { display: grid; gap: 0.2rem; }
  .row { display: flex; gap: var(--sp-2); }
  .said { margin: 0; font-size: var(--size-m); color: var(--success); }
</style>
