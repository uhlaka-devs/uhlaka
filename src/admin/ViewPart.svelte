<script lang="ts">
/**
 * One `uhlaka.view/1` view of an extension's screen (ADR 0031), drawn by this
 * admin: a list of a collection's rows, a form (the collection's one row, or
 * an action's questions), or tabs of other views. No code of the extension
 * runs here: rows come from the program, and a button runs a declared action
 * through it. What is drawn and how is this admin's; what is shown and done is
 * the view's.
 */
import { onMount } from 'svelte';
import type { ExtensionCollection, ExtensionField } from '../core/index.ts';
import { type ActionButton, type Button, buttonsFor, listRows, monthOf, nextMonth, readActionResult, readReport, REPORT_RANGES, type ReportAnswer, type ReportRange, resolveInput, shownFields, type View } from '../view/index.ts';
import { api, type ExtensionInfo } from './api.ts';
import { adminLanguage, t } from './messages.ts';
import Self from './ViewPart.svelte';

let { extension, view, onnavigate }: { extension: ExtensionInfo; view: View; onnavigate: (id: string) => void } = $props();

const word = (text: string): string => extension.messages[adminLanguage()]?.[text] || extension.messages[adminLanguage().split('-')[0] ?? '']?.[text] || text;
const collection = $derived<ExtensionCollection | null>('collection' in view ? (extension.collections?.find((c) => c.name === view.collection) ?? null) : null);
const formAction = $derived(view.type === 'form' && 'action' in view ? (extension.actions.find((a) => a.name === view.action) ?? null) : null);

let rows = $state.raw<Record<string, unknown>[]>([]);
let problem = $state('');
let notice = $state('');
let revealed = $state('');
/** The row being written: a new one (id null), or one being changed. */
let draft = $state<{ id: string | null; row: Record<string, unknown> } | null>(null);
/** A button waiting for its answers or its confirmation, on the row it is on. */
let pending = $state<{ key: string; button: ActionButton; row: Record<string, unknown> | null; answers: Record<string, string>; asked: boolean } | null>(null);
let working = $state(false);
let tab = $state(0);

/** A report (ADR 0062 d7): the time shown, and what its action answered for it. */
const ranges = $derived<readonly ReportRange[]>(view.type === 'report' ? (view.ranges ?? REPORT_RANGES) : []);
let range = $state<ReportRange | null>(null);
let report = $state.raw<ReportAnswer | null>(null);
/** Counts the loads, so that the answer for a time clicked earlier never replaces the last one's. */
let reports = 0;
async function loadReport(next: ReportRange): Promise<void> {
  if (view.type !== 'report') return;
  const action = view.action;
  const mine = ++reports;
  range = next;
  await attempt(async () => {
    const answer = readReport((await api.runExtensionAction(extension.name, action, { range: next, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })).answer);
    if (mine === reports) report = answer;
  });
}
const RANGE_WORDS: Record<ReportRange, () => string> = { today: () => t.stats.today, '7': () => t.stats.days7, '30': () => t.stats.days30, '365': () => t.stats.months12 };
const number = (n: number): string => n.toLocaleString();
const W = 600;
const H = 140;

/** A calendar (ADR 0062 d7): the month shown, `YYYY-MM`. */
let month = $state(new Date().toISOString().slice(0, 7));
const monthName = (at: string): string => new Date(`${at}-15T12:00:00Z`).toLocaleDateString(adminLanguage(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** Monday to Sunday, short, in the admin's language. */
const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(adminLanguage(), { weekday: 'short', timeZone: 'UTC' }));
const timeOf = (value: unknown): string => (typeof value === 'string' && value.length > 10 ? value.slice(11, 16) : '');

async function attempt(work: () => Promise<void>): Promise<boolean> {
  problem = '';
  notice = '';
  try {
    await work();
    return true;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
    return false;
  }
}
const load = (): Promise<boolean> => (collection ? attempt(async () => void (rows = (await api.extensionRows(extension.name, (collection as ExtensionCollection).name)).rows)) : Promise.resolve(true));

const labelOf = (key: string, label?: string): string => word(label ?? collection?.fields.find((f) => f.key === key)?.label ?? formAction?.ask.find((a) => a.key === key)?.label ?? key);
const blank = (fields: ExtensionField[]): Record<string, unknown> => Object.fromEntries(fields.map((f) => [f.key, f.kind === 'secret' ? '' : (f.initial ?? (f.kind === 'boolean' ? false : ''))]));
const editable = (row: Record<string, unknown>, fields: ExtensionField[]): Record<string, unknown> => Object.fromEntries(fields.map((f) => [f.key, f.kind === 'secret' ? '' : (row[f.key] ?? '')]));
const shown = (value: unknown): string => (value === true ? '✓' : value === false ? '–' : value === null || value === undefined ? '' : String(value));

/** The singleton form starts from the collection's one row, when it has one. */
async function startSingle(): Promise<void> {
  if (!collection) return;
  if (await load()) draft = rows[0] ? { id: String(rows[0].id), row: editable(rows[0], collection.fields) } : { id: null, row: blank(collection.fields) };
}

async function save(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!draft || !collection) return;
  const { id, row } = draft;
  const of = collection.name;
  const ok = await attempt(async () => void (rows = (await api.saveExtensionRow(extension.name, of, row, id)).rows));
  if (!ok) return;
  if (view.type === 'list') draft = null;
  else {
    notice = t.ext.done;
    await startSingle();
  }
}

const keyOf = (button: Button, row: Record<string, unknown> | null): string => `${'action' in button ? button.action : button.navigate}/${row ? String(row.id) : ''}`;

/** A button: opens a view, or runs its action once what it asks is answered and it is confirmed. */
function press(button: Button, row: Record<string, unknown> | null): void {
  if ('navigate' in button) return onnavigate(button.navigate);
  const ask = (button.prompt ?? []).length > 0;
  if (!ask && !button.confirm) return void run(button, row, {});
  pending = { key: keyOf(button, row), button, row, answers: Object.fromEntries((button.prompt ?? []).map((k) => [k, ''])), asked: !ask };
}

async function run(button: Pick<ActionButton, 'action' | 'input'>, row: Record<string, unknown> | null, answers: Record<string, string>): Promise<void> {
  working = true;
  revealed = '';
  const input = { ...resolveInput(button.input, row), ...answers };
  try {
    await attempt(async () => {
      const result = readActionResult((await api.runExtensionAction(extension.name, button.action, input)).answer);
      pending = null;
      if (result.kind === 'navigate') return onnavigate(result.view);
      if (result.kind === 'reveal') revealed = result.text;
      await load();
      notice = result.kind === 'values' ? t.ext.done : '';
    });
  } finally {
    working = false;
  }
}

/** A form over an action: its questions, and its button. */
let answers = $state<Record<string, string>>({});
async function submitAction(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (formAction) await run({ action: formAction.name }, null, answers);
}

onMount(() => {
  if (view.type === 'list' || view.type === 'calendar') void load();
  if (view.type === 'report') void loadReport((view.ranges ?? REPORT_RANGES)[0] as ReportRange);
  if (view.type === 'form' && 'singleton' in view) void startSingle();
  if (formAction) answers = Object.fromEntries(formAction.ask.map((a) => [a.key, '']));
});
</script>

{#snippet buttons(list: Button[], row: Record<string, unknown> | null)}
  {#each buttonsFor(list, row) as button (keyOf(button, row))}
    {@const key = keyOf(button, row)}
    {#if pending?.key === key && 'action' in button}
      {@const waiting = pending}
      <form class="ask" onsubmit={(e) => (e.preventDefault(), run(waiting.button, waiting.row, waiting.answers))} data-view-ask={key}>
        {#each waiting.button.prompt ?? [] as question (question)}
          <label class="field"><span>{labelOf(question)}</span><input type="text" bind:value={waiting.answers[question]} data-ask={question} /></label>
        {/each}
        {#if button.confirm}<p>{word(button.confirm)}</p>{/if}
        <span class="row">
          <button type="submit" class="primary" data-tone={button.tone} disabled={working} data-view-sure>{working ? t.ext.working : button.confirm ? t.ext.sure : t.ext.run}</button>
          <button type="button" class="quiet" onclick={() => (pending = null)}>{t.ext.cancel}</button>
        </span>
      </form>
    {:else}
      <button type="button" class="quiet" data-tone={button.tone} disabled={working} onclick={() => press(button, row)} data-view-button={key}>{word(button.label)}</button>
    {/if}
  {/each}
{/snippet}

{#snippet fieldInputs(fields: ExtensionField[], editing: { id: string | null; row: Record<string, unknown> })}
  {#each fields as field (field.key)}
    {#if field.kind === 'boolean'}
      <label class="check">
        <input type="checkbox" checked={editing.row[field.key] === true} onchange={(e) => (editing.row[field.key] = e.currentTarget.checked)} data-field={field.key} />
        <span>{word(field.label)}</span>
      </label>
    {:else}
      <label class="field">
        <span>{word(field.label)}{field.required ? ' *' : ''}</span>
        {#if field.kind === 'longtext'}
          <textarea rows="5" value={String(editing.row[field.key] ?? '')} oninput={(e) => (editing.row[field.key] = e.currentTarget.value)} data-field={field.key}></textarea>
        {:else if field.kind === 'choice'}
          <select value={String(editing.row[field.key] ?? '')} onchange={(e) => (editing.row[field.key] = e.currentTarget.value)} data-field={field.key}>
            <option value=""></option>
            {#each field.options as option}<option value={option}>{word(option)}</option>{/each}
          </select>
        {:else}
          <input
            type={field.kind === 'secret' ? 'password' : field.kind === 'number' ? 'number' : field.kind === 'url' ? 'url' : field.kind === 'date' ? 'date' : field.kind === 'datetime' ? 'datetime-local' : 'text'}
            value={String(editing.row[field.key] ?? '')}
            autocomplete="off"
            oninput={(e) => (editing.row[field.key] = field.kind === 'number' && e.currentTarget.value !== '' ? Number(e.currentTarget.value) : e.currentTarget.value)}
            data-field={field.key}
          />
        {/if}
        {#if field.kind === 'secret' && editing.id}<small>{t.ext.secretSet}</small>{/if}
      </label>
    {/if}
  {/each}
{/snippet}

<div class="view" data-view={view.type} data-view-id={view.id}>
  {#if view.title && view.type !== 'tabs'}<h2>{word(view.title)}</h2>{/if}
  {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
  {#if notice}<p class="good" role="status">{notice}</p>{/if}
  {#if revealed}<div class="reveal" data-reveal><p>{t.ext.reveal}</p><code>{revealed}</code></div>{/if}
  {#if view.actions?.length}<div class="row toolbar">{@render buttons(view.actions, null)}</div>{/if}

  {#if view.type === 'tabs'}
    <div class="tabs" role="tablist">
      {#each view.views as inner, i (i)}
        <button type="button" role="tab" aria-selected={tab === i} class:on={tab === i} onclick={() => (tab = i)} data-view-tab={i}>{word(inner.title ?? '')}</button>
      {/each}
    </div>
    {#key tab}
      {@const inner = view.views[tab]}
      {#if inner}<Self {extension} view={inner} {onnavigate} />{/if}
    {/key}
  {:else if view.type === 'form' && formAction}
    <form class="form" onsubmit={submitAction} data-view-form={formAction.name}>
      {#each shownFields(view.fields, formAction.ask) as field (field.key)}
        <label class="field"><span>{labelOf(field.key, field.label)}</span><input type="text" bind:value={answers[field.key]} data-ask={field.key} /></label>
      {/each}
      <div class="row"><button type="submit" class="primary" disabled={working} data-view-submit>{working ? t.ext.working : word('submit' in view && view.submit ? view.submit : formAction.label)}</button></div>
    </form>
  {:else if view.type === 'form' && collection && draft}
    {@const fields = view.fields ? shownFields(view.fields, collection.fields).map((s) => collection.fields.find((f) => f.key === s.key)).filter((f) => f !== undefined) : collection.fields}
    <form class="form" onsubmit={save} data-extension-form>
      {@render fieldInputs(fields, draft)}
      <div class="row"><button type="submit" class="primary" data-extension-save>{t.ext.save}</button></div>
    </form>
  {:else if view.type === 'report'}
    <div class="ranges" role="group" aria-label={word(view.title ?? '')}>
      {#each ranges as r (r)}
        <button type="button" aria-pressed={range === r} onclick={() => loadReport(r)} data-report-range={r}>{RANGE_WORDS[r]()}</button>
      {/each}
    </div>
    {#if report}
      {#if report.totals.length}
        <div class="totals">
          {#each report.totals as total, i (i)}<div class="total" data-report-total={i}><strong>{number(total.value)}</strong><span>{word(total.label)}</span></div>{/each}
        </div>
      {/if}
      {#if report.chart}
        {@const chart = report.chart}
        {@const top = Math.max(1, ...chart.series.flatMap((one) => one.values))}
        {@const step = W / chart.labels.length}
        {@const width = (step * 0.76) / chart.series.length}
        <svg class="chart" viewBox="0 0 {W} {H + 18}" role="img" aria-label={chart.series.map((one) => word(one.label)).join(', ')} data-report-chart>
          {#each chart.labels as at, i (i)}
            <g>
              <title>{at}: {chart.series.map((one) => `${word(one.label)} ${number(one.values[i] ?? 0)}`).join(', ')}</title>
              {#each chart.series as one, j (j)}
                <rect data-series={j} x={i * step + step * 0.12 + j * width} {width} y={H - ((one.values[i] ?? 0) / top) * H} height={((one.values[i] ?? 0) / top) * H} />
              {/each}
            </g>
          {/each}
          <text x="0" y={H + 14}>{chart.labels[0]}</text>
          <text x={W} y={H + 14} text-anchor="end">{chart.labels[chart.labels.length - 1]}</text>
        </svg>
        <p class="legend">{#each chart.series as one, j (j)}<span class="key" data-series={j}></span>{word(one.label)} {/each}</p>
      {/if}
      <div class="lists">
        {#each report.lists as list, i (i)}
          {@const most = Math.max(1, ...list.rows.map((r) => r.value))}
          <div class="list" data-report-list={i}>
            <h3>{word(list.title)}</h3>
            {#if list.rows.length}
              <ol>{#each list.rows as row, k (k)}<li style="--share: {(row.value / most) * 100}%"><span class="name">{word(row.label)}</span><span class="hits">{number(row.value)}</span></li>{/each}</ol>
            {:else}
              <p class="hint">{t.ext.empty}</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {:else if view.type === 'calendar' && collection}
    {@const shownMonth = monthOf(month, rows, view.date)}
    {#if draft}
      <form class="form" onsubmit={save} data-extension-form>
        {@render fieldInputs(collection.fields, draft)}
        <div class="row">
          <button type="submit" class="primary" data-extension-save>{t.ext.save}</button>
          <button type="button" class="quiet" onclick={() => (draft = null)}>{t.ext.cancel}</button>
        </div>
      </form>
    {/if}
    <div class="row month">
      <button type="button" class="quiet" onclick={() => (month = nextMonth(month, -1))} aria-label={t.ext.earlier} data-calendar-earlier>‹</button>
      <strong data-calendar-month={month}>{monthName(month)}</strong>
      <button type="button" class="quiet" onclick={() => (month = nextMonth(month, 1))} aria-label={t.ext.later} data-calendar-later>›</button>
    </div>
    <table class="calendar">
      <thead><tr>{#each weekdays as day (day)}<th>{day}</th>{/each}</tr></thead>
      <tbody>
        {#each shownMonth.weeks as week, w (w)}
          <tr>
            {#each week as day, d (d)}
              <td class:out={!day} data-day={day || undefined}>
                {#if day}
                  <span class="date">{Number(day.slice(8))}</span>
                  {#each shownMonth.on[day] ?? [] as row (row.id)}
                    {@const named = `${timeOf(row[view.date])} ${shown(row[view.name])}`.trim()}
                    {#if view.edit !== false}
                      <button type="button" class="quiet item" onclick={() => collection && (draft = { id: String(row.id), row: editable(row, collection.fields) })} data-calendar-row={row.id}>{named}</button>
                    {:else}
                      <span class="item" data-calendar-row={row.id}>{named}</span>
                    {/if}
                  {/each}
                  {#if view.create !== false}
                    {@const date = view.date}
                    <button type="button" class="quiet add" aria-label={t.ext.add} onclick={() => collection && (draft = { id: null, row: { ...blank(collection.fields), [date]: collection.fields.find((f) => f.key === date)?.kind === 'datetime' ? `${day}T09:00` : day } })} data-calendar-add={day}>+</button>
                  {/if}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {:else if view.type === 'list' && collection}
    {@const columns = shownFields(view.fields, collection.fields)}
    {#if draft}
      <form class="form" onsubmit={save} data-extension-form>
        {@render fieldInputs(collection.fields, draft)}
        <div class="row">
          <button type="submit" class="primary" data-extension-save>{t.ext.save}</button>
          <button type="button" class="quiet" onclick={() => (draft = null)}>{t.ext.cancel}</button>
        </div>
      </form>
    {:else if view.create !== false}
      <button type="button" class="primary" onclick={() => (draft = { id: null, row: blank(collection.fields) })} data-extension-add>+ {t.ext.add}</button>
    {/if}
    {@const shownRows = listRows(rows, view.filter, view.sort)}
    {#if shownRows.length === 0}
      <p class="hint">{t.ext.empty}</p>
    {:else}
      <table>
        <thead>
          <tr>
            {#each columns as column (column.key)}<th>{labelOf(column.key, column.label)}</th>{/each}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each shownRows as row (row.id)}
            <tr data-row={row.id}>
              {#each columns as column (column.key)}
                <td>
                  {#if column.display === 'badge' && row[column.key] !== null && row[column.key] !== ''}
                    <span class="badge" data-tone={column.tones[String(row[column.key])] ?? 'neutral'}>{word(shown(row[column.key]))}</span>
                  {:else}{shown(row[column.key])}{/if}
                </td>
              {/each}
              <td class="end">
                {@render buttons(view.rowActions ?? [], row)}
                {#if view.edit !== false}<button type="button" class="quiet" onclick={() => collection && (draft = { id: String(row.id), row: editable(row, collection.fields) })} data-extension-edit>{t.ext.edit}</button>{/if}
                {#if view.delete !== false}
                  {#if pending?.key === `delete/${String(row.id)}`}
                    <button type="button" class="quiet" data-tone="danger" onclick={() => attempt(async () => void ((rows = (await api.deleteExtensionRow(extension.name, collection?.name ?? '', String(row.id))).rows), (pending = null)))} data-extension-delete-sure>{t.ext.sure}</button>
                  {:else}
                    <button type="button" class="quiet" onclick={() => (pending = { key: `delete/${String(row.id)}`, button: { label: '', action: '' }, row, answers: {}, asked: true })} data-extension-delete>{t.ext.delete}</button>
                  {/if}
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</div>

<style>
  h2 { margin: 1rem 0 0.4rem; font-size: 1.05rem; }
  .form { display: grid; gap: 0.7rem; max-width: 36rem; margin: 1rem 0; padding: 1rem; background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  .ask { display: inline-grid; gap: 0.4rem; padding: 0.5rem; background: var(--secondary-container); border-radius: var(--shape-sm); }
  .field { display: grid; gap: 0.3rem; }
  .row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .toolbar { margin: 0.6rem 0; }
  .tabs { display: flex; gap: 0.3rem; margin: 0.8rem 0 0.2rem; border-bottom: 1px solid var(--outline-variant); }
  .tabs button { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
  .tabs button.on { background: var(--secondary-container); border-color: var(--primary); }
  table { margin-top: 1rem; border-collapse: collapse; min-width: 30rem; background: var(--surface-lowest); }
  th, td { padding: 0.45rem 0.7rem; border-bottom: 1px solid var(--outline-variant); text-align: start; }
  .end { text-align: end; white-space: nowrap; }
  .badge { display: inline-block; padding: 0.05rem 0.45rem; border-radius: var(--shape-full); background: var(--surface-container); font-size: 0.85rem; }
  [data-tone='success'] { color: var(--success); }
  [data-tone='warning'] { color: var(--warning); }
  [data-tone='danger'] { color: var(--error); }
  [data-tone='muted'] { color: var(--on-surface-variant); }
  .view button.quiet[data-tone='success'] { color: var(--success); }
  .view button.quiet[data-tone='warning'] { color: var(--warning); }
  .view button.quiet[data-tone='danger'] { color: var(--error); }
  .badge[data-tone='success'] { background: var(--success-container); }
  .badge[data-tone='warning'] { background: var(--warning-container); }
  .badge[data-tone='danger'] { background: var(--error-container); }
  .good { color: var(--success); }
  .reveal { margin: 0.6rem 0; padding: 0.6rem 0.8rem; background: var(--warning-container); border: 1px solid var(--warning); border-radius: var(--shape-sm); }
  .reveal code { overflow-wrap: anywhere; }
  h3 { font-size: 0.9rem; margin: 0 0 0.4rem; }
  .ranges { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.8rem 0; }
  .ranges button[aria-pressed='true'] { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  .totals { display: flex; flex-wrap: wrap; gap: 1rem; }
  .total { display: grid; padding: 0.8rem 1.2rem; border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); min-width: 150px; background: var(--surface-lowest); }
  .total strong { font-size: 1.6rem; }
  .total span, .legend, .hint { font-size: 0.8rem; color: var(--on-surface-variant); }
  .chart { width: 100%; max-width: 900px; height: auto; margin-top: 0.5rem; }
  .chart text { font-size: 11px; fill: var(--outline); }
  .chart rect[data-series='0'], .key[data-series='0'] { fill: var(--primary); background: var(--primary); }
  .chart rect[data-series='1'], .key[data-series='1'] { fill: var(--primary); background: var(--secondary-container); }
  .chart rect[data-series='2'], .key[data-series='2'] { fill: var(--success); background: var(--success); }
  .chart rect, .key { fill: var(--outline); background: var(--surface-container); }
  .legend { display: flex; align-items: center; gap: 0.3rem; }
  .key { display: inline-block; width: 10px; height: 10px; border-radius: var(--shape-xs); margin-inline-start: 0.6rem; }
  .lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.2rem; margin-top: 1.4rem; }
  .list ol { list-style: none; padding: 0; margin: 0; }
  .list li { display: flex; justify-content: space-between; gap: 0.6rem; padding: 0.3rem 0.5rem; margin-bottom: 2px; font-size: 0.85rem; border-radius: var(--shape-xs); background: linear-gradient(to right, var(--secondary-container) var(--share), transparent var(--share)); }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hits { font-variant-numeric: tabular-nums; }
  .month { align-items: center; margin: 0.8rem 0 0; }
  .calendar { table-layout: fixed; width: 100%; max-width: 980px; min-width: 0; }
  .calendar td { vertical-align: top; height: 5.5rem; padding: 0.3rem; border: 1px solid var(--outline-variant); }
  .calendar td.out { background: var(--surface-low); }
  .calendar .date { display: block; font-size: 0.75rem; color: var(--on-surface-variant); }
  .calendar .item { display: block; width: 100%; padding: 0.1rem 0.3rem; margin: 0.15rem 0; text-align: start; font-size: 0.8rem; background: var(--secondary-container); border-radius: var(--shape-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .calendar .add { padding: 0 0.4rem; font-size: 0.8rem; opacity: 0.5; }
  .calendar td:hover .add { opacity: 1; }
</style>
