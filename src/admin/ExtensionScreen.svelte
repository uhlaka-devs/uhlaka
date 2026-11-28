<script lang="ts">
/**
 * An extension's screen (ADR 0031): one `uhlaka.view/1` document, drawn by
 * this admin. The document says what is shown and which actions run; how it
 * looks is this admin's. No code of the extension runs here.
 */
import type { ViewDocument } from '../view/index.ts';
import { type ExtensionInfo } from './api.ts';
import { adminLanguage } from './messages.ts';
import ViewPart from './ViewPart.svelte';

let { extension, doc, onnavigate }: { extension: ExtensionInfo; doc: ViewDocument; onnavigate: (id: string) => void } = $props();

const word = (text: string): string => extension.messages[adminLanguage()]?.[text] || extension.messages[adminLanguage().split('-')[0] ?? '']?.[text] || text;
/** The document's own title is the screen's heading, so the view under it draws none. */
const body = $derived({ ...doc, title: undefined });
</script>

<section class="screen" data-extension-screen={`${extension.name}/${doc.id}`}>
  <h1>{word(doc.title)}</h1>
  <p class="hint">{extension.displayName}</p>
  <ViewPart {extension} view={body} {onnavigate} />
</section>

<style>
  h1 { margin: 0 0 var(--sp-1); font-size: var(--size-2xl); }
</style>
