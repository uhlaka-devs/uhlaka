<script lang="ts">
/**
 * The theme builder (ADR 0001 d8). A theme is a document; this edits it.
 *
 * Every change is tried against the core's own check first (`parseTheme`, the
 * same one the server runs). A change that would leave the theme invalid is
 * not made: the field says why, and the site keeps the theme it had. So the
 * canvas never shows a half-applied theme.
 */
import {
  BLOCK_TYPES,
  type BlockStyle,
  contrastIssues,
  otherPalette,
  otherScheme,
  ownScheme,
  proposePalette,
  shownBy,
  SHOWS,
  type Shows,
  type BlockType,
  FONT_STACKS,
  isFreeValue,
  isTokenName,
  parseTheme,
  REQUIRED_TOKENS,
  type Theme,
  TOKEN_GROUPS,
  type TokenGroup,
} from '../core/index.ts';
import { say, t } from './messages.ts';
import StyleEditor from './StyleEditor.svelte';
import PaletteGallery from './PaletteGallery.svelte';
import StyleGallery from './StyleGallery.svelte';
import { tryTheme } from './themeEdit.ts';

let {
  theme,
  onchange,
  handPicked = 0,
  ready = [],
  onchoose,
}: {
  theme: Theme;
  onchange: (theme: Theme) => void;
  /** Colours chosen by hand on the page in the canvas: they follow neither scheme (ADR 0074 d5). */
  handPicked?: number;
  /** The ready-made styles (ADR 0082 d4). */
  ready?: Theme[];
  /** A ready-made style taken in place of this one. */
  onchoose?: (theme: Theme) => void;
} = $props();

/** What is typed in a field but not valid yet, by field. */
let drafts = $state<Record<string, string>>({});
let adding = $state<Record<string, { name: string; value: string }>>({});
let problem = $state('');
let blockType = $state<BlockType>('hero');
let newVariant = $state('');
let fileInput: HTMLInputElement | undefined = $state();

const entry = $derived(theme.blocks[blockType] ?? {});

/** Try a changed copy of the theme; keep it only if it is a valid theme. */
function apply(mutate: (draft: Theme) => void): boolean {
  const tried = tryTheme(theme, mutate, t.style.invalid);
  problem = tried.problem;
  if (tried.theme) onchange(tried.theme);
  return !!tried.theme;
}

function setToken(group: TokenGroup, name: string, value: string): void {
  const key = `${group}.${name}`;
  if (isFreeValue(group, value)) {
    delete drafts[key];
    apply((d) => {
      d.tokens[group][name] = value;
    });
  } else {
    drafts[key] = value;
  }
}

function addToken(group: TokenGroup): void {
  const { name, value } = adding[group] ?? { name: '', value: '' };
  if (!isTokenName(name) || Object.hasOwn(theme.tokens[group], name) || !isFreeValue(group, value)) return;
  if (apply((d) => { d.tokens[group][name] = value; })) delete adding[group];
}

const removeToken = (group: TokenGroup, name: string): boolean =>
  apply((d) => {
    delete d.tokens[group][name];
    // The second palette names only tokens the theme has.
    if (group === 'color') delete d[otherScheme(d)]?.color[name];
  });

/* Light and dark (ADR 0074 d2, d5). */
const other = $derived(otherScheme(theme));
const palette = $derived(otherPalette(theme));
const shows = $derived(shownBy(theme));
const unreadable = $derived(contrastIssues(theme));

const setShows = (next: Shows): boolean =>
  apply((d) => {
    if (next === ownScheme(d)) delete d.shows;
    else d.shows = next;
  });

/** "Make the dark colours for me": a palette made from the theme's own; `link` joins the theme's colours when it has none. */
function propose(): void {
  const { palette: made, link } = proposePalette(theme);
  apply((d) => {
    if (link) d.tokens.color.link = link;
    d[otherScheme(d)] = { color: made };
  });
}

function setOther(name: string, value: string): void {
  const key = `${other}.${name}`;
  if (isFreeValue('color', value)) {
    delete drafts[key];
    apply((d) => {
      const scheme = otherScheme(d);
      d[scheme] = { color: { ...d[scheme]?.color, [name]: value } };
    });
  } else {
    drafts[key] = value;
  }
}

const removeOther = (): boolean =>
  apply((d) => {
    delete d[otherScheme(d)];
    delete d.shows;
  });

const otherShown = (name: string): string => drafts[`${other}.${name}`] ?? palette?.[name] ?? theme.tokens.color[name] ?? '';

const setBlockStyle = (style: BlockStyle): boolean =>
  apply((d) => {
    d.blocks[blockType] = { ...d.blocks[blockType], style };
  });

const setVariantStyle = (variant: string, style: BlockStyle): boolean =>
  apply((d) => {
    d.blocks[blockType] = { ...d.blocks[blockType], variants: { ...d.blocks[blockType]?.variants, [variant]: style } };
  });

function addVariant(): void {
  const name = newVariant.trim();
  if (!isTokenName(name) || entry.variants?.[name]) return;
  if (setVariantStyle(name, {})) newVariant = '';
}

const removeVariant = (variant: string): boolean =>
  apply((d) => {
    delete d.blocks[blockType]?.variants?.[variant];
  });

/** A colour or typeface by what it is for, when the theme uses one of the usual names; its own name otherwise. */
const tokenLabel = (group: TokenGroup, name: string): string => (group === 'color' ? t.look.colours[name] : group === 'font' ? t.look.faces[name] : undefined) ?? name;
const MAIN_GROUPS: readonly TokenGroup[] = ['color', 'font'];
const MORE_GROUPS = TOKEN_GROUPS.filter((g) => !MAIN_GROUPS.includes(g));

function download(): void {
  const blob = new Blob([`${JSON.stringify(theme, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${theme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'theme'}.theme.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function upload(event: Event): Promise<void> {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    // A theme file is data. It is checked like any other input, and a file with any issue is refused whole.
    const { theme: valid, issues } = parseTheme(JSON.parse(await file.text()));
    if (!valid) {
      problem = `${t.theme.notATheme} ${issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join('; ')}`;
    } else {
      problem = '';
      drafts = {};
      onchange(valid);
    }
  } catch {
    problem = t.theme.notATheme;
  }
  if (fileInput) fileInput.value = '';
}

const shown = (group: TokenGroup, name: string): string => drafts[`${group}.${name}`] ?? theme.tokens[group][name] ?? '';
const invalid = (group: TokenGroup, name: string): boolean => `${group}.${name}` in drafts;
const isRequired = (group: TokenGroup, name: string): boolean => REQUIRED_TOKENS[group].includes(name);
const pending = (group: TokenGroup): { name: string; value: string } => adding[group] ?? { name: '', value: '' };
const canAdd = (group: TokenGroup): boolean =>
  isTokenName(pending(group).name) && !Object.hasOwn(theme.tokens[group], pending(group).name) && isFreeValue(group, pending(group).value);
const hex6 = (value: string): string => (/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000');
</script>

{#if onchoose && ready.length}
  <h3 class="part">{t.look.ready}</h3>
  <StyleGallery {theme} {ready} onchoose={onchoose} ondownload={download} />
{/if}

{#if problem}<p class="bad problem" role="alert">{problem}</p>{/if}

{#snippet tokens(group: TokenGroup, open: boolean)}
  <details open={open} data-token-group={group}>
    <summary>{t.theme.groups[group]}</summary>
    {#each Object.keys(theme.tokens[group]) as name (name)}
      <div class="token">
        <label>
          <span>{tokenLabel(group, name)}</span>
          <span class="custom">
            {#if group === 'font'}
              <select value={theme.tokens.font[name]} onchange={(e) => setToken(group, name, e.currentTarget.value)} data-token={`${group}.${name}`}>
                {#each Object.keys(FONT_STACKS) as font}<option value={font}>{font}</option>{/each}
              </select>
            {:else}
              {#if group === 'color'}
                <input type="color" value={hex6(shown(group, name))} oninput={(e) => setToken(group, name, e.currentTarget.value)} aria-label={name} />
              {/if}
              <input
                type="text"
                value={shown(group, name)}
                oninput={(e) => setToken(group, name, e.currentTarget.value.trim())}
                aria-invalid={invalid(group, name)}
                data-token={`${group}.${name}`}
              />
            {/if}
            {#if !isRequired(group, name)}
              <button type="button" class="quiet" onclick={() => removeToken(group, name)} title={t.inspector.remove} aria-label={`${t.inspector.remove} ${name}`}>✕</button>
            {/if}
          </span>
        </label>
        {#if invalid(group, name)}<small class="bad">{t.style.invalid}</small>{/if}
      </div>
    {/each}
    <div class="token add">
      <span class="custom">
        <input
          type="text"
          placeholder={t.theme.tokenName}
          value={pending(group).name}
          oninput={(e) => (adding[group] = { ...pending(group), name: e.currentTarget.value.trim() })}
          data-new-token-name={group}
        />
        {#if group === 'font'}
          <select value={pending(group).value} onchange={(e) => (adding[group] = { ...pending(group), value: e.currentTarget.value })}>
            <option value=""></option>
            {#each Object.keys(FONT_STACKS) as font}<option value={font}>{font}</option>{/each}
          </select>
        {:else}
          <input
            type="text"
            placeholder={group === 'color' ? '#1a73e8' : '2rem'}
            value={pending(group).value}
            oninput={(e) => (adding[group] = { ...pending(group), value: e.currentTarget.value.trim() })}
            data-new-token-value={group}
          />
        {/if}
        <button type="button" onclick={() => addToken(group)} disabled={!canAdd(group)} data-add-token={group}>{t.inspector.add}</button>
      </span>
    </div>
  </details>
{/snippet}

<PaletteGallery {theme} onchange={(next) => { problem = ''; drafts = {}; onchange(next); }} />

{@render tokens('color', true)}
{@render tokens('font', true)}

<details data-theme-schemes>
  <summary>{t.theme.schemes.heading}</summary>
  <fieldset class="shows">
    <legend>{t.theme.schemes.shows}</legend>
    {#each SHOWS as option (option)}
      <label class="check">
        <input type="radio" name="theme-shows" value={option} checked={shows === option} disabled={option !== ownScheme(theme) && !palette} onchange={() => setShows(option)} data-theme-shows={option} />
        <span>{t.theme.schemes[option]}</span>
      </label>
    {/each}
  </fieldset>
  {#if shows === 'visitor'}<p class="hint">{t.theme.schemes.visitorHint}</p>{/if}
  {#if !palette}
    <p class="hint">{t.theme.schemes.only[ownScheme(theme)]}</p>
    <button type="button" onclick={propose} data-theme-propose>{t.theme.schemes.propose[other]}</button>
  {:else}
    <h3>{t.theme.schemes.colors[other]}</h3>
    <p class="hint">{t.theme.schemes.colorsHint}</p>
    {#each Object.keys(theme.tokens.color) as name (name)}
      <div class="token">
        <label>
          <span>{name}</span>
          <span class="custom">
            <input type="color" value={hex6(otherShown(name))} oninput={(e) => setOther(name, e.currentTarget.value)} aria-label={`${t.theme.schemes.colors[other]}: ${name}`} />
            <input type="text" value={otherShown(name)} oninput={(e) => setOther(name, e.currentTarget.value.trim())} aria-invalid={`${other}.${name}` in drafts} data-other-token={name} />
          </span>
        </label>
        {#if `${other}.${name}` in drafts}<small class="bad">{t.style.invalid}</small>{/if}
      </div>
    {/each}
    <p class="row">
      <button type="button" class="quiet" onclick={propose} data-theme-propose>{t.theme.schemes.proposeAgain}</button>
      <button type="button" class="quiet" onclick={removeOther} data-theme-remove-other>{t.theme.schemes.remove}</button>
    </p>
  {/if}
  {#if unreadable.length}
    <div class="unreadable" role="status" data-contrast>
      <strong>{t.theme.schemes.unreadable}</strong>
      <ul>
        {#each unreadable as issue}<li>{say(t.theme.schemes.pair, { text: issue.text, on: issue.on, scheme: issue.scheme === 'dark' ? t.theme.schemes.previewDark : t.theme.schemes.previewLight, ratio: issue.ratio.toLocaleString() })}</li>{/each}
      </ul>
    </div>
  {:else}
    <p class="hint good" data-contrast="ok">{t.theme.schemes.readable}</p>
  {/if}
  {#if handPicked > 0 && palette}<p class="hint" data-hand-picked>{say(t.theme.schemes.handPicked, { count: handPicked })}</p>{/if}
</details>

<details class="more" data-theme-more>
  <summary>{t.look.more}</summary>
  <p class="hint">{t.look.moreHint}</p>
  {#each MORE_GROUPS as group (group)}{@render tokens(group, false)}{/each}
<details>
  <summary>{t.theme.blocks}</summary>
  <label class="field">
    <span>{t.theme.blockType}</span>
    <select bind:value={blockType} data-theme-block>
      {#each BLOCK_TYPES as type}<option value={type}>{t.types[type] ?? type}</option>{/each}
    </select>
  </label>
  {#key blockType}
    <h3>{t.theme.defaultStyle}</h3>
    <div data-theme-style="default">
      <StyleEditor style={entry.style} {theme} onstyle={setBlockStyle} defaultLabel={t.theme.unset} />
    </div>
    {#each Object.entries(entry.variants ?? {}) as [variant, style] (variant)}
      <h3>
        {t.inspector.variant}: {variant}
        <button type="button" class="quiet" onclick={() => removeVariant(variant)} aria-label={`${t.inspector.remove} ${variant}`}>✕</button>
      </h3>
      <div data-theme-style={variant}>
        <StyleEditor {style} {theme} onstyle={(next) => setVariantStyle(variant, next)} defaultLabel={t.theme.unset} />
      </div>
    {/each}
    <div class="token add">
      <span class="custom">
        <input type="text" placeholder={t.theme.variantName} bind:value={newVariant} data-new-variant />
        <button type="button" onclick={addVariant} disabled={!isTokenName(newVariant.trim()) || !!entry.variants?.[newVariant.trim()]}>{t.theme.addVariant}</button>
      </span>
    </div>
  {/key}
</details>
<label class="field">
  <span>{t.theme.name}</span>
  <input
    type="text"
    maxlength="80"
    value={theme.name}
    data-theme-name
    oninput={(e) => {
      const name = e.currentTarget.value;
      if (name.trim()) apply((d) => { d.name = name; });
    }}
  />
</label>
<details>
  <summary>{t.theme.file}</summary>
  <p class="hint">{t.theme.fileHint}</p>
  <button type="button" onclick={download}>{t.theme.download}</button>
  <button type="button" onclick={() => fileInput?.click()}>{t.theme.upload}</button>
  <input type="file" accept="application/json,.json" bind:this={fileInput} onchange={upload} hidden data-theme-file />
</details>
</details>

<style>
  .problem { position: sticky; top: -0.9rem; z-index: 1; margin: 0 -0.9rem 0.6rem; padding: 0.5rem 0.9rem; background: #fdecea; }
  .part { display: block; margin: 0 0 0.5rem; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #5b4cdb; }
  .more { background: #faf9fd; }
  details { margin-bottom: 0.6rem; border: 1px solid #e4e2ee; border-radius: 6px; padding: 0.5rem 0.6rem; }
  summary { cursor: pointer; font-weight: 600; }
  details[open] > summary { margin-bottom: 0.6rem; }
  .token { margin-bottom: 0.5rem; }
  .token.add { padding-top: 0.5rem; border-top: 1px dashed #dddbe6; }
  .check { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem; }
  .check span { margin: 0; }
  .shows { border: 0; padding: 0; margin: 0 0 0.4rem; }
  .shows legend { font-weight: 600; font-size: 13px; margin-bottom: 0.4rem; }
  .shows .check { align-items: flex-start; margin-bottom: 0.4rem; }
  .row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .unreadable { margin-top: 0.6rem; padding: 0.5rem 0.6rem; border-radius: 6px; background: #fff4e5; }
  .unreadable ul { margin: 0.3rem 0 0; padding-inline-start: 1.1rem; }
  .good { color: #1f6b3a; }
  h3 { display: flex; align-items: center; justify-content: space-between; margin: 0.9rem 0 0.5rem; font-size: 13px; }
</style>
