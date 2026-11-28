<script lang="ts">
/** One block: the wrapper every type shares, then the type's own component. */
import { type Block, choiceCss, measureFor } from '../core/index.ts';
import { COMPONENTS } from './components.ts';
import { getMeasure, getSite, isEditing, marker, setMeasure } from './editing.ts';

let { block }: { block: Block } = $props();
// The width this block runs at, for the pictures inside it (ADR 0005 d8).
const outer = getMeasure();
// svelte-ignore state_referenced_locally
setMeasure(outer.layout, measureFor(getSite()?.site.pictures?.widths ?? {}, outer.layout, block.type, block.style?.maxWidth));
const Component = $derived(COMPONENTS[block.type]);
const mark = marker();
const editing = isEditing();
// Hidden on a phone or on a wide screen (ADR 0085 d4): in the editor only faded, so it can still be chosen.
const hide = $derived(block.style?.hideOn);
const hidden = $derived(hide && 'value' in hide && choiceCss('hideOn', hide.value) !== null ? `${editing ? 'cms-' : ''}hide-${hide.value}` : '');
/** The block's own motion, over the style's for the whole site (ADR 0085 d8). */
const own = (prop: 'appear' | 'hover'): string | undefined => {
  const value = block.style?.[prop];
  return value && 'value' in value && choiceCss(prop, value.value) !== null ? String(value.value) : undefined;
};
</script>

<section class={['b', `b-${block.type}`, block.variant && `v-${block.variant}`, hidden]} data-b={block.id} data-type={mark(block.type)} data-appear={own('appear')} data-hover={own('hover')}>
  <div class="b-in"><Component {block} /></div>
</section>
