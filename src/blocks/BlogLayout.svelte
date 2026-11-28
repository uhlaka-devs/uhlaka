<script lang="ts">
/** A list of entries: a type's front page, a later page of it, one category or tag, one person's (with who they are), or one period (ADR 0056). */
import type { Byline, ContentType, Crumb, MenuLink, Post, Site } from '../core/index.ts';
import { entryPath, listPath, pictureIn, postExcerpt, postsType, shownPrice } from '../core/index.ts';
import Breadcrumbs from './Breadcrumbs.svelte';
import PostMeta from './PostMeta.svelte';
import Shell from './Shell.svelte';
import ShopPrice from './ShopPrice.svelte';
import { wordsFor } from './words.ts';

let {
  site,
  menu,
  heading,
  posts,
  newer = '',
  older = '',
  numbers = [],
  at = 1,
  type,
  crumbs = [],
  kinds = [],
  person = null,
  current = null,
}: {
  site: Site;
  menu: MenuLink[];
  heading: string;
  posts: Post[];
  /** The address of the page with newer posts, when there is one. */
  newer?: string;
  older?: string;
  /** The address of each page of the list, the first first (ADR 0085 d7); fewer than two: no numbers. */
  numbers?: string[];
  /** Which of them this is, from 1. */
  at?: number;
  type?: ContentType;
  /** Where the list is, shown above it (ADR 0050 d4); empty: none. */
  crumbs?: Crumb[];
  /** Each entry's own type, in the order of `posts`, when they are of several (a person's page). */
  kinds?: ContentType[];
  /** Whose entries these are, shown above them. */
  person?: Byline | null;
  /** What the menu marks as where the visitor is; the type's list when not said. */
  current?: string | null;
} = $props();
const kind = $derived(type ?? postsType());
const typeOf = (i: number): ContentType => kinds[i] ?? kind;
const words = $derived(wordsFor(site.language));
/** A product's price and whether it is on sale or sold out, while the shop is on (ADR 0085 d8); null for any other entry. */
const priced = (post: Post, i: number) => (site.shop && typeOf(i).sells && post.product ? shownPrice(site.shop, post.product, typeOf(i).id, post.of ?? post.slug) : null);
/** The pages to number: the first, the last, and two on each side of this one; null where some are left out. */
const shownNumbers = $derived.by(() => {
  const out: (number | null)[] = [];
  for (let n = 1; n <= numbers.length; n++) {
    if (n === 1 || n === numbers.length || Math.abs(n - at) <= 2) out.push(n);
    else if (out.at(-1) !== null) out.push(null);
  }
  return out;
});
</script>

<Shell {site} {menu} current={current ?? listPath(kind)} layout={kind.layout}>
  <Breadcrumbs {crumbs} language={site.language} />
  <section class="b blog">
    <div class="b-in">
      {#if person}
        <div class="author-head" data-author-page>
          {#if person.picture}<img class="author-picture" src={person.picture.src} alt="" width="64" height="64" />{/if}
          <div>
            <h1>{heading}</h1>
            {#if person.bio}<p class="lead">{person.bio}</p>{/if}
          </div>
        </div>
      {:else}
        <h1>{heading}</h1>
      {/if}
      {#if posts.length === 0}<p class="lead">{words.noPosts}</p>{/if}
      <ul class="posts">
        {#each posts as post, i (`${typeOf(i).id}/${post.slug}`)}
          {@const shown = priced(post, i)}
          {@const badge = shown ? (!shown.left ? words.shopSoldOut : shown.sale !== null ? words.shopSale : '') : ''}
          <li class="post-card" class:has-picture={!!post.cover}>
            {#if post.cover}{@const pa = pictureIn(site, kind.layout, post.cover.src, 'card')}<a class="post-picture" href={entryPath(typeOf(i), post.slug)} tabindex="-1" aria-hidden="true">{#if badge}{@render tag(badge, !shown?.left)}{/if}<img src={post.cover.src} srcset={pa.srcset} sizes={pa.sizes} width={pa.width} height={pa.height} alt="" loading="lazy" decoding="async" /></a>{:else if badge}{@render tag(badge, !shown?.left)}{/if}
            <PostMeta type={typeOf(i)} {post} language={site.language} />
            <h2><a href={entryPath(typeOf(i), post.slug)}>{post.title}</a></h2>
            {#if shown && site.shop}<ShopPrice shop={site.shop} {shown} language={site.language} />{/if}
            <p class="post-excerpt">{postExcerpt(post)}</p>
            <a class="post-more" href={entryPath(typeOf(i), post.slug)} aria-label={`${words.readMore}: ${post.title}`}>{words.readMore}</a>
          </li>
        {/each}
      </ul>
      {#if newer || older}
        <nav class="pager" aria-label={words.pages}>
          {#if newer}<a rel="prev" href={newer}>{words.newer}</a>{/if}
          {#if numbers.length > 1}
            <ol class="pager-numbers">
              {#each shownNumbers as n}
                {#if n === null}<li aria-hidden="true">…</li>
                {:else if n === at}<li><span aria-current="page" aria-label={words.pageNumber.replace('{n}', String(n))}>{n}</span></li>
                {:else}<li><a href={numbers[n - 1]} aria-label={words.pageNumber.replace('{n}', String(n))}>{n}</a></li>{/if}
              {/each}
            </ol>
          {/if}
          {#if older}<a rel="next" href={older}>{words.older}</a>{/if}
        </nav>
      {/if}
    </div>
  </section>
</Shell>

{#snippet tag(text: string, out: boolean)}<span class="shop-badge" data-out={out ? '' : undefined}>{text}</span>{/snippet}
