<script lang="ts">
/**
 * The way into the admin (ADR 0022). On one's own computer the address carries
 * the key and the admin opens at once. On a served admin a person signs in, or
 * arrives by a one-time link: the first owner's, an invitation, or a new
 * password. A link's secret is taken out of the address once it is used.
 */
import { onMount } from 'svelte';
import { api, linkSecret, SignInNeeded } from './api.ts';
import App from './App.svelte';
import { say, t } from './messages.ts';

/** The server's rule (store.ts PASSWORD_MIN); said here so the form can say it first. */
const PASSWORD_MIN = 10;

let stage = $state<'waiting' | 'in' | 'signIn' | 'link' | 'key' | 'failed'>('waiting');
let link = $state.raw<Awaited<ReturnType<typeof api.link>> | null>(null);
/** The first page of a new site (ADR 0048 d4): its name and language, beside the owner's account. */
let siteName = $state('');
let language = $state('');
let email = $state('');
let password = $state('');
let name = $state('');
let busy = $state(false);
let problem = $state('');

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function attempt(work: () => Promise<unknown>): Promise<void> {
  busy = true;
  problem = '';
  try {
    await work();
    // The link is spent: it should not stay in the address, the history or a bookmark.
    if (linkSecret) history.replaceState(null, '', location.pathname);
    stage = 'in';
  } catch (error) {
    problem = message(error);
  } finally {
    busy = false;
  }
}

const signIn = (event: SubmitEvent): void => {
  event.preventDefault();
  void attempt(() => api.signIn(email, password));
};

const useLink = (event: SubmitEvent): void => {
  event.preventDefault();
  if (link?.kind !== 'setup') return void attempt(() => api.useLink(linkSecret, { name, email, password }));
  const before = link.site?.language ?? '';
  void attempt(async () => {
    const done = await api.useLink(linkSecret, { name, email, password, siteName, language });
    // The admin speaks the language just chosen: it starts again in it.
    if (language && language !== before) location.reload();
    return done;
  });
};

onMount(async () => {
  if (linkSecret) {
    try {
      link = await api.link(linkSecret);
      name = link.name;
      email = link.email;
      siteName = link.site?.name ?? '';
      language = link.site?.language ?? '';
      stage = 'link';
    } catch (error) {
      problem = message(error);
      history.replaceState(null, '', location.pathname);
      stage = 'signIn';
    }
    return;
  }
  try {
    await api.state();
    stage = 'in';
  } catch (error) {
    if (error instanceof SignInNeeded) stage = 'signIn';
    else if (!api.hasToken) stage = 'key';
    else {
      problem = message(error);
      stage = 'failed';
    }
  }
});
</script>

{#if stage === 'in'}
  <App />
{:else if stage === 'key'}
  <p class="notice">{t.door.key}</p>
{:else if stage === 'failed' || stage === 'waiting'}
  <p class="notice">{problem || '…'}</p>
{:else}
  <main class="door">
    {#if stage === 'signIn'}
      <form onsubmit={signIn} data-sign-in>
        <h1>{t.door.signIn}</h1>
        {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
        <label class="field"><span>{t.door.email}</span><input type="email" autocomplete="username" required bind:value={email} data-email /></label>
        <label class="field"><span>{t.door.password}</span><input type="password" autocomplete="current-password" required bind:value={password} data-password /></label>
        <button type="submit" class="primary" disabled={busy}>{t.door.go}</button>
        <p class="hint">{t.door.forgot}</p>
      </form>
    {:else if link}
      <form onsubmit={useLink} data-link={link.kind}>
        <h1>{t.door[link.kind]}</h1>
        <p class="hint">{say(t.door[`${link.kind}Intro`], { email: link.email })}</p>
        {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
        {#if link.kind !== 'reset'}
          <label class="field"><span>{t.door.name}</span><input type="text" autocomplete="name" required bind:value={name} data-name /></label>
        {/if}
        {#if link.kind === 'setup'}
          <label class="field"><span>{t.door.siteName}</span><input type="text" maxlength="120" required bind:value={siteName} data-site-name /></label>
          {#if (link.languages ?? []).length > 1}
            <label class="field"><span>{t.door.language}</span>
              <select bind:value={language} data-language>
                {#each link.languages ?? [] as choice (choice.language)}<option value={choice.language}>{choice.name}</option>{/each}
              </select>
            </label>
          {/if}
          <label class="field"><span>{t.door.email}</span><input type="email" autocomplete="username" required bind:value={email} data-email /></label>
        {/if}
        <label class="field">
          <span>{t.door.newPassword}</span>
          <input type="password" autocomplete="new-password" required minlength={PASSWORD_MIN} bind:value={password} data-password />
          <small>{say(t.door.passwordHint, { count: PASSWORD_MIN })}</small>
        </label>
        <button type="submit" class="primary" disabled={busy}>{t.door.save}</button>
      </form>
    {/if}
  </main>
{/if}

<style>
  /* The admin's own rules arrive with it; the door is drawn before, so it brings what it needs. */
  :global(html, body) { height: 100%; margin: 0; }
  :global(body) { font: var(--body-m); color: var(--on-surface); background: var(--surface); }
  .notice { margin: var(--sp-16) auto; max-width: 30rem; text-align: center; }
  .door { display: grid; place-items: center; min-height: 100vh; padding: var(--sp-4); box-sizing: border-box; }
  form { box-sizing: border-box; width: min(100%, 24rem); padding: var(--sp-6); background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-md); }
  h1 { margin: 0 0 var(--sp-3); font-size: var(--size-xl); }
  .field { display: block; margin-bottom: var(--sp-3); }
  .field span { display: block; margin-bottom: 0.2rem; font-size: var(--size-s); color: var(--on-surface-variant); }
  input, select { box-sizing: border-box; width: 100%; padding: var(--sp-2); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); background: var(--surface-lowest); color: inherit; font: inherit; }
  .hint, small { display: block; color: var(--on-surface-variant); font-size: var(--size-s); }
  small { margin-top: 0.2rem; }
  .bad { color: var(--error); }
  form > .hint { margin: 0 0 var(--sp-4); }
  form > p.hint:last-child { margin: var(--sp-4) 0 0; }
  button { width: 100%; margin-top: var(--sp-2); padding: var(--sp-2); border: 1px solid var(--primary); border-radius: var(--shape-sm); background: var(--primary); color: var(--on-primary); font: inherit; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: default; }
</style>
