/**
 * Runs inside the editor's canvas: the real page, drawn by the same renderer
 * as the public site, with marks on what can be edited. It turns that page
 * into an editing surface and reports to the admin around it.
 *
 * It never changes content itself. Every change is sent up, the admin changes
 * the document, and the server draws it again. (The approach is MYCMS's.)
 */
import { domToRichText, richTextToDom } from './richdom.ts';

type Up =
  | { type: 'ready' }
  | { type: 'select'; id: string | null }
  /** The header or footer was clicked: Design opens at it (ADR 0082 d3). */
  | { type: 'site'; part: 'header' | 'footer' }
  | { type: 'edit'; id: string; path: string; value: unknown }
  | { type: 'action'; id: string; action: 'up' | 'down' | 'duplicate' | 'delete' }
  /** `index` counts the blocks already in `parent`, the moved one left out. */
  | { type: 'move'; id: string; parent: string | null; index: number }
  | { type: 'insert'; blockType: string; parent: string | null; index: number };

interface Render {
  type: 'render';
  body: string;
  css: string;
  selected: string | null;
  /** Bumped when the theme changed, so the stylesheet is fetched again. */
  themeVersion: number;
  /** The scheme to show the page in (ADR 0074 d5); null: what the theme starts in. */
  scheme: 'light' | 'dark' | null;
  /** The theme panel is open: the header behaves as on the site, sticky included. */
  themeMode: boolean;
  labels: { types: Record<string, string>; fields: Record<string, string>; empty: Record<string, string>; actions: Record<string, string>; format: Record<string, string> };
}

const post = (message: Up): void => parent.postMessage({ uhlaka: true, ...message }, location.origin);

const root = document.getElementById('cms-root') as HTMLElement;
const own = document.getElementById('cms-own') as HTMLStyleElement;
const themeLink = document.getElementById('cms-theme') as HTMLLinkElement;

let selected: string | null = null;
let labels: Render['labels'] = { types: {}, fields: {}, empty: {}, actions: {}, format: {} };
let themeVersion = 0;

const style = document.createElement('style');
style.textContent = `
[data-b]{position:relative;cursor:default}
[data-b]:hover:not(:has([data-b]:hover)){outline:1px dashed #6d5dfc;outline-offset:-1px}
[data-frozen] [data-b]:not([data-live] [data-b]):hover{outline:none}
[data-b].cms-selected{outline:2px solid #6d5dfc!important;outline-offset:-2px}
/* While editing blocks, a header that would stay on screen does not: it would cover the block being worked on.
   With the theme panel open it does, so that the setting can be seen. */
:root:not([data-cms-theme]) .site-header{position:static!important}
[data-site]{cursor:pointer}
[data-site]:hover{outline:1px dashed #6d5dfc;outline-offset:-1px}
[data-edit],[data-edit-rich]{cursor:text;min-width:1ch}
[data-edit]:focus,[data-edit-rich]:focus{outline:2px dashed #6d5dfc;outline-offset:3px}
[data-edit]:empty::before{content:attr(data-placeholder);opacity:.45}
.cms-empty{display:grid;place-items:center;min-height:6rem;border:2px dashed #b9b3ff;border-radius:8px;color:#6d5dfc;font:500 14px/1.4 system-ui,sans-serif}
.cms-empty::after{content:attr(data-label)}
/* A block hidden on this screen (ADR 0085 d4) is only faded here, so it can still be chosen. */
@media (max-width:48rem){.cms-hide-phone{opacity:.35}}
@media (min-width:48.01rem){.cms-hide-wide{opacity:.35}}
.cms-bar{position:absolute;top:0;inset-inline-end:0;z-index:10;display:flex;background:#6d5dfc;color:#fff;border-radius:0 0 0 6px;font:600 12px/1 system-ui,sans-serif;text-align:start}
.cms-bar span{display:flex;align-items:center;padding:0 10px}
.cms-bar button{width:28px;height:28px;padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}
.cms-bar button:hover{background:rgb(255 255 255/.2)}
.cms-grip{cursor:grab;font-size:15px}
.cms-drop{position:fixed;z-index:30;pointer-events:none;background:#6d5dfc;border-radius:2px;box-shadow:0 0 0 1px #fff}
.cms-drop.cms-into{background:rgb(109 93 252/.12);box-shadow:inset 0 0 0 2px #6d5dfc}
.cms-format{position:fixed;z-index:20;display:flex;flex-wrap:wrap;align-items:center;gap:1px;padding:3px;background:#1c1b22;color:#fff;border-radius:7px;box-shadow:0 4px 14px rgb(0 0 0/.25);font:600 13px/1 system-ui,sans-serif;text-align:start}
.cms-format[hidden]{display:none}
.cms-format button{min-width:30px;height:30px;padding:0 8px;border:0;border-radius:5px;background:none;color:inherit;font:inherit;cursor:pointer}
.cms-format button:hover{background:rgb(255 255 255/.16)}
.cms-format button[aria-pressed=true]{background:#6d5dfc}
.cms-format i{width:1px;height:18px;margin:0 3px;background:rgb(255 255 255/.25)}
.cms-format form{display:flex;flex-wrap:wrap;gap:3px;flex-basis:100%;padding:3px 0 0}
.cms-format label{display:flex;align-items:center;gap:5px;flex-basis:100%;padding:2px 4px;font:400 12.5px/1.2 system-ui,sans-serif}
.cms-format label input{flex:none;min-width:0;width:auto;height:auto;padding:0}
.cms-format form[hidden]{display:none}
.cms-format input{flex:1;min-width:14rem;height:30px;padding:0 8px;border:0;border-radius:5px;font:400 13px/1 system-ui,sans-serif;color:#1c1b22;background:#fff}
.cms-format form button{background:rgb(255 255 255/.16)}
a{cursor:default}
`;
document.head.append(style);

/**
 * Whether a block is one the editor is changing. On a content type's page
 * (ADR 0015) some blocks are drawn only for context: the type's page around an
 * entry being typed into (inside `data-frozen`, with the entry's own blocks in
 * `data-live`), or an example entry inside the page being designed.
 */
const live = (block: Element): boolean => !block.closest('[data-frozen],[data-live]')?.hasAttribute('data-frozen');
/** The nearest block around a node that the editor is changing. */
const editable = (node: Element | null): HTMLElement | null => {
  let block = node?.closest<HTMLElement>('[data-b]') ?? null;
  while (block && !live(block)) block = block.parentElement?.closest<HTMLElement>('[data-b]') ?? null;
  return block;
};
const blockOf = (node: EventTarget | null): HTMLElement | null => (node instanceof Element ? editable(node) : null);
const parentBlock = (block: HTMLElement): HTMLElement | null => editable(block.parentElement);

function toolbar(block: HTMLElement): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'cms-bar';
  bar.contentEditable = 'false';
  const name = document.createElement('span');
  name.textContent = labels.types[block.dataset.type ?? ''] ?? block.dataset.type ?? '';
  // The block is moved by this handle, so that text inside it can still be selected with the mouse.
  const grip = document.createElement('span');
  grip.className = 'cms-grip';
  grip.draggable = true;
  grip.textContent = '⠿';
  grip.title = labels.actions.drag ?? '';
  bar.append(grip, name);
  for (const [action, glyph] of [['up', '↑'], ['down', '↓'], ['duplicate', '⧉'], ['delete', '✕']] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = glyph;
    button.title = labels.actions[action] ?? action;
    button.setAttribute('aria-label', button.title);
    button.dataset.action = action;
    bar.append(button);
  }
  return bar;
}

function showSelection(): void {
  for (const el of root.querySelectorAll('.cms-selected')) el.classList.remove('cms-selected');
  for (const el of root.querySelectorAll('.cms-bar')) el.remove();
  if (!selected) return;
  const block = root.querySelector<HTMLElement>(`[data-b="${CSS.escape(selected)}"]`);
  if (!block) return;
  block.classList.add('cms-selected');
  block.append(toolbar(block));
}

function prepare(): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-edit]')) {
    el.contentEditable = 'plaintext-only';
    el.spellcheck = true;
    const field = (el.dataset.edit ?? '').split('.').pop() ?? '';
    el.dataset.placeholder = labels.fields[field] ?? field;
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-edit-rich]')) {
    el.contentEditable = 'true';
    el.spellcheck = true;
  }
  for (const el of root.querySelectorAll<HTMLElement>('.cms-empty')) {
    el.dataset.label = labels.empty[el.dataset.empty ?? ''] ?? '';
  }
}

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== parent) return;
  const message = event.data as Render;
  if (message?.type !== 'render') return;
  labels = message.labels;
  selected = message.selected;
  // `body` is our own server's rendering of the document, every string escaped.
  root.innerHTML = message.body;
  own.textContent = message.css;
  if (message.themeVersion !== themeVersion) {
    themeVersion = message.themeVersion;
    themeLink.href = `/admin/site.css?v=${themeVersion}`;
  }
  if (message.scheme) document.documentElement.dataset.scheme = message.scheme;
  else delete document.documentElement.dataset.scheme;
  document.documentElement.toggleAttribute('data-cms-theme', message.themeMode);
  prepare();
  showSelection();
  if (rich && !rich.isConnected) leaveRich();
});

document.addEventListener('click', (event) => {
  const target = event.target as Element;
  if (target.closest('.cms-format')) return;
  const button = target.closest<HTMLElement>('.cms-bar button');
  if (button && selected) {
    event.preventDefault();
    post({ type: 'action', id: selected, action: button.dataset.action as 'up' });
    return;
  }
  // The page is being edited, not visited: links do not navigate.
  if (target.closest('a')) event.preventDefault();
  const id = blockOf(target)?.dataset.b ?? null;
  if (id !== selected) {
    selected = id;
    showSelection();
    post({ type: 'select', id });
  }
  const part = target.closest<HTMLElement>('[data-site]')?.dataset.site;
  if (part) post({ type: 'site', part: part === 'footer' ? 'footer' : 'header' });
});

document.addEventListener('input', (event) => {
  const target = event.target as HTMLElement;
  const id = blockOf(target)?.dataset.b;
  if (!id) return;
  const rich = target.closest<HTMLElement>('[data-edit-rich]');
  if (rich) {
    post({ type: 'edit', id, path: rich.dataset.editRich as string, value: domToRichText(rich) });
    return;
  }
  const plain = target.closest<HTMLElement>('[data-edit]');
  if (plain) post({ type: 'edit', id, path: plain.dataset.edit as string, value: plain.innerText.replace(/\n$/, '') });
});

document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (event.key === 'Escape') target.blur();
  if (rich && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    askLink();
  }
  // A one-line field stays one line.
  if (event.key === 'Enter' && target.matches('[data-edit]:not([data-multiline])')) event.preventDefault();
});

// Pasting brings words, never markup.
document.addEventListener('paste', (event) => {
  const target = event.target as HTMLElement;
  if (!target.closest('[data-edit-rich]')) return;
  event.preventDefault();
  document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
});

// ── Formatting rich text ────────────────────────────────────────────────────
// A bar that appears while the caret is in a rich text area. The browser does
// the editing; after each command the area is read back as a document and
// drawn again from it, so what it shows is always what was stored.

const FORMATS: [string, string][] = [['p', '¶'], ['h2', 'H2'], ['h3', 'H3'], ['quote', '❝'], ['ul', '•'], ['ol', '1.'], ['', ''], ['bold', 'B'], ['italic', 'I'], ['link', '🔗']];
const TAG_OF: Record<string, string> = { P: 'p', DIV: 'p', H2: 'h2', H3: 'h3', H4: 'h3', BLOCKQUOTE: 'quote', UL: 'ul', OL: 'ol' };

/** The rich text area being written in. */
let rich: HTMLElement | null = null;
/** The selection set aside while the link address is typed. */
let kept: { start: number; end: number } | null = null;

const formatBar = document.createElement('div');
formatBar.className = 'cms-format';
formatBar.hidden = true;
const linkForm = document.createElement('form');
linkForm.hidden = true;
const linkInput = document.createElement('input');
linkInput.type = 'text';
const linkApply = document.createElement('button');
linkApply.type = 'submit';
const linkRemove = document.createElement('button');
linkRemove.type = 'button';
// "Search engines do not follow it" (ADR 0058 d6): the link says rel="nofollow".
const linkNofollow = document.createElement('input');
linkNofollow.type = 'checkbox';
linkNofollow.dataset.linkNofollow = '';
const linkNofollowLabel = document.createElement('label');
const linkNofollowText = document.createElement('span');
linkNofollowLabel.append(linkNofollow, linkNofollowText);
linkForm.append(linkInput, linkApply, linkRemove, linkNofollowLabel);
document.body.append(formatBar);

function buildFormatBar(): void {
  formatBar.replaceChildren();
  for (const [command, glyph] of FORMATS) {
    if (!command) {
      formatBar.append(document.createElement('i'));
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = glyph;
    button.title = labels.format[command] ?? command;
    button.setAttribute('aria-label', button.title);
    button.dataset.format = command;
    formatBar.append(button);
  }
  linkInput.placeholder = labels.format.linkPlaceholder ?? '';
  linkApply.textContent = labels.format.linkApply ?? 'OK';
  linkRemove.textContent = labels.format.linkRemove ?? '✕';
  linkNofollowText.textContent = labels.format.linkNofollow ?? 'nofollow';
  formatBar.append(linkForm);
}

function placeFormatBar(): void {
  if (!rich) return;
  const area = rich.getBoundingClientRect();
  const height = formatBar.offsetHeight;
  // Above the text; when that is off the screen, at its top edge, so it stays in reach in a long text.
  formatBar.style.top = `${Math.max(6, Math.min(area.top - height - 6, innerHeight - height - 6))}px`;
  formatBar.style.left = `${Math.max(6, Math.min(area.left, innerWidth - formatBar.offsetWidth - 6))}px`;
}

/** How many characters of the area come before a point in it. */
function offsetIn(area: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(area);
  range.setEnd(node, offset);
  return range.toString().length;
}

function selectionIn(area: HTMLElement): { start: number; end: number } | null {
  const selection = getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!area.contains(range.startContainer) || !area.contains(range.endContainer)) return null;
  return { start: offsetIn(area, range.startContainer, range.startOffset), end: offsetIn(area, range.endContainer, range.endOffset) };
}

function select(area: HTMLElement, start: number, end: number): void {
  const texts: Text[] = [];
  const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  // A start on the border between two pieces of text belongs to the later one, an end to the earlier.
  const point = (at: number, later: boolean): [Node, number] => {
    let left = at;
    for (const [i, text] of texts.entries()) {
      if (left < text.length || (left === text.length && (!later || i === texts.length - 1))) return [text, left];
      left -= text.length;
    }
    return [area, area.childNodes.length];
  };
  const range = document.createRange();
  range.setStart(...point(start, start !== end));
  range.setEnd(...point(end, false));
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

const anchorElement = (): Element | null => {
  const node = getSelection()?.anchorNode ?? null;
  return node instanceof Element ? node : (node?.parentElement ?? null);
};

/** Which paragraph kind and marks the caret is in, shown on the bar. */
function showFormat(): void {
  if (!rich) return;
  const at = anchorElement();
  if (!at || !rich.contains(at)) return;
  const block = at.closest('ul,ol,h2,h3,h4,blockquote,p,div');
  const kind = block && rich.contains(block) && block !== rich ? TAG_OF[block.nodeName] : 'p';
  for (const button of formatBar.querySelectorAll<HTMLElement>('button[data-format]')) {
    const command = button.dataset.format as string;
    const on = command === 'bold' || command === 'italic' ? document.queryCommandState(command) : command === 'link' ? !!at.closest('a') : command === kind;
    button.setAttribute('aria-pressed', String(on));
  }
}

function enterRich(area: HTMLElement): void {
  if (rich === area) return;
  rich = area;
  buildFormatBar();
  linkForm.hidden = true;
  formatBar.hidden = false;
  placeFormatBar();
  showFormat();
}

function leaveRich(): void {
  rich = null;
  kept = null;
  formatBar.hidden = true;
}

/** Read the area as a document, draw it again from that document, and report it. */
function settle(area: HTMLElement): void {
  const id = blockOf(area)?.dataset.b;
  const doc = domToRichText(area);
  const at = selectionIn(area);
  // An empty paragraph is not in the document yet; while the caret is in one, the browser's markup stays.
  const caret = anchorElement()?.closest('p,div,h2,h3,h4,blockquote,li');
  if (at && caret && caret !== area && area.contains(caret) && caret.textContent === '') {
    if (id) post({ type: 'edit', id, path: area.dataset.editRich as string, value: doc });
    return;
  }
  richTextToDom(doc, area);
  if (at) select(area, at.start, at.end);
  if (id) post({ type: 'edit', id, path: area.dataset.editRich as string, value: doc });
  showFormat();
  placeFormatBar();
}

const exec = (command: string, value?: string): boolean => document.execCommand(command, false, value);
const inList = (): 'insertUnorderedList' | 'insertOrderedList' | null =>
  document.queryCommandState('insertUnorderedList') ? 'insertUnorderedList' : document.queryCommandState('insertOrderedList') ? 'insertOrderedList' : null;

function format(command: string): void {
  if (!rich) return;
  const area = rich;
  if (command === 'link') {
    askLink();
    return;
  }
  if (command === 'bold' || command === 'italic') exec(command);
  else if (command === 'ul' || command === 'ol') {
    // A list is made of plain lines: a heading or a quote becomes a paragraph first.
    if (!inList()) exec('formatBlock', 'p');
    exec(command === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
  } else {
    const list = inList();
    if (list) exec(list);
    exec('formatBlock', command === 'quote' ? 'blockquote' : command);
  }
  settle(area);
}

/** Show the address field, for the link the caret is in or for the selected words. */
function askLink(): void {
  if (!rich) return;
  const link = anchorElement()?.closest('a');
  if (link && rich.contains(link)) {
    // The caret is in a link: the whole link is what gets changed.
    const range = document.createRange();
    range.selectNodeContents(link);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  }
  kept = selectionIn(rich);
  if (!kept || (kept.start === kept.end && !link)) return;
  linkInput.value = link?.getAttribute('href') ?? '';
  linkNofollow.checked = /\bnofollow\b/.test(link?.getAttribute('rel') ?? '');
  linkRemove.hidden = !link;
  linkForm.hidden = false;
  placeFormatBar();
  linkInput.focus();
}

function applyLink(address: string): void {
  const area = rich;
  if (!area || !kept) return;
  linkForm.hidden = true;
  area.focus();
  select(area, kept.start, kept.end);
  kept = null;
  // Any address is taken here; the document keeps only one a visitor may follow.
  if (address) {
    exec('createLink', address);
    // The links now in the selection follow the box; the document keeps it as the span's own.
    const range = getSelection()?.rangeCount ? getSelection()?.getRangeAt(0) : null;
    for (const a of area.querySelectorAll('a')) {
      if (!range?.intersectsNode(a)) continue;
      if (linkNofollow.checked) a.setAttribute('rel', 'nofollow');
      else a.removeAttribute('rel');
    }
  } else exec('unlink');
  settle(area);
}

linkForm.addEventListener('submit', (event) => {
  event.preventDefault();
  applyLink(linkInput.value.trim());
});
linkRemove.addEventListener('click', () => applyLink(''));
linkInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  linkForm.hidden = true;
  if (rich && kept) {
    rich.focus();
    select(rich, kept.start, kept.end);
  }
});

// The bar's buttons act on the selection, so pressing one must not take it away.
formatBar.addEventListener('mousedown', (event) => {
  if (event.target !== linkInput) event.preventDefault();
});
formatBar.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLElement>('button[data-format]');
  if (button) format(button.dataset.format as string);
});

document.addEventListener('focusin', (event) => {
  const area = (event.target as Element).closest<HTMLElement>('[data-edit-rich]');
  if (area) enterRich(area);
});
document.addEventListener('focusout', (event) => {
  const next = event.relatedTarget;
  if (rich && !(next instanceof Node && (formatBar.contains(next) || rich.contains(next)))) leaveRich();
});
document.addEventListener('selectionchange', showFormat);
addEventListener('scroll', placeFormatBar, { passive: true });
addEventListener('resize', placeFormatBar);
exec('defaultParagraphSeparator', 'p');

// ── Moving blocks by dragging ───────────────────────────────────────────────
// A block is dragged by the handle on its bar; a new one is dragged in from
// the admin's list. The page only says where it was dropped: which container
// and at which place in it. The admin moves it in the document.

const BLOCK_MIME = 'application/x-uhlaka-block';
const TYPE_MIME = 'application/x-uhlaka-type';

interface Place {
  parent: string | null;
  index: number;
  /** Where to draw the mark, and whether it is a whole (empty) container. */
  box: { top: number; left: number; width: number; height: number };
  into: boolean;
}

let dragging: string | null = null;
let place: Place | null = null;
const dropMark = document.createElement('div');
dropMark.className = 'cms-drop';
dropMark.hidden = true;
document.body.append(dropMark);

/** The blocks directly inside a container, or at the top of the page. */
const childBlocks = (parent: HTMLElement | null): HTMLElement[] =>
  [...(parent ?? root).querySelectorAll<HTMLElement>('[data-b]')].filter((b) => live(b) && parentBlock(b) === parent);

function findPlace(x: number, y: number): Place | null {
  const moved = dragging ? root.querySelector<HTMLElement>(`[data-b="${CSS.escape(dragging)}"]`) : null;
  const over = blockOf(document.elementFromPoint(x, y));
  if (moved && over && moved.contains(over)) return null;
  const line = (rect: DOMRect, bottom: boolean): Place['box'] => ({ top: (bottom ? rect.bottom : rect.top) - 2, left: rect.left, width: rect.width, height: 4 });

  /** A place among the blocks of one container, by how far down the pointer is. */
  const among = (parent: HTMLElement | null): Place | null => {
    const blocks = childBlocks(parent).filter((b) => b !== moved);
    const index = blocks.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.top + r.height / 2 < y;
    }).length;
    const id = parent?.dataset.b ?? null;
    const next = blocks[index];
    const last = blocks[blocks.length - 1];
    if (next) return { parent: id, index, box: line(next.getBoundingClientRect(), false), into: false };
    if (last) return { parent: id, index, box: line(last.getBoundingClientRect(), true), into: false };
    if (!parent) return { parent: null, index: 0, box: line(root.getBoundingClientRect(), false), into: false };
    const r = parent.getBoundingClientRect();
    return { parent: id, index: 0, box: { top: r.top, left: r.left, width: r.width, height: r.height }, into: true };
  };

  if (!over) return among(null);
  const rect = over.getBoundingClientRect();
  if (over.dataset.type === 'group') {
    // The middle of a group is inside it; a strip at its top and bottom is beside it.
    const edge = Math.min(20, rect.height / 4);
    if (y > rect.top + edge && y < rect.bottom - edge) return among(over);
  }
  const parent = parentBlock(over);
  const after = y > rect.top + rect.height / 2;
  const index = childBlocks(parent).filter((b) => b !== moved).indexOf(over) + (after ? 1 : 0);
  return { parent: parent?.dataset.b ?? null, index, box: line(rect, after), into: false };
}

function endDrag(): void {
  dragging = null;
  place = null;
  dropMark.hidden = true;
}

const isOurs = (event: DragEvent): boolean => dragging !== null || (event.dataTransfer?.types.includes(TYPE_MIME) ?? false);

document.addEventListener('dragstart', (event) => {
  const grip = event.target instanceof Element ? event.target.closest('.cms-grip') : null;
  const block = grip?.closest<HTMLElement>('[data-b]');
  if (!block || !event.dataTransfer) return;
  dragging = block.dataset.b ?? null;
  event.dataTransfer.setData(BLOCK_MIME, dragging ?? '');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setDragImage(block, 24, 16);
});

document.addEventListener('dragover', (event) => {
  if (!isOurs(event)) return;
  event.preventDefault();
  place = findPlace(event.clientX, event.clientY);
  if (event.dataTransfer) event.dataTransfer.dropEffect = place ? (dragging ? 'move' : 'copy') : 'none';
  dropMark.hidden = !place;
  if (!place) return;
  dropMark.classList.toggle('cms-into', place.into);
  for (const side of ['top', 'left', 'width', 'height'] as const) dropMark.style[side] = `${place.box[side]}px`;
});

document.addEventListener('drop', (event) => {
  if (!isOurs(event)) return;
  event.preventDefault();
  const blockType = event.dataTransfer?.getData(TYPE_MIME) ?? '';
  if (place && dragging) post({ type: 'move', id: dragging, parent: place.parent, index: place.index });
  else if (place && blockType) post({ type: 'insert', blockType, parent: place.parent, index: place.index });
  endDrag();
});

document.addEventListener('dragend', endDrag);
// A drag that began in the admin ends there; here it is only seen leaving.
document.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget && !dragging) endDrag();
});

post({ type: 'ready' });
