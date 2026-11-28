<script lang="ts">
/**
 * Who may sign in (ADR 0022), for the owner: invite by address, choose a
 * role, make a new link for someone who forgot their password, remove. An
 * invitation is a link the owner sends themselves; the site sends no email.
 */
import { onMount } from 'svelte';
import { api, type People, type Role } from './api.ts';
import { say, t } from './messages.ts';

let people = $state.raw<People | null>(null);
let problem = $state('');
let email = $state('');
let role = $state<Role>('editor');
/** The link just made, and for whom. */
let made = $state<{ email: string; link: string } | null>(null);
let copied = $state(false);
/** Removing asks once more, on the same button, and to whom what they wrote goes (ADR 0055 d5). */
let removing = $state('');
let heir = $state('');

async function attempt(work: () => Promise<People>, linkFor = ''): Promise<void> {
  problem = '';
  try {
    people = await work();
    made = people.link ? { email: linkFor, link: people.link } : null;
    copied = false;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}

function invite(event: SubmitEvent): void {
  event.preventDefault();
  const address = email.trim();
  void attempt(() => api.invite(address, role), address).then(() => {
    if (!problem) email = '';
  });
}

async function copy(): Promise<void> {
  if (!made) return;
  try {
    await navigator.clipboard.writeText(made.link);
    copied = true;
  } catch {
    // Without the clipboard the link is still on the screen, selected by a click.
  }
}

onMount(() => void attempt(api.people));
</script>

<section class="screen" data-list="people">
  <h1>{t.people.heading}</h1>
  <p class="hint">{t.people.intro}</p>
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}

  {#if made}
    <div class="made" data-made-link>
      <p>{say(t.people.link, { email: made.email })}</p>
      <div class="row">
        <input type="text" readonly value={made.link} onfocus={(e) => e.currentTarget.select()} data-link-text />
        <button type="button" onclick={copy}>{copied ? t.people.copied : t.people.copy}</button>
      </div>
    </div>
  {/if}

  {#if people}
    <ul class="people">
      {#each people.users as user (user.id)}
        <li data-user={user.email}>
          <span class="who">
            <strong>{user.name || user.email}</strong>
            {#if user.name}<small>{user.email}</small>{/if}
            {#if user.id === people.me.id}<small>{t.people.you}</small>{:else if !user.active}<small>{t.people.invited}</small>{/if}
          </span>
          <select value={user.role} disabled={user.id === people.me.id} onchange={(e) => attempt(() => api.setRole(user.id, e.currentTarget.value as Role))} aria-label={t.people.role} data-role>
            <option value="owner">{t.people.owner}</option>
            <option value="editor">{t.people.editor}</option>
            <option value="author">{t.people.author}</option>
            <option value="contributor">{t.people.contributor}</option>
          </select>
          {#if user.id !== people.me.id}
            <button type="button" class="quiet" onclick={() => attempt(() => api.newLink(user.id), user.email)} data-new-link>{t.people.newLink}</button>
            {#if removing === user.id}
              <label class="inline">
                <span>{t.people.heir}</span>
                <select bind:value={heir} data-heir>
                  {#each people.users.filter((u) => u.id !== user.id) as other (other.id)}<option value={other.id}>{other.name || other.email}</option>{/each}
                </select>
              </label>
              <button type="button" class="quiet bad" onclick={() => attempt(() => api.removeUser(user.id, heir))} data-remove-sure>{t.people.removeSure}</button>
            {:else}
              <button type="button" class="quiet" onclick={() => ((removing = user.id), (heir = people?.me.id ?? ''))} data-remove>{t.people.remove}</button>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <h2>{t.people.invite}</h2>
  <form class="row" onsubmit={invite} data-invite>
    <input type="email" required placeholder={t.people.email} aria-label={t.people.email} bind:value={email} data-invite-email />
    <select bind:value={role} aria-label={t.people.role} data-invite-role>
      <option value="editor">{t.people.editor}</option>
      <option value="author">{t.people.author}</option>
      <option value="contributor">{t.people.contributor}</option>
      <option value="owner">{t.people.owner}</option>
    </select>
    <button type="submit" class="primary">{t.people.send}</button>
  </form>
  <p class="hint">{t.people.roles}</p>
</section>

<style>
  h1 { margin: 0 0 0.5rem; font-size: 1.4rem; }
  h2 { margin: 2rem 0 0.5rem; font-size: 1.05rem; }
  .people { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.5rem; max-width: 46rem; }
  .people li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.8rem; padding: 0.7rem 1rem; background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  .who { flex: 1 1 14rem; display: flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; align-items: baseline; }
  .people select { width: auto; }
  .row { display: flex; flex-wrap: wrap; gap: 0.5rem; max-width: 46rem; }
  .row input { flex: 1 1 16rem; }
  .row select { width: auto; }
  .made { max-width: 46rem; margin: 1rem 0; padding: 0.8rem 1rem; background: var(--secondary-container); border: 1px solid var(--primary); border-radius: var(--shape-sm); }
  .made p { margin: 0 0 0.5rem; }
</style>
