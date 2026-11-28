<script lang="ts">
/**
 * What every page of a site shares: the header, the footer, and between them
 * whatever this page is.
 *
 * What the header and footer say belongs to the site (its name or logo, one
 * button, the footer's words and links). How they are laid out belongs to the
 * theme, and reaches them only through the stylesheet (ADR 0006): this markup
 * is the same under every theme.
 *
 * The menu works without script (ADR 0008). An item that holds others is a
 * <details>: a click, a tap or the keyboard opens it. On a narrow screen the
 * whole menu folds behind a checkbox and its label.
 */
import { getContext, type Snippet } from 'svelte';
import type { Alternate, MenuLink, Site } from '../core/index.ts';
import { areaBlock, choicePath, holdsCurrent, isLink, isMega, layoutOf, measureFor, menuLeadsAway } from '../core/index.ts';
import BlockView from './BlockView.svelte';
import { type EntryLists, marker, setEditing, setLists, setMeasure, setSite } from './editing.ts';
import { ALTERNATES, wordsFor } from './words.ts';

let {
  site,
  menu,
  current,
  editing = false,
  lists = {},
  layout = '',
  children,
}: {
  site: Site;
  menu: MenuLink[];
  /** What a block that lists entries can list. */
  lists?: EntryLists;
  /** The address of this page, to mark it in the menu. */
  current: string;
  editing?: boolean;
  /** The layout this page is drawn in (ADR 0035): what is around its blocks. */
  layout?: string;
  children: Snippet;
} = $props();
// svelte-ignore state_referenced_locally
setEditing(editing);
// svelte-ignore state_referenced_locally
setLists(lists, site.language);
// svelte-ignore state_referenced_locally
setSite(site, current);
// svelte-ignore state_referenced_locally
setMeasure(layoutOf(site.layouts, layout).width, measureFor(site.pictures?.widths ?? {}, layoutOf(site.layouts, layout).width));
const mark = marker();
const words = $derived(wordsFor(site.language));
const footerLinks = $derived(site.footerLinks.filter(isLink));
/** The same page in the site's other languages; none when it has one. */
const others: Alternate[] = getContext(ALTERNATES) ?? [];
const home = others.find((a) => a.current)?.home ?? '/';
const frame = $derived(layoutOf(site.layouts, layout));
const hasMenu = $derived(menuLeadsAway(menu, home));
/** A place of the layout, with what its section holds in this language; nothing when it shows none. */
const area = (section: string) => (section ? { ...areaBlock(section), children: site.areas?.[section] ?? [] } : null);
const top = $derived(area(frame.top));
const side = $derived(frame.sidebar === 'none' ? null : area(frame.side));
const bottom = $derived(area(frame.bottom));
/** The bar above the header, and what else the header holds (ADR 0085 d3): the site's choice, drawn wherever the layout has a header. */
const bar = $derived(frame.header ? area(site.header?.bar ?? '') : null);
const search = $derived(site.header?.search === true);
const cart = $derived(site.header?.cart === true && site.shop !== undefined);
</script>

{#if bar && bar.children.length}
<div class="site-bar" data-site={mark('header')}><BlockView block={bar} /></div>
{/if}
{#if frame.header}
<header class="site-header" data-site={mark('header')}>
  <div class="site-in">
    <a class="site-name" href={home}>
      {#if site.logo}<img class="site-logo" src={site.logo.src} alt={site.logo.alt || site.name} />{:else}{site.name}{/if}
    </a>
    {#if hasMenu || isLink(site.action)}
      <input class="menu-check" type="checkbox" id="site-menu" aria-label={words.menu} />
      <label class="menu-button" for="site-menu">{words.menu}</label>
      <div class="site-nav">
        <label class="menu-close" for="site-menu"><span aria-hidden="true">×</span><span class="site-hide">{words.menuClose}</span></label>
        {#if hasMenu}
          <nav aria-label={words.mainMenu}>
            <ul class="menu">
              {#each menu as item}
                {#if item.children.length === 0}
                  <li>{@render link(item)}</li>
                {:else}
                  <li class={isMega(item) ? 'mega' : undefined}>
                    <details name="site-menu">
                      <summary class={holdsCurrent(item, current) ? 'current' : undefined}>{item.title}</summary>
                      <div class="sub">
                        {#if isMega(item)}
                          {#if item.href}<p class="sub-own">{@render link(item)}</p>{/if}
                          <div class="cols">
                            {#each item.children as column}
                              <div class="col">
                                <p class="col-title">{#if column.href}{@render link(column)}{:else}{column.title}{/if}</p>
                                {#if column.children.length}{@render list(column.children)}{/if}
                              </div>
                            {/each}
                          </div>
                        {:else}
                          {@render list(item.href ? [{ ...item, children: [] }, ...item.children] : item.children)}
                        {/if}
                      </div>
                    </details>
                  </li>
                {/if}
              {/each}
            </ul>
          </nav>
        {/if}
        {#if isLink(site.action)}<a class="button" href={site.action.href}>{site.action.label}</a>{/if}
      </div>
    {/if}
    <div class="site-tools">
    {#if search}
      <details class="site-search">
        <summary><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg><span class="site-hide">{words.search}</span></summary>
        <form role="search" method="get" action={editing ? undefined : '/_/search'}>
          <label class="site-hide" for="site-search-q">{words.search}</label>
          {#if !editing && site.languages.includes(site.language)}<input type="hidden" name="l" value={site.language} />{/if}
          <input id="site-search-q" name="q" type="search" maxlength="200" required disabled={editing} />
          <button class="button" type={editing ? 'button' : 'submit'}>{words.search}</button>
        </form>
      </details>
    {/if}
    {#if cart}
      <a class="site-cart" href="/_/cart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2" /><circle cx="9.5" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></svg><span class="site-hide">{words.cart}</span></a>
    {/if}
    {#if others.length > 1}
      <nav class="site-languages" aria-label={words.languages}>
        {#each others as other}<a href={site.served && !editing ? choicePath(other.language, other.href) : other.href} hreflang={other.language} lang={other.language} aria-current={other.current ? 'true' : undefined}><span class="lang-long">{other.name}</span><span class="lang-short" aria-hidden="true">{other.language.toUpperCase()}</span></a>{/each}
      </nav>
    {/if}
    {#if site.schemeSwitch}
      <!-- Shown by the site's one script, which turns the colours (ADR 0074 d4); without it, the device decides. -->
      <button class="scheme-switch" type="button" hidden={!editing}>
        <span class="scheme-to-dark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></svg><span class="scheme-label">{words.schemeDark}</span></span>
        <span class="scheme-to-light"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" /></svg><span class="scheme-label">{words.schemeLight}</span></span>
      </button>
    {/if}
    </div>
  </div>
</header>
{/if}
<div class="layout layout-{frame.width}" class:layout-side={frame.sidebar !== 'none'} data-layout={frame.id} data-sidebar={frame.sidebar}>
  {#if top}<div class="layout-top" data-area="top"><BlockView block={top} /></div>{/if}
  {#if frame.sidebar === 'none'}
    <main>
      {@render children()}
    </main>
  {:else}
    <div class="layout-body">
      <main>
        {@render children()}
      </main>
      <aside class="layout-aside" data-area="side">{#if side}<BlockView block={side} />{/if}</aside>
    </div>
  {/if}
  {#if bottom}<div class="layout-bottom" data-area="bottom"><BlockView block={bottom} /></div>{/if}
</div>
{#if frame.footer}
<footer class="site-footer" data-site={mark('footer')}>
  <div class="site-in">
    <p>{site.footer || site.name}</p>
    {#if footerLinks.length}
      <nav aria-label={words.footerMenu}>
        {#each footerLinks as link}<a href={link.href}>{link.label}</a>{/each}
      </nav>
    {/if}
  </div>
</footer>
{/if}

{#snippet link(item: MenuLink)}<a href={item.href} aria-current={item.href === current ? 'page' : undefined}>{item.title}</a>{/snippet}

{#snippet list(items: MenuLink[])}
  <ul>
    {#each items as item}{#if item.href}<li>{@render link(item)}</li>{/if}{/each}
  </ul>
{/snippet}
