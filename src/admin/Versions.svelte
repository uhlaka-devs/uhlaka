<script lang="ts">
/**
 * What was published before, kept by the program: the newest twenty
 * publications of this page or entry. One is brought back into the editor as
 * a change, to look at, undo, or publish.
 */
import { api, type Doc, type Kind } from './api.ts';
import { t } from './messages.ts';

let { slug, kind, onrestore }: { slug: string; kind: Kind; onrestore: (doc: Doc) => void } = $props();

let versions = $state.raw<{ at: string; title: string }[] | null>(null);
let problem = $state('');

const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

async function attempt(work: () => Promise<void>): Promise<void> {
  problem = '';
  try {
    await work();
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}
const show = () => attempt(async () => void (versions = (await api.versions(slug, kind)).versions));
const restore = (at: string) => attempt(async () => onrestore((await api.version(slug, at, kind)).page));
</script>

<div class="versions" data-versions>
  <h3>{t.versions.heading}</h3>
  {#if versions === null}
    <button type="button" class="quiet" onclick={show} data-versions-show>{t.versions.show}</button>
  {:else if versions.length === 0}
    <p class="hint">{t.versions.none}</p>
  {:else}
    <ul>
      {#each versions as version (version.at)}
        <li data-version={version.at}>
          <span><time datetime={version.at}>{when(version.at)}</time> · {version.title}</span>
          <button type="button" class="quiet" onclick={() => restore(version.at)} data-version-restore>{t.versions.restore}</button>
        </li>
      {/each}
    </ul>
    <p class="hint">{t.versions.hint}</p>
  {/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
</div>

<style>
  .versions { display: grid; gap: 0.4rem; margin-top: 1.2rem; padding-top: 0.8rem; border-top: 1px solid var(--outline-variant); }
  h3 { margin: 0; font-size: 0.85rem; color: var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.04em; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; max-height: 14rem; overflow: auto; }
  li { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-size: 0.9rem; }
  li button { white-space: nowrap; }
  .versions > button { justify-self: start; }
</style>
