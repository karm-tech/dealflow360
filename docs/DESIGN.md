# DealFlow360 — design system

Every screen is built from the tokens and components here. If a screen needs a
colour, a size or a shadow that is not in this file, the answer is to add it
here once — not to write a one-off value into a component.

---

## The one rule

> **Status colour is never brand colour.**

The accent is a deep navy. Green, amber and red mean health: fine, needs
attention, wrong. A green brand colour would make every button on the dashboard
read as "healthy".

`ink` for anything the product does, `state` for anything the data says.

---

## Colour

Colours are declared as CSS variables in `src/index.css` and read by
`tailwind.config.js`. They hold `R G B` channel numbers rather than hex, which
is what lets Tailwind still apply opacity (`bg-ink-700/10`).

A dark theme means redefining that one variable block under `.dark`. No
component changes.

### Ink — the accent

Deep navy. Primary buttons, active navigation, links, selected rows.

| Token | Hex | Used for |
|---|---|---|
| `ink-50` | `#EDF2F7` | selected row tint, planned-state strip |
| `ink-100` | `#D8E3EE` | borders on tinted surfaces |
| `ink-200` | `#B9CBDD` | quiet markers, list bullets |
| `ink-400` | `#5C7C9E` | focus ring, the lighter half of the mark |
| `ink-500` | `#35597D` | input focus border |
| `ink-600` | `#22456A` | — |
| `ink-700` | `#1B3A5C` | **primary** — buttons, active nav, links |
| `ink-800` | `#12283F` | primary hover |
| `ink-900` | `#0C1D2E` | modal backdrop |

### Sand — warm neutrals

Text, borders and quiet fills. Warm on purpose: a cold blue-grey next to a navy
accent makes the whole page read as one flat blue wash.

| Token | Hex | Used for |
|---|---|---|
| `canvas` | `#F7F6F4` | the page ground |
| `surface` | `#FFFFFF` | cards, inputs, table bodies |
| `sand-50` | `#FAF9F7` | table header, row hover, footer strips |
| `sand-100` | `#F2F0EC` | ghost button hover, segmented control track |
| `sand-200` | `#E4E1DC` | **the default border** |
| `sand-300` | `#D3CFC8` | input border, dashed empty-state border |
| `sand-400` | `#B0AAA1` | placeholder text, muted icons |
| `sand-500` | `#8A8479` | small print |
| `sand-600` | `#6B6862` | **secondary text** |
| `sand-700` | `#4E4B46` | body text on a fill |
| `sand-800` | `#332F2B` | table cell text |
| `sand-900` | `#1A1917` | **primary text**, headings |

### State — health only

Each has a text colour, a soft fill and a border, so a pill is built from one
matched set. These are darker than the usual bright versions because the bright
ones do not pass contrast on their own soft fill.

| Tone | Text | Soft fill | Border | Means |
|---|---|---|---|---|
| ok | `#0A6B4A` | `#E3F5EE` | `#A8DCC6` | healthy, approved, confirmed |
| warn | `#8A5200` | `#FDF1DD` | `#EDCB92` | needs attention, waiting, at risk |
| bad | `#992018` | `#FBE9E7` | `#EFB3AC` | critical, declined, cancelled |

### Demo — the instance, not the deal

One extra token, and it is deliberately **not** part of the state scale.

| Token | Hex | Used for |
|---|---|---|
| `demo` | `#6E4B63` | the strip above the header, chip text, the /demo entry strip |
| `demo-soft` | `#F3EBF0` | the "Demo data" chip background, the /login demo panel |
| `demo-border` | `#DCC9D6` | borders on both |

> **Status colours describe a deal. The demo tone describes the instance. They
> must never be confusable.**

Plum rather than a warm clay or ochre: `warn` sits at hue 36° and `bad` at 4°,
so a warm tone would land between two status colours. Plum sits at 319° and
contains blue (110 75 99 against 138 82 0), so it reads as a different kind of
thing rather than another shade of warning.

Live mode gets a plain greyscale chip, not green — green is `state.ok` and
would say "this is healthy" rather than "this is the real database".

`StatusPill` also has two non-health tones: `neutral` (a status carrying no
judgement, e.g. Draft) and `info` (work under way on our side, e.g. Sent) which
uses the navy tint so it never reads as a warning.

### Contrast

Every pair below was checked against WCAG AA (4.5:1 for normal text).

| Pair | Ratio |
|---|---|
| `sand-900` on `canvas` | 16.4:1 |
| `sand-600` on `canvas` | 5.1:1 |
| white on `ink-700` | 11.6:1 |
| `state-ok` on `state-okSoft` | 5.8:1 |
| `state-warn` on `state-warnSoft` | 5.6:1 |
| `state-bad` on `state-badSoft` | 6.9:1 |
| white on `state-warn` | 6.3:1 |
| `demo` on `demo-soft` (the chip) | 6.3:1 |
| white on `demo` (/demo entry strip) | 7.4:1 |

---

## Type

Three faces, three jobs. All **self-hosted** from `public/fonts` — the interface
renders identically with no network access, and the type cannot shift if a
third-party font host is slow or unreachable.

| Role | Face | Why |
|---|---|---|
| Headings | **Outfit** | geometric and a little characterful, used sparingly |
| Body / UI | **IBM Plex Sans** | holds up at 13–14px inside dense tables |
| Figures | **IBM Plex Mono** | money, quote numbers and ids line up in a column |

Outfit and IBM Plex Sans are variable fonts — one file covers the whole weight
range, which is why their `@font-face` declares a range.

### Scale

Pick from these and nothing else.

| Class | Size | Used for |
|---|---|---|
| `text-3xl` | 32px | display, used almost never |
| `text-2xl` | 24px | page title (`PageHeader`) |
| `text-xl` | 18px | section / card heading |
| `text-lg` | 16px | emphasised row title |
| `text-base` | 14px | **body — the default** |
| `text-sm` | 13px | secondary text, dense controls |
| `text-xs` | 12px | hints, small print |
| `text-2xs` | 11px | uppercase labels, table headers (letter-spaced) |

### Figures

Put `.figure` on anything numeric — it switches to the mono face with
`tabular-nums`, so a column of amounts lines up digit under digit. `<TD figure>`
does it for you.

---

## Spacing

The Tailwind 4px scale, using **4 · 8 · 12 · 16 · 24 · 32 · 48** and skipping
the rest. Lay groups out with flex/grid and `gap`, not per-element margins —
margins collapse and double in ways that are hard to chase.

## Radius and shadow — spent by role

Border, fill, radius and shadow each say "this is a separate object". Stamping
one radius and one shadow on every block flattens the hierarchy instead of
creating one.

| Radius | Used for |
|---|---|
| `rounded-md` (6px) | badges, nav items, small toggles |
| `rounded-lg` (8px) | buttons, inputs, alert boxes |
| `rounded-xl` (12px) | cards, tables |
| `rounded-2xl` (16px) | modals |
| `rounded-full` | status pills |

| Shadow | Used for |
|---|---|
| `shadow-card` | the quiet default on a card or table |
| `shadow-raised` | the one thing genuinely floating above the page |
| `shadow-modal` | dialogs only |

---

## Components — `src/components/ui`

One import: `import { Button, Card, Field, Input } from "../../components/ui";`

| Component | When |
|---|---|
| `Button` | `primary` the one action the screen exists for · `secondary` a real alternative · `ghost` a minor toolbar or row action · `danger` destructive or a decline. **One primary per screen.** Sizes `sm` / `md`; `isLoading` swaps the icon for a spinner. |
| `Field` | wraps every control with its label, hint and error. Screens should not hand-write a `<label>`. An error replaces the hint rather than stacking under it. |
| `Input` `Select` `Textarea` | one border and focus treatment, so a select never looks slightly different from the input beside it. Pass `hasError` to turn the border red. |
| `Card` / `CardHeader` | a panel. `raised` only when it genuinely floats; `padded={false}` when the content manages its own edges. |
| `Table` `THead` `TBody` `TR` `TH` `TD` | wide content scrolls inside its own box so the page never scrolls sideways. `<TD figure align="right">` for money. `<TR selected>` gets the navy tint. |
| `Badge` | a neutral label — a tier, a role, a count. **No meaning attached.** |
| `StatusPill` | something is fine / needs attention / is wrong. The only component allowed to use the state colours. |
| `Spinner` `ErrorState` `EmptyState` | the three things a screen can be doing other than showing data. `ErrorState` always says what to do next; `EmptyState`'s hint should say how the first row gets here. |
| `Modal` | confirmations and small forms. Escape closes it and background scroll is locked. |

App-level pieces live one level up in `src/components`: `Layout`, `PortalLayout`,
`InstanceMarker` (the demo rail and the mode chip), `PageHeader`,
`PhasePlaceholder`, `Wordmark`.

---

## Deliberate exceptions

**The demo marker is quiet.** Inside the app: a strip above the header and a
"Demo data" chip, with the full sentence in the chip's tooltip. Only `/demo`,
the entrance, spells it out.

**The customer portal reads differently.** Narrower column, no toolbar, no
staff navigation. It is a separate restricted view, not the internal app with
menus hidden, and it should not feel like one.

**Active nav is underlined, not filled.** Seven filled pills in a row would
fight the page content for attention.
