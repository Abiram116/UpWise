/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_EMAIL?: string;
  readonly VITE_APP_PASSWORD?: string;
  readonly VITE_RELEASE_REPO?: string;
}
