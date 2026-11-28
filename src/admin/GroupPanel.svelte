<script lang="ts">
/**
 * A group's panel (ADR 0085 d4): its columns and the picture behind it first;
 * its height, alignment, colours and where it is hidden under "More
 * settings". The columns are the group's content, the rest its style, from
 * closed lists only.
 */
import { type Block, type BlockStyle, columnCount, createBlock, GROUP_COLUMNS, type ImageValue, STYLE_CHOICES, type StyleProp, type Theme } from '../core/index.ts';
import ImageField from './ImageField.svelte';
import { t } from './messages.ts';

let { block, theme, onpatch }: { block: Block; theme: Theme; onpatch: (change: (b: Block) => Block) => void } = $props();

const columns = $derived((block.content.columns as string) ?? '');
const image = $derived((block.content.image as ImageValue | null | undefined) ?? null);
const colours = $derived(Object.keys(theme.tokens.color));
const LAYOUTS = ['', ...GROUP_COLUMNS];

/** Columns chosen: the group gains an empty group for each column it lacks, so there is a box to drop into; nothing is taken away. */
function setColumns(next: string): void {
  onpatch((b) => {
    const children = [...(b.children ?? [])];
    while (next && children.length < columnCount(next)) children.push(createBlock('group'));
    return { ...b, content: { ...b.content, columns: next }, children };
  });
}

const setContent = (name: string, value: unknown): void => onpatch((b) => ({ ...b, content: { ...b.content, [name]: value } }));

const chosen = (prop: StyleProp): string => {
  const value = block.style?.[prop];
  if (!value) return '';
  return 'token' in value ? `token:${value.token}` : `value:${value.value}`;
};

function setStyle(prop: StyleProp, choice: string): void {
  onpatch((b) => {
    const style: BlockStyle = { ...(b.style ?? {}) };
    if (choice.startsWith('token:')) style[prop] = { token: choice.slice(6) };
    else if (choice.startsWith('value:')) style[prop] = { value: choice.slice(6) };
    else delete style[prop];
    const { style: _old, ...rest } = b;
    return Object.keys(style).length ? { ...rest, style } : rest;
  });
}
</script>

<fieldset class="field" data-group-columns>
  <legend>{t.group.columns}</legend>
  <div class="choices">
    {#each LAYOUTS as name (name)}
      <label class="choice" class:on={columns === name}>
        <input type="radio" name="group-columns" value={name} checked={columns === name} onchange={() => setColumns(name)} data-columns={name || 'none'} />
        <span class="pic" class:stack={!name} aria-hidden="true">
          {#each name ? name.split('-') : ['1', '1'] as share, i (i)}<i style:flex-grow={share}></i>{/each}
        </span>
        <span>{t.group.layouts[name || 'none']}</span>
      </label>
    {/each}
  </div>
  {#if columns}<small class="hint">{t.group.columnsHint}</small>{/if}
</fieldset>

<ImageField label={t.group.picture} named={false} value={image} onchange={(value) => setContent('image', value)} />
{#if image}
  <button type="button" class="quiet" onclick={() => setContent('image', null)} data-group-no-picture>{t.group.noPicture}</button>
{/if}

<details class="more" data-group-more>
  <summary>{t.look.more}</summary>
  {#if columns}
    <label class="check">
      <input type="checkbox" checked={block.content.reverse === true} onchange={(e) => setContent('reverse', e.currentTarget.checked)} data-group-reverse />
      <span>{t.group.reverse}</span>
    </label>
  {/if}
  {#snippet pick(prop: StyleProp, withColours: boolean)}
    <label class="field">
      <span>{t.style.props[prop]}</span>
      <select value={chosen(prop)} onchange={(e) => setStyle(prop, e.currentTarget.value)} data-group-style={prop}>
        <option value="">{t.group.unset[prop] ?? t.style.theme}</option>
        {#if withColours}
          {#each colours as name (name)}<option value={`token:${name}`}>{t.look.colours[name] ?? name}</option>{/each}
        {:else}
          {#each Object.keys(STYLE_CHOICES[prop] ?? {}) as name (name)}<option value={`value:${name}`}>{t.style.choices[prop]?.[name] ?? name}</option>{/each}
        {/if}
      </select>
    </label>
  {/snippet}
  {@render pick('height', false)}
  {@render pick('alignY', false)}
  {#if image}
    {@render pick('overlay', true)}
    {@render pick('overlayStrength', false)}
  {/if}
  {@render pick('background', true)}
  {@render pick('gradient', true)}
  {#if block.style?.gradient}{@render pick('gradientDirection', false)}{/if}
  {@render pick('hideOn', false)}
</details>

<style>
  select { width: 100%; }
  .more { margin-top: var(--sp-3); }
  .more > summary { color: var(--primary); }
  .check { display: flex; align-items: center; gap: var(--sp-2); margin-block: var(--sp-2); }
  .choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-2); }
  .choice { position: relative; display: grid; gap: var(--sp-1); justify-items: center; padding: var(--sp-2) var(--sp-1); border: 1px solid var(--outline-variant); border-radius: var(--shape-md); font: var(--label-m); text-align: center; cursor: pointer; background: var(--surface-lowest); }
  .choice:hover { background: color-mix(in oklch, var(--on-surface) var(--state-hover), var(--surface-lowest)); }
  .choice.on { border: 2px solid var(--primary); padding: calc(var(--sp-2) - 1px) calc(var(--sp-1) - 1px); background: var(--secondary-container); color: var(--on-secondary-container); }
  .choice input { position: absolute; opacity: 0; pointer-events: none; }
  .choice:has(input:focus-visible) { outline: 3px solid var(--primary); outline-offset: 2px; }
  .pic { display: flex; gap: 3px; width: 100%; max-width: 64px; height: 28px; padding: 3px; border-radius: var(--shape-xs); background: var(--surface-container); }
  .pic.stack { flex-direction: column; }
  .pic i { display: block; flex: 1 1 0; border-radius: 2px; background: var(--outline-variant); }
  .choice.on .pic i { background: var(--primary); }
</style>
