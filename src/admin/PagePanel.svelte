<script lang="ts">
/**
 * The page around the blocks (ADR 0085 d8), under the style: the page in a
 * box, the colour and the picture around it; under "More settings" the motion
 * as the page scrolls and under the pointer, and a sidebar that stays in view.
 */
import { MOTION_APPEAR, MOTION_HOVER, type Site, type Theme } from '../core/index.ts';
import ImageField from './ImageField.svelte';
import { t } from './messages.ts';
import { tryTheme } from './themeEdit.ts';

let { site, theme, onsite, ontheme }: { site: Site; theme: Theme; onsite: (site: Site) => void; ontheme: (theme: Theme) => void } = $props();

let problem = $state('');
function apply(mutate: (draft: Theme) => void): void {
  const tried = tryTheme(theme, mutate, t.style.invalid);
  problem = tried.problem;
  if (tried.theme) ontheme(tried.theme);
}
const page = $derived(theme.layout.page);
const motion = $derived(theme.layout.motion);
const setPage = (key: 'boxed' | 'stickySide', on: boolean): void =>
  apply((d) => {
    if (on) d.layout.page[key] = true;
    else delete d.layout.page[key];
  });
const setAround = (name: string): void =>
  apply((d) => {
    if (name) d.layout.page.background = name;
    else delete d.layout.page.background;
  });
const setMotion = (key: 'appear' | 'hover', name: string): void =>
  apply((d) => {
    if (name === 'none') delete d.layout.motion[key];
    else (d.layout.motion as Record<string, string>)[key] = name;
  });
const setPicture = (src: string, alt: string): void => {
  const next: Site = { ...site };
  if (src) next.background = { src, alt };
  else delete next.background;
  onsite(next);
};
</script>

<section class="page-look" data-page-look>
  <h3>{t.pageLook.heading}</h3>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  <label class="check"><input type="checkbox" checked={page.boxed === true} onchange={(e) => setPage('boxed', e.currentTarget.checked)} data-page-boxed /><span>{t.pageLook.boxed}</span></label>
  {#if page.boxed}
    <label class="field">
      <span>{t.pageLook.around}</span>
      <select value={page.background ?? ''} onchange={(e) => setAround(e.currentTarget.value)} data-page-around>
        <option value="">{t.look.colours.surface ?? 'surface'}</option>
        {#each Object.keys(theme.tokens.color).filter((n) => n !== 'surface') as name (name)}<option value={name}>{t.look.colours[name] ?? name}</option>{/each}
      </select>
    </label>
    <ImageField label={t.pageLook.picture} value={site.background ?? null} named={false} onchange={(image) => setPicture(image.src, image.alt)} />
    <small>{t.pageLook.pictureHint}</small>
  {/if}
  <details class="more" data-page-more>
    <summary>{t.look.more}</summary>
    <label class="field">
      <span>{t.pageLook.appear}</span>
      <select value={motion.appear ?? 'none'} onchange={(e) => setMotion('appear', e.currentTarget.value)} data-motion-appear>
        {#each MOTION_APPEAR as name (name)}<option value={name}>{t.pageLook.appears[name]}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>{t.pageLook.hover}</span>
      <select value={motion.hover ?? 'none'} onchange={(e) => setMotion('hover', e.currentTarget.value)} data-motion-hover>
        {#each MOTION_HOVER as name (name)}<option value={name}>{t.pageLook.hovers[name]}</option>{/each}
      </select>
    </label>
    <small>{t.pageLook.motionHint}</small>
    <label class="check"><input type="checkbox" checked={page.stickySide === true} onchange={(e) => setPage('stickySide', e.currentTarget.checked)} data-page-sticky-side /><span>{t.pageLook.stickySide}</span></label>
  </details>
</section>

<style>
  .page-look { margin-top: var(--sp-5); padding-top: var(--sp-4); border-top: 1px solid var(--outline-variant); }
  h3 { margin: 0 0 var(--sp-2); font: var(--label-m); letter-spacing: 0.04em; text-transform: uppercase; color: var(--primary); }
  select { width: 100%; }
  small { display: block; color: var(--on-surface-variant); font: var(--body-s); }
  .problem { padding: var(--sp-2) var(--sp-4); background: var(--error-container); color: var(--on-error-container); }
  .more { margin-top: var(--sp-4); }
  .more > summary { color: var(--primary); }
  .check { display: flex; align-items: center; gap: var(--sp-2); margin-block: var(--sp-2); }
</style>
