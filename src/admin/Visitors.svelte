<script lang="ts">
/**
 * Settings → Visitor accounts (ADR 0064 d2, d6, d8): one switch, who may make
 * an account, and, once on, the accounts, invitations, each visitor's data
 * and the messages that could not be sent. While off, nothing else is shown.
 */
import { onMount } from 'svelte';
import { api, type VisitorsShown } from './api.ts';
import { say, t } from './messages.ts';

let { languages = [], onswitch }: { languages?: string[]; /** Told whether the accounts are on, each time that is known. */ onswitch?: (on: boolean) => void } = $props();
let levelName = $state('');
let shown = $state<VisitorsShown | null>(null);
let problem = $state('');
let email = $state('');
let name = $state('');
let language = $state('');
const day = (at: string | null): string => (at ? new Date(at).toLocaleDateString() : '');

async function load(call: () => Promise<VisitorsShown>): Promise<void> {
  try {
    shown = await call();
    problem = '';
    onswitch?.(shown.settings.on);
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
}
onMount(() => load(api.visitors));

async function invite(): Promise<void> {
  await load(() => api.inviteVisitor(email.trim(), name.trim(), language || (languages[0] ?? '')));
  if (!problem) {
    email = '';
    name = '';
  }
}

/** The levels the owner names (ADR 0064 d3); one taken away is taken from everyone. */
async function addLevel(): Promise<void> {
  if (!shown || !levelName.trim()) return;
  await load(() => api.setVisitors({ levels: [...(shown as VisitorsShown).settings.levels, { id: '', name: levelName.trim() }] }));
  if (!problem) levelName = '';
}
function removeLevel(id: string, name: string): void {
  if (!shown || !confirm(say(t.visitors.removeLevelConfirm, { name }))) return;
  const settings = shown.settings;
  void load(() => api.setVisitors({ levels: settings.levels.filter((l) => l.id !== id), welcome: settings.welcome === id ? '' : settings.welcome }));
}
function giveLevel(id: string, held: string[], level: string, on: boolean): void {
  void load(() => api.setVisitorLevels(id, on ? [...held, level] : held.filter((l) => l !== level)));
}

async function download(id: string, address: string): Promise<void> {
  const { visitor } = await api.visitorData(id);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(visitor, null, 2)], { type: 'application/json' }));
  link.download = `${address}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
</script>

<h3>{t.visitors.heading}</h3>
{#if shown}
  <p class="hint">{t.visitors.intro}</p>
  <label class="check">
    <input type="checkbox" checked={shown.settings.on} onchange={(e) => load(() => api.setVisitors({ on: e.currentTarget.checked }))} data-visitors-on />
    <span>{t.visitors.on}</span>
  </label>
  {#if !shown.settings.on}
    <small>{t.visitors.offHint}</small>
  {:else}
    <small>{say(t.visitors.pages, { address: '/_/account' })}</small>
    <label class="field">
      <span>{t.visitors.signup}</span>
      <select value={shown.settings.signup} onchange={(e) => load(() => api.setVisitors({ signup: e.currentTarget.value as 'open' | 'invite' | 'closed' }))} data-visitors-signup>
        <option value="open" disabled={!shown.mail}>{t.visitors.open}</option>
        <option value="invite">{t.visitors.invite}</option>
        <option value="closed">{t.visitors.closed}</option>
      </select>
      {#if !shown.mail}<small>{t.visitors.openNeedsMail}</small>{/if}
    </label>
    <label class="field">
      <span>{t.visitors.privacy}</span>
      <input type="text" value={shown.settings.privacy} placeholder="/privacy/" onchange={(e) => load(() => api.setVisitors({ privacy: e.currentTarget.value.trim() }))} data-visitors-privacy />
      <small>{t.visitors.privacyHint}</small>
    </label>
    {#if !shown.mail}<p class="bad">{t.visitors.noMail}</p>{/if}

    <h4>{t.visitors.levels}</h4>
    <p class="hint">{t.visitors.levelsHint}</p>
    {#if shown.settings.levels.length}
      <ul class="list" data-visitors-levels>
        {#each shown.settings.levels as level (level.id)}
          <li data-level={level.id}><span class="grow">{level.name}</span><button type="button" class="quiet" onclick={() => removeLevel(level.id, level.name)} data-level-remove>{t.visitors.removeLevel}</button></li>
        {/each}
      </ul>
      <label class="field">
        <span>{t.visitors.welcome}</span>
        <select value={shown.settings.welcome} onchange={(e) => load(() => api.setVisitors({ welcome: e.currentTarget.value }))} data-visitors-welcome>
          <option value="">{t.visitors.welcomeNone}</option>
          {#each shown.settings.levels as level (level.id)}<option value={level.id}>{level.name}</option>{/each}
        </select>
      </label>
    {/if}
    <div class="row">
      <input type="text" maxlength="60" placeholder={t.visitors.levelName} aria-label={t.visitors.levelName} bind:value={levelName} data-level-name />
      <button type="button" onclick={addLevel} disabled={!levelName.trim()} data-level-add>{t.visitors.addLevel}</button>
    </div>

    <h4>{t.visitors.list}</h4>
    {#if shown.waiting}<p class="hint" data-visitors-waiting>{say(t.visitors.waiting, { count: shown.waiting })}</p>{/if}
    {#if shown.visitors?.length}
      <ul class="list" data-visitors-list>
        {#each shown.visitors as v (v.id)}
          <li data-visitor={v.email}>
            <span class="grow">
              <strong>{v.name || v.email}</strong>
              {#if v.name}<small>{v.email}</small>{/if}
              <small>
                {v.invited ? t.visitors.invited : !v.confirmedAt ? t.visitors.unconfirmed : say(t.visitors.since, { date: day(v.confirmedAt) })}
                {#if v.lastAt} · {say(t.visitors.lastSeen, { date: day(v.lastAt) })}{/if}
              </small>
              {#if shown.settings.levels.length}
                <span class="held" aria-label={t.visitors.levelsOf}>
                  {#each shown.settings.levels as level (level.id)}
                    <label><input type="checkbox" checked={v.levels.includes(level.id)} onchange={(e) => giveLevel(v.id, v.levels, level.id, e.currentTarget.checked)} data-visitor-level={level.id} /> {level.name}</label>
                  {/each}
                </span>
              {/if}
            </span>
            <button type="button" class="quiet" onclick={() => download(v.id, v.email)}>{t.visitors.download}</button>
            <button type="button" class="quiet" onclick={() => confirm(say(t.visitors.removeConfirm, { email: v.email })) && load(() => api.removeVisitor(v.id))} data-visitor-remove>{t.visitors.remove}</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">{t.visitors.none}</p>
    {/if}

    {#if shown.settings.signup !== 'closed' && shown.mail}
      <fieldset class="field" data-visitors-invite>
        <legend>{t.visitors.inviteHeading}</legend>
        <label><span>{t.visitors.email}</span><input type="email" maxlength="254" bind:value={email} data-invite-email /></label>
        <label><span>{t.visitors.name}</span><input type="text" maxlength="120" bind:value={name} /></label>
        {#if languages.length > 1}
          <label><span>{t.visitors.language}</span>
            <select bind:value={language}>{#each languages as l (l)}<option value={l}>{l}</option>{/each}</select>
          </label>
        {/if}
        <button type="button" onclick={invite} disabled={!email.trim()} data-invite-send>{t.visitors.send}</button>
      </fieldset>
    {/if}

    {#if shown.failed?.length}
      <h4 class="bad">{t.visitors.failed}</h4>
      <ul class="list" data-visitors-failed>
        {#each shown.failed as f (f.id)}
          <li>
            <span class="grow"><strong>{f.to}</strong> <small>{f.what} · {day(f.failedAt)} · {f.error}</small></span>
            <button type="button" class="quiet" onclick={() => load(() => api.retryMail(f.id))}>{t.visitors.retry}</button>
            <button type="button" class="quiet" onclick={() => load(() => api.forgetMail(f.id))}>{t.visitors.forget}</button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
{/if}
{#if problem}<p class="bad" role="alert">{problem}</p>{/if}

<style>
  h3 { margin: var(--sp-4) 0 var(--sp-2); font-size: var(--size-m); }
  h4 { margin: var(--sp-3) 0 var(--sp-1); font-size: var(--size-s); }
  .field { display: grid; gap: 0.15rem; font-size: var(--size-s); margin-top: var(--sp-2); }
  .check { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-1); }
  .check span { margin: 0; }
  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--sp-1); font-size: var(--size-s); }
  .list li { display: flex; align-items: center; gap: var(--sp-2); }
  .list small { display: block; }
  .grow { flex: 1; min-width: 0; }
  .row { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
  .row input { flex: 1; min-width: 0; }
  .held { display: flex; flex-wrap: wrap; gap: 0.2rem var(--sp-2); }
  .held label { display: flex; align-items: center; gap: 0.2rem; }
  p { font-size: var(--size-m); }
  .bad { color: var(--error); }
</style>
