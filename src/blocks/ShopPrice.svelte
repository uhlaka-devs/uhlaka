<script lang="ts">
/** A product's price in a list and in the bar that keeps "Add to cart" in view (ADR 0085 d8): the lowest, the old one struck through on sale. */
import { moneyText, type ShopShown } from '../core/index.ts';
import { wordsFor } from './words.ts';

let { shop, shown, language, tag = 'p' }: { shop: ShopShown; shown: { price: number; sale: number | null; from: boolean }; language: string; tag?: 'p' | 'span' } = $props();
const said = $derived(wordsFor(language));
const money = (value: number): string => moneyText(value, shop.currency, language);
</script>

<svelte:element this={tag} class="post-price">
  {#if shown.from}{said.shopFrom.replace('{price}', money(shown.sale ?? shown.price))}
  {:else if shown.sale !== null}<del><span class="site-hide">{said.shopWas}</span> {money(shown.price)}</del> <ins>{money(shown.sale)}</ins>
  {:else}{money(shown.price)}{/if}
</svelte:element>
