# UpWise — Plans

Living backlog of things to build next. Nothing here is built yet — this is the roadmap, not a changelog. Grouped by theme, roughly in priority order within each group.

## 1. Bugs & core UX (do these first)

- [x] **Add-sheet gets stuck.** ~~It currently blocks closing while analyzing~~ Fixed: the sheet can be dismissed anytime now; the analyze call keeps running in the background (each attempt tracked by id) and reports via toast on completion instead of blocking the screen. Verified in the desktop build — dismiss mid-analysis unblocks the UI immediately, the item still lands in the library, reopening shows a clean form.
- **Status bar invisible in light mode.** Edge-to-edge is on but nothing tells Android to switch status bar icons to dark when the app background is light. Native fix: `setAppearanceLightStatusBars`, toggled whenever the theme changes.
- **App icon missing on both platforms.** Icons are correctly embedded (verified via `apksigner` and file inspection) — Windows was a cache issue, needs confirming after a clean reinstall. Android needs investigating separately — likely an adaptive-icon safe-zone/masking issue. Do a clean uninstall/reinstall on both, verify with a real screenshot.
- [x] **Copy audit.** Checked all "add link" copy — already source-agnostic everywhere except the Home empty-state, which leaned YouTube-first; broadened to mention YouTube/Instagram/paste evenly.

## 2. Content reliability

- **Instagram Reels — actually fixable.** Pull the public video URL, extract audio, transcribe with Groq Whisper, run it through the same pipeline as YouTube. Real transcript instead of a guess.
- **Instagram carousel posts — capped by no-login access.** Can't read slide 2+ without Instagram auth (out of scope). Instead: detect it's a carousel, prompt harder for a note, stop pretending confidence.
- **Articles — fallback chain.** Jina Reader → direct fetch + readability extraction → explicit "couldn't read this" instead of a thin guess. Handle PDFs and paywalls explicitly.
- [x] **"Limited info" trust badge.** Done: `has_transcript` now also covers extracted article text (was silently false for every article before), and a new `confidence()` helper shows "Limited info" / "AI unavailable" on the item row and detail page whenever analysis worked from just a title. Verified against real seeded items — badge appears exactly where it should.

## 3. Performance

- **Android (Tensor G3): optimize, never cut animation.** Every bit of motion stays. Swap expensive `backdrop-filter` blur for cheaper equivalents that look the same, disable `refetchOnWindowFocus` (app-switching shouldn't trigger network churn), profile on-device and fix real bottlenecks — jank, dropped frames, cold start — not the animations themselves.
- **Windows: can be simpler.** Basic transitions are fine here. Priority is low idle CPU/RAM over matching the mobile motion richness — trim timers, avoid unnecessary background work.

## 4. Polish (small, not a redesign)

- Tighten onboarding animation timing/easing further; consider haptic feedback on Android button presses.
- Home screen: shorter, punchier AI coach message (cap it much tighter than today); small completion micro-interaction when marking something done.

## 5. Companion / personalization

- [x] **Context-aware home message.** Done: coach now knows days since your last session/completion and what you recently finished, with explicit tone branches (warm re-entry after 4+ quiet days, lean in on a streak, simple first-message welcome, mention a growing backlog only when it's a real problem). Verified via test-coach.mjs against the real account. Still open: quiet mode during a declared break, which depends on streak-freeze below.
- **Streak freeze / take a break mode.** Settings gets a "Take a break" action — pick a date range (or "until I resume"), optional reason. No artificial limits, it's just you. Streak logic treats break days as neutral (doesn't break the streak, doesn't demand the daily target). Notifications go silent automatically. Home shows "On a break until [date]" instead of a guilt-inducing progress bar.

## 6. Notifications

- **Quick actions in the notification itself.** Android notification action buttons — "Mark done," "Snooze 1hr," "Skip" — right in the tray, no need to open the app. `tauri-plugin-notification` already exposes `registerActionTypes` for this; needs wiring to the coach's nudges.
- **Weekly recap.** Sunday-night digest: what you learned this week, streak, one suggested focus for next week.

## 7. New features

- **Batch import from Telegram.** Paste a wall of old links at once; the app queues and analyzes them all — makes migrating an existing Telegram backlog painless instead of one-at-a-time.
- **Backlog grooming prompt.** Anything sitting unopened 14+ days gets surfaced with an explicit keep/skip/delete decision instead of silently piling up forever.
- [x] **Always-have-a-quick-win.** Done: coach prompt now guarantees the shortest reasonable item gets suggested when nothing fits the available time well, rather than suggesting nothing. Bundled with the context-aware message change above.
- [x] **Skills export for resume/portfolio.** Done: Settings → Export → Skills summary, grouped by category with deduplicated AI-extracted key concepts, copy-to-clipboard. Verified live with real completed items across two categories.
- [x] **Duplicate/overlap quick action.** Done: one-tap "Skip, I know this" pill under the overlap note on the detail page. Verified live — seeded a genuinely overlapping video, confirmed Groq flagged it, tapped the button, status updated correctly.

## 8. Docs

- **README rewrite.** Lead with the actual story (final-year student, Telegram link-hoarding problem, built this to fix it) instead of a feature dump. Keep setup/dev commands short, pushed toward the bottom. Add custom SVG illustrations in the same Material 3 tonal language already used in the app (sage/apricot palette, squircle/pill shapes, no stock icons) so the README visually matches the product.
