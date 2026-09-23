export type ItemStatus = "inbox" | "queued" | "in_progress" | "completed" | "skipped";
export type ItemSource = "youtube" | "instagram" | "article" | "other";

export interface Category {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface ItemAI {
  summary: string | null;
  key_concepts: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  prerequisites: string[];
  why_it_matters: string | null;
  takeaway: string | null;
  segments: { start: string; end: string; label: string }[];
  resources: { title: string; url: string }[];
  overlap: string | null;
  model: string | null;
  error: string | null;
  transcript_status: string | null;
  possible_duplicate: { id: string; title: string } | null;
  related_item: { id: string; title: string } | null;
}

export interface Item {
  id: string;
  url: string;
  canonical_url: string;
  source: ItemSource;
  external_id: string | null;
  title: string | null;
  description: string | null;
  channel: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  has_transcript: boolean;
  transcript: string | null;
  category_id: string | null;
  category: Category | null;
  tags: string[];
  status: ItemStatus;
  ai: Partial<ItemAI>;
  relevance_score: number | null;
  estimated_minutes: number | null;
  notes: string | null;
  added_via: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface NotificationSettings {
  enabled: boolean;
  quiet_start: string; // "22:00"
  quiet_end: string; // "08:00"
  max_per_day: number;
  muted_categories: string[];
  preferred_hours?: number[]; // manual override, else learned
}

export interface Profile {
  id: string;
  display_name: string | null;
  goal: string;
  interests: string[];
  daily_target_minutes: number;
  settings: Partial<NotificationSettings> & {
    theme?: "system" | "light" | "dark";
    break_until?: string | "indefinite" | null; // ISO day (inclusive) or "indefinite", null = not on a break
    break_started?: string | null; // ISO day the current/last break began, for streak neutrality
    break_reason?: string | null;
    weekly_recap?: boolean;
    warn_duplicates?: boolean; // default true — flag likely-duplicate saves at save-time
  };
  onboarded: boolean;
}

export interface LearningSession {
  id: string;
  item_id: string | null;
  started_at: string;
  ended_at: string | null;
  seconds: number;
}

export interface DailyActivity {
  day: string; // YYYY-MM-DD
  seconds: number;
  completed: number;
  added: number;
}

export interface CoachResult {
  pick_item_id: string | null;
  headline: string;
  message: string;
  reason: string;
  focus_category: string | null;
  weak_spot: string | null;
  stats: { minutes28: number; completed28: number; added28: number; activeDays: number; daysSinceActive: number | null };
  fetched_at?: number;
}
