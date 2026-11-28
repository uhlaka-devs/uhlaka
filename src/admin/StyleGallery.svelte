<script lang="ts">
/**
 * The ready-made styles (ADR 0082 d1, d4). Each is the same theme document
 * with other values, shown by what it looks like: its colours and its
 * typefaces. Choosing one over a style changed by hand asks first, and offers
 * to keep the changed one as a file.
 */
import { onMount } from 'svelte';
import { FONT_STACKS, fontFacesCss, type Theme } from '../core/index.ts';
import { say, t } from './messages.ts';
import { readyMade } from './themeEdit.ts';

let {
  theme,
  ready,
  onchoose,
  ondownload,
}: {
  theme: Theme;
  /** The styles that ship (`themes/`). */
  ready: Theme[];
  onchoose: (theme: Theme) => void;
  /** Keeps the style as it is now, as a file. */
  ondownload: () => void;
} = $props();

const untouched = $derived(readyMade(theme, ready));
/** The style asked for while the site's own has changes: it waits for a yes. */
let asking = $state<Theme | null>(null);

const stack = (style: Theme, role: 'heading' | 'body'): string => FONT_STACKS[(style.tokens.font[role] ?? style.tokens.font.body ?? 'system') as keyof typeof FONT_STACKS] ?? FONT_STACKS.system;
const color = (style: Theme, name: string, fallback: string): string => style.tokens.color[name] ?? fallback;
/** A few colours that say the style: the page, the text, the main colour and what else it names. */
const dots = (style: Theme): string[] => {
  const c = style.tokens.color;
  return [...new Set([c.background, c.text, c.primary, c.surface, ...Object.values(c)].filter((v): v is string => !!v))].slice(0, 5);
};

/** The typefaces that ship, so each card shows its own (the site serves them, ADR 0068). */
onMount(() => {
  if (document.getElementById('uhlaka-faces')) return;
  const sheet = document.createElement('style');
  sheet.id = 'uhlaka-faces';
  sheet.textContent = fontFacesCss();
  document.head.append(sheet);
});

function choose(style: Theme): void {
  if (style.name === theme.name && untouched) return;
  if (untouched) onchoose(style);
  else asking = style;
}
</script>

<div class="gallery" data-styles>
  {#each ready as style (style.name)}
    {@const current = style.name === theme.name}
    <button
      type="button"
      class="card"
      class:current
      aria-pressed={current}
      onclick={() => choose(style)}
      style:--bg={color(style, 'background', '#fff')}
      style:--fg={color(style, 'text', '#111')}
      style:--accent={color(style, 'primary', '#333')}
      data-style={style.name}
    >
      <span class="sample">
        <span class="aa" style:font-family={stack(style, 'heading')}>Aa</span>
        <span class="line" style:font-family={stack(style, 'body')}>{t.look.sample}</span>
        <span class="dots" aria-hidden="true">{#each dots(style) as dot}<i style:background={dot}></i>{/each}</span>
      </span>
      <span class="name">
        {style.name}
        {#if current}<small>{untouched ? t.look.inUse : t.look.inUseChanged}</small>{/if}
      </span>
    </button>
  {/each}
  {#if !ready.some((r) => r.name === theme.name)}
    <div class="card own current" data-style-own>
      <span class="sample"><span class="aa" style:font-family={stack(theme, 'heading')}>Aa</span><span class="dots" aria-hidden="true">{#each dots(theme) as dot}<i style:background={dot}></i>{/each}</span></span>
      <span class="name">{theme.name}<small>{t.look.inUseOwn}</small></span>
    </div>
  {/if}
</div>

{#if asking}
  {@const next = asking}
  <div class="ask" role="alertdialog" aria-labelledby="style-ask" data-style-ask {@attach (node) => node.scrollIntoView({ block: 'nearest' })}>
    <p id="style-ask"><strong>{say(t.look.askTitle, { name: next.name })}</strong></p>
    <p>{say(t.look.askBody, { name: next.name })}</p>
    <div class="row">
      <button type="button" onclick={ondownload} data-style-keep>{t.look.askKeep}</button>
      <button type="button" class="danger" onclick={() => { asking = null; onchoose(next); }} data-style-replace>{say(t.look.askReplace, { name: next.name })}</button>
      <button type="button" class="quiet" onclick={() => (asking = null)} data-style-cancel>{t.app.cancel}</button>
    </div>
  </div>
{/if}

<style>
  .gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2); margin-bottom: var(--sp-3); }
  /* A style is a card; the one in use has the primary colour round it. */
  .card { display: grid; gap: var(--sp-2); padding: var(--sp-2); margin: 0; text-align: start; background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-md); cursor: pointer; font: inherit; color: var(--on-surface); transition: box-shadow var(--dur-short-2) var(--ease-standard); }
  .card:hover { box-shadow: var(--elev-1); }
  .card.current { border: 2px solid var(--primary); padding: calc(var(--sp-2) - 1px); }
  .card.own { cursor: default; }
  .card.own:hover { box-shadow: none; }
  /* The sample shows the style's own colours: --bg and --fg come from the style, not from the admin. */
  .sample { display: grid; gap: 2px; padding: var(--sp-2) var(--sp-3); border-radius: var(--shape-sm); background: var(--bg, var(--surface-container)); color: var(--fg, var(--on-surface)); border: 1px solid color-mix(in oklch, var(--on-surface) 6%, transparent); }
  .aa { font-size: 1.6rem; line-height: 1; font-weight: 700; }
  .line { font-size: 0.72rem; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dots { display: flex; gap: 3px; margin-top: 2px; }
  .dots i { width: 12px; height: 12px; border-radius: 50%; border: 1px solid color-mix(in oklch, var(--on-surface) 15%, transparent); }
  .name { display: flex; flex-direction: column; padding: 0 var(--sp-1) 2px; font: var(--title-s); }
  .name small { font: var(--body-s); color: var(--on-surface-variant); }
  .ask { display: grid; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); margin-bottom: var(--sp-4); border-radius: var(--shape-md); background: var(--warning-container); color: var(--on-warning-container); }
  .ask p { margin: 0; }
  .row { display: grid; gap: var(--sp-2); margin-top: var(--sp-1); }
  .row button { margin: 0; }
  .row button.danger { margin: 0; background: var(--error); border-color: transparent; color: var(--on-error); }
  .row button.danger:hover { background: color-mix(in oklch, var(--on-error) var(--state-hover), var(--error)); }
</style>
