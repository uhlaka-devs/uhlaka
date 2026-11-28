<script lang="ts">
/**
 * The blog and the pages of their own (ADR 0085 d7): how a list of entries
 * and an entry's head look under the style, and what the page for a missing
 * address and the search results show besides their own words. The list's look
 * first; what a card shows and the excerpt under "More settings".
 */
import { CARD_PARTS, type CardPart, ENTRY_COVERS, LIST_LOOKS, type Site, type Theme } from '../core/index.ts';
import type { SectionInfo } from './api.ts';
import { t } from './messages.ts';
import { tryTheme } from './themeEdit.ts';

let {
  site,
  theme,
  sections = [],
  shop = false,
  onsite,
  ontheme,
}: {
  site: Site;
  theme: Theme;
  sections?: SectionInfo[];
  /** Whether the shop is on: its products' look is then offered (ADR 0085 d8). */
  shop?: boolean;
  onsite: (site: Site) => void;
  ontheme: (theme: Theme) => void;
} = $props();

let problem = $state('');
function apply(mutate: (draft: Theme) => void): void {
  const tried = tryTheme(theme, mutate, t.style.invalid);
  problem = tried.problem;
  if (tried.theme) ontheme(tried.theme);
}
const list = $derived(theme.layout.list);

const setLook = (name: string): void =>
  apply((d) => {
    if (name === LIST_LOOKS[0]) delete d.layout.list.look;
    else d.layout.list.look = name as typeof d.layout.list.look;
  });
const setShown = (part: CardPart, shown: boolean): void =>
  apply((d) => {
    const hide = CARD_PARTS.filter((p) => (p === part ? !shown : (d.layout.list.hide ?? []).includes(p)));
    if (hide.length) d.layout.list.hide = hide;
    else delete d.layout.list.hide;
  });
const setFlag = (key: 'excerpt' | 'more', on: boolean): void =>
  apply((d) => {
    if (!on) delete d.layout.list[key];
    else if (key === 'excerpt') d.layout.list.excerpt = 'short';
    else d.layout.list.more = true;
  });
const setCover = (name: string): void =>
  apply((d) => {
    if (name === ENTRY_COVERS[0]) delete d.layout.entry.cover;
    else d.layout.entry.cover = name as typeof d.layout.entry.cover;
  });
const setShop = (key: 'badge' | 'zoom' | 'bar', on: boolean): void =>
  apply((d) => {
    if (on) d.layout.shop[key] = true;
    else delete d.layout.shop[key];
  });
/** A section's slug, or none: the site's own choice. */
const setSection = (key: 'notFound' | 'searchSection', slug: string): void => {
  const next: Site = { ...site };
  if (slug) next[key] = slug;
  else delete next[key];
  onsite(next);
};
</script>

<p class="hint">{t.blogLook.intro}</p>
{#if problem}<p class="problem" role="alert">{problem}</p>{/if}

<fieldset class="field" data-list-look>
  <legend>{t.blogLook.list}</legend>
  <div class="choices">
    {#each LIST_LOOKS as name (name)}
      <label class="choice" class:on={(list.look ?? LIST_LOOKS[0]) === name}>
        <input type="radio" name="list-look" value={name} checked={(list.look ?? LIST_LOOKS[0]) === name} onchange={() => setLook(name)} data-list={name} />
        <span class="pic {name}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span>{t.blogLook.looks[name]}</span>
      </label>
    {/each}
  </div>
</fieldset>

<label class="field">
  <span>{t.blogLook.cover}</span>
  <select value={theme.layout.entry.cover ?? ENTRY_COVERS[0]} onchange={(e) => setCover(e.currentTarget.value)} data-entry-cover>
    {#each ENTRY_COVERS as name (name)}<option value={name}>{t.blogLook.covers[name]}</option>{/each}
  </select>
</label>

<details class="more" data-blog-more>
  <summary>{t.look.more}</summary>
  <fieldset class="field">
    <legend>{t.blogLook.shows}</legend>
    {#each CARD_PARTS as part (part)}
      <label class="check">
        <input type="checkbox" checked={!(list.hide ?? []).includes(part)} onchange={(e) => setShown(part, e.currentTarget.checked)} data-card-part={part} />
        <span>{t.blogLook.parts[part]}</span>
      </label>
    {/each}
    <label class="check">
      <input type="checkbox" checked={list.excerpt === 'short'} onchange={(e) => setFlag('excerpt', e.currentTarget.checked)} data-list-short />
      <span>{t.blogLook.short}</span>
    </label>
    <label class="check">
      <input type="checkbox" checked={list.more === true} onchange={(e) => setFlag('more', e.currentTarget.checked)} data-list-more />
      <span>{t.blogLook.more}</span>
    </label>
  </fieldset>
</details>

{#if shop}
  <h3>{t.blogLook.shop}</h3>
  {#each ['badge', 'zoom', 'bar'] as const as key (key)}
    <label class="check">
      <input type="checkbox" checked={theme.layout.shop[key] === true} onchange={(e) => setShop(key, e.currentTarget.checked)} data-shop-look={key} />
      <span>{t.blogLook.shopLooks[key]}</span>
    </label>
  {/each}
{/if}

<h3>{t.blogLook.ownPages}</h3>
{#each [['notFound', t.blogLook.notFound], ['searchSection', t.blogLook.search]] as const as [key, label] (key)}
  <label class="field">
    <span>{label}</span>
    <select value={site[key] ?? ''} onchange={(e) => setSection(key, e.currentTarget.value)} data-site-section={key}>
      <option value="">{t.blogLook.noSection}</option>
      {#each sections as section (section.slug)}<option value={section.slug}>{section.title}</option>{/each}
    </select>
  </label>
{/each}
<small class="hint">{t.blogLook.sectionHint}</small>

<style>
  h3 { margin: var(--sp-5) 0 var(--sp-2); font: var(--label-m); letter-spacing: 0.04em; text-transform: uppercase; color: var(--primary); }
  select { width: 100%; }
  .problem { padding: var(--sp-2) var(--sp-4); background: var(--error-container); color: var(--on-error-container); }
  .more { margin-top: var(--sp-4); }
  .more > summary { color: var(--primary); }
  .check { display: flex; align-items: center; gap: var(--sp-2); margin-block: var(--sp-2); }
  .choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2); }
  .choice { position: relative; display: grid; gap: var(--sp-1); justify-items: center; padding: var(--sp-2) var(--sp-1); border: 1px solid var(--outline-variant); border-radius: var(--shape-md); font: var(--label-m); text-align: center; cursor: pointer; background: var(--surface-lowest); }
  .choice.on { border: 2px solid var(--primary); padding: calc(var(--sp-2) - 1px) calc(var(--sp-1) - 1px); background: var(--secondary-container); color: var(--on-secondary-container); }
  .choice input { position: absolute; opacity: 0; pointer-events: none; }
  .choice:has(input:focus-visible) { outline: 3px solid var(--primary); outline-offset: 2px; }
  /* A small picture of each look: four entries as blocks. */
  .pic { display: grid; gap: 3px; width: 64px; height: 40px; }
  .pic i { display: block; border-radius: 2px; background: var(--outline); }
  .pic.stack { grid-template-rows: repeat(2, 1fr); }
  .pic.stack i:nth-child(n + 3), .pic.side i:nth-child(n + 3) { display: none; }
  .pic.side { grid-template-columns: 1fr 2fr; grid-template-rows: 1fr; }
  .pic.side i:nth-child(2) { background: var(--outline-variant); }
  .pic.grid, .pic.cards { grid-template-columns: repeat(2, 1fr); }
  .pic.cards i { background: var(--surface-lowest); box-shadow: inset 0 0 0 1px var(--outline); }
</style>
