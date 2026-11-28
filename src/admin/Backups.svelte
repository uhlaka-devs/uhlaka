<script lang="ts">
/**
 * Backups (ADR 0051): how the last one went, the ones kept on the server
 * (download, put back, delete), when they are made, the copy sent to an S3
 * storage, and a backup from another server put back. The owner's only.
 */
import { onMount } from 'svelte';
import { api, type BackupSettings, type BackupsShown } from './api.ts';
import { say, t } from './messages.ts';

let shown = $state<BackupsShown | null>(null);
let settings = $state<BackupSettings | null>(null);
let busy = $state('');
let problem = $state('');
let note = $state('');
let tested = $state<{ ok: boolean; error: string } | null>(null);
/** The backup asked to be put back, waiting for "yes". */
let asked = $state('');
let uploading = $state<File | null>(null);
let input = $state<HTMLInputElement | null>(null);

const EMPTY_S3 = { endpoint: '', bucket: '', region: 'auto', accessKeyId: '', secretAccessKey: '', prefix: 'uhlaka/' };
let s3 = $state({ ...EMPTY_S3 });
let useS3 = $state(false);

const size = (bytes: number): string => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const kind = (name: string): string =>
  name.startsWith('before-restore-') ? t.backups.kindBefore : name.startsWith('uploaded-') ? t.backups.kindUploaded : name.startsWith('manual-') ? t.backups.kindManual : t.backups.kindSite;
/** Made or brought by hand: the number kept never deletes it (ADR 0051). */
const byHand = (name: string): boolean => name.startsWith('manual-') || name.startsWith('uploaded-');

function show(next: BackupsShown): void {
  shown = next;
  settings = { ...next.settings };
  useS3 = next.settings.s3 !== null;
  s3 = { ...(next.settings.s3 ?? EMPTY_S3) };
}

async function attempt(what: string, work: () => Promise<void>): Promise<void> {
  busy = what;
  problem = '';
  note = '';
  try {
    await work();
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  } finally {
    busy = '';
  }
}

onMount(() => void attempt('load', async () => show(await api.backups())));

/** The settings as they are on the screen: the hour in this browser's time. */
const asSaved = (): BackupSettings => ({ ...(settings as BackupSettings), offset: new Date().getTimezoneOffset(), s3: useS3 ? { ...s3 } : null });

const save = () =>
  attempt('save', async () => {
    show(await api.setBackups(asSaved()));
    note = t.backups.saved;
  });
const now = () => attempt('now', async () => show(await api.backUpNow()));
const test = () =>
  attempt('test', async () => {
    tested = (await api.testBackups(asSaved())).test;
  });
const remove = (name: string) => attempt('remove', async () => show(await api.removeBackup(name)));

function save_(blob: Blob, name: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}
const download = (name: string) => attempt('download', async () => save_(await api.backupFile(name), name));

/** Put back, then the admin opens again: everything it shows may have changed. */
const restored = (): void => {
  note = t.backups.restored;
  setTimeout(() => location.reload(), 600);
};
const restore = (name: string) =>
  attempt('restore', async () => {
    show(await api.restoreBackup(name));
    asked = '';
    restored();
  });
const upload = () =>
  attempt('restore', async () => {
    show(await api.uploadBackup(uploading as File));
    uploading = null;
    restored();
  });
</script>

<section class="backups">
  <h1>{t.backups.heading}</h1>
  <p class="hint">{t.backups.intro}</p>

  {#if shown && settings}
    <div class="last" data-backup-last={shown.last ? (shown.last.ok ? 'ok' : 'failed') : 'none'}>
      {#if !shown.last}
        <p>{t.backups.none}</p>
      {:else if shown.last.ok}
        <p>{say(t.backups.last, { when: when(shown.last.at), size: size(shown.last.size) })}</p>
        {#if shown.last.sent === 'yes'}<p class="good">{t.backups.sent}</p>{/if}
        {#if shown.last.sent === 'failed'}<p class="bad" role="alert">{say(t.backups.notSent, { error: shown.last.sendError })}</p>{/if}
      {:else}
        <p class="bad" role="alert">{say(t.backups.failed, { error: shown.last.error })}</p>
      {/if}
      <button type="button" class="primary" onclick={now} disabled={busy !== ''} data-backup-now>{busy === 'now' ? t.backups.working : t.backups.now}</button>
    </div>

    <h2>{t.backups.list}</h2>
    {#if shown.files.length === 0}
      <p class="hint">{t.backups.empty}</p>
    {:else}
      <ul class="files">
        {#each shown.files as file (file.name)}
          <li data-backup={file.name}>
            <span class="what"><strong>{when(file.at)}</strong> <small data-backup-kind>{kind(file.name)} · {size(file.size)}{#if byHand(file.name)} · {t.backups.keptHint}{/if}</small></span>
            <button type="button" onclick={() => download(file.name)} disabled={busy !== ''} data-backup-download>{t.backups.download}</button>
            <button type="button" onclick={() => (asked = file.name)} disabled={busy !== ''} data-backup-restore>{t.backups.restore}</button>
            <button type="button" onclick={() => remove(file.name)} disabled={busy !== ''} data-backup-remove>{t.backups.remove}</button>
            {#if asked === file.name}
              <div class="confirm" role="alertdialog" data-backup-confirm>
                <p>{say(t.backups.confirm, { when: when(file.at) })}</p>
                <button type="button" class="danger" onclick={() => restore(file.name)} disabled={busy !== ''} data-backup-yes>{busy === 'restore' ? t.backups.restoring : t.backups.yes}</button>
                <button type="button" onclick={() => (asked = '')} data-backup-cancel>{t.backups.cancel}</button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <p class="hint">{say(t.backups.where, { folder: shown.folder })}</p>

    <h2>{t.backups.schedule}</h2>
    <label class="check"><input type="checkbox" bind:checked={settings.on} data-backup-on /> {t.backups.on}</label>
    <div class="row">
      <label class="field">
        <span>{t.backups.every}</span>
        <select bind:value={settings.every} disabled={!settings.on} data-backup-every>
          <option value="day">{t.backups.day}</option>
          <option value="week">{t.backups.week}</option>
        </select>
      </label>
      <label class="field">
        <span>{t.backups.hour}</span>
        <select bind:value={settings.hour} disabled={!settings.on} data-backup-hour>
          {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}<option value={h}>{String(h).padStart(2, '0')}:00</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>{t.backups.keep}</span>
        <input type="number" min="1" max="90" bind:value={settings.keep} data-backup-keep />
        <small>{t.backups.keepHint}</small>
      </label>
    </div>

    <h2>{t.backups.remote}</h2>
    <p class="hint">{t.backups.remoteIntro}</p>
    <label class="check"><input type="checkbox" bind:checked={useS3} data-backup-s3 /> {t.backups.useRemote}</label>
    {#if useS3}
      <div class="grid">
        <label class="field"><span>{t.backups.endpoint}</span><input type="text" inputmode="url" bind:value={s3.endpoint} placeholder="https://s3.eu-central-003.backblazeb2.com" data-s3="endpoint" /></label>
        <label class="field"><span>{t.backups.bucket}</span><input type="text" bind:value={s3.bucket} data-s3="bucket" /></label>
        <label class="field"><span>{t.backups.region}</span><input type="text" bind:value={s3.region} data-s3="region" /></label>
        <label class="field"><span>{t.backups.prefix}</span><input type="text" bind:value={s3.prefix} data-s3="prefix" /></label>
        <label class="field"><span>{t.backups.accessKeyId}</span><input type="text" autocomplete="off" bind:value={s3.accessKeyId} data-s3="accessKeyId" /></label>
        <label class="field"><span>{t.backups.secretAccessKey}</span><input type="password" autocomplete="new-password" bind:value={s3.secretAccessKey} data-s3="secretAccessKey" /></label>
      </div>
      <small class="hint">{t.backups.endpointHint}</small>
      <div class="row">
        <button type="button" onclick={test} disabled={busy !== '' || !s3.bucket.trim()} data-backup-test>{t.backups.test}</button>
      </div>
      {#if tested}<p class:good={tested.ok} class:bad={!tested.ok} role="status" data-backup-tested>{tested.ok ? t.backups.tested : say(t.backups.untested, { error: tested.error })}</p>{/if}
    {/if}
    <div class="row">
      <button type="button" class="primary" onclick={save} disabled={busy !== ''} data-backup-save>{t.backups.save}</button>
    </div>

    <h2>{t.backups.upload}</h2>
    <p class="hint">{say(t.backups.uploadHint, { size: size(shown.limit) })}</p>
    <input type="file" accept=".uhlaka-backup,.thecms-backup" bind:this={input} onchange={(e) => (uploading = e.currentTarget.files?.[0] ?? null)} data-backup-file />
    {#if uploading}
      <div class="confirm" role="alertdialog" data-backup-upload-confirm>
        <p>{say(t.backups.confirmUpload, { name: uploading.name })}</p>
        <button type="button" class="danger" onclick={upload} disabled={busy !== ''} data-backup-upload>{busy === 'restore' ? t.backups.restoring : t.backups.yes}</button>
        <button type="button" onclick={() => ((uploading = null), input && (input.value = ''))} data-backup-upload-cancel>{t.backups.cancel}</button>
      </div>
    {/if}
  {/if}
  {#if note}<p class="good" role="status" data-backup-note>{note}</p>{/if}
  {#if problem}<p class="bad" role="alert" data-backup-problem>{problem}</p>{/if}
</section>

<style>
  .backups { max-width: 760px; padding: 1.5rem 2rem; }
  h1 { font-size: 20px; margin: 0 0 0.4rem; }
  h2 { font-size: 14px; margin: 1.6rem 0 0.5rem; }
  .hint { color: var(--on-surface-variant); font-size: 13px; }
  .last { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 1rem; padding: 0.8rem 1rem; border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  .last p { margin: 0; flex: 1 1 100%; font-size: 13px; }
  .files { list-style: none; padding: 0; margin: 0; }
  .files li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; padding: 0.5rem 0; border-bottom: 1px solid var(--outline-variant); }
  .what { flex: 1; font-size: 13px; }
  .confirm { flex: 1 1 100%; padding: 0.6rem 0.8rem; background: var(--warning-container); border: 1px solid var(--warning); border-radius: var(--shape-sm); }
  .confirm p { margin: 0 0 0.5rem; font-size: 13px; }
  .row { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.6rem; margin-top: 0.5rem; }
  .field { display: grid; gap: 0.15rem; font-size: 12px; }
  .check { display: flex; gap: 0.4rem; align-items: center; font-size: 13px; }
  .good { color: var(--success); font-size: 13px; }
  .bad { color: var(--error); font-size: 13px; }
</style>
