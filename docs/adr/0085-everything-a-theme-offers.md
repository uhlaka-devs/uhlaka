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
