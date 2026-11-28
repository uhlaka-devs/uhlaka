<script lang="ts">
/**
 * The site's settings (ADR 0082 d6): who it is, its languages and address,
 * what search engines are told, and how it works (forms, accounts, the shop,
 * e-mail, old addresses, speed). What it says around every page (logo, menu,
 * footer) and how it looks are in Design.
 */
import { type Business, BUSINESS_KINDS, cleanBusiness, WEEKDAYS, cleanRobots, languageName, MAX_LANGUAGES, prefixOf, type ShopSettings, type Site, verificationCode } from '../core/index.ts';
import type { LanguageInfo } from './api.ts';
import ImageField from './ImageField.svelte';
import { say, t } from './messages.ts';

let {
  site,
  languages = [],
  onchange,
  onadminlanguage,
  shop,
  onshop,
}: {
  site: Site;
  languages?: LanguageInfo[];
  onchange: (site: Site) => void;
  /** The admin's words are read when it starts, so choosing its language saves and opens it again. */
  onadminlanguage?: (language: string) => void;
  /** The shop's settings (ADR 0065), and what to do once they are saved: the site is read again. */
  shop?: ShopSettings;
  onshop?: () => void;
} = $props();
const named = (l: LanguageInfo): string => (l.coverage < 1 ? `${l.name} (${say(t.site.partial, { count: Math.floor(l.coverage * 100) })})` : l.name);

const set = (patch: Partial<Site>): void => onchange({ ...site, ...patch });
/** The business as a place people come to (ADR 0061 d2): each part cleaned as it is left, so the field shows what is kept. */
const business = $derived(site.business ?? {});
const setBusiness = (patch: Record<string, unknown>): void => set({ business: cleanBusiness({ ...business, ...patch }) });
let adding = $state('');
const addLanguage = (): void => {
  const language = adding.trim();
  if (!language) return;
  set({ languages: [...site.languages, language] });
  adding = '';
};
import Performance from './Performance.svelte';
import ShopSettingsPanel from './ShopSettings.svelte';
import Visitors from './Visitors.svelte';
import EmailSettings from './EmailSettings.svelte';
import Redirects from './Redirects.svelte';
</script>

<label class="field">
  <span>{t.site.name}</span>
  <input type="text" maxlength="120" value={site.name} oninput={(e) => e.currentTarget.value.trim() && set({ name: e.currentTarget.value })} data-site-name />
</label>
<label class="field">
  <span>{t.site.language}</span>
  <input type="text" maxlength="20" value={site.language} list="cms-languages" onchange={(e) => set({ language: e.currentTarget.value.trim() })} data-site-language />
  <datalist id="cms-languages">{#each languages as l (l.language)}<option value={l.language}>{named(l)}</option>{/each}</datalist>
  <small>{t.site.languageHint}</small>
</label>
<fieldset class="field" data-site-languages>
  <legend>{t.site.otherLanguages}</legend>
  {#each site.languages as language (language)}
    <div class="custom" data-site-other={language}>
      <span class="grow">{languageName(language)} <small>/{prefixOf(language)}/</small></span>
      <button type="button" class="quiet" onclick={() => set({ languages: site.languages.filter((l) => l !== language) })} data-language-remove>{t.inspector.remove}</button>
    </div>
  {/each}
  {#if site.languages.length < MAX_LANGUAGES}
    <div class="custom">
      <input type="text" maxlength="20" list="cms-languages" placeholder="ro, de, fr" bind:value={adding} onkeydown={(e) => e.key === 'Enter' && addLanguage()} data-language-new />
      <button type="button" onclick={addLanguage} data-language-add>{t.inspector.add}</button>
    </div>
  {/if}
  <small>{t.site.otherLanguagesHint}</small>
</fieldset>
{#if site.languages.length}
  <label class="check">
    <input type="checkbox" checked={site.visitorLanguage !== false} onchange={(e) => set({ visitorLanguage: e.currentTarget.checked ? undefined : false })} data-site-visitor-language />
    <span>{t.site.visitorLanguage}</span>
  </label>
  <small>{t.site.visitorLanguageHint}</small>
{/if}
<label class="field">
  <span>{t.site.adminLanguage}</span>
  <select
    value={site.adminLanguage}
    onchange={(e) => onadminlanguage?.(e.currentTarget.value)}
    data-admin-language
  >
    <option value="">{t.site.sameAsSite}</option>
    {#each languages as l (l.language)}<option value={l.language}>{named(l)}</option>{/each}
  </select>
</label>
<label class="field">
  <span>{t.site.url}</span>
  <input type="url" value={site.url} onchange={(e) => set({ url: e.currentTarget.value.trim() })} />
  <small>{t.site.urlHint}</small>
</label>

<h3>{t.site.sharing}</h3>
<div class="field">
  <ImageField label={t.site.shareImage} value={site.shareImage ?? null} onchange={(image) => set({ shareImage: image.src ? image : undefined })} />
  <small>{t.site.shareImageHint}</small>
</div>
<label class="check">
  <input type="checkbox" checked={site.breadcrumbs !== false} onchange={(e) => set({ breadcrumbs: e.currentTarget.checked ? undefined : false })} data-site-breadcrumbs />
  <span>{t.site.breadcrumbs}</span>
</label>
<small>{t.site.breadcrumbsHint}</small>
<label class="field"><span>{t.site.verifyGoogle}</span>
  <input type="text" maxlength="300" value={site.verify?.google ?? ''} onchange={(e) => set({ verify: { ...site.verify, google: verificationCode(e.currentTarget.value) || undefined } })} data-site-verify-google />
</label>
<label class="field"><span>{t.site.verifyBing}</span>
  <input type="text" maxlength="300" value={site.verify?.bing ?? ''} onchange={(e) => set({ verify: { ...site.verify, bing: verificationCode(e.currentTarget.value) || undefined } })} data-site-verify-bing />
</label>
<small>{t.site.verifyHint}</small>
<label class="field"><span>{t.site.robots}</span>
  <textarea rows="3" maxlength="5000" value={site.robots ?? ''} onchange={(e) => set({ robots: cleanRobots(e.currentTarget.value) || undefined })} data-site-robots></textarea>
</label>
<small>{t.site.robotsHint}</small>
<label class="check">
  <input type="checkbox" checked={site.indexNow === true} onchange={(e) => set({ indexNow: e.currentTarget.checked ? true : undefined })} data-site-indexnow />
  <span>{t.site.indexNow}</span>
</label>
<small>{t.site.indexNowHint}</small>
<label class="check">
  <input type="checkbox" checked={site.data !== false} onchange={(e) => set({ data: e.currentTarget.checked ? undefined : false })} data-site-data />
  <span>{t.site.data}</span>
</label>
<small>{t.site.dataHint}</small>

<details class="business" data-business>
  <summary>{t.business.heading}</summary>
  <p class="hint">{t.business.intro}</p>
  <label class="field"><span>{t.business.kind}</span>
    <select value={business.kind ?? ''} onchange={(e) => setBusiness({ kind: (e.currentTarget.value || undefined) as Business['kind'] })} data-business-kind>
      <option value="">{t.business.kindNone}</option>
      {#each BUSINESS_KINDS as kind}<option value={kind}>{t.business.kinds[kind] ?? kind}</option>{/each}
    </select>
  </label>
  {#each ['street', 'city', 'region', 'postalCode', 'country', 'phone', 'email', 'priceRange', 'currency'] as const as key}
    <label class="field"><span>{t.business[key]}</span>
      <input type="text" maxlength="200" value={business[key] ?? ''} onchange={(e) => setBusiness({ [key]: e.currentTarget.value })} data-business-field={key} />
    </label>
  {/each}
  <p class="label">{t.business.hours}</p>
  {#each WEEKDAYS as day, i}
    <label class="day"><span>{t.business.days[day] ?? day}</span>
      <input type="text" maxlength="60" placeholder={t.business.closed} value={business.hours?.[i] ?? ''} onchange={(e) => setBusiness({ hours: Array.from({ length: 7 }, (_, j) => (j === i ? e.currentTarget.value : (business.hours?.[j] ?? ''))) })} data-business-day={i} />
    </label>
  {/each}
  <small>{t.business.hoursHint}</small>
</details>

<h3>{t.site.forms}</h3>
<label class="field">
  <span>{t.site.formsAddress}</span>
  <input type="text" inputmode="url" value={site.forms} onchange={(e) => set({ forms: e.currentTarget.value.trim() })} data-site-forms />
  <small>{t.site.formsHint}</small>
</label>
<label class="field">
  <span>{t.site.keep}</span>
  <input type="number" min="1" max="3650" value={site.keepMessages} onchange={(e) => set({ keepMessages: Number(e.currentTarget.value) })} data-site-keep />
</label>

<Visitors languages={[site.language, ...site.languages]} />

{#if shop}<ShopSettingsPanel settings={shop} onchange={() => onshop?.()} />{/if}

<EmailSettings />

<Redirects />

<Performance />

<p class="hint">{t.site.live}</p>

<style>
  h3 { margin: var(--sp-5) 0 var(--sp-2); font: var(--title-s); }
  .grow { flex: 1; }
  .check { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-3); }
  .check span { margin: 0; }
  .business { margin: var(--sp-4) 0; }
  .business summary { cursor: pointer; font: var(--title-s); }
  .day { display: grid; grid-template-columns: 7rem 1fr; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-1); }
  .label { margin: var(--sp-3) 0 var(--sp-1); }
</style>
