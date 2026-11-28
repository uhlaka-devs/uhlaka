<script lang="ts">
/**
 * The colour palettes (ADR 0083). Each card shows its light and its dark side
 * by side; a click puts its colours in the style. The colours before it are
 * kept here until the panel closes, so one click brings them back. A palette
 * can also be made from one colour the owner picks.
 */
import { untrack } from 'svelte';
import { applyPalette, type ColorPalette, paletteFrom, paletteInUse, PALETTES, parseTheme, type Theme } from '../core/index.ts';
import { say, t } from './messages.ts';

let { theme, onchange }: { theme: Theme; onchange: (theme: Theme) => void } = $props();

const inUse = $derived(paletteInUse(theme));
/** The style as it was before the last palette, to bring its colours back. */
let before = $state.raw<Theme | null>(null);
let applied = $state('');
/** The colour to make a palette from: the style's main colour, to start with. */
let own = $state(untrack(() => (/^#[0-9a-f]{6}$/i.test(theme.tokens.color.primary ?? '') ? (theme.tokens.color.primary as string) : '#2563eb')));

/** `name` is the palette's; none for one made from the owner's colour. */
function use(palette: Pick<ColorPalette, 'light' | 'dark'>, name: string | null): void {
  // Checked like any change to the style (ADR 0004 d2): a style left invalid is never handed on.
  const { theme: next } = parseTheme(applyPalette(theme, palette));
  if (!next) return;
  before ??= theme;
  applied = name === null ? t.palettes.appliedOwn : say(t.palettes.applied, { name });
  onchange(next);
}

function undo(): void {
  if (!before) return;
  const next = structuredClone(theme);
  next.tokens.color = { ...before.tokens.color };
  delete next.light;
  delete next.dark;
  if (before.light) next.light = structuredClone(before.light);
  if (before.dark) next.dark = structuredClone(before.dark);
  before = null;
  applied = '';
  onchange(next);
}

function make(): void {
  const made = paletteFrom(own);
  if (made) use(made, null);
}

const SWATCHES = ['background', 'text', 'primary', 'muted'] as const;
</script>

<section class="palettes" data-palettes>
  <h3 class="part">{t.palettes.heading}</h3>
  <p class="hint">{t.palettes.intro}</p>
  <div class="grid">
    {#each PALETTES as palette (palette.id)}
      {@const current = inUse?.id === palette.id}
      <button type="button" class="card" class:current aria-pressed={current} onclick={() => use(palette, t.palettes.names[palette.id] ?? palette.id)} data-palette={palette.id}>
        <span class="sides">
          {#each ['light', 'dark'] as const as scheme (scheme)}
            {@const c = palette[scheme]}
            <span class="side" style:background={c.background} style:color={c.text} title={t.palettes[scheme]}>
              <span class="aa">Aa</span>
              <span class="dots" aria-hidden="true">{#each SWATCHES as name}<i style:background={c[name]}></i>{/each}</span>
              <span class="btn" style:background={c.primary} style:color={c['on-primary']} aria-hidden="true"></span>
            </span>
          {/each}
        </span>
        <span class="name">{t.palettes.names[palette.id] ?? palette.id}{#if current}<small>{t.palettes.inUse}</small>{/if}</span>
      </button>
    {/each}
  </div>
  <div class="mine">
    <strong>{t.palettes.fromColor}</strong>
    <p class="hint">{t.palettes.fromColorHint}</p>
    <span class="row">
      <input type="color" bind:value={own} aria-label={t.palettes.fromColor} data-palette-color />
      <button type="button" onclick={make} data-palette-make>{t.palettes.make}</button>
    </span>
  </div>
  {#if applied}
    <p class="hint done" role="status" data-palette-applied>{applied}</p>
  {/if}
  {#if before}
    <button type="button" class="quiet" onclick={undo} data-palette-undo>{t.palettes.undo}</button>
  {/if}
</section>

<style>
  .palettes { margin-bottom: 0.8rem; }
  .part { display: block; margin: 0.4rem 0 0.3rem; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #5b4cdb; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; margin-bottom: 0.6rem; }
  .card { display: grid; gap: 0.3rem; padding: 0.3rem; margin: 0; text-align: start; background: #fff; border: 1px solid #dddbe6; border-radius: 10px; cursor: pointer; font: inherit; color: #1e1e27; }
  .card:hover { border-color: #a9a3e8; }
  .card:focus-visible { outline: 2px solid #5b4cdb; outline-offset: 2px; }
  .card.current { border: 2px solid #5b4cdb; padding: calc(0.3rem - 1px); }
  .sides { display: grid; grid-template-columns: 1fr 1fr; border-radius: 7px; overflow: hidden; border: 1px solid rgb(0 0 0 / 0.08); }
  .side { display: grid; gap: 0.25rem; padding: 0.4rem 0.45rem; }
  .aa { font-weight: 700; font-size: 1rem; line-height: 1; }
  .dots { display: flex; gap: 2px; }
  .dots i { width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 0 1px rgb(127 127 127 / 0.35); }
  .btn { height: 7px; width: 70%; border-radius: 99px; }
  .name { display: flex; flex-direction: column; padding: 0 0.2rem 0.1rem; font-weight: 600; font-size: 13px; }
  .name small { font-weight: 400; color: #5d5d72; }
  .mine { padding: 0.5rem 0.6rem; border: 1px dashed #dddbe6; border-radius: 8px; margin-bottom: 0.5rem; }
  .mine .hint { margin: 0.2rem 0 0.4rem; }
  .row { display: flex; align-items: center; gap: 0.5rem; }
  .row input[type='color'] { width: 2.6rem; height: 2rem; padding: 0; border: 1px solid #dddbe6; border-radius: 6px; }
  .row button { margin: 0; }
  .done { color: #1f6b3a; }
</style>
