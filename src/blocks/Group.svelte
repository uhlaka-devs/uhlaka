<script lang="ts">
/**
 * Blocks held together (ADR 0085 d4): one under another, or each one a column
 * in the proportion the group names. A picture behind covers the whole band,
 * with the style's colour over it; without words of its own it is hidden
 * from readers, as a decoration.
 */
import { type Block, GROUP_COLUMNS, type ImageValue } from '../core/index.ts';
import BlockView from './BlockView.svelte';
import { isEditing, picture } from './editing.ts';

let { block }: { block: Block } = $props();
const editing = isEditing();
const pic = picture();
const columns = $derived((GROUP_COLUMNS as readonly string[]).includes(block.content.columns as string) ? (block.content.columns as string) : '');
const image = $derived(block.content.image as ImageValue | null | undefined);
</script>

<div class={['group', columns && `cols cols-${columns}`, columns && block.content.reverse === true && 'reverse', image && 'has-bg']}>
  {#if image}{@const pa = pic(image.src, 'full')}<img class="group-bg" src={image.src} srcset={pa.srcset} sizes={pa.srcset ? '100vw' : undefined} width={pa.width} height={pa.height} alt={image.alt} aria-hidden={image.alt ? undefined : 'true'} /><span class="group-shade" aria-hidden="true"></span>{/if}
  {#each block.children ?? [] as child (child.id)}<BlockView block={child} />{/each}
  {#if editing && !block.children?.length}<div class="cms-empty" data-empty="group"></div>{/if}
</div>
