<script lang="ts">
/** The form for what an entry's content type asks for besides the usual (ADR 0010, ADR 0052): one input for each field, by its kind. */
import { type ContentType, type FileValue, type ImageValue, type LinkValue, MAX_LINKED } from '../core/index.ts';
import type { PostInfo } from './api.ts';
import FileField from './FileField.svelte';
import ImageField from './ImageField.svelte';
import LinkedField from './LinkedField.svelte';
import { t } from './messages.ts';

let {
  type,
  values,
  onchange,
  types = [],
  entries = {},
  own = '',
}: {
  type: ContentType;
  values: Record<string, unknown>;
  onchange: (values: Record<string, unknown>) => void;
  /** The site's types, for the ones a link field leads to. */
  types?: ContentType[];
  /** Each type's entries, by the type's name: what a link field offers. */
  entries?: Record<string, PostInfo[]>;
  /** The address of the entry being edited. */
  own?: string;
} = $props();

const set = (key: string, value: unknown): void => onchange({ ...values, [key]: value });
const text = (key: string): string => (typeof values[key] === 'string' ? (values[key] as string) : '');
const link = (key: string): LinkValue => ({ label: '', href: '', ...((values[key] as LinkValue | null) ?? {}) });
const slugs = (key: string): string[] => (Array.isArray(values[key]) ? (values[key] as string[]) : []);
const yesno = (key: string): string => (values[key] === true ? 'yes' : values[key] === false ? 'no' : '');
</script>

{#each type.fields as field (field.key)}
  <div class="field" data-entry-field={field.key}>
    {#if field.kind === 'image'}
      <ImageField label={field.label} value={(values[field.key] as ImageValue | null) ?? null} onchange={(image) => set(field.key, image.src ? image : null)} />
    {:else if field.kind === 'file'}
      <FileField label={field.label} accept="document" value={(values[field.key] as FileValue | null) ?? null} onchange={(file) => set(field.key, file)} />
    {:else if field.kind === 'entries'}
      <LinkedField
        label={field.label}
        type={types.find((one) => one.id === field.to)}
        entries={entries[field.to ?? ''] ?? []}
        value={slugs(field.key)}
        max={field.many ? MAX_LINKED : 1}
        own={field.to === type.id ? own : ''}
        onchange={(next) => set(field.key, next)}
      />
    {:else if field.kind === 'link'}
      <fieldset>
        <legend>{field.label}</legend>
        <label><span>{t.inspector.linkLabel}</span><input type="text" maxlength="80" value={link(field.key).label} oninput={(e) => set(field.key, { ...link(field.key), label: e.currentTarget.value })} /></label>
        <label><span>{t.inspector.linkHref}</span><input type="text" value={link(field.key).href} placeholder="https://… /contact/" onchange={(e) => set(field.key, { ...link(field.key), href: e.currentTarget.value.trim() })} /></label>
        <label class="check"><input type="checkbox" checked={link(field.key).nofollow === true} onchange={(e) => set(field.key, { ...link(field.key), nofollow: e.currentTarget.checked ? true : undefined })} data-link-nofollow /><span>{t.format.linkNofollow}</span></label>
      </fieldset>
    {:else}
      <label>
        <span>{field.label}</span>
        {#if field.kind === 'longtext'}
          <textarea rows="3" maxlength="2000" value={text(field.key)} onchange={(e) => set(field.key, e.currentTarget.value)}></textarea>
        {:else if field.kind === 'date'}
          <input type="date" value={text(field.key)} onchange={(e) => set(field.key, e.currentTarget.value)} />
        {:else if field.kind === 'number'}
          <input type="text" inputmode="decimal" value={typeof values[field.key] === 'number' || typeof values[field.key] === 'string' ? String(values[field.key]) : ''} onchange={(e) => set(field.key, e.currentTarget.value)} />
        {:else if field.kind === 'yesno'}
          <select value={yesno(field.key)} onchange={(e) => set(field.key, e.currentTarget.value === 'yes' ? true : e.currentTarget.value === 'no' ? false : null)}>
            <option value="">{t.ctypes.unset}</option>
            <option value="yes">{t.ctypes.yes}</option>
            <option value="no">{t.ctypes.no}</option>
          </select>
        {:else if field.kind === 'choice'}
          <select value={text(field.key)} onchange={(e) => set(field.key, e.currentTarget.value)}>
            <option value="">{t.ctypes.unset}</option>
            {#each field.options ?? [] as option (option)}<option value={option}>{option}</option>{/each}
          </select>
        {:else}
          <input type="text" maxlength="300" value={text(field.key)} onchange={(e) => set(field.key, e.currentTarget.value)} />
        {/if}
      </label>
    {/if}
  </div>
{/each}

<style>
  .check { display: flex; align-items: center; gap: var(--sp-2); }
</style>
