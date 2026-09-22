---
name: UpWise
description: A calm tonal surface where the one thing to learn now is set large and quiet.
colors:
  surface: "#f8f6f2"
  surface-low: "#f1eee8"
  surface-mid: "#eae6df"
  surface-high: "#e2ded6"
  surface-bright: "#ffffff"
  on-surface: "#1c1b1a"
  on-surface-2: "#57544f"
  on-surface-3: "#67635d"
  primary: "#2f6a52"
  on-primary: "#ffffff"
  primary-container: "#cfe7da"
  on-primary-container: "#0f3325"
  warm: "#9a5b2a"
  warm-container: "#f5dcc4"
  on-warm-container: "#4a2a10"
  error: "#b3261e"
  error-container: "#f9dedc"
  on-error-container: "#410e0b"
  inverse-surface: "#2f2e2c"
  inverse-on-surface: "#f3f0eb"
typography:
  display:
    fontFamily: "Figtree Variable, -apple-system, Segoe UI Variable Text, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Figtree Variable, -apple-system, Segoe UI Variable Text, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline-sm:
    fontFamily: "Figtree Variable, -apple-system, Segoe UI Variable Text, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  title-sm:
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.35
  body:
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  body-lg:
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  section-title:
    fontSize: "13px"
    fontWeight: 500
    letterSpacing: "0.01em"
rounded:
  slab: "28px"
  sheet: "32px"
  thumb: "14px"
  row: "18px"
  pill: "999px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "20px"
  s-6: "24px"
  s-7: "32px"
  s-8: "40px"
  s-9: "56px"
  gutter: "20px"
components:
  pill-filled:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
    typography: "{typography.title-sm}"
  pill-tonal:
    backgroundColor: "{colors.surface-high}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  pill-tonal-hover:
    backgroundColor: "{colors.surface-bright}"
  pill-soft:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.pill}"
  pill-text:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "48px"
  pill-danger:
    backgroundColor: "{colors.error-container}"
    textColor: "{colors.on-error-container}"
    rounded: "{rounded.pill}"
  pill-lg:
    height: "56px"
    padding: "0 28px"
  pill-sm:
    height: "38px"
    padding: "0 16px"
  slab:
    backgroundColor: "{colors.surface-low}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.slab}"
    padding: "24px"
  slab-primary:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.slab}"
    padding: "24px"
  slab-warm:
    backgroundColor: "{colors.warm-container}"
    textColor: "{colors.on-warm-container}"
    rounded: "{rounded.slab}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface-mid}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "52px"
  input-focus:
    backgroundColor: "{colors.surface-high}"
  chip:
    backgroundColor: "{colors.surface-mid}"
    textColor: "{colors.on-surface-2}"
    rounded: "10px"
    padding: "0 14px"
    height: "36px"
  chip-active:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
  chip-warm:
    backgroundColor: "{colors.warm-container}"
    textColor: "{colors.on-warm-container}"
  rowitem:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.row}"
    padding: "10px 12px"
    height: "64px"
  rowitem-hover:
    backgroundColor: "{colors.surface-low}"
  navbar:
    backgroundColor: "{colors.surface-low}"
    height: "80px"
  rail:
    backgroundColor: "{colors.surface-low}"
    width: "88px"
  nav-indicator-active:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "16px"
    width: "64px"
    height: "32px"
  fab:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "20px"
    width: "60px"
    height: "60px"
  sheet:
    backgroundColor: "{colors.surface-low}"
    textColor: "{colors.on-surface}"
    rounded: "32px 32px 0 0"
    padding: "12px 20px 24px"
  sheet-desktop:
    backgroundColor: "{colors.surface-mid}"
    rounded: "{rounded.slab}"
    padding: "24px 32px"
    width: "min(520px, calc(100vw - 48px))"
  snackbar:
    backgroundColor: "{colors.inverse-surface}"
    textColor: "{colors.inverse-on-surface}"
    rounded: "14px"
    padding: "12px 18px"
  live-pill:
    backgroundColor: "{colors.surface-bright}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.pill}"
    padding: "8px 8px 8px 18px"
---

# Design System: UpWise

## Overview

**Creative North Star: "The Pixel Recorder"**

UpWise is the Now Playing screen of a learning habit. The whole interface is one calm tonal sheet with a single sentence set large on it — what to learn now — and one pill to press. Everything below that is a quiet list you scroll past. The system is Material You read through Google's Recorder app: tonal surfaces stepped by lightness rather than divided by lines, generous corner radii, one accent used sparingly, and motion that feels sprung rather than eased.

Density is deliberately low. A screen is a single 680px column of stacked sections separated by 32px of air (`--s-7`), never a grid of cards. Type does the hierarchy work: a 40px `display` line, a 28px `headline` for the one thing that matters, and everything else at 15px or 13px in a dimmer on-surface tone. Weight is almost entirely regular (400); 500 appears only on labels, pills and row titles. Nothing is bolded for emphasis and nothing is uppercased.

The confirmed anti-reference is the card-grid dashboard: boxed tiles, KPI stat cards, dividing rules, and hairline borders around content. The build refuses all of them — there is exactly one shadow token in the system and it is reserved for things that float above the page. Two platforms share this system unchanged: a Tauri webview in a frameless desktop window and an Android WebView on a Pixel. A single 840px breakpoint is the only thing that differs between them.

**Key Characteristics:**
- Tonal surfaces stepped by lightness; no borders, no dividers, one shadow token
- One sage accent (`--primary`) and one apricot warmth (`--warm`); nothing else is coloured
- Figtree at regular weight, set large — 40px display, 28px headline
- 28px slabs, 999px pills, 14px thumbnails, 18px row hit areas
- One authored entrance per page; spring physics, never linear easing
- A single 840px breakpoint flips navbar to rail and bottom sheet to centred dialog

## Colors

A warm-neutral daylight surface in light mode and a cool near-black in dark mode, both carrying one desaturated sage accent and one apricot for warmth and streaks.

### Primary
- **Forest Sage** (`--primary`, `#2f6a52` light / `#a9d8c0` dark): the only accent. It fills the Start pill, the progress bar, the heatmap's densest cells, the completion check, the active switch track, the focus ring and the rail brand mark. Used as raw text colour only for links, "See all" and inline positive numbers.
- **Sage Container** (`--primary-container`, `#cfe7da` light / `#294a3b` dark): the soft, sit-behind-things version. It is the navigation indicator pill, the FAB, the active chip, the "takeaway" slab, and the Welcome mark.

### Secondary
- **Kiln Apricot** (`--warm`, `#9a5b2a` light / `#ebbf95` dark): warmth and honest warning. It marks the streak flame, a growing backlog, and the "Couldn't connect" glyph. It is never a call to action.
- **Apricot Container** (`--warm-container`, `#f5dcc4` light / `#46321f` dark): the "Already saved" chip and the `slab-warm` surface.

### Tertiary
- **Ember Red** (`--error`, `#b3261e` light / `#f2b8b5` dark): form errors, the close-button hover on the desktop title strip, and the breathing live-session dot. Its container (`--error-container`) carries destructive pills and the "AI unavailable" chip.

### Neutral
The five-step tonal ramp is the structural system, not a palette.
- **Surface** (`--surface`, `#f8f6f2` light / `#131315` dark): the page. Nothing else uses it.
- **Surface Low** (`--surface-low`, `#f1eee8` / `#1a1a1d`): one step up — slabs, the navbar, the rail, the bottom sheet, row hover.
- **Surface Mid** (`--surface-mid`, `#eae6df` / `#202024`): two steps — inputs at rest, chips at rest, thumbnails, skeletons, the desktop dialog, row press.
- **Surface High** (`--surface-high`, `#e2ded6` / `#28282d`): three steps — tonal pills, focused inputs, the unfilled part of a bar, the switch track, the step dot.
- **Surface Bright** (`--surface-bright`, `#ffffff` / `#34343a`): the top of the ramp, used only for things that float — the live session pill — and for tonal-pill hover.
- **Ink** (`--on-surface`, `#1c1b1a` / `#e8e5e9`): all headlines, titles and row titles.
- **Ink Muted** (`--on-surface-2`, `#57544f` / `#b3b0b6`): body copy, chip labels, inactive nav destinations.
- **Ink Quiet** (`--on-surface-3`, `#67635d` / `#9b98a1`): meta lines, placeholders, section titles, empty-state prose.
- **Inverse** (`--inverse-surface` / `--inverse-on-surface`): the snackbar only — the one place the theme flips.

### Named Rules

**The Step, Don't Draw Rule.** Separation is a change of tone, never a line. A surface that needs to read as distinct moves one step up the ramp (`--surface` → `--surface-low` → `--surface-mid` → `--surface-high` → `--surface-bright`). No `border`, no `border-top`, no `<hr>` appears anywhere in the built stylesheets. If two things need separating and a tone step is wrong, use space instead.

**The One Accent Rule.** Sage is the only colour that means "act". Apricot means "warm fact" (streak, growing backlog) and red means "live or wrong". A screen carries one sage moment — the Start pill or the active nav indicator — and nothing competes with it.

**The Warm-On-Quiet-Surfaces Rule.** `--warm` as text is legible on `--surface` (4.98:1) and `--surface-low` (4.65:1) only. It drops to 4.32:1 on `--surface-mid` and 4.01:1 on `--surface-high`. Warm text lives on the page or in a slab; on higher surfaces use `--warm-container` with `--on-warm-container` (9.77:1) instead.

## Typography

**Display / Body / Label Font:** Figtree Variable (bundled via `@fontsource-variable/figtree`), falling back to `-apple-system`, `Segoe UI Variable Text`, `Segoe UI`, `Roboto`, `system-ui`, `sans-serif`.

**Character:** One humanist variable sans doing every job, differentiated by size and negative tracking rather than by weight or by a second family. Large sizes are tightened (`-0.025em` at display, `-0.02em` at headline) so a 40px sentence reads as a calm statement rather than a banner. Body sizes sit at normal tracking. Tabular figures are opt-in via `.num` for anything that ticks — the session timer, streak counts, minute totals.

### Hierarchy
- **Display** (`.display`, 400, 40px → 44px ≥840px, 1.08, −0.025em): the one sentence per screen. The greeting headline on Today, the screen name on Library, each onboarding question. One per page, never two.
- **Headline** (`.headline`, 400, 28px → 30px ≥840px, 1.15, −0.02em): the Up-next title inside the slab, and the Progress numbers set as a sentence.
- **Focal** (`.focal`, 36px, ≥840px only): a desktop-only escalation applied alongside `.headline` on the single most important title on screen. On phone it is inert and the title stays at 28px.
- **Headline Small** (`.headline-sm`, 400, 22px, 1.2, −0.015em): sheet titles, result titles, empty and error state titles.
- **Title** (`.title`, 500, 17px, 1.3): section leads inside detail blocks.
- **Title Small** (`.title-sm`, 500, 15px, 1.35): the label above a list — "Today", "In progress", "Backlog".
- **Body** (`.body`, 400, 15px, 1.5, `--on-surface-2`): default prose. **Body Large** (`.body-lg`, 400, 17px, 1.45, `--on-surface-2`) carries the coach sentence and the takeaway — the only copy written to be read slowly.
- **Meta** (`.meta`, 400, 13px, 1.4, `--on-surface-3`): the facts line under a title — category, minutes, relevance dots, relative time. `.meta-strong` is the same size at 500 weight in `--on-surface-2`.
- **Section Title** (`.section-title`, 500, 13px, +0.01em, `--on-surface-3`): a quiet label inside a form group. Sentence case — never uppercased.

### Named Rules

**The Regular Weight Rule.** `h1`–`h4` and `p` are reset to `font-weight: 400` globally. Emphasis comes from size, tone and space. Weight 500 is reserved for interactive labels (pills, chips, nav destinations, row titles) and small labels; 600+ appears nowhere.

**The One Display Rule.** Exactly one `.display` per screen and it is the first thing in the column. If a second idea wants display size, it is a different screen or it is a `.headline`.

**The Sentence, Not The Tile Rule.** Numbers are set as prose inside a `.headline`, not as KPI tiles — "12-day streak, best 20. 48 things learned." Statistics get a sentence and a colour span; they never get a box.

## Layout

One centred column, max 680px (`--content-max`), with `display: flex; flex-direction: column; gap: var(--s-7)` — 32px between every section. There is no grid and no multi-column layout anywhere in the build.

**Spacing rhythm.** A 4px-based scale, `--s-1` through `--s-9` (4, 8, 12, 16, 20, 24, 32, 40, 56). The horizontal page inset is `--gutter` (20px) on phone and `--s-8` (40px) on desktop. Slab padding is `--s-6` (24px). Gaps inside a row are 12–14px; gaps inside a stacked group are 6–12px.

**Phone (<840px).** Content is padded `calc(var(--safe-top) + var(--s-6))` at the top and `calc(var(--nav-h) + var(--safe-bottom) + 104px)` at the bottom — the navigation bar (80px, `--nav-h`) plus the Android gesture inset plus clearance for the FAB and live pill. `env(safe-area-inset-*)` is read into `--safe-top` / `--safe-bottom` and every fixed element composes with it; nothing assumes a rectangular viewport.

**Desktop (≥840px).** A Material navigation rail 88px wide (`--rail-w`) pins to the left; the same 680px column centres in the remaining space. The window is frameless: `WindowControls` sets `data-frameless="true"` on `<html>`, which promotes `--titlebar-h` from 0 to 36px, and the content's top padding grows to match. The title strip is a full-width drag region with three soft controls right-aligned.

**The single-breakpoint rule.** 840px is the only breakpoint in the system. It flips exactly four things: navbar → rail, bottom sheet → centred dialog, horizontal chip scroller → wrapping chip set, and the display/headline sizes up one step. `.hide-mobile` and `.hide-desktop` handle the rest. A second breakpoint is a design failure, not a fix.

**Pointer, not width, decides touch size.** A separate `@media (pointer: coarse)` block grows chips to 40px with a −4px overflow hit area, small pills to 44px, and rows to 72px. Android and a touchscreen laptop both get it; a narrow desktop window does not.

## Elevation & Depth

This system is tonally layered, not lifted. Depth is a lightness step on the surface ramp, and the elevation of a surface is readable from its tone alone. There is exactly **one** shadow token in the whole build.

### Shadow Vocabulary
- **Float** (`--shadow-float`: `0 8px 28px rgba(28,27,26,0.14), 0 2px 6px rgba(28,27,26,0.08)` light; `0 12px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)` dark): applied to four things only — the FAB, the live session pill, the snackbar, and the rail FAB on hover. All four are fixed-position and genuinely overlap scrolling content.

### Named Rules

**The Float-Only Shadow Rule.** A shadow means "this is not part of the page". Slabs, rows, inputs, chips, sheets, the navbar and the rail all carry zero shadow at every state. If an element scrolls with the content, it does not get `--shadow-float`.

**The Scrim Rule.** Modality is the only other depth device: `.scrim` at `rgba(0,0,0,0.42)` full-bleed behind a sheet. No blur, no backdrop-filter anywhere in the build.

## Shapes

Everything is soft and nothing is boxed. Four radius tokens carry the form language, and the size of the radius tracks the size of the thing:

- **Slab** (`--r-slab`, 28px): the large content surfaces — the Up-next slab, the takeaway slab, the video player, the full-width thumbnail, the desktop dialog.
- **Sheet** (`--r-sheet`, 32px): the top corners of the bottom sheet only, where it meets the screen edge.
- **Thumb** (`--r-thumb`, 14px): the 88px 16:9 list thumbnail.
- **Pill** (`--r-pill`, 999px): every button, every text input, the progress bar, the live pill, the dots, the switch.

Off-scale radii are deliberate and few: 20px on the FAB and textareas, 18px on a list row's hit area, 16px on the navigation indicator, 14px on the snackbar and skeleton, 10px on chips, 8px on the focus ring, 4px on heatmap cells.

**The Never-Boxed Rule.** No element in the system has a `border`. The only stroke-like treatments are `box-shadow: inset` on a focused input (`0 0 0 2px var(--primary) inset`) and on the off-state switch track (`inset 0 0 0 2px var(--on-surface-3)`) — both are state feedback, not structure. A "card" in this system is a `.slab`: a tone step with 28px corners and 24px padding, and it is used once or twice per screen, never as a repeating grid unit.

**The Squircle Family Rule.** Square-ish controls take a radius roughly a third of their size — 60px FAB at 20px, 56px rail FAB at 18px, 32px brand mark at 10px — so nothing ever reads as a circle unless it is a true pill.

## Components

### Buttons (`Pill`)
Buttery and physical: every pill is a capsule that compresses when you press it and paints a ripple from the point of contact.

- **Shape:** full capsule (`--r-pill`, 999px). Sizes are 38px (`sm`, grown to 44px on coarse pointers), 48px (default), 56px (`lg`). Icon-only variants are square-ish capsules at 40/48px.
- **Filled:** sage on white text (`--primary` / `--on-primary`), 0 22px padding. The single primary action per screen — Start, Analyze and save, Done.
- **Tonal:** `--surface-high` with ink text; hover lifts one step to `--surface-bright`. The default variant.
- **Soft:** `--primary-container` / `--on-primary-container`. **Text:** transparent with sage label and reduced 14px side padding; hover paints `--surface-low`. **Danger:** `--error-container` / `--on-error-container`.
- **States:** an absolutely-positioned `::after` state layer at `currentColor` reaches `opacity: 0.1` on `:active`. A ripple span is injected at the click point, scales to 2.6× over 520ms on `--out` and removes itself. `whileTap` scales the button to 0.96 on a stiff spring (600/30). Disabled drops to `opacity: 0.45`.
- **Loading:** the label is replaced by an 18px `Spinner` (0.8s linear rotation); the button disables itself.

### Chips
Small, rectangular-soft, and the only place in the system with a 10px radius.

- **Style:** `--surface-mid` with `--on-surface-2`, 36px tall, 10px radius, 500 weight at 14px.
- **Interactive** (`.chip-btn`, rendered when `onClick` is passed): selected state swaps to `--primary-container` / `--on-primary-container` and prepends a 14px check glyph. Unselected hover steps to `--surface-high`. `whileTap` scales to 0.95.
- **Static** (`.chip-static`): 28px tall at 12.5px, non-interactive. Tone variants `chip-primary` / `chip-warm` / `chip-error` carry status — "Saved", "Already saved", "AI unavailable".
- **Layout:** `.chips` wraps; `.chips-scroll` bleeds to the gutter edges and scrolls horizontally with the scrollbar hidden on phone, and wraps normally above 840px.

### Cards / Containers (`.slab`)
The one boxed thing in the system, and it is not boxed — it is a lighter patch of the same material.

- **Corner:** 28px (`--r-slab`). **Background:** `--surface-low` by default; `slab-mid` for a second step; `slab-primary` and `slab-warm` for tonal emphasis.
- **Padding:** 24px (`--s-6`). **Shadow:** none, ever. **Border:** none.
- Inside `slab-primary`, secondary text is derived rather than tokenised: `color-mix(in srgb, var(--on-primary-container) 78%, transparent)`.

### Inputs / Fields
- **Style:** 52px capsule filled with `--surface-mid`, no border, 20px side padding, 15px text. `.input-lg` is 56px/16px. Textareas break the capsule to a 20px radius with 96px min-height and 14px/20px padding.
- **Focus:** the fill steps up to `--surface-high` and a 2px sage inset ring appears (`box-shadow: 0 0 0 2px var(--primary) inset`). The browser outline is suppressed here only; everywhere else `:focus-visible` draws a 2px `--primary` outline at 2px offset with an 8px radius.
- **Search:** `.searchbar` inlines a 18px icon at 18px from the left in `--on-surface-3` and pads the 56px field to 48px on the left.
- **Label:** `.label`, 13px/500 in `--on-surface-2`, indented 4px to sit under the capsule's curve.

### Navigation
One set of destinations rendered twice — bottom bar on phone, rail on desktop — sharing one animated indicator.

- **Bar** (`.navbar`): fixed, 80px plus the bottom safe inset, `--surface-low`, a four-column grid, no top border.
- **Rail** (`.rail`): fixed left, 88px, `--surface-low`, with the brand mark (32px sage square, 10px radius) and a 56px `--primary-container` add button above the destinations. The rail FAB is the only element that gains `--shadow-float` on hover.
- **Indicator:** a 64×32px 16px-radius `--primary-container` pill behind the active icon. It is a `motion` element with a shared `layoutId` (`"nav-pill"` / `"rail-pill"`) so it slides between destinations on the standard spring instead of cutting.
- **States:** inactive destinations are `--on-surface-2` with 1.9 stroke-width icons; active is `--on-surface` with 2.4 stroke and `--on-primary-container` inside the pill. Labels are 12px/500 at all times — never hidden.

### Sheet / Dialog
One component, two renditions decided at 840px.

- **Phone:** anchored to the bottom, `--surface-low`, 32px top corners, `max-height: 92dvh`, a 32×4px grip capsule centred above the content. It enters on `y: 100% → 0` with a spring (380/36/0.9) and is draggable downward — release past 100px of offset or 700px/s of velocity dismisses it.
- **Desktop:** centred dialog, `--surface-mid`, 28px corners, `min(520px, 100vw − 48px)`, 24px/32px padding, grip hidden. It enters by scaling 0.96 → 1 with opacity. A text close button appears in the header row.
- Both dismiss on scrim click and on Escape. Under `prefers-reduced-motion` both collapse to a plain opacity fade and drag is disabled.

### Snackbar
The one inverted surface. Fixed, centred, above the navbar (or 32px from the bottom on desktop), `--inverse-surface` / `--inverse-on-surface`, 14px radius, 12px/18px padding, 14px/500, `--shadow-float`, single line with no wrap. It springs in from 16px below and auto-dismisses after 2800ms.

### Rows (`.rowitem`)
The quiet list you scroll past. A borderless flex row with a 64px min height (72px on coarse pointers), 14px gap, and an 18px-radius hit area that bleeds 12px past the column on both sides so the hover fill reads as a target rather than a box. Hover paints `--surface-low`, press paints `--surface-mid`. Leading element is an 88px 16:9 `--surface-mid` thumbnail at 14px radius, falling back to a source glyph when there is no image. Title is 15.5px/500; the facts line is `.meta`. Completed rows drop the thumbnail to 0.55 opacity and the title to `--on-surface-3`.

### Live Session Pill
The signature component, and the reason the Recorder grammar was chosen. A fixed capsule on `--surface-bright` with `--shadow-float`, sitting above the navbar on phone and beside the rail on desktop. It carries a 10px `--error` dot animating on a 1.6s `breathe` keyframe (scale 1 → 0.6, opacity 1 → 0.5 and back), the item title on one truncated line, a tabular-figure elapsed timer ticking every second, a text stop button and a filled Done pill. It springs up from 30px below when a session starts and back down when it ends. The same breathing dot appears at 1.2s inside an active `.step` in the add-sheet progress list.

### Feedback States
- **Skeleton:** `--surface-mid` block at a 14px default radius with a 1.4s shimmer sweeping `--surface-high` across it. Height, width and radius are props; Home uses a 220px block at 28px radius so the placeholder is the exact shape of the slab it replaces.
- **Empty:** 56px/20px padding, a `.headline-sm` in `--on-surface`, prose in `--on-surface-3` capped at 360px, and an optional action. No illustration, no icon.
- **ErrorState:** the same shape with the container tinted `--error`, a fixed ink title, the real error message, and a tonal Retry pill.

### Progress & Data Marks
- **Bar** (`.bar`): 4px, fully rounded, `--surface-high` track with a `--primary` fill that animates from `width: 0` over 700ms. The only meter in the system.
- **Dots** (`.dots`): five 5px dots, filled `--primary` and unfilled at 0.35 opacity — the relevance score, always inline in a `.meta` row.
- **Heatmap** (`.heat`): 7-row grid flowing in columns, 4px square cells at a 4px radius, four levels built by `color-mix` of `--primary` into `--surface-mid` at 30/55/78/100%.
- **Bars** (`.bars`): 88px-tall weekly columns, `--surface-high` with the current week in `--primary`, rounded 8px at the top and 4px at the base.
- **Switch:** 52×32px track, `--surface-high` with a 2px inset `--on-surface-3` ring when off, solid `--primary` when on; the 24px thumb scales 0.66 → 1 and translates 20px on the `--spring` curve. A −8px `::before` inset gives it a 48px hit area.

### Motion
Motion is a system property here, not per-component decoration. Four presets cover the whole build.

- **Curves:** `--spring` `cubic-bezier(0.2, 0, 0, 1)` for CSS transforms; `--out` `cubic-bezier(0.05, 0.7, 0.1, 1)` — Material's emphasised-decelerate — for everything that enters or changes colour. Durations are `--dur-fast` 150ms (colour and state layers), `--dur` 240ms (shape and transform), `--dur-slow` 400ms.
- **JS presets** (`src/components/ui.tsx`): `spring` (stiffness 420, damping 36, mass 0.8) is the default for layout, indicators, taps and the snackbar; `easeOut` (0.32s on the `--out` curve) for content that fades in; `springSoft` (260/30) is defined as the gentler option. Button taps use a stiffer inline 600/30.
- **The One Entrance Rule.** `<Page>` animates once — opacity 0→1 and y 10→0 over 360ms on the `--out` curve — and sections inside it do not animate separately. `<Rise>` is a plain wrapper that exists to mark those sections; it deliberately renders no animation of its own. The only nested motion allowed is a list stagger: `stagger` fires children 45ms apart with the `rise` variant (opacity + 10px), used on `.rows`.
- **Shared elements.** The list thumbnail carries `layoutId={"thumb-" + item.id}` so it morphs from the 88px row thumb into the detail header. The navigation indicator carries a shared `layoutId` across destinations. These are the only two shared-element transitions.
- **The welcome sequence.** Onboarding's first screen is the one scripted moment: the 88px mark scales in on a soft spring, its two strokes draw by `pathLength` at 0.35s and 0.7s, the headline reveals word by word at 60ms intervals after a 900ms hold (each word rising 18px out of a 6px blur), and the supporting paragraph fades in at 1.6s. Nothing else in the app stages itself this way.
- **Reduced motion.** A global rule clamps every animation and transition to 0.01ms. On top of that, `useReducedMotion` removes the page entrance entirely, collapses the sheet to a fade, and disables drag-to-dismiss.

## Do's and Don'ts

### Do:
- **Do** separate surfaces by stepping the tonal ramp (`--surface` → `--surface-low` → `--surface-mid` → `--surface-high` → `--surface-bright`), and reach for space before reaching for a second step.
- **Do** give every screen exactly one `.display` line and at most one filled sage pill.
- **Do** compose every fixed element with `--safe-top` / `--safe-bottom` and with `--nav-h`; the phone target has a punch-hole camera and gesture navigation.
- **Do** wrap a screen in `<Page>` and let that be its only entrance animation; use `stagger` + `rise` only on a list of rows.
- **Do** use `.num` on anything that ticks or counts — timers, streaks, minute totals — so digits do not jitter.
- **Do** set secondary copy in `--on-surface-2` (≥5.62:1 on every light surface, ≥5.77:1 on every dark one) and reserve `--on-surface-3` for 13px meta lines.
- **Do** add new size variants to the coarse-pointer block if they are drawn under 44px; `.pill-sm` and `.chip` both already do this.
- **Do** keep the sage accent under roughly a tenth of any screen. Its rarity is what makes the Start pill obvious.

### Don't:
- **Don't** add a `border`, a `border-top`, a divider rule or an `<hr>`. The system has none and the tonal step is the replacement.
- **Don't** build a card grid, a KPI tile row, or any repeating boxed unit. Numbers are set as a sentence in a `.headline`; lists are borderless `.rowitem` rows.
- **Don't** apply `--shadow-float` to anything that scrolls with the page. Shadow means fixed and floating — FAB, live pill, snackbar, rail FAB on hover.
- **Don't** introduce a second breakpoint, a second font family, or a font weight above 500.
- **Don't** uppercase or letterspace a label for emphasis; `.section-title` is sentence case at +0.01em and that is the ceiling.
- **Don't** put `--warm` text on `--surface-mid` or `--surface-high` (4.32:1 / 4.01:1). Use `--warm-container` with `--on-warm-container` there.
- **Don't** animate a section inside a `<Page>`. If something needs its own entrance, it is probably a new page.
- **Don't** hardcode a hex in a component. Every colour in the build comes from a token so that both themes and the `data-theme` override keep working.
- **Don't** stage a scripted multi-beat animation outside the onboarding welcome. One entrance, then the interface holds still.

## Accessibility

Facts true of the built stylesheets, verified by computing WCAG contrast on the token pairs:

- **Text contrast.** `--on-surface` ranges 12.82–17.20:1 (light) and 9.90–14.86:1 (dark) across the ramp. `--on-surface-2` never drops below 5.62:1 light / 5.77:1 dark. `--on-surface-3`, the quietest text in the system, holds ≥4.45:1 on every light surface (floor: 4.45:1 on `--surface-high`) and ≥5.17:1 on every dark surface except `--surface-bright`, where it measures 4.36:1 — the elapsed-time line inside the live session pill in dark mode is the one pairing under 4.5:1 and the only place that pairing occurs.
- **Container pairs** all clear AAA for body text: `--on-primary-container` on `--primary-container` at 10.59:1 light / 7.57:1 dark, warm at 9.77:1 / 9.19:1, error at 12.77:1 / 9.43:1, and the inverted snackbar at 11.93:1 / 13.73:1.
- **Touch targets.** `@media (pointer: coarse)` guarantees 44px+ on every control: chips grow to 40px with a −4px overflow hit area (48px effective), `.pill-sm` grows to 44px, rows to 72px. The switch carries a −8px `::before` inset. Inline text actions in the detail screen set an explicit 44px `min-height`.
- **Focus.** A single global `:focus-visible` rule draws a 2px `--primary` outline at 2px offset with an 8px radius. Inputs override it with a 2px sage inset ring so the capsule shape is preserved. `-webkit-tap-highlight-color` is transparent because the ripple and state layer replace it.
- **Motion.** `prefers-reduced-motion: reduce` clamps all CSS animation and transition to 0.01ms; `useReducedMotion` additionally disables the page entrance, the sheet's slide and the sheet's drag gesture.
- **Theme.** `prefers-color-scheme: dark` applies the dark ramp under `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]` applies it unconditionally, so the in-app System / Light / Dark preference wins over the OS in both directions. `color-scheme: light dark` and matching `theme-color` meta tags keep native scrollbars and the Android status bar in step.
- **Semantics.** The switch is a `role="switch"` button with `aria-checked`; the relevance dots carry an `aria-label`; the sheet is `role="dialog" aria-modal` with Escape handling; every icon-only control has an `aria-label`; decorative thumbnails use `alt=""`.
