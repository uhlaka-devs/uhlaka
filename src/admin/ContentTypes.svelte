<script lang="ts">
/**
 * The content types of the site (ADR 0010): what kinds of entry it keeps
 * besides pages. A type is made here from a name and a few choices; nothing
 * about it is code.
 */
import { type ContentType, contentTypes, ENTRY_EXTRAS, ENTRY_SCHEMAS, type EntrySchema, type FieldMeaning, meaningsFor, languageName, prefixOf, READY_LAYOUTS, type TypeTranslation, STANDARD, type Site, slugify, TYPE_FIELD_KINDS, type TypeField, type TypeFieldKind } from '../core/index.ts';
import type { SectionInfo } from './api.ts';
import Audience from './Audience.svelte';
import { layoutName } from './layouts.ts';
import { say, t } from './messages.ts';

let {
  site,
  counts,
  templates = {},
  terms = {},
  onsave,
  ondesign,
  shop = false,
  sections = [],
}: {
  site: Site;
  /** The sections a type may draw after each entry (ADR 0085 d8). */
  sections?: SectionInfo[];
  /** The shop is on (ADR 0065 d10): a type may sell. */
  shop?: boolean;
  counts: Record<string, number>;
  /** Which types have a page of their own (ADR 0015). */
  templates?: Record<string, { custom: boolean }>;
  /** The categories and tags each type's entries use: what a language writes its own way (ADR 0054 d3). */
  terms?: Record<string, string[]>;
  /** Resolves to a reason when the site refuses. */
  onsave: (types: ContentType[]) => Promise<string>;
  /** Opens the page a type shows its entries in. */
  ondesign: (id: string) => void;
} = $props();

/** The type being made or changed, as it is being typed; null while the list shows. */
let draft = $state<ContentType | null>(null);
/** The name of the type being changed; '' for a new one. */
let editing = $state('');
let problem = $state('');

const blank = (): ContentType => ({ id: '', name: '', singular: '', path: '', dated: false, categories: false, feed: false, fields: [] });
const start = (type?: ContentType): void => {
  problem = '';
  editing = type?.id ?? '';
  draft = type ? { ...type, fields: type.fields.map((f) => ({ ...f })) } : blank();
};
const patch = (change: Partial<ContentType>): void => {
  if (draft) draft = { ...draft, ...change };
};
/** The types a link field may lead to: the site's, and this one once it has a name the site knows. */
const targets = $derived(contentTypes(site).map((type) => (type.id === editing && draft ? { ...type, name: draft.name || type.name } : type)));
/** A field of another kind: a choice starts with two choices to change, a link with the first type to link to. */
const kindChange = (kind: TypeFieldKind): Partial<TypeField> =>
  kind === 'choice' ? { kind, options: ['1', '2'] } : kind === 'entries' ? { kind, to: targets[0]?.id ?? '' } : { kind };
/** One extra of an entry (ADR 0085 d7): kept only while it differs from before (the author's box on, the rest off). */
const setExtra = (key: (typeof ENTRY_EXTRAS)[number], on: boolean): void => {
  const entry: Record<string, boolean | string> = { ...(draft?.entry ?? {}) };
  if (key === 'author') {
    if (on) delete entry.author;
    else entry.author = false;
  } else if (on) entry[key] = true;
  else delete entry[key];
  patch({ entry: Object.keys(entry).length ? (entry as ContentType['entry']) : undefined });
};
/** The section drawn after each entry (ADR 0085 d8), or none. */
const setSection = (slug: string): void => {
  const entry = { ...(draft?.entry ?? {}) };
  if (slug) entry.section = slug;
  else delete entry.section;
  patch({ entry: Object.keys(entry).length ? entry : undefined });
};
const patchField = (i: number, change: Partial<TypeField>): void => patch({ fields: (draft?.fields ?? []).map((f, j) => (j === i ? { ...f, ...change } : f)) });

/** A type's name, address and words in a language, as typed (ADR 0054 d3). */
const translationOf = (language: string): TypeTranslation => draft?.translations?.[language] ?? { name: '', singular: '', path: '', words: {} };
const patchTranslation = (language: string, change: Partial<TypeTranslation>): void =>
  patch({ translations: { ...(draft?.translations ?? {}), [language]: { ...translationOf(language), ...change } } });
/** What a language may write its own way: the categories and tags in use, and each choice. */
const words = $derived(draft ? [...new Set([...(terms[editing] ?? []), ...draft.fields.flatMap((f) => (f.kind === 'choice' ? (f.options ?? []) : []))].filter((w) => w.trim()))] : []);

async function save(): Promise<void> {
  if (!draft) return;
  const next = { ...draft, path: slugify(draft.path) || slugify(draft.name) };
  const others = site.types.filter((type) => type.id !== editing);
  problem = await onsave(editing ? site.types.map((type) => (type.id === editing ? next : type)) : [...others, next]);
  if (!problem) draft = null;
}

async function remove(): Promise<void> {
  problem = await onsave(site.types.filter((type) => type.id !== editing));
  if (!problem) draft = null;
}
</script>

<section class="screen" data-list="types">
  <header>
    <h1>{t.ctypes.heading}</h1>
    {#if !draft}<button type="button" class="primary" onclick={() => start()} data-new-type>+ {t.ctypes.add}</button>{/if}
  </header>
  {#if !draft}
    <p class="hint intro">{t.ctypes.intro}</p>
    <table>
      <thead>
        <tr><th>{t.inspector.title}</th><th>{t.list.address}</th><th></th><th></th></tr>
      </thead>
      <tbody>
        {#each contentTypes(site) as type (type.id)}
          <tr data-type={type.id}>
            <td>
              <button type="button" class="open" onclick={() => start(type)}>{type.name}</button>
            </td>
            <td class="quiet">/{type.path}/</td>
            <td class="quiet">{say(t.ctypes.entries, { count: counts[type.id] ?? 0 })}</td>
            <td class="end"><button type="button" onclick={() => ondesign(type.id)} data-design={type.id}>{t.design.open}</button>{#if templates[type.id]?.custom}<small>{t.design.custom}</small>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <form
      class="type"
      onsubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label class="field">
        <span>{t.ctypes.name}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" maxlength="60" value={draft.name} oninput={(e) => patch({ name: e.currentTarget.value })} autofocus data-type-name />
      </label>
      <label class="field">
        <span>{t.ctypes.singular}</span>
        <input type="text" maxlength="60" value={draft.singular} oninput={(e) => patch({ singular: e.currentTarget.value })} data-type-singular />
      </label>
      <label class="field">
        <span>{t.ctypes.path}</span>
        <input type="text" maxlength="80" value={draft.path} placeholder={slugify(draft.name)} oninput={(e) => patch({ path: e.currentTarget.value })} data-type-path />
        <small>/{slugify(draft.path) || slugify(draft.name) || '…'}/ · {t.ctypes.pathHint}</small>
      </label>
      <label class="check"><input type="checkbox" checked={draft.dated} onchange={(e) => patch({ dated: e.currentTarget.checked, feed: e.currentTarget.checked && (draft?.feed ?? false) })} data-type-dated /><span>{t.ctypes.dated}</span></label>
      <label class="check"><input type="checkbox" checked={draft.categories} onchange={(e) => patch({ categories: e.currentTarget.checked })} data-type-categories /><span>{t.ctypes.categories}</span></label>
      <label class="check" class:off={!draft.dated}><input type="checkbox" disabled={!draft.dated} checked={draft.feed} onchange={(e) => patch({ feed: e.currentTarget.checked })} /><span>{t.ctypes.feed}</span></label>
      <label class="check"><input type="checkbox" checked={draft.comments === true} onchange={(e) => patch({ comments: e.currentTarget.checked ? true : undefined })} data-type-comments /><span>{t.ctypes.comments}</span></label>
      <fieldset class="field" data-type-entry>
        <legend>{t.ctypes.entryShows}</legend>
        {#each ENTRY_EXTRAS as key (key)}
          <label class="check"><input type="checkbox" checked={key === 'author' ? draft.entry?.author !== false : draft.entry?.[key] === true} onchange={(e) => setExtra(key, e.currentTarget.checked)} data-type-extra={key} /><span>{t.ctypes.extras[key]}</span></label>
        {/each}
        {#if sections.length || draft.entry?.section}
          <label class="field">
            <span>{t.ctypes.afterSection}</span>
            <select value={draft.entry?.section ?? ''} onchange={(e) => setSection(e.currentTarget.value)} data-type-section>
              <option value="">{t.blogLook.noSection}</option>
              {#each sections as section (section.slug)}<option value={section.slug}>{section.title}</option>{/each}
            </select>
          </label>
        {/if}
      </fieldset>
      {#if editing}{#key editing}<Audience kind="type" key={editing} />{/key}{/if}

      <label class="field">
        <span>{t.layouts.ofType}</span>
        <select value={draft.layout ?? STANDARD} onchange={(e) => patch({ layout: e.currentTarget.value === STANDARD ? undefined : e.currentTarget.value })} data-type-layout>
          {#each site.layouts ?? READY_LAYOUTS as layout (layout.id)}<option value={layout.id}>{layoutName(layout)}</option>{/each}
        </select>
      </label>

      {#if shop || draft.sells}
        <label class="check"><input type="checkbox" checked={draft.sells === true} onchange={(e) => patch(e.currentTarget.checked ? { sells: true, schema: 'product' } : { sells: undefined })} data-type-sells /><span>{t.shop.sells}</span></label>
        <small>{t.shop.sellsHint}</small>
      {/if}
      {#if !draft.sells}
      <label class="field">
        <span>{t.ctypes.schema}</span>
        <select value={draft.schema ?? ''} onchange={(e) => patch({ schema: (e.currentTarget.value || undefined) as EntrySchema | undefined })} data-type-schema>
          <option value="">{draft.dated ? t.ctypes.schemaArticle : t.ctypes.schemaNone}</option>
          {#each ENTRY_SCHEMAS as schema}<option value={schema}>{t.ctypes.schemas[schema]}</option>{/each}
        </select>
        <small>{t.ctypes.schemaHint}</small>
      </label>
      {/if}

      <h2>{t.ctypes.fields}</h2>
      <p class="hint">{t.ctypes.fieldsHint}</p>
      {#each draft.fields as field, i (i)}
        <div class="row" data-type-field>
          <input type="text" maxlength="60" value={field.label} placeholder={t.ctypes.fieldLabel} aria-label={t.ctypes.fieldLabel} oninput={(e) => patchField(i, { label: e.currentTarget.value })} />
          <select value={field.kind} aria-label={t.inspector.content} onchange={(e) => patchField(i, kindChange(e.currentTarget.value as TypeFieldKind))} data-type-field-kind>
            {#each TYPE_FIELD_KINDS as kind}<option value={kind}>{t.ctypes.kinds[kind]}</option>{/each}
          </select>
          <button type="button" class="quiet" onclick={() => patch({ fields: (draft?.fields ?? []).filter((_, j) => j !== i) })} aria-label={t.inspector.remove} title={t.inspector.remove}>✕</button>
          {#if meaningsFor(draft.schema, field.kind).length}
            <label class="more">
              <span>{t.ctypes.means}</span>
              <select value={field.means ?? ''} onchange={(e) => patchField(i, { means: (e.currentTarget.value || undefined) as FieldMeaning | undefined })} data-type-field-means>
                <option value="">{t.ctypes.meansNothing}</option>
                {#each meaningsFor(draft.schema, field.kind) as meaning}<option value={meaning}>{t.ctypes.meanings[meaning]}</option>{/each}
              </select>
            </label>
          {/if}
          {#if field.kind === 'choice'}
            <label class="more">
              <span>{t.ctypes.choices}</span>
              <textarea rows="3" value={(field.options ?? []).join('\n')} onchange={(e) => patchField(i, { options: e.currentTarget.value.split('\n') })} data-type-field-choices></textarea>
            </label>
          {:else if field.kind === 'entries'}
            <div class="more">
              <label>
                <span>{t.ctypes.linksTo}</span>
                <select value={field.to ?? ''} onchange={(e) => patchField(i, { to: e.currentTarget.value })} data-type-field-to>
                  {#each targets as target (target.id)}<option value={target.id}>{target.name}</option>{/each}
                </select>
              </label>
              <label class="check"><input type="checkbox" checked={field.many === true} onchange={(e) => patchField(i, { many: e.currentTarget.checked ? true : undefined })} data-type-field-many /><span>{t.ctypes.many}</span></label>
            </div>
          {/if}
        </div>
      {/each}
      <button type="button" onclick={() => patch({ fields: [...(draft?.fields ?? []), { key: '', label: '', kind: 'text' }] })} data-type-add-field>+ {t.ctypes.addField}</button>

      {#each site.languages as language (language)}
        {@const own = translationOf(language)}
        {@const label = languageName(language)}
        <h2>{say(t.ctypes.inLanguage, { language: label })}</h2>
        <p class="hint">{say(t.ctypes.inLanguageHint, { language: label })}</p>
        <div class="language" data-type-language={language}>
          <label class="field">
            <span>{t.ctypes.name}</span>
            <input type="text" maxlength="60" value={own.name} placeholder={draft.name} oninput={(e) => patchTranslation(language, { name: e.currentTarget.value })} data-type-language-name />
          </label>
          <label class="field">
            <span>{t.ctypes.singular}</span>
            <input type="text" maxlength="60" value={own.singular} placeholder={draft.singular} oninput={(e) => patchTranslation(language, { singular: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span>{t.ctypes.path}</span>
            <input type="text" maxlength="80" value={own.path} placeholder={slugify(draft.path) || slugify(draft.name)} oninput={(e) => patchTranslation(language, { path: e.currentTarget.value })} data-type-language-path />
            <small>/{prefixOf(language)}/{slugify(own.path) || slugify(draft.path) || slugify(draft.name) || '…'}/</small>
          </label>
          {#if words.length}
            <p class="hint">{t.ctypes.words}: {t.ctypes.wordsHint}</p>
            {#each words as word (word)}
              <label class="word">
                <span>{word}</span>
                <input type="text" maxlength="60" value={own.words[word] ?? ''} placeholder={word} oninput={(e) => patchTranslation(language, { words: { ...own.words, [word]: e.currentTarget.value } })} data-type-word={word} />
              </label>
            {/each}
          {/if}
        </div>
      {/each}

      {#if problem}<p class="bad" role="alert">{problem}</p>{/if}
      <div class="actions">
        <button type="submit" class="primary" disabled={!slugify(draft.name)} data-type-save>{t.ctypes.save}</button>
        <button type="button" class="quiet" onclick={() => (draft = null)}>{t.app.cancel}</button>
        {#if editing}<button type="button" class="danger" onclick={remove}>{t.ctypes.remove}</button>{/if}
      </div>
    </form>
  {/if}
</section>

<style>
  header { display: flex; align-items: center; gap: var(--sp-4); margin-bottom: var(--sp-4); }
  h1 { margin: 0; font-size: var(--size-2xl); flex: 1; }
  h2 { margin: var(--sp-5) 0 0.2rem; font-size: var(--size-s); letter-spacing: 0.06em; text-transform: uppercase; color: var(--on-surface-variant); }
  .intro { max-width: 44rem; margin-bottom: var(--sp-4); }
  table { width: 100%; border-collapse: collapse; background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); overflow: hidden; }
  th, td { padding: var(--sp-2) var(--sp-3); text-align: start; border-bottom: 1px solid var(--outline-variant); }
  th { font-size: var(--size-s); letter-spacing: 0.05em; text-transform: uppercase; color: var(--on-surface-variant); font-weight: 600; }
  tr:last-child td { border-bottom: 0; }
  td.quiet { color: var(--on-surface-variant); }
  td.end { text-align: end; white-space: nowrap; }
  td.end small { display: block; color: var(--on-surface-variant); }
  .open { border: 0 !important; padding: 0 !important; background: none !important; font-weight: 600 !important; color: var(--primary) !important; }
  .type { max-width: 34rem; padding: var(--sp-5); background: var(--surface-lowest); border: 1px solid var(--outline-variant); border-radius: var(--shape-sm); }
  .check { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
  .check span { margin: 0; }
  .check.off { opacity: 0.55; }
  .row { display: grid; grid-template-columns: 1fr 11rem auto; gap: var(--sp-2); margin-bottom: var(--sp-2); }
  .row .more { grid-column: 1 / -1; padding: 0 0 var(--sp-2) var(--sp-4); border-left: 2px solid var(--outline-variant); }
  .row .more label { display: block; margin-bottom: var(--sp-2); }
  .row .more span { display: block; font-size: var(--size-m); color: var(--on-surface-variant); margin-bottom: 0.2rem; }
  .row .more .check span { display: inline; margin: 0; }
  .row textarea, .row select { width: 100%; }
  .language { padding-left: var(--sp-4); border-left: 2px solid var(--outline-variant); }
  .word { display: grid; grid-template-columns: 10rem 1fr; gap: var(--sp-2); align-items: center; margin-bottom: var(--sp-1); }
  .word span { color: var(--on-surface-variant); font-size: var(--size-m); overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; gap: var(--sp-2); align-items: center; margin-top: var(--sp-5); }
  .actions :global(.danger) { margin: 0 0 0 auto !important; }
</style>
