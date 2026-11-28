/*
 * Icons from Lucide 1.72.0 (https://lucide.dev), their SVG drawings copied in (ADR 0084 d7).
 * Only the ones the admin uses; add one by copying its elements from lucide-static.
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/** Each 24×24 drawing as its elements: a tag and its attributes (no markup, so nothing is parsed as HTML). */
export const ICONS = {
  'file-text': [['path', { d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' }], ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }], ['path', { d: 'M10 9H8' }], ['path', { d: 'M16 13H8' }], ['path', { d: 'M16 17H8' }]],
  'newspaper': [['path', { d: 'M15 18h-5' }], ['path', { d: 'M18 14h-8' }], ['path', { d: 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2' }], ['rect', { width: '8', height: '4', x: '10', y: '6', rx: '1' }]],
  'folder': [['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }]],
  'layout-template': [['rect', { width: '18', height: '7', x: '3', y: '3', rx: '1' }], ['rect', { width: '9', height: '7', x: '3', y: '14', rx: '1' }], ['rect', { width: '5', height: '7', x: '16', y: '14', rx: '1' }]],
  'image': [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }], ['circle', { cx: '9', cy: '9', r: '2' }], ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }]],
  'clipboard-list': [['rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }], ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }], ['path', { d: 'M12 11h4' }], ['path', { d: 'M12 16h4' }], ['path', { d: 'M8 11h.01' }], ['path', { d: 'M8 16h.01' }]],
  'palette': [['path', { d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z' }], ['circle', { cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor' }], ['circle', { cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor' }], ['circle', { cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor' }], ['circle', { cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor' }]],
  'panel-top': [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }], ['path', { d: 'M3 9h18' }]],
  'panel-bottom': [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }], ['path', { d: 'M3 15h18' }]],
  'layout-dashboard': [['rect', { width: '7', height: '9', x: '3', y: '3', rx: '1' }], ['rect', { width: '7', height: '5', x: '14', y: '3', rx: '1' }], ['rect', { width: '7', height: '9', x: '14', y: '12', rx: '1' }], ['rect', { width: '7', height: '5', x: '3', y: '16', rx: '1' }]],
  'clipboard-check': [['rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }], ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }], ['path', { d: 'm9 14 2 2 4-4' }]],
  'mail': [['path', { d: 'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7' }], ['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }]],
  'message-square': [['path', { d: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z' }]],
  'users': [['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }], ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }], ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }], ['circle', { cx: '9', cy: '7', r: '4' }]],
  'shopping-cart': [['path', { d: 'm2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18' }], ['path', { d: 'M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25' }], ['circle', { cx: '18', cy: '20', r: '2' }], ['circle', { cx: '8', cy: '20', r: '2' }]],
  'ticket-percent': [['path', { d: 'M2 9a3 3 0 1 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z' }], ['path', { d: 'M9 9h.01' }], ['path', { d: 'm15 9-6 6' }], ['path', { d: 'M15 15h.01' }]],
  'chart-line': [['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }], ['path', { d: 'm19 9-5 5-4-4-3 3' }]],
  'search': [['path', { d: 'm21 21-4.34-4.34' }], ['circle', { cx: '11', cy: '11', r: '8' }]],
  'database': [['ellipse', { cx: '12', cy: '5', rx: '9', ry: '3' }], ['path', { d: 'M3 5V19A9 3 0 0 0 21 19V5' }], ['path', { d: 'M3 12A9 3 0 0 0 21 12' }]],
  'upload': [['path', { d: 'M12 3v12' }], ['path', { d: 'm17 8-5-5-5 5' }], ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }]],
  'download': [['path', { d: 'M12 15V3' }], ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['path', { d: 'm7 10 5 5 5-5' }]],
  'puzzle': [['path', { d: 'M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z' }]],
  'archive': [['rect', { width: '20', height: '5', x: '2', y: '3', rx: '1' }], ['path', { d: 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' }], ['path', { d: 'M10 12h4' }]],
  'settings': [['path', { d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' }], ['circle', { cx: '12', cy: '12', r: '3' }]],
  'circle-user': [['circle', { cx: '12', cy: '12', r: '10' }], ['circle', { cx: '12', cy: '10', r: '3' }], ['path', { d: 'M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662' }]],
  'external-link': [['path', { d: 'M15 3h6v6' }], ['path', { d: 'M10 14 21 3' }], ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }]],
  'plus': [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
} satisfies Record<string, readonly (readonly [string, Record<string, string>])[]>;

export type IconName = keyof typeof ICONS;
