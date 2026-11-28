# ADR 0085 — Everything a theme offers, in one style: five stages, the header first

- **Status:** Accepted (David, 2026-11-28: the five stages, the header first, on the decision card "Mergem pe cele cinci etape, începând cu antetul complet?")
- **Date:** 2026-11-28
- **Builds on:** ADR 0001 d8 (a theme is a data document), ADR 0006 (header and footer), ADR 0008 (the menu without script), ADR 0033 (sections), ADR 0035 (layouts), ADR 0082 (one style, Design)

David: a person who builds a site with Uhlaka must be able to make anything
the popular WordPress themes make, so that nobody leaves Uhlaka because
another theme gives more freedom.

Uhlaka has one style a site shapes (ADR 0082 d1), so the question is not
which themes to add but which choices the style lacks. A survey of Astra,
Kadence, GeneratePress, Blocksy, OceanWP, Divi, Neve and the block themes of
the Site Editor (`theme.json`, style variations), area by area, against what
Uhlaka's style, layouts and blocks already do, found that about half is there.
The three large gaps: a header built of more than one row (a bar above it,
transparent over the first block, other tools in it, another menu on a
phone); columns and backgrounds of a section; and the blog's list, the 404
page and the search results designed like any page.

The survey, with each area, what the themes offer, what Uhlaka lacks and its
priority, is the document "Uhlaka: tot ce oferă temele WordPress" shown to
David in the project.

## Decisions

### d1. How every new choice is made

- **A beginner sees three to five choices in a panel**; the rest is under
  "More settings", closed.
- **Choices from a closed list, never numbers or CSS.** A shadow is none,
  light or deep, as an arrangement is one of a few names. The style stays a
  data document (ADR 0001 d8), and a site changed by hand still takes another
  ready-made style.
- **Edited where it is clicked** (ADR 0082 d3).
- **Each ready-made style gives each new choice a value**, so a new site looks
  finished without anything touched.
- **What a place shows is a section** (ADR 0033), written with the ordinary
  blocks: the bar above the header, the footer's columns, a sidebar, the 404
  page. Uhlaka gets no second system of widgets.
- **Features are not style.** A pop-up, a wish list, a shop's filters, a
  cookie banner are features for extensions or parts, not this plan.

### d2. Five stages, in the order people ask for them

1. **The header and the menu** (d3).
2. **Sections, columns and backgrounds:** columns in a group (2–4, in ready
   proportions), their order on a phone; a picture behind a section with a
   colour over it, a gradient from the style's colours; the height of the
   screen; vertical alignment; hidden on a phone or on a wide screen.
3. **Type, buttons and forms:** more typefaces that Uhlaka carries; weight,
   line height and letter spacing for headings, text, menu and buttons; sizes
   on a phone; buttons filled, outlined or as text, with a colour on hover; the
   look of a form's fields; shadows and borders as tokens.
4. **The blog, an entry and the pages of their own:** a list as a list, a
   grid or cards, what a card shows, the length of the excerpt, numbered
   pages; on an entry the picture behind the title, reading time, the author's
   box, previous and next, sharing, contents; the 404 page and the search
   results designed with blocks; a footer in columns (a section), with a line
   of its own for the copyright and "Back to top".
5. **Finishing:** appearing as the page scrolls and a change on hover (both
   off for a visitor who asked for less motion), a logo for the dark, a boxed
   layout and the site's background, a sidebar that stays in view, a section
   placed by itself on a kind of page, the shop's grid with a badge, zoom and a
   bar that keeps "Add to cart" in view.

Each stage is one or two pull requests that can be used as soon as they
merge. Colour palettes and the admin's design system are their own work; the
stages use them and do not redo them.

### d3. Stage 1: the header and the menu

What the header **says** stays the site's, what it **looks like** the style's
(ADR 0035 d1, ADR 0082 d2):

| Choice | Kept in | Values |
| --- | --- | --- |
| A bar above the header | site: `header.bar`, a section's slug | a section, or none |
| A search in the header | site: `header.search` | on or off |
| The cart in the header | site: `header.cart` | on or off; drawn only while the shop is on |
| Where the parts sit | style: `layout.header.arrangement` | the three of before, and **menu in the middle** (`menu-centre`) and **logo in the middle** (`logo-centre`) |
| Over the first block | style: `layout.header.over` | on: when a page starts with a hero, the header lies over it, without its own background, in the hero's text colour |
| Smaller as the page scrolls | style: `layout.header.shrink` | on or off; only while it stays at the top |
| The look of the bar | style: `layout.bar.style` | colours and spacing, as the header's |
| The link to the page one is on, and under the pointer | style: `layout.menu.current` | its colour (`colour`, as before), underlined (`underline`), or a pill (`pill`) |
| The menu on a phone | style: `layout.menu.phone` | under the header (`below`, as before), a panel from the side (`side`), or the whole screen (`full`) |

The header panel shows, first, "stays at the top"; then under **What it
says** the logo, the menu, the button, the bar, search and cart; under **How
it looks** the arrangement, "over the first block" and "smaller as it
scrolls", with the colours, the bar's look, the current link and the phone's
menu under "More settings".

Everything works without script, as the menu does (ADR 0008): the search is a
`<details>` holding a form that asks `/_/search`; the phone's panel is the
checkbox of before, with a second label inside it that closes it. Getting
smaller as the page scrolls uses the browser's scroll-driven animations;
a browser without them keeps the header its full size. Over the first block
and staying at the top together: the header fills in its background once the
page has scrolled, by the same means, and in a browser without them it keeps
its background while it stays at the top. On a phone the header keeps its
background (its parts may take two rows there, so the room to leave in the
hero is not known), as most themes do by default.

The cart link shows no count: the page is cached for every visitor
(ADR 0044), so a count that is one visitor's cannot be in it. A count is for
later, with a request of its own.

*Why the header first:* it is the first thing anyone changes, and the gap to
Astra and Kadence is largest there. *Why fixed places and not a builder to
drag into:* a beginner picks one of five pictures; a builder of rows and
cells, as Astra and Kadence have, asks for decisions most people cannot make,
and a header dragged together under one style breaks under the next.

### d4. Stage 2: sections, columns and backgrounds

Everything lands on the **group**, which is already the block that holds
others; Uhlaka gets no "columns" or "cover" block of its own. What a group
**is made of** stays in its content, so an import, a translation or another
style keeps it; what it **looks like** is style, from closed lists, so a
ready-made style may give a group's variant a height or a gradient.

| Choice | Kept in | Values |
| --- | --- | --- |
| Columns | content: `columns` | none (one under another, as before), `1-1`, `1-2`, `2-1`, `1-1-1`, `1-1-1-1`: each block in the group is one column, in that proportion; more blocks than columns start a new row |
| On a phone, the last column first | content: `reverse` | on or off; a phone always shows the columns one under another |
| A picture behind | content: `image` | a picture from the library, drawn as a picture (with its sizes), covering the whole band |
| The colour over the picture | style: `overlay`, `overlayStrength` | a colour of the style (by default the page's text colour, with the text in the page's background colour); light, medium or deep |
| A gradient | style: `gradient`, `gradientDirection` | a second colour of the style, from the band's own background (or from nothing) to it; down, to the right or across |
| Height | style: `height` | as tall as its content, half the screen (`half`) or the whole screen (`screen`) |
| Vertical alignment | style: `alignY` | top, middle or bottom: of the content in a tall band (the middle when not chosen), and of columns of different heights |
| Hidden | style: `hideOn` | on a phone (`phone`) or on a wide screen (`wide`); on **every** block, not only a group |

A **column is a block.** To put more than one block in a column, the column
is a group itself: choosing columns in the panel adds an empty group for each
column the group lacks, so a beginner sees boxes to drop blocks into and never
builds the nesting by hand. Choosing fewer columns removes nothing: what is
left over moves to the next row, for the person to move or delete.

The proportions are the five that the themes and the Site Editor offer by
default; a free proportion (typed widths) is left out by d1. Four columns
become two between a phone and a wide screen. The phone's width is the
menu's (48rem), so a site has one place where it changes.

The group's panel shows **Columns** (five small pictures and "none") and
**A picture behind**; under "More settings" the height, the vertical
alignment, the colour over the picture and its strength, the gradient, the
phone's order and where it is hidden. In the editor a hidden block is shown
faded on the screen it is hidden on, so it can still be chosen.

Everything is CSS, without script. A style written before reads as before:
nothing new is on.

*Why the content holds the columns:* they are the page's structure; a style
that changed them would rearrange the page, and "Reset to theme" would undo
someone's layout. *Why a column is any block:* one image or one text beside
another is the most common case, and it needs no extra box.

### d5. Stage 3: type, buttons and forms

All of it is the style's (`layout`), from closed lists, as the header's look is:

| Choice | Kept in | Values |
| --- | --- | --- |
| The look of headings, text, the menu and buttons | `layout.text.heading`, `.body`, `.menu`, `.button` | `weight`: light, normal, medium, semibold, bold, black; `line` (headings and text): tight, normal, loose; `spacing`: tight, normal, wide; `case` (all but text): `upper` |
| Headings on a phone | `layout.text.phone` | as on a wide screen (absent), `smaller`, `much-smaller` |
| Buttons | `layout.button.look` | filled (absent, as before), `outline`, `text` |
| A button under the pointer | `layout.button.hover` | a colour of the style; absent: as before, no change |
| A form's fields | `layout.field.look` | boxed (absent, as before), `underline`, `filled` |
| A shadow, a border | a block's (or the header's) style: `shadow`, `border` | `soft` or `deep`; `thin` or `thick`, in the style's border colour |

The values each name stands for (a weight of 600, a line height of 1.15)
are written once, in `css.ts`. Light and black need a typeface that has them;
the faces Uhlaka carries do, a system typeface shows its nearest weight.

The panel is a fourth part of Design, **Text and buttons**: first the
headings' weight and case and the buttons' look; under "More settings" the
rest. Its words are as short as the header's.

A style written before reads and draws as before: every list's first value
is how it looked, and is kept as an absence.

*Shadows and borders as choices, not tokens:* a token would be a CSS value
typed into the style (a shadow is four numbers and a colour), which d1 rules
out; two names each cover what the themes offer by default.

### d6. Typefaces: Uhlaka's own, Google Fonts and bought ones

David (2026-11-28): "we must have our own fonts, and at the same time the
user can use Google Fonts or fonts they bought: that is the most freedom."
Three sources, one rule: **every face is served by the site** (ADR 0001 d3,
ADR 0068), so no visitor's browser asks Google or anyone else.

1. **Faces Uhlaka carries** (`fonts/`, SIL Open Font License): more families
   than the two of today, a choice for headings and one for text in each
   style.
2. **Google Fonts**: the owner picks a family from the catalogue in the
   admin; the site's server downloads its files once, keeps them with the
   site's files and serves them as its own. Their licences (OFL, Apache)
   allow it.
3. **A face the owner bought**: a `.woff2` file uploaded in the admin,
   checked to be a font and kept with the site's files. That the licence
   allows a website is the owner's to know; the admin says so.

**The faces Uhlaka carries cover all of Unicode's common scripts** (David,
2026-11-28: "full UTF-8 support"). Each family is chosen for Latin with
Latin Extended (ș and ț with the comma below), Cyrillic, Greek and
Vietnamese; for the scripts it lacks (Arabic, Hebrew, Devanagari, Thai,
Chinese, Japanese, Korean...) the stack falls back to the Noto family of the
script, carried by Uhlaka too. Every file is cut by `unicode-range`, as the
two faces of today are, so a page loads only the pieces its words need: a
Romanian page never downloads Japanese.

A style names a typeface by a name from these three lists, never by a CSS
stack typed in. This is its own pull request, after the one for d5.

**How it is built** (the pull request for d6):

| | Named in a style | Kept | Served at |
| --- | --- | --- | --- |
| Uhlaka's | `inter`, `manrope`, `literata`, `garamond`, `jetbrains`, `noto-sans`, `noto-serif`, with `bricolage`, `figtree` and the device's stacks of before | `fonts/`, carried by the program | `/assets/fonts/<family>-<script>.woff2` |
| Google Fonts | `google:<family>` (`google:playfair-display`) | the site's database (`fonts`, `font_files`), in its backups | `/assets/fonts/<hash>.woff2` |
| Bought | `own:<name>` (`own:brand-sans`) | the same | the same |

- The families Uhlaka carries are Inter and Manrope (without serifs),
  Literata and EB Garamond (with serifs), JetBrains Mono, Noto Sans and Noto
  Serif, each with Latin Extended, Cyrillic, Greek and Vietnamese; Figtree and
  Bricolage stay. Every stack ends in Noto Sans (or Noto Serif) and the Noto
  of Arabic, Hebrew, Bengali, Tamil, Thai, Georgian, Armenian, Chinese
  (simplified and traditional), Japanese and Korean, each drawing only its
  own script: 547 files, 22 MB, all OFL, made again by `bun tools/fonts.ts`.
  The device's stacks end in the other scripts' Noto only.
- **A site carries only the files its letters need.** The published
  stylesheet declares, of the families its stacks name, the faces that draw a
  character of its pages (or of the words the served site answers with): for
  each character, the first family of the stack that has it. A stack that
  starts with the device's typefaces leaves Latin, Greek and Cyrillic to the
  device. A Romanian site carries Latin; one with a word in Japanese carries
  the pieces of that word.
- **The catalogue** of Google Fonts (1,908 families, with the scripts each
  has) ships with the program, made by the same tool from the MIT package
  `google-font-metadata`: searching it asks nobody. Adding a family asks
  Google once, from the server, for every weight and style; only files from
  `fonts.gstatic.com`, each checked to be a `woff2`, at most 40 MB a family.
- **A bought face** is one `.woff2` at a time (at most 8 MB), with its weight
  (light, regular, bold, or every weight of a variable face) and its style;
  a family is its faces under one name. Only the owner adds or removes a
  typeface, as only the owner changes the style.
- A font of the site's own is declared under its name (`google-lora`), so it
  never meets a face of the device; taken away, a style naming it falls back
  to the rest of its stack.
- The choice is at the top of **Text and buttons**: headings and text, each
  with a sample in its face (`Ag Ăă Șș Țț Жж Ωω Ạạ`); adding a typeface is
  under "Add a typeface".

### d7. Stage 4: the blog, an entry, and the pages of their own

*Accepted (David, 2026-11-28, on the decision cards: what an entry shows is its type's; starter sites are a separate work, after stage 5).*

How a list and an entry **look** is the style's (`layout.list`, `layout.entry`),
from closed lists, so a ready-made style gives a blog a finished look; what an
entry **shows besides its words** is its type's, because a blog wants a reading
time and a list of projects does not. Every list's first value is
how it looked before, kept as an absence.

| Choice | Kept in | Values |
| --- | --- | --- |
| The list | style: `layout.list.look` | one under another, the picture above (`stack`, as before), the picture beside the words (`side`), a grid of two or three (`grid`), a grid of boxes (`cards`, in the style's surface colour, with its border and radius) |
| What a card shows | style: `layout.list.hide` | any of `picture`, `meta` (date, author, categories), `excerpt`; absent: all of them, as before |
| The excerpt's length | style: `layout.list.excerpt` | as before (`long`, the first 200 characters), or `short`: two lines; leaving it out is `hide` |
| "Read more" under each card | style: `layout.list.more` | on or off |
| Numbered pages | none: always | the pages of a list as numbers (1 2 3 … 9) between "Newer" and "Older"; a choice nobody would turn off is not offered |
| The picture of an entry | style: `layout.entry.cover` | under the title (`below`, as before), above it (`above`), behind it (`behind`: the whole band, with the style's colour over it, as a group's picture, d4), or `none` |
| Reading time | type: `entry.readingTime` | on or off; minutes at 200 words a minute, after the date |
| The author's box | type: `entry.author` | on (as before, when the author has a picture or a few words) or off |
| Previous and next | type: `entry.nextPrev` | on or off; the entries before and after in the type's own order, with their titles |
| Sharing | type: `entry.share` | on or off; plain links in words (Facebook, X, LinkedIn, WhatsApp, e-mail), no script, no icon and no count, so no visitor's browser asks anyone before a click; only once the site has its address |
| Contents | type: `entry.contents` | on or off; the headings 2 and 3 of the entry's text blocks, linked, above its first block, when it has three or more; the headings then carry anchors (`h-<words>`) |
| The page for an address that does not exist | site: `notFound`, a section's slug | a section, drawn under the heading "Page not found" and a search field (on a static host, which answers no search, a link home); none: only those |
| Search results | site: `searchSection`, a section's slug | a section drawn under the results (a few links, a form); none: as before |
| The footer in columns | site: `footerSection`, a section's slug | a section drawn above the footer's line (its columns are a group's, d4); none: as before |
| "Back to top" | site: `backToTop` | on or off: a link at the end of the footer's line to the top of the page, no script |

Every extra is off until a type turns it on, except the author's box, which
was there before and stays on until turned off; a site written before draws
its entries as before. They are chosen with the type, in Content types, under
"Each entry also shows". Reading time, contents and sharing are drawn on the
entry's own page; a type with a page of its own (ADR 0015) gets sharing,
previous and next and the author's box after it.

The panels: Design gains a fifth part, **Blog and pages**: the list's look
(four small pictures) and where an entry's picture sits; under "More
settings" what a card shows, the shorter excerpt and "Read more"; then the
sections of the 404 page and of the search results. What an entry shows
besides its words is set with its type. The footer's panel gains its section
and "Back to top".

The 404 page was empty before (its title only); it now always has its heading
and, on the site's own server, a search field. The section under the search
results rides in the 404 page, inside a `<template>` nothing draws, because
that page is the frame the server answers a search in.

Everything works without script. A style or a site written before reads and
draws as before.

*Why the list's look is the style's and an entry's extras the type's:* a grid
or cards is how a site looks and moves with another style, as the header's
arrangement does; whether a project shows a reading time is what that type of
entry is, and a new style must not switch it on.

**Starter sites** (a restaurant, a shop, a blog, each a whole site to import
from the first screen) are not part of this plan: David, 2026-11-28, a
separate work after stage 5, made of content files (`.uhlaka.json`) that use
what stages 4 and 5 bring.

## Not changed

The format of a style otherwise; a style written before this one reads as
before (the arrangement, the current link and the phone's menu keep their old
look; nothing new is on).

## Not yet

- A count on the cart (d3).
- Social links as a part of the header: the bar or the footer's section holds
  them until the business's profiles are a field of their own.
- A second header for the phone, built apart: the phone's menu panel covers
  what people ask for most; a whole other header waits for someone to ask.
- "Over the first block" chosen page by page, in a layout.
- Han characters in Japanese or Korean forms on a page in those languages: the
  stack names the Chinese Noto first, so a Japanese page draws Han and kana in
  Noto Sans SC until the stack follows the page's language.
