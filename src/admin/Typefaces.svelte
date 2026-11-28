<script lang="ts">
/**
 * The typefaces of the style (ADR 0085 d6): one for headings, one for text,
 * from three lists. Uhlaka's own, which draw every common script; a family of
 * Google Fonts, which the site downloads once and serves itself; a face the
 * owner bought, uploaded as a `.woff2`. Every one is served by the site.
 */
import { onMount } from 'svelte';
import { FONT_STACKS, fontStack, type Theme } from '../core/index.ts';
import { api, type GoogleFamily, type SiteFont } from './api.ts';
import { say, t } from './messages.ts';
import { FACES_CSS } from './themeEdit.ts';

let { theme, apply }: { theme: Theme; apply: (mutate: (draft: Theme) => void) => void } = $props();

const ROLES = ['heading', 'body'] as const;
let fonts = $state<SiteFont[]>([]);
let query = $state('');
let found = $state<GoogleFamily[]>([]);
let total = $state(0);
let busy = $state('');
let problem = $state('');
let said = $state('');
let label = $state('');
let weight = $state('400');
let style = $state('normal');
let file = $state<File | null>(null);
/** Raised when the site's faces change, so the samples' stylesheet is asked for again. */
let version = $state(0);

const current = (role: 'heading' | 'body'): string => theme.tokens.font[role] ?? theme.tokens.font.body ?? 'system';
const choose = (role: 'heading' | 'body', value: string): void =>
  apply((d) => {
    d.tokens.font[role] = value;
  });
const nameOf = (value: string): string => t.fonts.names[value] ?? fonts.find((f) => f.name === value)?.label ?? value;
/** The scripts a family has, in words: Latin once, however many pieces of it there are. */
const scripts = (subsets: string[]): string => [...new Set(subsets.map((s) => t.fonts.scripts[s.replace(/-ext$/, '')] ?? s))].join(', ');

onMount(() => {
  void api.fonts().then((answer) => (fonts = answer.fonts), () => {});
});
$effect(() => {
  const href = `${FACES_CSS}?v=${version}`;
  let sheet = document.getElementById('uhlaka-faces') as HTMLLinkElement | null;
  if (!sheet) {
    sheet = document.createElement('link');
    sheet.id = 'uhlaka-faces';
    sheet.rel = 'stylesheet';
    document.head.append(sheet);
  }
  sheet.href = href;
});

let timer: ReturnType<typeof setTimeout> | undefined;
function search(): void {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const answer = await api.googleFonts(query);
    found = answer.families;
    total = answer.total;
  }, 200);
}

async function run(what: string, work: () => Promise<{ font: SiteFont; fonts: SiteFont[] } | { fonts: SiteFont[] }>): Promise<void> {
  busy = what;
  problem = '';
  said = '';
  try {
    const answer = await work();
    fonts = answer.fonts;
    version++;
    if ('font' in answer) said = say(t.fonts.added, { name: answer.font.label });
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  } finally {
    busy = '';
  }
}
const addGoogle = (family: string): Promise<void> => run(family, () => api.addGoogleFont(family));
const upload = (): Promise<void> => (file ? run('upload', () => api.uploadFont(file as File, label, weight, style)) : Promise.resolve());
const remove = (name: string): Promise<void> => run(name, () => api.deleteFont(name));
</script>

<h3>{t.fonts.heading}</h3>
{#each ROLES as role (role)}
  <label class="field">
    <span>{t.fonts.roles[role]}</span>
    <select value={current(role)} onchange={(e) => choose(role, e.currentTarget.value)} data-font={role}>
      <optgroup label={t.fonts.uhlaka}>
        {#each Object.keys(FONT_STACKS) as name (name)}<option value={name}>{nameOf(name)}</option>{/each}
      </optgroup>
      {#if fonts.length}
        <optgroup label={t.fonts.yours}>
          {#each fonts as font (font.name)}<option value={font.name}>{font.label}</option>{/each}
        </optgroup>
      {/if}
    </select>
  </label>
  <p class="sample" style:font-family={fontStack(current(role))} data-font-sample={role}>{t.fonts.sample}</p>
{/each}

<details class="add" data-fonts-add>
  <summary>{t.fonts.add}</summary>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  {#if said}<p class="said" role="status">{said}</p>{/if}

  <h4>{t.fonts.google}</h4>
  <p class="hint">{t.fonts.googleHint}</p>
  <input type="search" bind:value={query} oninput={search} placeholder={t.fonts.search} aria-label={t.fonts.search} data-google-search />
  {#if found.length}
    <ul class="found">
      {#each found as family (family.family)}
        {@const have = fonts.some((f) => f.label === family.family && f.name.startsWith('google:'))}
        <li>
          <span><strong>{family.family}</strong><small>{scripts(family.subsets)}</small></span>
          <button type="button" class="tonal" disabled={have || busy !== ''} onclick={() => addGoogle(family.family)} data-google-add={family.family}>
            {have ? t.fonts.have : busy === family.family ? t.fonts.adding : t.fonts.addOne}
          </button>
        </li>
      {/each}
    </ul>
    {#if total > found.length}<p class="hint">{say(t.fonts.more, { count: String(total - found.length) })}</p>{/if}
  {/if}

  <h4>{t.fonts.upload}</h4>
  <p class="hint">{t.fonts.licence}</p>
  <label class="field"><span>{t.fonts.name}</span><input bind:value={label} data-font-label /></label>
  <label class="field">
    <span>{t.fonts.weight}</span>
    <select bind:value={weight} data-font-weight>
      {#each Object.entries(t.fonts.weights) as [value, word] (value)}<option {value}>{word}</option>{/each}
    </select>
  </label>
  <label class="field">
    <span>{t.fonts.style}</span>
    <select bind:value={style} data-font-style>
      <option value="normal">{t.fonts.upright}</option>
      <option value="italic">{t.fonts.italic}</option>
    </select>
  </label>
  <label class="field">
    <span>{t.fonts.file}</span>
    <input type="file" accept=".woff2,font/woff2" onchange={(e) => (file = e.currentTarget.files?.[0] ?? null)} data-font-file />
  </label>
  <button type="button" disabled={!file || !label.trim() || busy !== ''} onclick={upload} data-font-upload>{busy === 'upload' ? t.fonts.adding : t.fonts.uploadOne}</button>

  {#if fonts.length}
    <h4>{t.fonts.yours}</h4>
    <ul class="yours">
      {#each fonts as font (font.name)}
        <li data-site-font={font.name}>
          <span style:font-family={fontStack(font.name)}>{font.label}</span>
          <small>{font.name.startsWith('google:') ? t.fonts.fromGoogle : say(t.fonts.files, { count: String(font.faces.length) })}</small>
          <button type="button" class="text" disabled={busy !== ''} onclick={() => remove(font.name)} data-font-remove={font.name}>{t.fonts.remove}</button>
        </li>
      {/each}
    </ul>
  {/if}
</details>

<style>
  h3 { margin: var(--sp-5) 0 var(--sp-2); font: var(--label-m); letter-spacing: 0.04em; text-transform: uppercase; color: var(--primary); }
  h4 { margin: var(--sp-4) 0 var(--sp-1); font: var(--title-s); }
  select, input[type='search'], [data-font-label] { width: 100%; }
  .sample { margin: 0 0 var(--sp-3); font-size: 1.25rem; line-height: 1.3; overflow-wrap: anywhere; }
  .add { margin-top: var(--sp-3); }
  .add > summary { color: var(--primary); }
  .problem { padding: var(--sp-2) var(--sp-4); background: var(--error-container); color: var(--on-error-container); }
  .said { color: var(--primary); }
  ul { list-style: none; margin: var(--sp-2) 0; padding: 0; display: grid; gap: var(--sp-1); }
  li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
  li span { display: grid; min-width: 0; }
  li small { color: var(--on-surface-variant); font: var(--body-s); }
  .yours li span { font-size: 1.125rem; }
</style>
