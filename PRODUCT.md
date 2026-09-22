# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Tauri v2 webview shipped as a Windows desktop app and an Android APK. One UI codebase; the primary usage device is a Pixel 8, the secondary is a Windows laptop in a frameless window.)

## Users

One user: Abiram, a final-year B.Tech student preparing for AI Engineer roles. He saves learning content he scrolls past (YouTube videos, Instagram reels, articles) and never returns to it — previously by pasting links into Telegram Saved Messages. He uses the app in short gaps during the day on his phone (share from YouTube, glance at what to do next) and in longer sittings on the laptop (actually watch/learn, review progress).

## Product Purpose

Turn saved links into things he actually learned. The app reads each link (transcript, description), tells him what it teaches, how relevant it is to his goal and how long it *really* takes, keeps a queue, tracks learning time and completion, and nudges him at the times he tends to learn. Success = the backlog shrinks and the weekly "learned" count trends up; the honest metric is Saved → Started → Completed.

## Positioning

Not a bookmark manager and not a course app. It is a personal coach that already knows the content of what he saved and his goal, so it can say "do this one, it's 12 minutes and covers eval pipelines, your weakest area" instead of showing a list of 40 links.

## Operating Context

- Capture: Android share sheet (YouTube → Share → UpWise) or paste on desktop (Ctrl+V anywhere).
- Learn: mostly watching YouTube (embedded on desktop, opened in the YouTube app on phone) with an in-app session timer; sometimes reading the AI takeaway and skipping the video.
- Review: Today (what to do now, daily minutes vs target, streak), Library (queue by category/status), Progress (consistency heatmap, weekly velocity, backlog health, per-area coverage), Settings (goal, nudges with quiet hours/max-per-day/muted categories, appearance, updates).
- Notifications: at most 1–3/day, at learned active hours, never in quiet hours; tapping opens the suggested item.
- Single silent account; no login UI. Data syncs between phone and laptop via Supabase.

## Capabilities and Constraints

- Sources: YouTube (full: metadata + transcript + chapters), articles (clean text via reader), Instagram (best effort: title/caption only; user adds a note).
- AI output per item: clean title, summary, key concepts, category (auto-created), tags, difficulty, prerequisites, relevance 1–5, why-it-matters, real learning minutes, optional "takeaway" (skip-the-video lesson), worth-watching segments, extracted resources, overlap with existing library.
- Item statuses: inbox → queued → in_progress → completed / skipped.
- Explicitly out of scope: quizzes, notes-as-feature, multi-user, Instagram scraping.
- Technical: hand-written CSS (no Tailwind), React 19, `motion/react` for animation, lucide icons, system font stack, must render in Android WebView and WebView2. Android safe areas (punch-hole, gesture nav). Desktop window is frameless with custom controls. Light and dark themes required.

## Brand Commitments

- Name: UpWise. Icon: a single white ascending arrow on a violet→indigo gradient rounded square (branding/icon.svg). The arrow is the only mandated brand mark; the gradient is not required inside the app.
- Voice: blunt but kind coach. Short sentences. No emoji in UI copy. Honest about low-value content.
- User-stated visual constraints (binding): Material You / Pixel-inspired tonal surfaces; soft, muted colours; dark theme and light theme; minimal; few boxes and borders; lighter typography; buttery animations; must not read as a generic AI-generated SaaS dashboard.

## Evidence on Hand

- Working data pipeline and real analyzed items exist in the database (e.g. "Retrieval-Augmented Generation (RAG) Explained", "Intro to Large Language Models") with AI fields populated; use these shapes, do not invent fake stats.
- No testimonials, marketing claims, or third-party content.

## Product Principles

1. The next action is the interface: every screen should make "do this one now" the easiest thing to do.
2. Honesty over motivation theatre: real minutes, real streaks, growing-backlog warnings.
3. Zero friction capture: sharing or pasting a link is the whole job; the app does the rest.
4. Calm by default: nothing shouts; colour and motion mark meaning, not decoration.
5. One user, one goal: everything is filtered through "does this help me become an AI Engineer".
