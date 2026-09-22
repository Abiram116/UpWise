# UpWise

Personal AI learning tracker. Save YouTube/Instagram/article links → the app reads them, tells you what they teach and how long they really take, tracks what you actually learned, and nudges you at the times you tend to learn.

- **Windows + Android** from one codebase (Tauri v2 + React/TS, Rust for the native side)
- **Supabase** for sync (Postgres + Edge Functions), **Groq** for the AI, **YouTube Data API** for metadata
- No login screen: a built-in account signs in silently on both devices

## Setup (once)

```bash
cp .env.example .env        # fill in Supabase URL/key + the built-in account
npm install
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase secrets set GROQ_API_KEY=... YOUTUBE_API_KEY=...
npx supabase functions deploy analyze-link --no-verify-jwt
npx supabase functions deploy coach --no-verify-jwt
```

## Develop

```bash
npm run tauri dev                              # desktop
npm run tauri android build -- --debug --apk --target aarch64 --ci   # debug APK
```

## Releasing a new version (this is how both apps update)

1. Bump the version in `src-tauri/tauri.conf.json` **and** `package.json` (e.g. `0.2.0`).
2. Commit, then tag and push:
   ```bash
   git tag v0.2.0 && git push && git push --tags
   ```
3. GitHub Actions (`.github/workflows/release.yml`) builds the Windows installer + `latest.json` and the signed Android APK, and attaches them to a GitHub Release.
4. **Windows** app: checks `latest.json` on launch / from Settings → downloads, verifies the signature, installs, relaunches.
5. **Android** app: checks the GitHub Releases API → "Update available" → downloads the APK → tap to install over the current version (same signing key, so data is kept).

### Secrets the workflow needs

Repository → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_NAME`, `VITE_APP_EMAIL`, `VITE_APP_PASSWORD` | same as your `.env` |
| `TAURI_SIGNING_PRIVATE_KEY` | contents of `~/.upwise-keys/updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | empty |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 ~/.upwise-keys/upwise-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD` | from `~/.upwise-keys/keystore.properties` |
| `ANDROID_KEY_ALIAS` | `upwise` |

**Back up `~/.upwise-keys/`.** Lose the updater key and Windows can't auto-update; lose the keystore and Android can't update in place.

## Layout

```
src/                 React app (screens, components, lib)
src-tauri/           Rust side: plugins + YouTube transcript fetcher
src-tauri/gen/android  Android project (share-sheet intent in MainActivity.kt)
supabase/migrations  Postgres schema (RLS on everything)
supabase/functions   analyze-link (metadata + Groq), coach (what to learn now)
```
