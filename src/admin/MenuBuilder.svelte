<script lang="ts">
/**
 * The menu builder (ADR 0008). The menu is a short tree: top items, the items
 * under one, and the links under those. An item points at a page or a list of entries
 * by name, at another address, or at nothing (a heading that only opens).
 *
 * Until the owner arranges it, the site makes the menu from its pages; this
 * shows that one and offers to take it over.
 */
import { automaticMenu, contentTypes, MENU_DEPTH, MENU_MAX_ITEMS, type MenuList, type MenuNode, type MenuTarget, newId, type Site } from '../core/index.ts';
import type { PageInfo } from './api.ts';
import Self from './MenuBuilder.svelte';
import { t } from './messages.ts';

let {
  site,
  pages,
  lists,
  nodes,
  depth = 1,
  accounts = false,
  onchange,
}: {
  site: Site;
  pages: PageInfo[];
  /** The content types that have something to list: the only ones a menu can lead to. */
  lists: MenuList[];
  /** The items at this level; null at the top means the site still makes its own menu. */
  nodes: MenuNode[] | null;
  depth?: number;
  /** Visitor accounts are on: an item may lead to "My account" (ADR 0064 d4). */
  accounts?: boolean;
  onchange: (nodes: MenuNode[] | null) => void;
} = $props();

const fresh = (): MenuNode => ({ id: newId(), label: '', target: { kind: 'none' }, children: [] });
const list = $derived(nodes ?? []);
const patch = (i: number, change: Partial<MenuNode>): void => onchange(list.map((n, j) => (j === i ? { ...n, ...change } : n)));
const move = (i: number, by: -1 | 1): void => {
  const next = [...list];
  const [item] = next.splice(i, 1);
  if (item) next.splice(i + by, 0, item);
  onchange(next);
};

const choice = (target: MenuTarget): string => (target.kind === 'page' ? `page:${target.slug}` : target.kind === 'type' ? `type:${target.id}` : target.kind);
const types = $derived(site.types);
function choose(i: number, value: string): void {
  if (value.startsWith('page:')) patch(i, { target: { kind: 'page', slug: value.slice(5) } });
  else if (value.startsWith('type:')) patch(i, { target: { kind: 'type', id: value.slice(5) } });
  else if (value === 'url') patch(i, { target: { kind: 'url', href: '' } });
  else if (value === 'account') patch(i, { target: { kind: 'account' } });
  else patch(i, { target: { kind: 'none' } });
}
/** What the item says when its own label is left empty. */
const fallback = (target: MenuTarget): string =>
  target.kind === 'page'
    ? (pages.find((p) => p.slug === target.slug)?.title ?? '')
    : target.kind === 'type'
      ? (contentTypes(site).find((type) => type.id === target.id)?.name ?? '')
      : '';
/** Points at a list with nothing in it yet: not drawn until it has an entry. */
const empty = (target: MenuTarget): boolean =>
  target.kind === 'type' && !lists.some((l) => l.id === target.id);
const missing = (target: MenuTarget): boolean => target.kind === 'page' && !pages.some((p) => p.slug === target.slug);
</script>

{#if nodes === null}
  <p class="hint">{t.menu.automatic}</p>
  <button type="button" onclick={() => onchange(automaticMenu(site, pages, lists).map((n) => ({ ...n, id: newId() })))} data-menu-customise>{t.menu.customise}</button>
{:else}
  <ul class="menu-items" data-menu-level={depth}>
    {#each list as node, i (node.id)}
      <li data-menu-item>
        <div class="row">
          <input
            type="text"
            maxlength="60"
            value={node.label}
            placeholder={fallback(node.target) || t.menu.label}
            aria-label={t.menu.label}
            oninput={(e) => patch(i, { label: e.currentTarget.value })}
            data-menu-label
          />
          <button type="button" class="quiet" onclick={() => move(i, -1)} disabled={i === 0} title={t.actions.up} aria-label={t.actions.up}>↑</button>
          <button type="button" class="quiet" onclick={() => move(i, 1)} disabled={i === list.length - 1} title={t.actions.down} aria-label={t.actions.down}>↓</button>
          <button type="button" class="quiet" onclick={() => onchange(list.filter((_, j) => j !== i))} title={t.inspector.remove} aria-label={t.inspector.remove}>✕</button>
        </div>
        <select value={choice(node.target)} onchange={(e) => choose(i, e.currentTarget.value)} aria-label={t.menu.target} data-menu-target>
          <option value="none">{t.menu.heading}</option>
          {#each pages as p}<option value={`page:${p.slug}`}>{t.menu.page}: {p.title}</option>{/each}
          {#if node.target.kind === 'page' && missing(node.target)}<option value={`page:${node.target.slug}`}>{t.menu.gone}</option>{/if}
          {#each types as type}<option value={`type:${type.id}`}>{type.name}</option>{/each}
          <option value="url">{t.menu.url}</option>
          {#if accounts || node.target.kind === 'account'}<option value="account">{t.menu.account}</option>{/if}
        </select>
        {#if node.target.kind === 'url'}
          <input type="text" value={node.target.href} placeholder="https://… /contact/" aria-label={t.inspector.linkHref} oninput={(e) => patch(i, { target: { kind: 'url', href: e.currentTarget.value.trim() } })} data-menu-href />
        {/if}
        {#if missing(node.target)}<small class="bad">{t.menu.goneHint}</small>{/if}
        {#if empty(node.target)}<small>{t.menu.noPosts}</small>{/if}
        {#if depth < MENU_DEPTH}
          {#if node.children.length}
            <Self {site} {pages} {lists} {accounts} nodes={node.children} depth={depth + 1} onchange={(children) => patch(i, { children: children ?? [] })} />
          {:else}
            <button type="button" class="quiet" onclick={() => patch(i, { children: [fresh()] })} data-menu-sub>+ {depth === 1 ? t.menu.addSub : t.menu.addLink}</button>
          {/if}
        {/if}
      </li>
    {/each}
  </ul>
  {#if list.length < MENU_MAX_ITEMS}
    <button type="button" onclick={() => onchange([...list, fresh()])} data-menu-add={depth}>+ {depth === 1 ? t.menu.add : depth === 2 ? t.menu.addSub : t.menu.addLink}</button>
  {/if}
  {#if depth === 1}
    <p class="hint">{t.menu.megaHint}</p>
    <button type="button" class="quiet" onclick={() => onchange(null)}>{t.menu.reset}</button>
  {/if}
{/if}

<style>
  .menu-items { list-style: none; margin: 0 0 var(--sp-2); padding: 0; display: grid; gap: var(--sp-2); }
  .menu-items li { display: grid; gap: var(--sp-1); padding: var(--sp-2); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); background: var(--surface-lowest); }
  .menu-items :global(.menu-items) { margin: 0.2rem 0 0; padding-inline-start: var(--sp-2); border-inline-start: 2px solid var(--primary); }
  .menu-items :global(.menu-items li) { background: var(--surface-low); }
  .row { display: flex; gap: 0.15rem; align-items: center; }
  .row input { flex: 1; min-width: 0; }
  .row button { padding: var(--sp-1) var(--sp-2) !important; }
</style>
