# ADR 0083 — Colour palettes: light and dark that go together

- **Status:** Accepted (David, 2026-11-28: "da", to ready-made palettes in Design → Style, each with its light and dark made together and checked for contrast, to choose, change or make one's own; for the site only)
- **Date:** 2026-11-28
- **Builds on:** ADR 0001 d8 (a theme is a data document), ADR 0074 (dark mode, the second palette, the contrast check), ADR 0082 (one style, Design → Style)

A style has its colours for the light and for the dark (ADR 0074). Picking
eight colours that go together, twice, and keeping every text readable, is
the part of a site a beginner is least able to do, and the one that shows
most. A ready-made style (ADR 0082 d1) changes everything at once: colours,
typefaces, the look of each block. There was no way to change only the
colours to a set that is known to work.

## Decisions

### d1. Palettes, in Design → Style

Under the ready-made styles, **Colour palettes**: eight sets (Ocean, Forest,
Terracotta, Plum, Rose, Lagoon, Honey, Graphite), each shown as a card with
its light and its dark side by side. A click puts its colours in the style,
on the page at once; the colour fields below show them, to change any of
them. The card of the palette in use says so, until a colour is changed by
hand.

A palette sets the colours every style has (`background`, `surface`, `text`,
`muted`, `border`, `primary`, `on-primary`) and `link`, in the style's own
scheme and in its second palette. The typefaces, spacing, the look of the
blocks and what the site shows (light, dark or the visitor's) stay.

### d2. Every palette reads

Each pair a site is read by (text and quiet text on the page and on cards,
links on both, the text on the main colour) is 4.5 : 1 or more, WCAG AA, in
the light and in the dark. A test holds every palette to it, and holds each
palette on each ready-made style to the whole contrast check of ADR 0074.

A style's colours of its own that are not in a palette stay. Those that were
shades of the old main colour (Atelier's `deep` and `tint-1`) are turned to
the new one's hue; and one that no longer reads with a palette colour it is
paired with is moved in lightness until it does.

### d3. A palette from one colour

**From a colour of yours**: the owner picks one colour (their logo's, for
example) and a palette is made from it: calm neutrals of its hue, the colour
as the main one, moved only as far as it takes to read, for the light and
the dark. It is held to the same 4.5 : 1.

### d4. One click back

After a palette, **Bring back the colours from before** returns the colours
the style had before the first palette of this visit to the panel. Nothing
else is asked: a palette changes only colours, and they are kept as a draft
of the style until it is published (ADR 0082).

### d5. The site only

The admin keeps its own colours. Palettes are data in the core
(`src/core/palettes.ts`), not a new kind of file: a style still carries its
colours as before, and a site made with a palette is an ordinary style.

## Not changed

The theme format, the API, the ready-made styles, the contrast check.

## Not yet

- Palettes shipped by an extension, or saved by the owner to reuse on another
  site (today: the style's file, under More settings).
