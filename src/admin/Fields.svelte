<script lang="ts">
/** A form for one block's content, generated from the fields its type declares. */
import type { Field, FileValue, ImageValue, TableValue } from '../core/index.ts';
import FileField from './FileField.svelte';
import Self from './Fields.svelte';
import ImageField from './ImageField.svelte';
import TableField from './TableField.svelte';
import { t } from './messages.ts';
import { getPath } from './paths.ts';

let {
  fields,
  content,
  prefix = '',
  sources = [],
  parts = [],
  sections = [],
  forms = [],
  blocks = [],
  onform,
  onchange,
}: {
  fields: Record<string, Field>;
  content: unknown;
  prefix?: string;
  /** The content types a block can list. */ sources?: { id: string; name: string }[];
  /** The parts of an entry a type's page can show. */ parts?: { id: string; name: string }[];
  /** The sections a block can show (ADR 0033). */ sections?: { slug: string; title: string }[];
  /** The forms a block can show (ADR 0049), and how to open one on its screen. */ forms?: { name: string; title: string }[];
  /** The blocks the extensions that are on add (ADR 0062 d6), as `<extension>/<block>`. */ blocks?: { id: string; label: string }[];
  onform?: (name: string) => void;
  onchange: (path: string, value: unknown) => void;
} = $props();

const at = (name: string): string => (prefix ? `${prefix}.${name}` : name);
const text = (name: string): string => (getPath(content, name) as string | undefined) ?? '';
const part = (name: string, key: string): string => ((getPath(content, name) as Record<string, string> | null)?.[key] ?? '') as string;
/** A link field as it stands, its choice for search engines with it (ADR 0058 d6). */
const linkAt = (name: string): { label: string; href: string; nofollow?: true | undefined } => {
  const value = getPath(content, name) as { label?: string; href?: string; nofollow?: true } | null | undefined;
  return { label: value?.label ?? '', href: value?.href ?? '', ...(value?.nofollow ? { nofollow: true as const } : {}) };
};
const list = (name: string): Record<string, unknown>[] => (getPath(content, name) as Record<string, unknown>[] | undefined) ?? [];
const input = (e: Event): string => (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
</script>

{#each Object.entries(fields) as [name, field] (name)}
  <div class="field">
    {#if field.kind === 'text'}
      <label>
        <span>{t.fields[name] ?? name}</span>
        {#if field.code}
          <textarea class="code-input" rows="10" spellcheck="false" autocapitalize="off" maxlength={field.max} value={text(name)} oninput={(e) => onchange(at(name), input(e))} data-field-code></textarea>
        {:else if field.multiline}
          <textarea rows="3" maxlength={field.max} value={text(name)} oninput={(e) => onchange(at(name), input(e))}></textarea>
        {:else}
          <input type="text" maxlength={field.max} value={text(name)} oninput={(e) => onchange(at(name), input(e))} />
        {/if}
      </label>
    {:else if field.kind === 'source'}
      <label>
        <span>{t.fields[name] ?? name}</span>
        <select value={text(name)} onchange={(e) => onchange(at(name), e.currentTarget.value)} data-field-source>
          {#each sources as source}<option value={source.id}>{source.name}</option>{/each}
          {#if !sources.some((s) => s.id === text(name))}<option value={text(name)}>{text(name)}</option>{/if}
        </select>
      </label>
    {:else if field.kind === 'section'}
      <label>
        <span>{t.fields[name] ?? name}</span>
        <select value={text(name)} onchange={(e) => onchange(at(name), e.currentTarget.value)} data-field-section>
          <option value="">{t.sections.pick}</option>
          {#each sections as section (section.slug)}<option value={section.slug}>{section.title}</option>{/each}
        </select>
      </label>
    {:else if field.kind === 'form'}
      <label>
        <span>{t.fields[name] ?? name}</span>
        <select value={text(name)} onchange={(e) => onchange(at(name), e.currentTarget.value)} data-field-form>
          {#each forms as form (form.name)}<option value={form.name}>{form.title}</option>{/each}
          {#if !forms.some((f) => f.name === text(name))}<option value={text(name)}>{t.forms.missing}</option>{/if}
        </select>
      </label>
      {#if onform && forms.some((f) => f.name === text(name))}
        <button type="button" class="quiet" onclick={() => onform(text(name))} data-open-form>{t.forms.open}</button>
      {/if}
    {:else if field.kind === 'extension'}
      <label>
        <span>{t.fields[name] ?? name}</span>
        <select value={text(name)} onchange={(e) => onchange(at(name), e.currentTarget.value)} data-field-extension>
          {#each blocks as one (one.id)}<option value={one.id}>{one.label}</option>{/each}
          {#if !blocks.some((b) => b.id === text(name))}<option value={text(name)}>{t.ext.blockMissing}</option>{/if}
        </select>
      </label>
    {:else if field.kind === 'part'}
      <label>
        <span>{t.fields[name] ?? name}</span>
        <select value={text(name)} onchange={(e) => onchange(at(name), e.currentTarget.value)} data-field-part>
          {#each parts as part}<option value={part.id}>{part.name}</option>{/each}
          {#if !parts.some((p) => p.id === text(name))}<option value={text(name)}>{text(name)}</option>{/if}
        </select>
      </label>
    {:else if field.kind === 'number'}
      <label>
        <span>{t.fields[name] ?? name}</span>
        <input type="number" min={field.min} max={field.max} value={getPath(content, name) as number} onchange={(e) => onchange(at(name), Number(e.currentTarget.value))} />
      </label>
    {:else if field.kind === 'check'}
      <label class="check">
        <input type="checkbox" checked={getPath(content, name) === true} onchange={(e) => onchange(at(name), e.currentTarget.checked)} data-field-check={name} />
        <span>{t.fields[name] ?? name}</span>
      </label>
    {:else if field.kind === 'richtext'}
      <p class="hint">{t.inspector.onPage}</p>
    {:else if field.kind === 'image'}
      <ImageField label={t.fields[name] ?? name} value={(getPath(content, name) as ImageValue | null | undefined) ?? null} onchange={(value) => onchange(at(name), value)} />
    {:else if field.kind === 'file'}
      <FileField label={t.fields[name] ?? name} accept={field.accept} value={(getPath(content, name) as FileValue | null | undefined) ?? null} onchange={(value) => onchange(at(name), value)} />
    {:else if field.kind === 'table'}
      <TableField label={t.fields[name] ?? name} value={(getPath(content, name) as TableValue | null | undefined) ?? null} onchange={(value) => onchange(at(name), value)} />
    {:else if field.kind === 'link'}
      <fieldset>
        <legend>{t.fields[name] ?? name}</legend>
        <label><span>{t.inspector.linkLabel}</span>
          <input type="text" value={part(name, 'label')} oninput={(e) => onchange(at(name), { ...linkAt(name), label: input(e) })} />
        </label>
        <label><span>{t.inspector.linkHref}</span>
          <input type="text" value={part(name, 'href')} oninput={(e) => onchange(at(name), { ...linkAt(name), href: input(e) })} />
        </label>
        <label class="check"><input type="checkbox" checked={linkAt(name).nofollow === true} onchange={(e) => onchange(at(name), { ...linkAt(name), nofollow: e.currentTarget.checked ? true : undefined })} data-link-nofollow />
          <span>{t.format.linkNofollow}</span>
        </label>
      </fieldset>
    {:else if field.kind === 'list'}
      <fieldset>
        <legend>{t.fields[name] ?? name}</legend>
        {#each list(name) as item, i}
          <div class="item">
            <Self fields={field.item} content={item} prefix={at(`${name}.${i}`)} {onchange} />
            <button type="button" class="quiet" onclick={() => onchange(at(name), list(name).filter((_, j) => j !== i))}>{t.inspector.remove}</button>
          </div>
        {/each}
        {#if list(name).length < field.max}
          <button type="button" onclick={() => onchange(at(name), [...list(name), {}])}>{t.inspector.add}</button>
        {/if}
      </fieldset>
    {/if}
  </div>
{/each}

<style>
  .check { display: flex; align-items: center; gap: var(--sp-2); }
  .check span { margin: 0; }
  .code-input { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: var(--size-m); white-space: pre; overflow-x: auto; tab-size: 2; }
</style>
