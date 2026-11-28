<script lang="ts">
  // An icon from the admin's set (ADR 0084 d7): a Lucide drawing at 20 px, 1.5 stroke, in the colour of the text around it.
  import { ICONS, type IconName } from './icons.ts';

  let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  {#each ICONS[name] as [tag, attrs], i (i)}
    <svelte:element this={tag} {...attrs} />
  {/each}
</svg>

<style>
  .icon { flex: none; display: block; }
</style>
