<script lang="ts">
/**
 * Settings → E-mail (ADR 0064 d5): the mail server the site sends through,
 * the sender, a test message, and the words of each message to visitors in
 * each language, the site's and those extensions declare. UHLAKA_SMTP and UHLAKA_MAIL_FROM are stronger, and it says so.
 */
import { onMount } from 'svelte';
import { api, type MailShown, type MailTemplates } from './api.ts';
import { t } from './messages.ts';

let shown = $state<MailShown | null>(null);
let form = $state({ host: '', port: 465, security: 'tls' as 'tls' | 'plain', user: '', password: '', from: '' });
let problem = $state('');
let note = $state('');
let testTo = $state('');
let words = $state<MailTemplates | null>(null);
let language = $state('');
let which = $state('confirm');
let subject = $state('');
let body = $state('');

const NAMES: Record<string, string> = {
  confirm: t.mail.confirm,
  reset: t.mail.reset,
  welcome: t.mail.welcome,
  invite: t.mail.invite,
  deleted: t.mail.deleted,
  orderReceived: t.mail.orderReceived,
  orderPaid: t.mail.orderPaid,
  orderSent: t.mail.orderSent,
  orderCancelled: t.mail.orderCancelled,
  orderNew: t.mail.orderNew,
};

const take = (next: MailShown): void => {
  shown = next;
  form = { host: next.settings.host, port: next.settings.port, security: next.settings.security, user: next.settings.user, password: '', from: next.settings.from };
};
const attempt = async (work: () => Promise<void>): Promise<void> => {
  try {
    await work();
    problem = '';
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
    note = '';
  }
};
const own = $derived(words?.saved[language]?.[which] ?? null);
// The messages extensions declare (ADR 0064) are kept as `extension:message`.
const siteNames = $derived((words?.names ?? []).filter((n) => !n.includes(':')));
const extensionNames = $derived((words?.names ?? []).filter((n) => n.includes(':')));
function pick(): void {
  const chosen = words?.saved[language]?.[which] ?? words?.defaults[language]?.[which];
  subject = chosen?.subject ?? '';
  body = chosen?.text ?? '';
}

onMount(() =>
  attempt(async () => {
    take(await api.mail());
    words = await api.mailTemplates();
    language = words.languages[0] ?? 'en';
    pick();
  }),
);

const save = () =>
  attempt(async () => {
    take(await api.setMail({ ...form, port: Number(form.port) }));
    note = t.mail.saved;
  });
const test = () =>
  attempt(async () => {
    note = '…';
    await api.testMail(testTo.trim());
    note = t.mail.tested;
  });
const saveWords = (back = false) =>
  attempt(async () => {
    words = await api.setMailTemplate(language, which, back ? '' : subject, back ? '' : body);
    pick();
  });
</script>

<h3>{t.mail.heading}</h3>
{#if shown}
  <p class="hint">{t.mail.intro}</p>
  <p class:bad={!shown.ready} data-mail-ready={shown.ready}>{shown.ready ? t.mail.ready : t.mail.notReady}</p>
  {#if shown.fromEnvironment.server}
    <small>{t.mail.fromEnvironment}</small>
  {:else}
    <label class="field"><span>{t.mail.host}</span><input type="text" bind:value={form.host} placeholder="mail.example.com" data-mail-host /></label>
    <div class="row">
      <label class="field"><span>{t.mail.security}</span>
        <select bind:value={form.security} data-mail-security>
          <option value="tls">{t.mail.tls}</option>
          <option value="plain">{t.mail.plain}</option>
        </select>
      </label>
      <label class="field"><span>{t.mail.port}</span><input type="number" min="1" max="65535" bind:value={form.port} data-mail-port /></label>
    </div>
    <label class="field"><span>{t.mail.user}</span><input type="text" autocomplete="off" bind:value={form.user} /></label>
    <label class="field"><span>{t.mail.password}</span><input type="password" autocomplete="new-password" bind:value={form.password} />
      {#if shown.settings.passwordSet}<small>{t.mail.passwordSet}</small>{/if}
    </label>
  {/if}
  <label class="field"><span>{t.mail.from}</span>
    <input type="email" bind:value={form.from} placeholder="site@example.com" readonly={shown.fromEnvironment.from} data-mail-from />
    {#if shown.fromEnvironment.from}<small>{t.mail.fromEnvironmentFrom}</small>{/if}
  </label>
  {#if !(shown.fromEnvironment.server && shown.fromEnvironment.from)}
    <div class="row"><button type="button" onclick={save} data-mail-save>{t.mail.save}</button></div>
  {/if}
  <div class="row">
    <input type="email" bind:value={testTo} placeholder={t.mail.testTo} aria-label={t.mail.testTo} data-mail-test-to />
    <button type="button" onclick={test} disabled={!shown.ready || !testTo.trim()} data-mail-test>{t.mail.test}</button>
  </div>
  {#if note}<p role="status" data-mail-note>{note}</p>{/if}

  {#if words}
    <h4>{t.mail.templates}</h4>
    <small>{t.mail.templatesHint}</small>
    <div class="row">
      <select bind:value={which} onchange={pick} aria-label={t.mail.template} data-mail-template>
        {#if extensionNames.length}
          <optgroup label={t.mail.siteMails}>{#each siteNames as n (n)}<option value={n}>{NAMES[n] ?? n}</option>{/each}</optgroup>
          <optgroup label={t.mail.extensionMails}>{#each extensionNames as n (n)}<option value={n}>{words.labels[n] ?? n}</option>{/each}</optgroup>
        {:else}
          {#each siteNames as n (n)}<option value={n}>{NAMES[n] ?? n}</option>{/each}
        {/if}
      </select>
      {#if words.languages.length > 1}
        <select bind:value={language} onchange={pick} data-mail-language>{#each words.languages as l (l)}<option value={l}>{l}</option>{/each}</select>
      {/if}
    </div>
    {#if which.startsWith('order')}<small data-mail-order-hint>{t.mail.orderHint}</small>{/if}
    <small>{own ? t.mail.own : which.includes(':') ? t.mail.revertedExtension : t.mail.reverted}</small>
    <label class="field"><span>{t.mail.subject}</span><input type="text" maxlength="200" bind:value={subject} data-mail-subject /></label>
    <label class="field"><span>{t.mail.text}</span><textarea rows="7" maxlength="5000" bind:value={body} data-mail-text></textarea></label>
    <div class="row">
      <button type="button" onclick={() => saveWords()} data-mail-template-save>{t.mail.save}</button>
      {#if own}<button type="button" class="quiet" onclick={() => saveWords(true)}>{which.includes(':') ? t.mail.backToExtension : t.mail.backToProgram}</button>{/if}
    </div>
  {/if}
{/if}
{#if problem}<p class="bad" role="alert">{problem}</p>{/if}

<style>
  h3 { margin: 1.1rem 0 0.5rem; font-size: 13px; }
  h4 { margin: 0.8rem 0 0.3rem; font-size: 12px; }
  .field { display: grid; gap: 0.15rem; font-size: 12px; margin-top: 0.4rem; }
  .row { display: flex; gap: 0.4rem; margin-top: 0.4rem; align-items: end; }
  p { font-size: 13px; }
  .bad { color: var(--error); }
</style>
