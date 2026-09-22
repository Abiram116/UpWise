# UpWise — Plans

Living backlog of things to build next. Nothing here is built yet — this is the roadmap, not a changelog. Grouped by theme, roughly in priority order within each group.

## 1. Bugs & core UX (do these first)

- **Add-sheet gets stuck.** It currently blocks closing while analyzing (`Sheet onClose: busy ? () => {} : close`) to protect the in-flight request. If the WebView suspends while backgrounded and resumes oddly, you're stuck behind an unclosable scrim. Fix: let the sheet be dismissed anytime; the analyze call keeps running in the background and finishes with a toast, like a normal upload notification instead of a blocking modal.
- **Status bar invisible in light mode.** Edge-to-edge is on but nothing tells Android to switch status bar icons to dark when the app background is light. Native fix: `setAppearanceLightStatusBars`, toggled whenever the theme changes.
- **App icon missing on both platforms.** Icons are correctly embedded (verified via `apksigner` and file inspection) — Windows was a cache issue, needs confirming after a clean reinstall. Android needs investigating separately — likely an adaptive-icon safe-zone/masking issue. Do a clean uninstall/reinstall on both, verify with a real screenshot.
- **Copy audit.** Remove any leftover YouTube-only phrasing ("add a YT link" style text) — should read as source-agnostic everywhere since YouTube, Instagram, and articles all work.

## 2. Content reliability

- **Instagram Reels — actually fixable.** Pull the public video URL, extract audio, transcribe with Groq Whisper, run it through the same pipeline as YouTube. Real transcript instead of a guess.
- **Instagram carousel posts — capped by no-login access.** Can't read slide 2+ without Instagram auth (out of scope). Instead: detect it's a carousel, prompt harder for a note, stop pretending confidence.
- **Articles — fallback chain.** Jina Reader → direct fetch + readability extraction → explicit "couldn't read this" instead of a thin guess. Handle PDFs and paywalls explicitly.
- **"Limited info" trust badge.** Whenever an item's analysis worked from just a title (no transcript/content), show a small badge on the card and detail page instead of presenting full confident output. Visibility over false confidence — this is the direct fix for "information isn't reliable."

## 3. Performance

- **Android (Tensor G3): optimize, never cut animation.** Every bit of motion stays. Swap expensive `backdrop-filter` blur for cheaper equivalents that look the same, disable `refetchOnWindowFocus` (app-switching shouldn't trigger network churn), profile on-device and fix real bottlenecks — jank, dropped frames, cold start — not the animations themselves.
- **Windows: can be simpler.** Basic transitions are fine here. Priority is low idle CPU/RAM over matching the mobile motion richness — trim timers, avoid unnecessary background work.

## 4. Polish (small, not a redesign)

- Tighten onboarding animation timing/easing further; consider haptic feedback on Android button presses.
- Home screen: shorter, punchier AI coach message (cap it much tighter than today); small completion micro-interaction when marking something done.

## 5. Companion / personalization

- **Context-aware home message.** The coach should feel like it knows you, not read a generic line. Needs: days since last session, recent topics/categories, and explicit tone branches — welcoming re-entry after a break (4+ days quiet, not guilt), leaning in during a hot streak, mentioning a growing backlog without nagging daily, quiet mode during a declared break.
- **Streak freeze / take a break mode.** Settings gets a "Take a break" action — pick a date range (or "until I resume"), optional reason. No artificial limits, it's just you. Streak logic treats break days as neutral (doesn't break the streak, doesn't demand the daily target). Notifications go silent automatically. Home shows "On a break until [date]" instead of a guilt-inducing progress bar.

## 6. Notifications

- **Quick actions in the notification itself.** Android notification action buttons — "Mark done," "Snooze 1hr," "Skip" — right in the tray, no need to open the app. `tauri-plugin-notification` already exposes `registerActionTypes` for this; needs wiring to the coach's nudges.
- **Weekly recap.** Sunday-night digest: what you learned this week, streak, one suggested focus for next week.

## 7. New features

- **Batch import from Telegram.** Paste a wall of old links at once; the app queues and analyzes them all — makes migrating an existing Telegram backlog painless instead of one-at-a-time.
- **Backlog grooming prompt.** Anything sitting unopened 14+ days gets surfaced with an explicit keep/skip/delete decision instead of silently piling up forever.
- **Always-have-a-quick-win.** Coach logic guarantees at least one sub-10-minute item is always ready to suggest, for nights with only a few minutes.
- **Skills export for resume/portfolio.** Generated summary of what's been learned, grouped by category, copyable for LinkedIn/resume — this project doubles as an AI Engineer prep record.
- **Duplicate/overlap quick action.** When AI flags overlap with something already in the library, a one-tap "skip, I know this" instead of just a text note.

## 8. Docs

- **README rewrite.** Lead with the actual story (final-year student, Telegram link-hoarding problem, built this to fix it) instead of a feature dump. Keep setup/dev commands short, pushed toward the bottom. Add custom SVG illustrations in the same Material 3 tonal language already used in the app (sage/apricot palette, squircle/pill shapes, no stock icons) so the README visually matches the product.
