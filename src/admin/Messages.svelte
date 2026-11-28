<script lang="ts">
/**
 * What visitors sent through the site's forms (ADR 0019): read, answer by
 * email, delete. They are shown by form, and a form's messages are
 * downloaded as a CSV file, one column for each field (ADR 0049 d5). A visitor's right to see or erase what they sent is answered
 * here too: everything one address sent, messages and comments (ADR 0040),
 * can be downloaded, or erased at once.
 */
import { onMount } from 'svelte';
import { type Form, messagesCsv } from '../core/index.ts';
import { api, type Comment, type Message } from './api.ts';
import { say, t } from './messages.ts';

let items = $state.raw<Message[] | null>(null);
let forms = $state.raw<Form[]>([]);
/** The form whose messages are shown; empty for every form's. */
let shown = $state('');
const formTitle = (name: string): string => forms.find((f) => f.name === name)?.title ?? name;
/** Every form that has a message, the site's in their order, then any that is gone. */
const groups = $derived([...new Set([...forms.map((f) => f.name).filter((n) => items?.some((m) => m.form === n)), ...(items ?? []).map((m) => m.form)])]);
const listed = $derived(shown ? (items ?? []).filter((m) => m.form === shown) : items);
let keep = $state(180);
let problem = $state('');
let who = $state('');

const attempt = async (work: () => Promise<{ messages: Message[]; keep: number }>): Promise<void> => {
  problem = '';
  try {
    const answer = await work();
    items = answer.messages;
    keep = answer.keep;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
};

const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const subject = (m: Message): string => encodeURIComponent(`Re: ${m.body.slice(0, 60)}`);

function save(blob: Blob, name: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** One form's messages, one column for each field, for a spreadsheet. */
function csv(): void {
  const rows = (items ?? []).filter((m) => m.form === shown);
  const text = messagesCsv(forms.find((f) => f.name === shown) ?? null, rows, { receivedAt: t.inbox.received, page: t.inbox.page, consent: t.inbox.consent });
  save(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${shown}-messages.csv`);
}

function download(kept: { messages: Message[]; comments: Comment[] }, name: string): void {
  save(new Blob([JSON.stringify({ messages: kept.messages, comments: kept.comments }, null, 2)], { type: 'application/json' }), name);
}

onMount(() => {
  void attempt(api.messages);
  api.forms().then((state) => (forms = state.forms)).catch(() => {});
});
</script>

<section class="screen" data-list="messages">
  <header>
    <h1>{t.inbox.heading}</h1>
  </header>
  <p class="hint">{say(t.inbox.intro, { count: keep })}</p>
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  {#if items && items.length === 0}
    <p class="hint">{t.inbox.empty}</p>
  {:else if items && listed}
    <div class="by-form">
      <label>{t.inbox.show}
        <select bind:value={shown} data-messages-form>
          <option value="">{t.inbox.all}</option>
          {#each groups as name (name)}<option value={name}>{formTitle(name)} ({items.filter((m) => m.form === name).length})</option>{/each}
        </select>
      </label>
      {#if shown}<button type="button" onclick={csv} data-messages-csv>{t.inbox.csv}</button>{/if}
    </div>
    <ul class="messages">
      {#each listed as m (m.id)}
        <li data-message={m.id}>
          <p class="from"><strong>{m.name}</strong> {#if m.email}<a href={`mailto:${m.email}?subject=${subject(m)}`}>{m.email}</a>{/if} <small>{when(m.receivedAt)} · {formTitle(m.form)} · {m.page}</small></p>
          {#if m.answers}
            <dl class="answers">
              {#each m.answers.filter((a) => a.value) as a (a.id)}<dt>{a.label}</dt><dd>{a.value}</dd>{/each}
            </dl>
          {:else}
            <p class="body">{m.body}</p>
          {/if}
          <details><summary>{t.inbox.consent}</summary><p>{m.consent}</p></details>
          <button type="button" class="quiet" onclick={() => attempt(() => api.removeMessage(m.id))} data-message-delete>{t.inbox.remove}</button>
        </li>
      {/each}
    </ul>
  {/if}

  <h2>{t.inbox.rights}</h2>
  <p class="hint">{t.inbox.rightsHint}</p>
  <div class="rights">
    <input type="email" placeholder={t.inbox.address} bind:value={who} data-rights-email />
    <button type="button" disabled={!who.trim()} onclick={async () => download(await api.messagesFrom(who), `kept-about-${who.trim()}.json`)} data-rights-export>{t.inbox.export}</button>
    <button type="button" class="quiet" disabled={!who.trim()} onclick={() => attempt(() => api.eraseMessagesFrom(who))} data-rights-erase>{t.inbox.erase}</button>
  </div>
</section>

<style>
  header { margin-bottom: 0.5rem; }
  h1 { margin: 0; font-size: 1.4rem; }
  h2 { margin: 2rem 0 0.3rem; font-size: 1.05rem; }
  .messages { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.8rem; max-width: 46rem; }
  .messages li { padding: 1rem 1.2rem; background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  .from { margin: 0 0 0.4rem; display: flex; flex-wrap: wrap; gap: 0.3rem 0.8rem; align-items: baseline; }
  .from small { color: var(--on-surface-variant); }
  .body { margin: 0 0 0.5rem; white-space: pre-line; }
  .by-form { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; margin-top: 1rem; }
  .by-form label { display: flex; gap: 0.5rem; align-items: center; }
  .answers { display: grid; grid-template-columns: minmax(6rem, max-content) 1fr; gap: 0.25rem 1rem; margin: 0 0 0.5rem; }
  .answers dt { color: var(--on-surface-variant); }
  .answers dd { margin: 0; white-space: pre-line; }
  details { font-size: 0.85rem; color: var(--on-surface-variant); margin-bottom: 0.5rem; }
  .rights { display: flex; flex-wrap: wrap; gap: 0.5rem; max-width: 46rem; }
  .rights input { flex: 1 1 16rem; }
</style>
