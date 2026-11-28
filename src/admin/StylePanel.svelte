<script lang="ts">
/** The style tab of a selected block: its variant, its own style, and how much of that is not the theme's. */
import { type Block, type BlockStyle, isOwnValue, stylePropsFor, type Theme, variantsOf } from '../core/index.ts';
import { say, t } from './messages.ts';
import StyleEditor from './StyleEditor.svelte';

let {
  block,
  theme,
  onstyle,
  onvariant,
}: { block: Block; theme: Theme; onstyle: (style: BlockStyle) => void; onvariant: (variant: string) => void } = $props();

const variants = $derived(variantsOf(theme, block.type));
const free = $derived(Object.entries(block.style ?? {}).filter(([prop, v]) => isOwnValue(prop, v)).length);
/** Bumped by "reset", so the editor forgets values that were being typed. */
let round = $state(0);
</script>

{#if variants.length}
  <label class="field">
    <span>{t.inspector.variant}</span>
    <select value={block.variant ?? ''} onchange={(e) => onvariant(e.currentTarget.value)}>
      <option value="">{t.inspector.noVariant}</option>
      {#each variants as variant}<option value={variant}>{variant}</option>{/each}
    </select>
  </label>
{/if}

{#key round}<StyleEditor style={block.style} {theme} {onstyle} props={stylePropsFor(block.type, true)} />{/key}

{#if free > 0}
  <p class="hint">{say(t.style.free, { count: free })}</p>
  <button
    type="button"
    onclick={() => {
      round += 1;
      onstyle(Object.fromEntries(Object.entries(block.style ?? {}).filter(([prop, v]) => v && !isOwnValue(prop, v))) as BlockStyle);
    }}>{t.style.reset}</button>
{/if}
