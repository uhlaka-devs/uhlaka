<script lang="ts">
/**
 * Text and buttons (ADR 0085 d5): how headings, text, the menu, buttons and a
 * form's fields look under the style. Headings and buttons first; the rest
 * under "More settings". Every choice is a name from a closed list.
 */
import { BUTTON_LOOKS, FIELD_LOOKS, TEXT_KEYS, TEXT_LINES, TEXT_PARTS, TEXT_PHONE, TEXT_SPACINGS, TEXT_WEIGHTS, type TextLook, type TextPart, type Theme } from '../core/index.ts';
import { t } from './messages.ts';
import { tryTheme } from './themeEdit.ts';

let { theme, ontheme }: { theme: Theme; ontheme: (theme: Theme) => void } = $props();

let problem = $state('');
function apply(mutate: (draft: Theme) => void): void {
  const tried = tryTheme(theme, mutate, t.style.invalid);
  problem = tried.problem;
  if (tried.theme) ontheme(tried.theme);
}

const OPTIONS: Record<keyof TextLook, readonly string[]> = { weight: TEXT_WEIGHTS, line: TEXT_LINES, spacing: TEXT_SPACINGS, case: ['none', 'upper'] };
/** What a kind of text has; absent is how it looked before: normal, and no capitals. */
const valueOf = (part: TextPart, key: keyof TextLook): string => theme.layout.text[part]?.[key] ?? (key === 'case' ? 'none' : 'normal');

/** One look of one kind of text; the value of before is kept as an absence. */
const setText = (part: TextPart, key: keyof TextLook, value: string): void =>
  apply((d) => {
    const look: Record<string, string> = { ...(d.layout.text[part] ?? {}) };
    if (value === 'normal' || value === 'none') delete look[key];
    else look[key] = value;
    if (Object.keys(look).length) d.layout.text[part] = look as TextLook;
    else delete d.layout.text[part];
  });
const setPhone = (value: string): void =>
  apply((d) => {
    if (value === TEXT_PHONE[0]) delete d.layout.text.phone;
    else d.layout.text.phone = value as 'smaller' | 'much-smaller';
  });
const setButton = (key: 'look' | 'hover', value: string): void =>
  apply((d) => {
    if (!value || value === BUTTON_LOOKS[0]) delete d.layout.button[key];
    else (d.layout.button as Record<string, string>)[key] = value;
  });
const setField = (value: string): void =>
  apply((d) => {
    if (value === FIELD_LOOKS[0]) delete d.layout.field.look;
    else d.layout.field.look = value as 'underline' | 'filled';
  });
</script>

<p class="hint">{t.text.intro}</p>
{#if problem}<p class="problem" role="alert">{problem}</p>{/if}

{#snippet look(part: TextPart, keys: readonly (keyof TextLook)[])}
  {#each keys as key (key)}
    {#if key === 'case'}
      <label class="check">
        <input type="checkbox" checked={valueOf(part, 'case') === 'upper'} onchange={(e) => setText(part, 'case', e.currentTarget.checked ? 'upper' : 'none')} data-text={`${part}.case`} />
        <span>{t.text.upper}</span>
      </label>
    {:else}
      <label class="field">
        <span>{t.text.keys[key]}</span>
        <select value={valueOf(part, key)} onchange={(e) => setText(part, key, e.currentTarget.value)} data-text={`${part}.${key}`}>
          {#each OPTIONS[key] as name (name)}<option value={name}>{t.text.values[key]?.[name] ?? name}</option>{/each}
        </select>
      </label>
    {/if}
  {/each}
{/snippet}

<h3>{t.text.parts.heading}</h3>
{@render look('heading', ['weight', 'case'])}

<fieldset class="field" data-button-look>
  <legend>{t.text.buttons}</legend>
  <div class="choices">
    {#each BUTTON_LOOKS as name (name)}
      <label class="choice" class:on={(theme.layout.button.look ?? 'filled') === name}>
        <input type="radio" name="button-look" value={name} checked={(theme.layout.button.look ?? 'filled') === name} onchange={() => setButton('look', name)} data-button={name} />
        <span class="pic {name}" aria-hidden="true">Aa</span>
        <span>{t.text.buttonLooks[name]}</span>
      </label>
    {/each}
  </div>
</fieldset>

<details class="more" data-text-more>
  <summary>{t.look.more}</summary>
  {@render look('heading', ['line', 'spacing'])}
  <label class="field">
    <span>{t.text.phone}</span>
    <select value={theme.layout.text.phone ?? TEXT_PHONE[0]} onchange={(e) => setPhone(e.currentTarget.value)} data-text-phone>
      {#each TEXT_PHONE as name (name)}<option value={name}>{t.text.phones[name]}</option>{/each}
    </select>
  </label>
  {#each TEXT_PARTS.filter((p) => p !== 'heading') as part (part)}
    <h3>{t.text.parts[part]}</h3>
    {@render look(part, TEXT_KEYS[part])}
  {/each}
  <label class="field">
    <span>{t.text.hover}</span>
    <select value={theme.layout.button.hover ?? ''} onchange={(e) => setButton('hover', e.currentTarget.value)} data-button-hover>
      <option value="">{t.text.noHover}</option>
      {#each Object.keys(theme.tokens.color) as name (name)}<option value={name}>{t.look.colours[name] ?? name}</option>{/each}
    </select>
  </label>
  <h3>{t.text.fields}</h3>
  <label class="field">
    <span>{t.text.fieldLook}</span>
    <select value={theme.layout.field.look ?? FIELD_LOOKS[0]} onchange={(e) => setField(e.currentTarget.value)} data-field-look>
      {#each FIELD_LOOKS as name (name)}<option value={name}>{t.text.fieldLooks[name]}</option>{/each}
    </select>
  </label>
</details>

<style>
  h3 { margin: var(--sp-5) 0 var(--sp-2); font: var(--label-m); letter-spacing: 0.04em; text-transform: uppercase; color: var(--primary); }
  select { width: 100%; }
  .problem { padding: var(--sp-2) var(--sp-4); background: var(--error-container); color: var(--on-error-container); }
  .more { margin-top: var(--sp-4); }
  .more > summary { color: var(--primary); }
  .check { display: flex; align-items: center; gap: var(--sp-2); margin-block: var(--sp-2); }
  .choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-2); }
  .choice { position: relative; display: grid; gap: var(--sp-1); justify-items: center; padding: var(--sp-2) var(--sp-1); border: 1px solid var(--outline-variant); border-radius: var(--shape-md); font: var(--label-m); text-align: center; cursor: pointer; background: var(--surface-lowest); }
  .choice.on { border: 2px solid var(--primary); padding: calc(var(--sp-2) - 1px) calc(var(--sp-1) - 1px); background: var(--secondary-container); color: var(--on-secondary-container); }
  .choice input { position: absolute; opacity: 0; pointer-events: none; }
  .choice:has(input:focus-visible) { outline: 3px solid var(--primary); outline-offset: 2px; }
  .pic { display: inline-flex; align-items: center; justify-content: center; min-width: 56px; height: 26px; padding: 0 var(--sp-2); border-radius: var(--shape-full); font: var(--label-m); }
  .pic.filled { background: var(--primary); color: var(--on-primary); }
  .pic.outline { box-shadow: inset 0 0 0 2px var(--primary); color: var(--primary); }
  .pic.text { color: var(--primary); text-decoration: underline; }
</style>
