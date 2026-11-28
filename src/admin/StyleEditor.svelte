<script lang="ts">
/**
 * The controls for one style: a block's own (ADR 0001 d7), or a block type's
 * default or variant inside a theme (d8). For each property the theme's tokens
 * come first; "my own value" is one step further and is marked, because it
 * will not follow the theme's tokens when they change.
 */
import {
  ALIGNMENTS,
  BAND_PROPS,
  type BlockStyle,
  FONT_STACKS,
  isFree,
  isFreeValue,
  isOwnValue,
  STYLE_CHOICES,
  STYLE_PROPS,
  type StyleProp,
  type Theme,
  type TokenGroup,
} from '../core/index.ts';
import { t } from './messages.ts';

let {
  style,
  theme,
  onstyle,
  defaultLabel = t.style.theme,
  props = (Object.keys(STYLE_PROPS) as StyleProp[]).filter((prop) => !BAND_PROPS.includes(prop)),
}: { style: BlockStyle | undefined; theme: Theme; onstyle: (style: BlockStyle) => void; defaultLabel?: string; /** The properties offered: a header's, or a block's (ADR 0085 d4). */ props?: StyleProp[] } = $props();

const styleProps = $derived(props);
/** Properties whose custom input is open but does not hold a valid value yet. */
let drafts = $state<Partial<Record<StyleProp, string>>>({});

const kindOf = (prop: StyleProp) => STYLE_PROPS[prop].kind;
const tokens = (prop: StyleProp): string[] => (kindOf(prop) === 'align' || kindOf(prop) === 'choice' ? [] : Object.keys(theme.tokens[kindOf(prop) as TokenGroup]));
const choices = (prop: StyleProp): readonly string[] | null =>
  kindOf(prop) === 'align' ? ALIGNMENTS : kindOf(prop) === 'font' ? Object.keys(FONT_STACKS) : kindOf(prop) === 'choice' ? Object.keys(STYLE_CHOICES[prop] ?? {}) : null;
const choiceLabel = (prop: StyleProp, choice: string): string =>
  kindOf(prop) === 'align' ? (t.style.align[choice] ?? choice) : kindOf(prop) === 'choice' ? (t.style.choices[prop]?.[choice] ?? choice) : choice;

function mode(prop: StyleProp): string {
  if (prop in drafts) return '$custom';
  const value = style?.[prop];
  if (!value) return '';
  if (!isFree(value)) return `token:${value.token}`;
  return choices(prop) ? `value:${value.value}` : '$custom';
}

function set(prop: StyleProp, value: BlockStyle[StyleProp] | undefined): void {
  const next: BlockStyle = { ...(style ?? {}) };
  if (value) next[prop] = value;
  else delete next[prop];
  onstyle(next);
}

function choose(prop: StyleProp, choice: string): void {
  delete drafts[prop];
  if (choice === '') set(prop, undefined);
  else if (choice.startsWith('token:')) set(prop, { token: choice.slice(6) });
  else if (choice.startsWith('value:')) set(prop, { value: choice.slice(6) });
  else {
    const current = style?.[prop];
    drafts[prop] = current && isFree(current) ? current.value : '';
  }
}

function type(prop: StyleProp, value: string): void {
  drafts[prop] = value;
  // Only a value that would survive saving is applied; until then the block keeps what it had.
  if (isFreeValue(kindOf(prop), value)) set(prop, { value });
}

const customValue = (prop: StyleProp): string => {
  const value = style?.[prop];
  return drafts[prop] ?? (value && isFree(value) ? value.value : '');
};
</script>

{#each styleProps as prop (prop)}
  <label class="field">
    <span>{t.style.props[prop]}{#if isOwnValue(prop, style?.[prop])}<em class="own" title={t.style.custom}>●</em>{/if}</span>
    <select value={mode(prop)} onchange={(e) => choose(prop, e.currentTarget.value)} data-style={prop}>
      <option value="">{defaultLabel}</option>
      {#each tokens(prop) as token}<option value={`token:${token}`}>{token}</option>{/each}
      {#if choices(prop)}
        {#each choices(prop) ?? [] as choice}
          <option value={`value:${choice}`}>{choiceLabel(prop, choice)} {kindOf(prop) === 'font' ? `(${t.style.custom})` : ''}</option>
        {/each}
      {:else}
        <option value="$custom">{t.style.custom}…</option>
      {/if}
    </select>
    {#if mode(prop) === '$custom'}
      <span class="custom">
        {#if kindOf(prop) === 'color'}
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(customValue(prop)) ? customValue(prop) : '#000000'} oninput={(e) => type(prop, e.currentTarget.value)} />
        {/if}
        <input
          type="text"
          placeholder={kindOf(prop) === 'color' ? '#1a73e8' : '2rem'}
          value={customValue(prop)}
          oninput={(e) => type(prop, e.currentTarget.value.trim())}
          aria-invalid={customValue(prop) !== '' && !isFreeValue(kindOf(prop), customValue(prop))}
          data-custom={prop}
        />
      </span>
      {#if customValue(prop) !== '' && !isFreeValue(kindOf(prop), customValue(prop))}<small class="bad">{t.style.invalid}</small>{/if}
    {/if}
  </label>
{/each}
