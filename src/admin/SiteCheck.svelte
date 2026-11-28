<script lang="ts">
/**
 * Before publishing (ADR 0029): the published site, read as an export would
 * write it, for links that lead nowhere and pictures with no description.
 */
import { api } from './api.ts';
import { languageName, LONG_TITLE } from '../core/index.ts';
import { say, t } from './messages.ts';

type Check = Awaited<ReturnType<typeof api.check>>['check'];
let check = $state.raw<Check | null>(null);
let problem = $state('');
let working = $state(false);

const pages = (list: string[]): string => list.join(', ');

async function run(): Promise<void> {
  working = true;
  problem = '';
  try {
    check = (await api.check()).check;
  } catch (error) {
    check = null;
    problem = error instanceof Error ? error.message : String(error);
  } finally {
    working = false;
  }
}
</script>

<section class="check" data-site-check>
  <h2>{t.check.heading}</h2>
  <button type="button" onclick={run} disabled={working} data-check-run>{working ? t.check.working : t.check.run}</button>
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  {#if check}
    {#if check.broken.length === 0 && check.unnamed.length === 0 && !check.untranslated?.length && !check.redirects?.length && !check.seo?.length}
      <p class="good" data-check-fine>{t.check.fine}</p>
    {/if}
    {#if check.broken.length}
      <p class="bad">{t.check.broken}</p>
      <ul data-check-broken>
        {#each check.broken as link (link.href)}<li><code>{link.href}</code> <small>{say(t.check.from, { pages: pages(link.from) })}</small></li>{/each}
      </ul>
    {/if}
    {#if check.unnamed.length}
      <p>{t.check.unnamed}</p>
      <ul data-check-unnamed>
        {#each check.unnamed as image (image.src)}<li><code>{image.src}</code> <small>{say(t.check.from, { pages: pages(image.on) })}</small></li>{/each}
      </ul>
    {/if}
    {#if check.redirects?.length}
      <p>{t.check.redirects}</p>
      <ul data-check-redirects>
        {#each check.redirects as r (r.from)}<li><code>{r.from}</code> → <code>{r.to}</code> <small>{t.check[r.problem === 'missing' ? 'lost' : r.problem]}</small></li>{/each}
      </ul>
    {/if}
    {#if check.server?.length}
      <p>{t.check.server}</p>
      <ul data-check-server>
        {#each check.server as what (what)}<li data-server-only={what}>{t.check.serverOnly[what]}</li>{/each}
      </ul>
    {/if}
    {#if check.seo?.length}
      <p>{t.check.seo}</p>
      <ul data-check-seo>
        {#each check.seo as s (`${s.problem}${s.pages.join()}`)}
          <li data-seo-problem={s.problem}>{#if s.problem !== 'hidden' && s.problem !== 'blocked'}<small>{pages(s.pages)}:</small> {/if}{say(s.problem === 'long' ? t.check.seoLong : s.problem === 'duplicate' ? t.check.seoDuplicate : s.problem === 'blocked' ? t.check.seoBlocked : t.check.seoHidden, { title: s.title ?? '', count: String(LONG_TITLE) })}</li>
        {/each}
      </ul>
    {/if}
    {#if check.untranslated?.length}
      <p>{t.check.untranslated}</p>
      <ul data-check-untranslated>
        {#each check.untranslated as page (page.slug)}<li><code>/{page.slug}/</code> <small>{say(t.check.missing, { count: String(page.missing), language: languageName(page.language) })}</small></li>{/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .check { max-width: 46rem; margin: 0 2rem 2rem; padding-top: 1rem; border-top: 1px solid var(--outline-variant); }
  h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
  ul { margin: 0.3rem 0 0.8rem; padding-inline-start: 1.2rem; }
  li { overflow-wrap: anywhere; }
  small { color: var(--on-surface-variant); }
  .good { color: var(--success); }
</style>
