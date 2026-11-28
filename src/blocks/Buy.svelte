<script lang="ts">
/**
 * A product's Buy part (ADR 0065 d3): its price, its sale price with the old
 * one crossed through, whether it is in stock, its combinations to choose
 * from, a quantity and "Add to cart", a plain form posted to the site's cart.
 * Drawn only while the shop is on, and never in a static export.
 */
import { combinations, inStock, moneyText, paid, type Post, priceOf, type ShopShown, stockKey, VARIANT_JOIN } from '../core/index.ts';
import { wordsFor } from './words.ts';

let { shop, post, typeId, language }: { shop: ShopShown; post: Post; typeId: string; language: string } = $props();
const said = $derived(wordsFor(language));
const product = $derived(post.product);
const slug = $derived(post.of ?? post.slug);
const money = (value: number): string => moneyText(value, shop.currency, language);
/** Each combination as it is offered, with what it costs and whether it is left; none without options. */
const offered = $derived(
  product
    ? combinations(product.options).map((key) => ({ key, ...priceOf(product, key), left: inStock(shop, product, stockKey(typeId, slug, key)) })).filter((c) => c.price !== null)
    : [],
);
const own = $derived(product ? { ...priceOf(product), left: inStock(shop, product, stockKey(typeId, slug)) } : null);
/** The lowest a combination costs, said when they differ. */
const lowest = $derived(offered.length ? Math.min(...offered.map((c) => paid(c) as number)) : null);
const differ = $derived(new Set(offered.map((c) => paid(c))).size > 1);
const any = $derived(product?.options.length ? offered.some((c) => c.left) : (own?.left ?? false));
</script>

{#if product && own && (product.options.length ? offered.length > 0 : own.price !== null)}
  <form class="buy" id="buy" method="post" action="/_/cart" data-product={`${typeId}/${slug}`}>
    <input type="hidden" name="product" value={`${typeId}/${slug}`} />
    {#if language}<input type="hidden" name="language" value={language} />{/if}
    <p class="buy-price">
      {#if product.options.length}
        {#if differ && lowest !== null}{said.shopFrom.replace('{price}', money(lowest))}{:else if offered[0]}{#if offered[0].sale !== null}<del><span class="buy-said">{said.shopWas}</span> {money(offered[0].price as number)}</del> <ins>{money(offered[0].sale)}</ins>{:else}{money(offered[0].price as number)}{/if}{/if}
      {:else if own.sale !== null}
        <del><span class="buy-said">{said.shopWas}</span> {money(own.price as number)}</del> <ins>{money(own.sale)}</ins>
      {:else}
        {money(own.price as number)}
      {/if}
      {#if shop.vat}<small>{said.shopVat}</small>{/if}
    </p>
    {#if product.counted}<p class="buy-stock" data-left={any ? '' : undefined}>{any ? said.shopInStock : said.shopOutOfStock}</p>{/if}
    {#if product.options.length}
      <label>{product.options.map((o) => o.name).join(VARIANT_JOIN)}
        <select name="variant" required>
          <option value="">{said.shopChoose}…</option>
          {#each offered as c (c.key)}<option value={c.key} disabled={!c.left}>{c.key}{differ ? ` — ${money(paid(c) as number)}` : ''}{c.left ? '' : ` (${said.shopOutOfStock})`}</option>{/each}
        </select>
      </label>
    {/if}
    <label class="buy-quantity">{said.shopQuantity} <input type="number" name="quantity" value="1" min="1" max="999" inputmode="numeric" /></label>
    <button type="submit" disabled={!any}>{said.shopBuy}</button>
  </form>
{/if}
