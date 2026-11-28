<script lang="ts">
/**
 * Design (ADR 0082): the one place for how the site looks and what it says
 * around every page. Three parts, as the page shows them: the style of the
 * whole site, the header with its menu, and the footer. A click on the header
 * or the footer in the canvas opens its part.
 */
import type { MenuList, Site, Theme } from '../core/index.ts';
import type { PageInfo } from './api.ts';
import FooterPanel from './FooterPanel.svelte';
import HeaderPanel from './HeaderPanel.svelte';
import { t } from './messages.ts';
import ThemeBuilder from './ThemeBuilder.svelte';
import { DESIGN_PARTS, type DesignPart } from './themeEdit.ts';

let {
  part,
  site,
  theme,
  ready,
  changed,
  pages,
  lists,
  handPicked = 0,
  onpart,
  onsite,
  ontheme,
  onchoose,
  onpublish,
}: {
  part: DesignPart;
  site: Site;
  theme: Theme;
  ready: Theme[];
  /** The style differs from the one visitors see. */
  changed: boolean;
  pages: PageInfo[];
  lists: MenuList[];
  handPicked?: number;
  onpart: (part: DesignPart) => void;
  onsite: (site: Site) => void;
  ontheme: (theme: Theme) => void;
  onchoose: (theme: Theme) => void;
  onpublish: () => void;
} = $props();

</script>

<h2>{t.look.heading}</h2>
<div class="parts" role="tablist" aria-label={t.look.heading}>
  {#each DESIGN_PARTS as one (one)}
    <button type="button" role="tab" aria-selected={part === one} onclick={() => onpart(one)} data-design-part={one}>{t.look.parts[one]}</button>
  {/each}
</div>

<div class="saved" data-theme-state={changed ? 'changed' : 'published'}>
  <p class="hint">{changed ? t.look.savedDraft : t.look.savedLive}</p>
  {#if changed}<button type="button" class="primary" onclick={onpublish} data-theme-publish-here>{t.theme.publish}</button>{/if}
</div>

<div role="tabpanel" data-design={part}>
  {#if part === 'style'}
    <p class="hint" data-panel-intro="theme">{t.look.styleIntro}</p>
    <ThemeBuilder {theme} onchange={ontheme} {handPicked} {ready} {onchoose} />
  {:else if part === 'header'}
    <HeaderPanel {site} {theme} {pages} {lists} {onsite} {ontheme} />
  {:else}
    <FooterPanel {site} {theme} {onsite} {ontheme} />
  {/if}
</div>

<style>
  /* Three parts as tabs, with an indicator under the chosen one (ADR 0084). */
  .parts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0 0 var(--sp-4); border-bottom: 1px solid var(--outline-variant); }
  .parts button { position: relative; margin: 0; min-height: 48px; padding: var(--sp-1) var(--sp-1); border: 0; border-radius: 0; background: transparent; font: var(--title-s); color: var(--on-surface-variant); line-height: 1.2; }
  .parts button::after { content: ''; position: absolute; inset-inline: 20%; bottom: 0; height: 3px; border-radius: 3px 3px 0 0; background: var(--primary); transform: scaleX(0); transition: transform var(--dur-medium) var(--ease-decel); }
  .parts button[aria-selected='true'] { color: var(--primary); }
  .parts button[aria-selected='true']::after { transform: scaleX(1); }
  .saved { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2) var(--sp-3); margin: 0 0 var(--sp-4); padding: var(--sp-3) var(--sp-4); border-radius: var(--shape-md); background: var(--surface-container); color: var(--on-surface-variant); }
  .saved[data-theme-state='changed'] { background: var(--warning-container); color: var(--on-warning-container); }
  .saved p { margin: 0; flex: 1 1 12rem; }
</style>
