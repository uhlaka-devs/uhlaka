<script lang="ts">
/**
 * Forms (ADR 0049): built here, shown on pages by the "Form" block. A form
 * has its fields in order, the consent every visitor ticks, and the words
 * around them, written in the main language and translated by field into
 * the others. It is kept when saved; one a page shows is not deleted.
 */
import { onMount } from 'svelte';
import { CHOICE_KINDS, contactForm, emptyForm, type Form, FORM_FIELD_KINDS, type FormFieldKind, type FormTranslation, languageName, nextFieldId, type Site, slugify } from '../core/index.ts';
import { api } from './api.ts';
import { say, t } from './messages.ts';

let { site, open = '', onchange }: { site: Site; open?: string; onchange: (forms: Form[]) => void } = $props();

let forms = $state.raw<Form[]>([]);
let usedOn = $state.raw<Record<string, string[]>>({});
let counts = $state.raw<Record<string, number>>({});
/** The form being changed, as a copy, and the name it had: empty for a new one. */
let editing = $state<Form | null>(null);
let was = $state('');
let language = $state('');
let newTitle = $state('');
let start = $state<'contact' | 'empty'>('contact');
let addKind = $state<FormFieldKind>('text');
let problem = $state('');
let notice = $state('');

const main = $derived(!language || language === site.language);
/** The words the ready forms are made with: the main language's, from the ready Contact form the site has, or English. */
const ready = $derived(forms.find((f) => f.name === 'contact'));

function take(state: { forms: Form[]; usedOn: Record<string, string[]>; counts: Record<string, number> }): void {
  forms = state.forms;
  usedOn = state.usedOn;
  counts = state.counts;
  onchange(state.forms);
}

onMount(async () => {
  try {
    take(await api.forms());
    const asked = forms.find((f) => f.name === open);
    if (asked) edit(asked);
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
});

function edit(form: Form): void {
  editing = structuredClone($state.snapshot(form) as Form);
  was = form.name;
  language = '';
  problem = notice = '';
}

/** A name no form has: from the title, with a number when it is taken. */
function freeName(title: string): string {
  const base = slugify(title).slice(0, 50) || 'form';
  let name = base;
  for (let n = 2; forms.some((f) => f.name === name); n++) name = `${base}-${n}`;
  return name;
}

function create(): void {
  const title = newTitle.trim();
  if (!title) return;
  const words = {
    formTitle: title,
    formName: ready?.fields.find((f) => f.id === 'name')?.label ?? 'Name',
    formEmail: ready?.fields.find((f) => f.id === 'email')?.label ?? 'Email',
    formMessage: ready?.fields.find((f) => f.id === 'message')?.label ?? 'Message',
    formConsent: ready?.consent ?? '',
    formSend: ready?.button ?? '',
    formSent: ready?.sent ?? '',
    formFailed: ready?.failed ?? '',
  };
  const name = freeName(title);
  editing = start === 'contact' ? { ...contactForm(words), name, title } : emptyForm(words, name, title);
  was = '';
  language = '';
  newTitle = '';
  problem = notice = '';
}

async function keep(next: Form[]): Promise<boolean> {
  problem = '';
  try {
    take(await api.setForms(next));
    return true;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
    return false;
  }
}

async function save(): Promise<void> {
  if (!editing) return;
  const form = $state.snapshot(editing) as Form;
  const next = was ? forms.map((f) => (f.name === was ? form : f)) : [...forms, form];
  if (await keep(next)) {
    const kept = forms.find((f) => f.name === form.name);
    if (kept) edit(kept);
    notice = t.forms.saved;
  }
}

async function remove(name: string): Promise<void> {
  await keep(forms.filter((f) => f.name !== name));
}

function addField(): void {
  if (!editing) return;
  const choice = CHOICE_KINDS.includes(addKind);
  editing.fields.push({ id: nextFieldId(editing), kind: addKind, label: t.forms.newField, required: false, options: choice ? ['1', '2'] : [] });
}

function move(i: number, by: number): void {
  if (!editing) return;
  const fields = editing.fields;
  const [field] = fields.splice(i, 1);
  if (field) fields.splice(i + by, 0, field);
}

/** The translation being written, made when the first word of it is. */
function own(): FormTranslation {
  if (!editing) return {};
  editing.translations[language] ??= {};
  return editing.translations[language] as FormTranslation;
}
const words = (key: 'consent' | 'button' | 'sent' | 'failed'): string => (main ? editing?.[key] : editing?.translations[language]?.[key]) ?? '';
function setWords(key: 'consent' | 'button' | 'sent' | 'failed', value: string): void {
  if (!editing) return;
  if (main) editing[key] = value;
  else own()[key] = value;
}
const lines = (value: string): string[] => value.split('\n');
</script>

<section class="screen" data-list="forms">
  {#if editing}
    <header>
      <button type="button" class="quiet" onclick={() => (editing = null)} data-forms-back>← {t.forms.back}</button>
    </header>
    <div class="form-editor" data-form-editor={editing.name}>
      <label class="wide">
        <span>{t.forms.title}</span>
        <input type="text" maxlength="120" bind:value={editing.title} data-form-title />
      </label>
      {#if site.languages.length}
        <label class="wide">
          <span>{t.forms.language}</span>
          <select bind:value={language} data-form-language>
            <option value="">{languageName(site.language)}</option>
            {#each site.languages as other (other)}<option value={other}>{languageName(other)}</option>{/each}
          </select>
        </label>
        {#if !main}<p class="hint">{t.forms.translating}</p>{/if}
      {/if}

      <h2>{t.forms.fields}</h2>
      {#if editing.fields.length === 0}<p class="hint">{t.forms.noFields}</p>{/if}
      <ol class="fields">
        {#each editing.fields as field, i (field.id)}
          <li data-form-field={field.id}>
            {#if main}
              <label>
                <span>{t.forms.label}</span>
                <input type="text" maxlength="200" bind:value={field.label} data-field-label />
              </label>
              <label>
                <span>{t.forms.kind}</span>
                <select bind:value={field.kind} onchange={() => CHOICE_KINDS.includes(field.kind) && field.options.length === 0 && (field.options = ['1', '2'])} data-field-kind>
                  {#each FORM_FIELD_KINDS as kind (kind)}<option value={kind}>{t.forms.kinds[kind] ?? kind}</option>{/each}
                </select>
              </label>
              <label class="tick"><input type="checkbox" bind:checked={field.required} data-field-required /> {t.forms.required}</label>
              {#if CHOICE_KINDS.includes(field.kind)}
                <label class="wide">
                  <span>{t.forms.options}</span>
                  <textarea rows="4" value={field.options.join('\n')} oninput={(e) => (field.options = lines(e.currentTarget.value))} data-field-options></textarea>
                </label>
              {/if}
              <div class="tools">
                <button type="button" class="quiet" disabled={i === 0} onclick={() => move(i, -1)} data-field-up>{t.forms.up}</button>
                <button type="button" class="quiet" disabled={i === editing.fields.length - 1} onclick={() => move(i, 1)} data-field-down>{t.forms.down}</button>
                <button type="button" class="quiet" onclick={() => editing?.fields.splice(i, 1)} data-field-remove>{t.forms.remove}</button>
              </div>
            {:else}
              <label class="wide">
                <span>{field.label}</span>
                <input type="text" maxlength="200" placeholder={field.label} value={editing.translations[language]?.labels?.[field.id] ?? ''} oninput={(e) => ((own().labels ??= {})[field.id] = e.currentTarget.value)} data-field-label />
              </label>
              {#if CHOICE_KINDS.includes(field.kind)}
                <label class="wide">
                  <span>{t.forms.options}</span>
                  <textarea rows="4" placeholder={field.options.join('\n')} value={(editing.translations[language]?.options?.[field.id] ?? []).join('\n')} oninput={(e) => ((own().options ??= {})[field.id] = lines(e.currentTarget.value))} data-field-options></textarea>
                </label>
              {/if}
            {/if}
          </li>
        {/each}
      </ol>
      {#if main}
        <div class="add">
          <select bind:value={addKind} data-add-kind>
            {#each FORM_FIELD_KINDS as kind (kind)}<option value={kind}>{t.forms.kinds[kind] ?? kind}</option>{/each}
          </select>
          <button type="button" onclick={addField} data-add-field>{t.forms.addField}</button>
        </div>
      {/if}

      <label class="wide">
        <span>{t.forms.consent}</span>
        <textarea rows="3" maxlength="600" placeholder={main ? '' : editing.consent} value={words('consent')} oninput={(e) => setWords('consent', e.currentTarget.value)} data-form-consent></textarea>
        <small class="hint">{t.forms.consentHint}</small>
      </label>
      <label class="wide">
        <span>{t.forms.button}</span>
        <input type="text" maxlength="60" placeholder={main ? '' : editing.button} value={words('button')} oninput={(e) => setWords('button', e.currentTarget.value)} data-form-button />
      </label>
      <label class="wide">
        <span>{t.forms.sent}</span>
        <input type="text" maxlength="300" placeholder={main ? '' : editing.sent} value={words('sent')} oninput={(e) => setWords('sent', e.currentTarget.value)} data-form-sent />
      </label>
      <label class="wide">
        <span>{t.forms.failed}</span>
        <input type="text" maxlength="300" placeholder={main ? '' : editing.failed} value={words('failed')} oninput={(e) => setWords('failed', e.currentTarget.value)} data-form-failed />
      </label>
      <p><button type="button" onclick={save} data-form-save>{t.forms.save}</button></p>
      {#if notice}<p class="hint" role="status" data-form-saved>{notice}</p>{/if}
      {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
    </div>
  {:else}
    <header>
      <h1>{t.forms.heading}</h1>
    </header>
    <p class="hint">{t.forms.intro}</p>
    {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
    <ul class="forms">
      {#each forms as form (form.name)}
        <li data-form={form.name}>
          <p><strong>{form.title}</strong> <small>{say(t.forms.count, { count: counts[form.name] ?? 0 })}</small></p>
          <p class="hint">{usedOn[form.name]?.length ? `${t.forms.usedOn}: ${usedOn[form.name]?.join(', ')}` : t.forms.unused}</p>
          <div class="tools">
            <button type="button" onclick={() => edit(form)} data-form-edit>{t.forms.edit}</button>
            <button type="button" class="quiet" onclick={() => remove(form.name)} data-form-delete>{t.forms.delete}</button>
          </div>
        </li>
      {/each}
    </ul>
    <h2>{t.forms.add}</h2>
    <div class="add">
      <input type="text" maxlength="120" placeholder={t.forms.newName} bind:value={newTitle} data-new-form />
      <label>{t.forms.startFrom}
        <select bind:value={start} data-new-form-start>
          <option value="contact">{t.forms.fromContact}</option>
          <option value="empty">{t.forms.fromEmpty}</option>
        </select>
      </label>
      <button type="button" disabled={!newTitle.trim()} onclick={create} data-create-form>{t.forms.create}</button>
    </div>
  {/if}
</section>

<style>
  header { margin-bottom: var(--sp-2); }
  h1 { margin: 0; font-size: var(--size-2xl); }
  h2 { margin: var(--sp-6) 0 var(--sp-2); font-size: var(--size-l); }
  .forms { list-style: none; margin: var(--sp-4) 0 0; padding: 0; display: grid; gap: var(--sp-3); max-width: 46rem; }
  .forms li, .fields li { padding: var(--sp-4) var(--sp-4); background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  .forms p { margin: 0 0 var(--sp-1); }
  .forms small { color: var(--on-surface-variant); margin-inline-start: var(--sp-2); }
  .form-editor { max-width: 46rem; display: grid; gap: var(--sp-3); }
  .form-editor label { display: grid; gap: var(--sp-1); }
  .form-editor label > span { font-weight: 600; font-size: var(--size-m); }
  .fields { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-2); }
  .fields li { display: grid; grid-template-columns: 1fr 14rem; gap: var(--sp-2) var(--sp-4); align-items: end; }
  .fields .wide, .fields .tools { grid-column: 1 / -1; }
  .tick { display: flex !important; gap: var(--sp-2); align-items: center; }
  .tools, .add { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
  .add input { flex: 1 1 14rem; }
  .add select { width: auto; }
  @media (max-width: 40rem) { .fields li { grid-template-columns: 1fr; } }
</style>
