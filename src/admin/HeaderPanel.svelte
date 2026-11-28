<script lang="ts">
/**
 * The header, whole (ADR 0082 d3): what it says (the logo, the menu, the
 * button) and how it looks (stays at the top, arrangement, colours). What it
 * says is kept with the site, how it looks with its style; this is only where
 * both are edited, opened by a click on the header.
 */
import { onMount } from 'svelte';
import { type BlockStyle, HEADER_ARRANGEMENTS, languageName, type LinkValue, type MenuList, type Site, type SiteText, type Theme } from '../core/index.ts';
import { api, type PageInfo } from './api.ts';
import ImageField from './ImageField.svelte';
import MenuBuilder from './MenuBuilder.svelte';
import { say, t } from './messages.ts';
import StyleEditor from './StyleEditor.svelte';
import { tryTheme } from './themeEdit.ts';

let {
  site,
  theme,
  pages,
  lists,
  onsite,
  ontheme,
}: {
  site: Site;
  theme: Theme;
  pages: PageInfo[];
  lists: MenuList[];
  onsite: (site: Site) => void;
  ontheme: (theme: Theme) => void;
} = $props();

const set = (patch: Partial<Site>): void => onsite({ ...site, ...patch });
const link = (value: LinkValue | null, patch: Partial<LinkValue>): LinkValue => ({ label: value?.label ?? '', href: value?.href ?? '', ...patch });
const own = (language: string): SiteText => site.translations[language] ?? { footer: '', action: null, footerLinks: [] };
const setOwn = (language: string, patch: Partial<SiteText>): void => set({ translations: { ...site.translations, [language]: { ...own(language), ...patch } } });

let problem = $state('');
function apply(mutate: (draft: Theme) => void): void {
  const tried = tryTheme(theme, mutate, t.style.invalid);
  problem = tried.problem;
  if (tried.theme) ontheme(tried.theme);
}
const setStyle = (part: 'header' | 'menu', style: BlockStyle): void =>
  apply((d) => {
    if (Object.keys(style).length) d.layout[part].style = style;
    else delete d.layout[part].style;
  });

/** Whether visitor accounts are on: the menu may then lead to "My account" (ADR 0064 d4, d8). */
let accounts = $state(false);
onMount(() => {
  api.visitors().then((shown) => (accounts = shown.settings.on)).catch(() => {});
});
</script>

<p class="hint">{t.look.headerIntro}</p>
{#if problem}<p class="bad problem" role="alert">{problem}</p>{/if}

<label class="switch" data-header-sticky>
  <input type="checkbox" role="switch" checked={theme.layout.header.sticky} onchange={(e) => apply((d) => { d.layout.header.sticky = e.currentTarget.checked; })} data-layout-sticky />
  <span><strong>{t.layout.sticky}</strong><small>{t.layout.stickyHint}</small></span>
</label>

<h3>{t.look.says}</h3>
<div class="field">
  <ImageField label={t.site.logo} value={site.logo} named={false} onchange={(logo) => set({ logo: logo.src ? logo : null })} />
  <small>{t.site.logoHint}</small>
</div>

<div class="field" data-menu-builder>
  <span class="label">{t.menu.title}</span>
  <MenuBuilder {site} {pages} {lists} {accounts} nodes={site.menu} onchange={(menu) => set({ menu })} />
</div>

<fieldset class="field" data-site-action>
  <legend>{t.site.action}</legend>
  <label><span>{t.inspector.linkLabel}</span>
    <input type="text" maxlength="80" value={site.action?.label ?? ''} oninput={(e) => set({ action: link(site.action, { label: e.currentTarget.value }) })} />
  </label>
  <label><span>{t.inspector.linkHref}</span>
    <input type="text" value={site.action?.href ?? ''} oninput={(e) => set({ action: link(site.action, { href: e.currentTarget.value }) })} />
  </label>
</fieldset>

{#each site.languages as language (language)}
  <fieldset class="field" data-own-action={language}>
    <legend>{say(t.look.actionIn, { language: languageName(language) })}</legend>
    <label><span>{t.inspector.linkLabel}</span>
      <input type="text" maxlength="80" value={own(language).action?.label ?? ''} oninput={(e) => setOwn(language, { action: link(own(language).action, { label: e.currentTarget.value }) })} />
    </label>
    <label><span>{t.inspector.linkHref}</span>
      <input type="text" value={own(language).action?.href ?? ''} oninput={(e) => setOwn(language, { action: link(own(language).action, { href: e.currentTarget.value }) })} />
    </label>
    <small>{t.site.inLanguageHint}</small>
  </fieldset>
{/each}

<h3>{t.look.looks}</h3>
<fieldset class="field arrangements" data-layout="header">
  <legend>{t.layout.arrangement}</legend>
  <div class="choices">
    {#each HEADER_ARRANGEMENTS as name (name)}
      <label class="choice" class:on={theme.layout.header.arrangement === name}>
        <input type="radio" name="header-arrangement" value={name} checked={theme.layout.header.arrangement === name} onchange={() => apply((d) => { d.layout.header.arrangement = name; })} data-layout-header={name} />
        <span class="pic {name}" aria-hidden="true"><i class="logo"></i><i class="nav"></i><i class="nav"></i><i class="nav"></i></span>
        <span>{t.layout.arrangements[name] ?? name}</span>
      </label>
    {/each}
  </div>
</fieldset>

<details>
  <summary>{t.look.headerColours}</summary>
  <div data-layout-style="header">
    <StyleEditor style={theme.layout.header.style} {theme} onstyle={(style) => setStyle('header', style)} defaultLabel={t.theme.unset} />
  </div>
</details>
<details>
  <summary>{t.menu.panel}</summary>
  <p class="hint">{t.look.menuPanelHint}</p>
  <div data-layout-style="menu">
    <StyleEditor style={theme.layout.menu.style} {theme} onstyle={(style) => setStyle('menu', style)} defaultLabel={t.theme.unset} />
  </div>
</details>

<style>
  h3 { margin: var(--sp-5) 0 var(--sp-2); font: var(--label-m); letter-spacing: 0.04em; text-transform: uppercase; color: var(--primary); }
  .label { display: block; font: var(--title-s); margin-bottom: var(--sp-1); }
  .problem { position: sticky; top: calc(-1 * var(--sp-4)); z-index: 1; margin: 0 calc(-1 * var(--sp-4)) var(--sp-3); padding: var(--sp-2) var(--sp-4); background: var(--error-container); color: var(--on-error-container); }
  .switch { display: flex; gap: var(--sp-3); align-items: center; justify-content: space-between; padding: var(--sp-3) var(--sp-4); border: 1px solid var(--outline-variant); border-radius: var(--shape-md); background: var(--surface-lowest); cursor: pointer; }
  .switch strong { display: block; font: var(--title-s); }
  .switch small { display: block; color: var(--on-surface-variant); margin-top: 2px; }
  /* The switch: the thumb grows and moves when it is on. */
  .switch input { appearance: none; order: 2; flex: none; width: 52px; height: 32px; margin: 0; border: 2px solid var(--outline); border-radius: var(--shape-full); background: var(--surface-highest); position: relative; cursor: pointer; transition: background var(--dur-medium) var(--ease-standard), border-color var(--dur-medium) var(--ease-standard); }
  .switch input::after { content: ''; position: absolute; top: 50%; left: 6px; width: 16px; height: 16px; border-radius: 50%; background: var(--outline); transform: translateY(-50%); transition: all var(--dur-medium) var(--ease-decel); }
  .switch input:checked { background: var(--primary); border-color: var(--primary); }
  .switch input:checked::after { left: 22px; width: 24px; height: 24px; background: var(--on-primary); }
  .switch input:active::after { left: 2px; width: 28px; height: 28px; }
  .switch input:checked:active::after { left: 18px; }
  .choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-2); }
  .choice { display: grid; gap: var(--sp-1); justify-items: center; padding: var(--sp-2) var(--sp-1); border: 1px solid var(--outline-variant); border-radius: var(--shape-md); font: var(--label-m); text-align: center; cursor: pointer; background: var(--surface-lowest); transition: background-color var(--dur-short-2) var(--ease-standard); }
  .choice:hover { background: color-mix(in oklch, var(--on-surface) var(--state-hover), var(--surface-lowest)); }
  .choice.on { border: 2px solid var(--primary); padding: calc(var(--sp-2) - 1px) calc(var(--sp-1) - 1px); background: var(--secondary-container); color: var(--on-secondary-container); }
  .choice input { position: absolute; opacity: 0; pointer-events: none; }
  .choice:has(input:focus-visible) { outline: 3px solid var(--primary); outline-offset: 2px; }
  .pic { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; width: 100%; max-width: 72px; height: 30px; padding: var(--sp-1); border-radius: var(--shape-xs); background: var(--surface-container); }
  .pic i { display: block; height: 5px; border-radius: 2px; background: var(--outline-variant); }
  .pic .logo { width: 18px; background: var(--primary); }
  .pic .nav { width: 9px; }
  .pic.inline .logo { margin-inline-end: auto; }
  .pic.centered, .pic.stacked { justify-content: center; }
  .pic.centered .logo, .pic.stacked .logo { flex-basis: 100%; max-width: 18px; margin: 0 calc(50% - 9px); }
  .pic.stacked { align-content: center; }
  .pic.stacked .logo { width: 24px; max-width: 24px; margin: 0 calc(50% - 12px); }
  details { margin: var(--sp-3) 0; border: 1px solid var(--outline-variant); border-radius: var(--shape-md); padding: var(--sp-2) var(--sp-3); }
  summary { cursor: pointer; font: var(--title-s); min-height: var(--target-dense); display: flex; align-items: center; }
  details[open] > summary { margin-bottom: var(--sp-3); }
</style>
