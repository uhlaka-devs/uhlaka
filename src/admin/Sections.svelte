<script lang="ts">
/**
 * The site's sections (ADR 0033): blocks written once and shown on many
 * pages. Each says where it is shown, and is translated as a page is.
 */
import { languageName, prefixOf, type Site, slugify } from '../core/index.ts';
import type { SectionInfo } from './api.ts';
import { say, t } from './messages.ts';

let {
  sections,
  site,
  onopen,
  oncreate,
  ontranslate,
}: { sections: SectionInfo[]; site: Site; onopen: (slug: string) => void; oncreate: (title: string) => void; ontranslate: (slug: string, language: string) => void } = $props();

let title = $state<string | null>(null);
const status = (item: SectionInfo): string => (!item.published ? t.bar.draft : item.changed ? t.bar.changed : t.bar.published);
</script>

<section class="screen" data-list="sections">
  <header>
    <h1>{t.sections.heading}</h1>
    {#if title === null}
      <button type="button" class="primary" onclick={() => (title = '')} data-new="section">+ {t.sections.add}</button>
    {:else}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          if (slugify(title)) oncreate((title ?? '').trim());
          title = null;
        }}
      >
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" placeholder={t.sections.name} bind:value={title} maxlength="200" autofocus data-section-name />
        <button type="submit" class="primary" disabled={!slugify(title)}>{t.app.create}</button>
        <button type="button" class="quiet" onclick={() => (title = null)}>{t.app.cancel}</button>
      </form>
    {/if}
  </header>
  <p class="hint">{t.sections.intro}</p>
  {#if sections.length === 0}
    <p class="hint" data-no-sections>{t.sections.none}</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>{t.inspector.title}</th>
          <th>{t.sections.usedOn}</th>
          <th>{t.list.status}</th>
          {#if site.languages.length}<th>{t.list.translations}</th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each sections as item (item.slug)}
          <tr data-section={item.slug}>
            <td><button type="button" class="open" onclick={() => onopen(item.slug)} data-open-section={item.slug}>{item.title}</button></td>
            <td class="quiet" data-used-on>{item.usedOn.length ? item.usedOn.join(', ') : t.sections.unused}</td>
            <td class="quiet" class:live={item.published && !item.changed}>{status(item)}</td>
            {#if site.languages.length}
              <td class="translations">
                {#each site.languages as language (language)}
                  {@const at = `${prefixOf(language)}/${item.slug}`}
                  {#if item.languages.includes(language)}
                    <button type="button" class="chip" title={languageName(language)} onclick={() => onopen(at)} data-open-section={at}>{prefixOf(language)}</button>
                  {:else}
                    <button type="button" class="chip quiet" title={say(t.list.translate, { language: languageName(language) })} onclick={() => ontranslate(item.slug, language)} data-translate-section={at}>+ {prefixOf(language)}</button>
                  {/if}
                {/each}
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  header { display: flex; align-items: center; gap: var(--sp-4); margin-bottom: var(--sp-2); }
  h1 { margin: 0; font-size: var(--size-2xl); flex: 1; }
  form { display: flex; gap: var(--sp-2); }
  form input { width: 16rem; }
  .hint { max-width: 46rem; }
  table { width: 100%; border-collapse: collapse; background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); overflow: hidden; }
  th, td { padding: var(--sp-2) var(--sp-3); text-align: start; border-bottom: 1px solid var(--outline-variant); }
  th { font-size: var(--size-s); letter-spacing: 0.05em; text-transform: uppercase; color: var(--on-surface-variant); font-weight: 600; }
  tr:last-child td { border-bottom: 0; }
  td.quiet { color: var(--on-surface-variant); }
  td.live { color: var(--success); }
  .open { border: 0 !important; padding: 0 !important; background: none !important; font-weight: 600 !important; color: var(--primary) !important; text-align: start; }
  .open:hover { text-decoration: underline; }
  .translations { display: flex; gap: var(--sp-1); flex-wrap: wrap; }
  .chip { padding: 0.1rem var(--sp-2) !important; font-size: var(--size-s); text-transform: uppercase; }
</style>
