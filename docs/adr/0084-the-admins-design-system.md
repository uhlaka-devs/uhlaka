# ADR 0084 — The admin's design system: Material 3's principles, one file of tokens

- **Status:** Accepted (David, 2026-11-28: the board, "Da, așa cum e", 09:00). Settled with it: a system of
  Uhlaka's own, after Material 3's principles ("material design este mult
  mai mult [decât iconițele] … elementele de design alea contează"); the
  base colour is the blue of the logo (decision card, 08:15); the icons are
  Lucide, copied as SVG, with a 1.5 stroke (08:58).
- **Date:** 2026-11-28
- **Builds on:** ADR 0080 (the logo and its colours), ADR 0068 (typefaces
  that ship with Uhlaka), ADR 0074 (dark mode), ADR 0082 (the Design and
  Settings panels, the first to move)
- **Board:** the visual proposal shown to David, kept with this thread's
  files.

The admin has no shared design. Each component in `src/admin/` writes its
own CSS: 68 colours by hand, eight different corner radii, font sizes from
11 px to 1.4 rem, buttons of 6 px corners in one place and none in another.
It reads as screens made one at a time, and every new screen adds more.

## Decisions

### d1. Material 3's principles, drawn as Uhlaka's

The admin follows the principles and the elements of Material 3: colour
roles, a type scale, space on a grid of 4, steps of corner and shadow, one
rule for states, large targets, set durations and curves, light and dark.
It does **not** copy Android's look, and it does **not** use Google's
library or any other: no new dependency, nothing loaded from a third party
(AGENTS.md).

The elements kept from Material 3:

- pill buttons, in four kinds by weight (filled, tonal, outlined, text),
  plus a red one only for what cannot be undone;
- outlined fields whose label rises onto the border;
- the switch whose thumb grows when on;
- the side menu with a pill behind the screen you are on;
- filter chips, segmented buttons, tabs with an indicator;
- cards in three kinds (elevated, filled, outlined);
- the dialog with large corners, the message at the bottom on a dark
  surface, banners in the page.

### d2. One file of tokens; components use roles, never values

`src/admin/tokens.css` holds every value. A component names a role
(`--primary`, `--surface-container`, `--on-surface-variant`), never a
colour, and a step (`--sp-4`, `--shape-md`, `--title-m`), never a size.

| Group | What |
|---|---|
| Colour | ~30 roles: primary and its container, secondary container, six surfaces from lowest to highest, text and secondary text, two outlines, error, success, warning (each with a container), inverse, scrim |
| Text | Headline S, Title L/M/S, Body L/M/S, Label L/M/S (24 px down to 11 px); body 14 px as now |
| Space | 4, 8, 12, 16, 20, 24, 32, 40, 48 |
| Corners | 4 (field), 8 (chip), 12 (card), 16 (panel), 28 (dialog), pill (button) |
| Shadow | 0, 1 (card), 2 (menu), 3 (dialog); height shows mostly by surface colour |
| State | a layer of the content colour: 8% hover, 10% focus and pressed, 16% dragged; disabled at 38% |
| Target | at least 40 px; 48 px on a touch screen |
| Motion | 100, 150, 250, 300, 450 ms; a standard curve and an entering one; none when the system asks for reduced motion |

### d3. One hue makes every colour

The colours come from one hue, the blue of the logo's H (`#287df0`, ADR
0080), as tones from black to white, the way Material 3 makes them. The
roles take tones from those palettes. Light and dark are two sets of values
for the same roles, so a component is written once.

### d4. Light and dark follow the device

The admin follows the device, as the site does for visitors (ADR 0074),
with a choice in the person's Profile.

### d5. Figtree, which Uhlaka already ships

The admin's text is Figtree (ADR 0068), served by Uhlaka with its Romanian
letters. The admin used the system's font until now.

### d6. Moved a part at a time

First the tokens, the shared controls in `App.svelte` (the side menu,
buttons, fields, tabs, the builder's bars) and the panels of ADR 0082
(Design, Header, Footer, the style gallery, Settings). Then the rest, a
screen at a time. `test/admin-tokens.test.ts` holds the screens already
moved to no colour by hand, and the others to a count that may only go
down.

Fields keep their label above them until a field component draws the label
on the border for every screen at once; dark turns on (`data-scheme` on the
admin's page, from the device and the Profile) when the last screen has
moved, so no screen shows light boxes on a dark admin.

### d7. Icons: Lucide, copied in

The icons are Lucide's (ISC licence), their SVG drawings copied into
`src/admin/icons.ts` with the licence, only the ones the admin uses, drawn
by `Icon.svelte` with a 1.5 stroke at 20 px. Nothing is
loaded from a third party and no package is added: the licence goes with
the files.
