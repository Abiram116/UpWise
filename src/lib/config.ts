// GitHub repo that hosts releases (used for Android update checks). Format: "owner/repo".
export const RELEASE_REPO = import.meta.env.VITE_RELEASE_REPO ?? "Abiram116/UpWise";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const DEFAULT_NOTIFICATIONS = {
  enabled: true,
  quiet_start: "23:00",
  quiet_end: "08:00",
  max_per_day: 2,
  muted_categories: [] as string[],
};

export const COACH_TTL_MS = 6 * 60 * 60 * 1000;
