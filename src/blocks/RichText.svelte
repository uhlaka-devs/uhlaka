<script lang="ts">
/** Draws a rich text document. Every string is escaped by Svelte; no HTML is trusted. */
import type { RichText } from '../core/index.ts';
import { headingAnchor, richTextPlain } from '../core/index.ts';
import { getEntry, marker } from './editing.ts';
import Spans from './Spans.svelte';

let { doc, path = '' }: { doc: RichText; path?: string } = $props();
const mark = marker();
/** On an entry whose type shows its contents, headings 2 and 3 get the anchors the contents link to (ADR 0085 d7). */
const entry = getEntry();
const anchors = entry?.type.entry?.contents === true;
const anchorOf = (node: RichText[number]): string | undefined =>
  anchors && node.type === 'heading' && (node.level === 2 || node.level === 3) ? headingAnchor(richTextPlain([node]).trim()) : undefined;
</script>

<div class="prose" data-edit-rich={path ? mark(path) : undefined}>
  {#each doc as node}
    {#if node.type === 'paragraph'}
      <p><Spans spans={node.children} /></p>
    {:else if node.type === 'heading'}
      <svelte:element this={`h${node.level}`} id={anchorOf(node)}><Spans spans={node.children} /></svelte:element>
    {:else if node.type === 'quote'}
      <blockquote><Spans spans={node.children} /></blockquote>
    {:else if node.type === 'list'}
      <svelte:element this={node.ordered ? 'ol' : 'ul'}>
        {#each node.items as item}<li><Spans spans={item} /></li>{/each}
      </svelte:element>
    {/if}
  {/each}
</div>
