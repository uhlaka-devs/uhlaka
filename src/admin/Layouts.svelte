<script lang="ts">
/**
 * The site's layouts (ADR 0035): how a page is arranged around its blocks,
 * made from a few closed choices. The ready ones come with the site; each
 * can be changed, and new ones made from them. What the sidebar and the bands
 * show is a section, written in the block editor.
 */
import { LAYOUT_WIDTHS, type Layout, READY_LAYOUTS, SIDEBARS, type Site, slugify, STANDARD } from '../core/index.ts';
import type { SectionInfo } from './api.ts';
import { layoutName } from './layouts.ts';
import { t } from './messages.ts';

let {
  site,
  sections,
  onsave,
}: {
  site: Site;
  sections: SectionInfo[];
  /** Resolves to a reason when the site refuses. */
  onsave: (layouts: Layout[]) => Promise<string>;
} = $props();

const layouts = $derived(site.layouts ?? READY_LAYOUTS.map((l) => ({ ...l })));
/** The layout being made or changed; null while the list shows. */
let draft = $state<Layout | null>(null);
/** The id of the layout being changed; '' for a new one. */
let editing = $state('');
let problem = $state('');

const start = (layout: Layout | null): void => {
  problem = '';
  editing = layout?.id ?? '';
  draft = layout ? { ...layout, name: layoutName(layout) } : { ...(READY_LAYOUTS[0] as Layout), id: '', name: '' };
};
const patch = (change: Partial<Layout>): void => {
  if (draft) draft = { ...draft, ...change };
};

/** A new layout's id from its name, never one the site already has. */
function freshId(name: string): string {
  const base = slugify(name) || 'layout';
  let id = base;
  for (let n = 2; layouts.some((l) => l.id === id); n++) id = `${base}-${n}`;
  return id;
}

async function save(): Promise<void> {
  if (!draft || !draft.name.trim()) return;
  const next = { ...draft, id: editing || freshId(draft.name) };
  problem = await onsave(editing ? layouts.map((l) => (l.id === editing ? next : l)) : [...layouts, next]);
  if (!problem) draft = null;
}

async function remove(): Promise<void> {
  problem = await onsave(layouts.filter((l) => l.id !== editing));
  if (!problem) draft = null;
}

const sectionTitle = (slug: string): string => sections.find((s) => s.slug === slug)?.title ?? slug;
</script>

<section class="screen" data-list="layouts">
  <header>
    <h1>{t.layouts.heading}</h1>
    {#if !draft}<button type="button" class="primary" onclick={() => start(null)} data-new-layout>+ {t.layouts.add}</button>{/if}
  </header>
  {#if !draft}
    <p class="hint intro">{t.layouts.intro}</p>
    <ul class="cards">
      {#each layouts as layout (layout.id)}
        <li>
          <button type="button" class="card" onclick={() => start(layout)} data-layout={layout.id}>
            {@render sketch(layout)}
            <strong>{layoutName(layout)}</strong>
            <small>{t.layouts.widths[layout.width]}{layout.sidebar !== 'none' ? ` · ${t.layouts.sidebars[layout.sidebar]}` : ''}</small>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <form
      class="layout"
      onsubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div class="split">
        <div class="choices">
          <label class="field">
            <span>{t.layouts.name}</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input type="text" maxlength="60" value={draft.name} oninput={(e) => patch({ name: e.currentTarget.value })} autofocus data-layout-name />
          </label>
          <label class="check"><input type="checkbox" checked={draft.header} onchange={(e) => patch({ header: e.currentTarget.checked })} data-layout-header /><span>{t.layouts.header}</span></label>
          <label class="check"><input type="checkbox" checked={draft.footer} onchange={(e) => patch({ footer: e.currentTarget.checked })} data-layout-footer /><span>{t.layouts.footer}</span></label>
          <label class="field">
            <span>{t.layouts.width}</span>
            <select value={draft.width} onchange={(e) => patch({ width: e.currentTarget.value as Layout['width'] })} data-layout-width>
              {#each LAYOUT_WIDTHS as width}<option value={width}>{t.layouts.widths[width]}</option>{/each}
            </select>
          </label>
          <label class="field">
            <span>{t.layouts.sidebar}</span>
            <select value={draft.sidebar} onchange={(e) => patch({ sidebar: e.currentTarget.value as Layout['sidebar'] })} data-layout-sidebar>
              {#each SIDEBARS as side}<option value={side}>{t.layouts.sidebars[side]}</option>{/each}
            </select>
          </label>
          {#each [['top', t.layouts.top], ...(draft.sidebar !== 'none' ? [['side', t.layouts.side]] : []), ['bottom', t.layouts.bottom]] as [area, label] (area)}
            <label class="field">
              <span>{label}</span>
              <select value={draft[area as 'top']} onchange={(e) => patch({ [area as 'top']: e.currentTarget.value })} data-layout-area={area}>
                <option value="">{t.layouts.nothing}</option>
                {#each sections as section (section.slug)}<option value={section.slug}>{section.title}</option>{/each}
              </select>
            </label>
          {/each}
          {#if sections.length === 0}<p class="hint">{t.layouts.noSections}</p>{/if}
        </div>
        <div class="preview" aria-hidden="true">{@render sketch(draft)}</div>
      </div>
      {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
      <div class="row">
        <button type="submit" class="primary" disabled={!draft.name.trim()} data-layout-save>{t.ctypes.save}</button>
        <button type="button" class="quiet" onclick={() => (draft = null)}>{t.app.cancel}</button>
        {#if editing && editing !== STANDARD}<button type="button" class="danger" onclick={remove} data-layout-remove>{t.layouts.remove}</button>{/if}
      </div>
    </form>
  {/if}
</section>

<!-- A small drawing of the page: what is there and where, never how it looks. -->
{#snippet sketch(layout: Layout)}
  <div class="sketch" data-width={layout.width} data-side={layout.sidebar}>
    {#if layout.header}<i class="bar">{t.layouts.header}</i>{/if}
    {#if layout.top}<i class="band">{sectionTitle(layout.top)}</i>{/if}
    <div class="middle">
      <i class="content">{t.layouts.content}</i>
      {#if layout.sidebar !== 'none'}<i class="aside">{layout.side ? sectionTitle(layout.side) : t.layouts.sideShort}</i>{/if}
    </div>
    {#if layout.bottom}<i class="band">{sectionTitle(layout.bottom)}</i>{/if}
    {#if layout.footer}<i class="bar">{t.layouts.footer}</i>{/if}
  </div>
{/snippet}

<style>
  header { display: flex; align-items: center; gap: var(--sp-4); margin-bottom: var(--sp-2); }
  h1 { margin: 0; font-size: var(--size-2xl); flex: 1; }
  .intro { max-width: 46rem; }
  .cards { list-style: none; padding: 0; margin: var(--sp-4) 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: var(--sp-3); }
  .card { width: 100%; display: grid; gap: var(--sp-1); text-align: start; padding: var(--sp-3) !important; background: var(--surface-lowest); }
  .card small { color: var(--on-surface-variant); }
  .layout { max-width: 52rem; display: grid; gap: var(--sp-3); }
  .split { display: grid; grid-template-columns: minmax(0, 26rem) 16rem; gap: var(--sp-6); align-items: start; }
  .choices { display: grid; gap: var(--sp-3); }
  .field { display: grid; gap: var(--sp-1); }
  .check { display: flex; gap: var(--sp-2); align-items: center; }
  .row { display: flex; gap: var(--sp-2); }
  .problem { color: var(--error); margin: 0; }
  .sketch { display: grid; gap: var(--sp-1); padding: var(--sp-1); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); background: var(--surface-low); min-height: 8rem; font-size: var(--size-xs); font-style: normal; }
  .sketch i { font-style: normal; display: block; padding: var(--sp-1) var(--sp-1); border-radius: var(--shape-xs); color: var(--on-surface-variant); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .bar { background: var(--surface-container); }
  .band { background: var(--secondary-container); }
  .middle { display: flex; gap: var(--sp-1); min-height: 4rem; }
  .content { flex: 1; background: var(--surface-lowest); border: 1px dashed var(--outline-variant); }
  .sketch[data-width='narrow'] .content { flex: 0.6; margin-inline: auto; }
  .aside { width: 32%; background: var(--secondary-container); }
  .sketch[data-side='left'] .aside { order: -1; }
</style>
