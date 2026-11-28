<script lang="ts">
/**
 * One entry of a content type (a blog post, a project). By default: what its
 * type asks for, its title and cover, then its blocks. A type that has its
 * own page (ADR 0015) draws that page instead, with the entry's parts where
 * the page puts them.
 */
import type { Block, ContentType, Crumb, MenuLink, Post, Site } from '../core/index.ts';
import { areaBlock, entryContents, entryPath, listPath, neighbours, pictureIn, placesRelated, postsType, readingMinutes, shownPrice, typeAuthorPath } from '../core/index.ts';
import EntryFields from './EntryFields.svelte';
import { type EntryLists, setEntry } from './editing.ts';
import BlockView from './BlockView.svelte';
import Buy from './Buy.svelte';
import Breadcrumbs from './Breadcrumbs.svelte';
import Comments from './Comments.svelte';
import Frozen from './Frozen.svelte';
import PostMeta from './PostMeta.svelte';
import Related from './Related.svelte';
import Shell from './Shell.svelte';
import ShopPrice from './ShopPrice.svelte';
import { wordsFor } from './words.ts';

let {
  site,
  post,
  menu,
  editing = false,
  type,
  lists = {},
  template = null,
  designing = false,
  crumbs = [],
}: {
  site: Site;
  post: Post;
  menu: MenuLink[];
  editing?: boolean;
  type?: ContentType;
  lists?: EntryLists;
  /** The type's own page, when it has one. */
  template?: Block[] | null;
  /** The editor is changing the type's page, not this entry. */
  designing?: boolean;
  /** Where the entry is, shown above it (ADR 0050 d4); empty: none. */
  crumbs?: Crumb[];
} = $props();
const kind = $derived(type ?? postsType());
// The entries linked to this one are drawn after it, unless its type's page puts them somewhere (ADR 0052 d3).
const placed = $derived(!!template && placesRelated(template));
// What the entry shows besides its words, as its type says (ADR 0085 d7).
const extras = $derived(kind.entry ?? {});
const words = $derived(wordsFor(site.language));
const contents = $derived(extras.contents ? entryContents(post.blocks) : []);
const around = $derived(extras.nextPrev ? neighbours(lists[kind.id]?.entries ?? [], post.slug) : { previous: null, next: null });
/** Where the entry is shared from: its whole address, so only once the site has one. */
const shareUrl = $derived(extras.share && site.url ? `${site.url}${entryPath(kind, post.slug)}` : '');
const shares = $derived.by(() => {
  const u = encodeURIComponent(shareUrl);
  const title = encodeURIComponent(post.title);
  return [
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['X', `https://x.com/intent/post?url=${u}&text=${title}`],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ['WhatsApp', `https://wa.me/?text=${title}%20${u}`],
    [words.shareEmail, `mailto:?subject=${title}&body=${u}`],
  ] as const;
});
/** The section the type draws after each entry's blocks (ADR 0085 d8), with what it holds in this language. */
const after = $derived(extras.section && site.areas?.[extras.section]?.length ? { ...areaBlock(extras.section), children: site.areas[extras.section] ?? [] } : null);
/** A product's price, for the bar that keeps "Add to cart" in view; null when it is not one that can be bought. */
const forBar = $derived(site.shop && kind.sells && post.product && !editing ? shownPrice(site.shop, post.product, kind.id, post.of ?? post.slug) : null);
/** A product's picture can be opened whole (the style says whether, ADR 0085 d8). */
const zooms = $derived(!!site.shop && !!kind.sells && !editing);
// Read once: a page is drawn for one entry and one type.
// svelte-ignore state_referenced_locally
setEntry({ post, type: type ?? postsType(), language: site.language, editing: editing ? (designing ? 'template' : 'entry') : null });
</script>

<Shell {site} {menu} current={listPath(kind)} {editing} {lists} layout={kind.layout}>
  <Breadcrumbs {crumbs} language={site.language} />
  <article class="post">
    {#if template}
      {#if editing && !designing}
        <Frozen>{#each template as block (block.id)}<BlockView {block} />{/each}</Frozen>
      {:else}
        {#each template as block (block.id)}<BlockView {block} />{/each}
        {#if editing && template.length === 0}<div class="cms-empty" data-empty="page"></div>{/if}
      {/if}
    {:else}
      <header class="b post-head">
        <div class="b-in">
          <PostMeta type={kind} {post} language={site.language} />
          {#if extras.readingTime}<p class="post-reading">{words.readingTime.replace('{n}', String(readingMinutes(post)))}</p>{/if}
          <h1>{post.title}</h1>
          {#if post.cover}{@const pa = pictureIn(site, kind.layout, post.cover.src, 'full')}
            {#if zooms}
              <a class="post-zoom post-cover" id="zoom-from" href="#zoom-whole" aria-label={words.zoomOpen}><img src={post.cover.src} srcset={pa.srcset} sizes={pa.sizes} width={pa.width} height={pa.height} alt={post.cover.alt} /></a>
              <div class="zoom-whole" id="zoom-whole" role="dialog" aria-label={post.cover.alt || post.title}>
                <a class="zoom-close" href="#zoom-from"><span aria-hidden="true">×</span><span class="site-hide">{words.zoomClose}</span></a>
                <img src={post.cover.src} alt={post.cover.alt} loading="lazy" decoding="async" />
              </div>
            {:else}<img class="post-cover" src={post.cover.src} srcset={pa.srcset} sizes={pa.sizes} width={pa.width} height={pa.height} alt={post.cover.alt} />{/if}
          {/if}
          <EntryFields type={kind} {post} language={site.language} />
          {#if site.shop && kind.sells}<Buy shop={site.shop} {post} typeId={kind.id} language={site.language} />{/if}
        </div>
      </header>
      {#if contents.length}
        <nav class="b post-contents" aria-label={words.contents}>
          <div class="b-in">
            <p class="post-contents-title">{words.contents}</p>
            <ol>{#each contents as item (item.id)}<li class:sub={item.level === 3}><a href={`#${item.id}`}>{item.text}</a></li>{/each}</ol>
          </div>
        </nav>
      {/if}
      {#each post.blocks as block (block.id)}<BlockView {block} />{/each}
      {#if editing && post.blocks.length === 0}<div class="cms-empty" data-empty="page"></div>{/if}
    {/if}
    {#if after}<div class="post-after" data-area="entry"><BlockView block={after} /></div>{/if}
    {#if !placed}<Related type={kind} {post} language={site.language} />{/if}
    {#if shareUrl && !editing}
      <aside class="b post-share" aria-label={words.share}>
        <div class="b-in">
          <span>{words.share}</span>
          {#each shares as [name, href] (name)}<a {href} rel="noopener nofollow" target="_blank">{name}</a>{/each}
        </div>
      </aside>
    {/if}
    {#if extras.author !== false && kind.dated && post.author && (post.author.bio || post.author.picture)}
      <aside class="b post-bio" data-author>
        <div class="b-in">
          {#if post.author.picture}<img class="author-picture" src={post.author.picture.src} alt="" width="64" height="64" loading="lazy" />{/if}
          <div>
            <p><strong>{#if post.author.slug}<a href={typeAuthorPath(kind, post.author.slug)} rel="author">{post.author.name}</a>{:else}{post.author.name}{/if}</strong></p>
            {#if post.author.bio}<p>{post.author.bio}</p>{/if}
          </div>
        </div>
      </aside>
    {/if}
    {#if around.previous || around.next}
      <nav class="b post-around" aria-label={`${words.previousEntry} / ${words.nextEntry}`}>
        <div class="b-in">
          {#if around.previous}<a rel="prev" href={entryPath(kind, around.previous.slug)}><small>{words.previousEntry}</small>{around.previous.title}</a>{/if}
          {#if around.next}<a rel="next" href={entryPath(kind, around.next.slug)}><small>{words.nextEntry}</small>{around.next.title}</a>{/if}
        </div>
      </nav>
    {/if}
  </article>
  {#if kind.comments && !editing}<Comments {site} type={kind} {post} />{/if}
  {#if forBar && site.shop}
    <!-- Shown once the Buy part has scrolled away, while the style keeps "Add to cart" in view (ADR 0085 d8). -->
    <div class="buy-bar" aria-hidden="true">
      <p><strong>{post.title}</strong> <ShopPrice shop={site.shop} shown={forBar} language={site.language} tag="span" /></p>
      <a class="button" href="#buy" tabindex="-1">{words.shopBuy}</a>
    </div>
  {/if}
</Shell>
