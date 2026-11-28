<script lang="ts">
/** A table's rows and columns (ADR 0047): add or take away a row or a column, and say whether the first row holds the headings. Cells are typed here or on the page. */
import { TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, type TableValue } from '../core/index.ts';
import { t } from './messages.ts';

let { label, value, onchange }: { label: string; value: TableValue | null; onchange: (value: TableValue) => void } = $props();

const table = $derived(value ?? { header: true, rows: [['']] });
const width = $derived(table.rows[0]?.length ?? 1);
const set = (rows: string[][]): void => onchange({ header: table.header, rows });
const cell = (i: number, j: number, text: string): void => set(table.rows.map((row, r) => (r === i ? row.map((c, k) => (k === j ? text : c)) : row)));
</script>

<fieldset data-table-field>
  <legend>{label}</legend>
  <label class="check"><input type="checkbox" checked={table.header} onchange={(e) => onchange({ header: e.currentTarget.checked, rows: table.rows })} data-table-header /> {t.table.header}</label>
  <div class="grid" style:grid-template-columns={`repeat(${width}, minmax(4rem, 1fr)) auto`}>
    {#each table.rows as row, i}
      {#each row as text, j}
        <input type="text" maxlength="500" value={text} class:head={table.header && i === 0} aria-label={`${i + 1}, ${j + 1}`} oninput={(e) => cell(i, j, e.currentTarget.value)} data-cell={`${i}.${j}`} />
      {/each}
      <button type="button" class="quiet" title={t.table.removeRow} aria-label={`${t.table.removeRow} ${i + 1}`} disabled={table.rows.length < 2} onclick={() => set(table.rows.filter((_, r) => r !== i))}>✕</button>
    {/each}
  </div>
  <div class="actions">
    <button type="button" disabled={table.rows.length >= TABLE_MAX_ROWS} onclick={() => set([...table.rows, Array<string>(width).fill('')])} data-table-add-row>{t.table.addRow}</button>
    <button type="button" disabled={width >= TABLE_MAX_COLUMNS} onclick={() => set(table.rows.map((row) => [...row, '']))} data-table-add-column>{t.table.addColumn}</button>
    <button type="button" class="quiet" disabled={width < 2} onclick={() => set(table.rows.map((row) => row.slice(0, -1)))} data-table-remove-column>{t.table.removeColumn}</button>
  </div>
</fieldset>

<style>
  .grid { display: grid; gap: 0.2rem; margin: var(--sp-2) 0; overflow-x: auto; }
  .grid input { min-width: 0; padding: var(--sp-1) var(--sp-1) !important; font-size: var(--size-s); }
  .grid input.head { font-weight: 700; }
  .actions { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
  .check { display: flex; align-items: center; gap: var(--sp-2); }
</style>
