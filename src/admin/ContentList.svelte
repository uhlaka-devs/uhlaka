<script lang="ts">
/**
 * One section of the admin: every page, or every post, as a list. Choosing
 * one opens it in the builder; the list itself changes nothing.
 */
import { type ContentType, entryPath, type Layout, STANDARD, languageName, pagePath, pagesIn, POSTS_TYPE, prefixOf, type Site, slugIn, slugify } from '../core/index.ts';
import type { Kind, PageInfo, Person, PostInfo } from './api.ts';
import { layoutName } from './layouts.ts';
import { say, t } from './messages.ts';

let {
  kind,
  type,
  items,
  onopen,
  oncreate,
  site,
  ontranslate,
  layouts = [],
  people = [],
  adding = false,
  onadding,
}: {
  kind: Kind;
  /** The content type listed; none for pages. */
  type?: ContentType;
  items: (PageInfo | PostInfo)[];
  onopen: (slug: string) => void;
  oncreate: (title: string, layout: string) => void;
  /** The site, whose other languages each page or entry can be translated into (ADR 0024, ADR 0054). */
  site?: Site;
  ontranslate?: (slug: string, language: string) => void;
  /** For pages: the layouts a new page picks from (ADR 0035). */
  layouts?: readonly Layout[];
  /** Who has an account: each entry's author is named beside it (ADR 0055). */
  people?: Person[];
  /** Asked from the bar over the site (ADR 0075): the title of a new one is asked at once. */
  adding?: boolean;
  /** Told once it is asked, so it is asked only once. */
  onadding?: () => void;
} = $props();

const others = $derived(site ? site.languages : []);
/** An entry's translation into a language, as the list shows it (ADR 0054). */
const entryIn = (item: PageInfo | PostInfo, language: string) => {
  const found = 'translations' in item ? item.translations?.find((one) => one.language === language) : undefined;
  return found ? { ...item, slug: found.slug, missing: found.missing } : undefined;
};
/** Pages are listed in the main language; their translations sit beside them. */
const shown = $derived(!type && site ? pagesIn(site, site.language, items).filter((i) => !('translated' in i && i.translated)) : items);
const bySlug = $derived(new Map(items.map((item) => [item.slug, item])));

/** Posts keep the name the rest of the admin knows them by. */
const mark = $derived(kind === POSTS_TYPE ? 'post' : kind);

let title = $state<string | null>(null);
let layout = $state(STANDARD);
$effect(() => {
  if (!adding) return;
  title = '';
  onadding?.();
});
const words = $derived(
  !type
    ? { heading: t.nav.pages, add: t.app.newPage, none: '' }
    : kind === POSTS_TYPE
      ? { heading: type.name, add: t.posts.newPost, none: t.posts.none }
      : { heading: type.name, add: say(t.ctypes.newEntry, { singular: type.singular.toLowerCase() }), none: t.ctypes.noEntries },
);
/** Where it is in its review comes before whether it is published (ADR 0055 d4). */
const status = (item: PageInfo | PostInfo): string =>
  'review' in item && item.review ? (item.review.state === 'waiting' ? t.review.waiting : t.review.returned) : !item.published ? t.bar.draft : item.changed ? t.bar.changed : t.bar.published;
/** The list says who wrote each entry when more than one person may write. */
const authors = $derived(!!type && people.length > 1);
const nameOf = (item: PageInfo | PostInfo): string => people.find((p) => 'author' in item && p.id === item.author)?.name ?? '';
</script>

<section class="screen" data-list={mark}>
  <header>
    <h1>{words.heading}</h1>
    {#if title === null}
      <button type="button" class="primary" onclick={() => (title = '')} data-new={mark}>+ {words.add}</button>
    {:else}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          if (slugify(title)) oncreate((title ?? '').trim(), layout);
          title = null;
        }}
      >
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" placeholder={t.app.pageTitle} bind:value={title} maxlength="200" autofocus />
        {#if layouts.length > 1}
          <select bind:value={layout} aria-label={t.layouts.pick} title={t.layouts.pick} data-new-layout>
            {#each layouts as one (one.id)}<option value={one.id}>{layoutName(one)}</option>{/each}
          </select>
        {/if}
        <button type="submit" class="primary" disabled={!slugify(title)}>{t.app.create}</button>
        <button type="button" class="quiet" onclick={() => (title = null)}>{t.app.cancel}</button>
      </form>
    {/if}
  </header>
  {#if items.length === 0}
    <p class="hint">{words.none}</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>{t.inspector.title}</th>
          <th>{t.list.address}</th>
          {#if type?.dated}<th>{t.posts.date}</th>{/if}
          {#if authors}<th>{t.review.author}</th>{/if}
          <th>{t.list.status}</th>
          {#if others.length}<th>{t.list.translations}</th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each shown as item (item.slug)}
          {@const address = type ? entryPath(type, item.slug) : pagePath(item.slug)}
          <tr>
            <td><button type="button" class="open" onclick={() => onopen(item.slug)} data-open={item.slug}>{item.title}</button></td>
            <!-- A published page's address opens it on the site, in a tab of its own. -->
            <td class="quiet">{#if item.published}<a class="address" href={address} target="_blank" rel="noopener" title={t.bar.viewPageHint} data-view={item.slug}>{address} ↗</a>{:else}{address}{/if}</td>
            {#if type?.dated}<td class="quiet">{'date' in item ? item.date : ''}</td>{/if}
            {#if authors}<td class="quiet" data-author-of={item.slug}>{nameOf(item)}</td>{/if}
            <td class="quiet" class:live={item.published && !item.changed && !('review' in item && item.review)} data-status-of={item.slug}>{status(item)}</td>
            {#if site && others.length}
              <td class="translations">
                {#each others as language (language)}
                  {@const slug = slugIn(site, language, item.slug)}
                  {@const translation = type ? entryIn(item, language) : (items.find((i) => i.translated && i.of === item.slug && i.language === language) ?? bySlug.get(slug))}
                  {#if translation}
                    {@const missing = translation.missing ?? 0}
                    <button
                      type="button"
                      class="chip"
                      class:partial={missing > 0}
                      title={`${languageName(language)}: ${translation.title} (${status(translation)})${missing ? ` · ${say(t.list.missing, { count: String(missing) })}` : ''}`}
                      onclick={() => onopen(translation.slug)}
                      data-open={translation.slug}>{prefixOf(language)}</button
                    >
                  {:else}
                    <button type="button" class="chip quiet" title={say(t.list.translate, { language: languageName(language) })} onclick={() => ontranslate?.(item.slug, language)} data-translate={slug}>+ {prefixOf(language)}</button>
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
  header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  h1 { margin: 0; font-size: 1.4rem; flex: 1; }
  form { display: flex; gap: 0.4rem; }
  form input { width: 16rem; }
  table { width: 100%; border-collapse: collapse; background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); overflow: hidden; }
  th, td { padding: 0.55rem 0.8rem; text-align: start; border-bottom: 1px solid var(--outline-variant); }
  th { font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--on-surface-variant); font-weight: 600; }
  tr:last-child td { border-bottom: 0; }
  td.quiet { color: var(--on-surface-variant); }
  td.live { color: var(--success); }
  .open { border: 0 !important; padding: 0 !important; background: none !important; font-weight: 600 !important; color: var(--primary) !important; text-align: start; }
  .open:hover { text-decoration: underline; }
  .translations { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .chip { padding: 0.1rem 0.45rem !important; font-size: 12px; text-transform: uppercase; }
  .chip.partial { border-style: dashed; }
  .address { color: inherit; text-decoration: none; }
  .address:hover { color: var(--primary); text-decoration: underline; }
</style>
