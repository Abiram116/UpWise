import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronRight, Coffee, Copy, CopyCheck, Download, FileText, Moon, RefreshCw, Target, User } from "lucide-react";
import { useActivity, useProfile, useUpdateProfile, useItems, useSessions } from "../lib/api";
import { ensurePermission, replanNotifications, settingsOf } from "../lib/notifications";
import { describeError, isNetworkError } from "../lib/errors";
import "../lib/android-bridge";
import { checkForUpdate, currentVersion, type UpdateInfo } from "../lib/updater";
import { isTauri, platform } from "../lib/platform";
import { RELEASE_REPO } from "../lib/config";
import { applyTheme, type Theme } from "../theme";
import { formatSkillsExport, skillsSummary, isOnBreak } from "../lib/stats";
import { isoDay, pluralize } from "../lib/utils";
import { extractNotes } from "../lib/changelog";
import type { Profile } from "../lib/types";
import { useCoach } from "./Home";
import { Chip, ErrorState, Page, Pill, Rise, Segmented, Sheet, Skeleton, Switch, useToast } from "../components/ui";

const TARGETS = [15, 30, 45, 60, 90];

export function SettingsScreen() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const items = useItems();
  const sessions = useSessions(30);
  const activity = useActivity(14);
  const toast = useToast();
  const { coach } = useCoach(false);
  const [version, setVersion] = useState("");
  const [upd, setUpd] = useState<UpdateInfo | null | "none">(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>((localStorage.getItem("upwise:theme") as Theme) || "system");

  useEffect(() => { currentVersion().then(setVersion); }, []);

  const sessionsAll = useSessions(365); // export should cover everything completed, not just the last 30 days
  const skillsText = useMemo(() => {
    if (!items.data || !sessionsAll.data || !profile.data) return "";
    return formatSkillsExport(skillsSummary(items.data, sessionsAll.data), profile.data.goal, profile.data.display_name);
  }, [items.data, sessionsAll.data, profile.data]);

  const p = profile.data;
  const s = settingsOf(p);
  const onBreak = isOnBreak(p?.settings);
  const fail = (what: string) => (e: unknown) => toast(`${what} — ${describeError(e).message}`);
  // Once Android has been told "no", it never shows the permission dialog again — the only
  // way back is the app's notification settings, so offer that instead of a dead end.
  const notificationsBlocked = () => toast(
    "Notifications are blocked for UpWise",
    window.AndroidNative?.openNotificationSettings ? { label: "Settings", onClick: () => window.AndroidNative?.openNotificationSettings?.() } : undefined,
  );
  const saveSettings = async (patch: Partial<Profile["settings"]>) => {
    const next = { ...(p?.settings ?? {}), ...patch };
    if ((patch.enabled || patch.weekly_recap) && isTauri && !(await ensurePermission())) { notificationsBlocked(); return; }
    try { await update.mutateAsync({ settings: next }); }
    catch (e) { fail("Couldn't save that")(e); return; }
    if (p && items.data && sessions.data) {
      const n = await replanNotifications({ profile: { ...p, settings: next }, items: items.data, sessions: sessions.data, coach, activity: activity.data });
      if (patch.enabled !== undefined) toast(patch.enabled ? (onBreak ? "On — they'll start when your break ends" : `On · ${pluralize(n, "notification")} planned for the next 2 days`) : "Notifications off");
    }
  };

  const doCheck = async () => {
    setChecking(true);
    try { const u = await checkForUpdate(); setUpd(u ?? "none"); }
    catch (e) { toast(isNetworkError(e) || !navigator.onLine ? "Can't check for updates offline" : `Update check failed — ${describeError(e).message}`); }
    finally { setChecking(false); }
  };

  if (!p) {
    return (
      <Page>
        <h1 className="display">Settings</h1>
        {profile.isError ? <ErrorState error={profile.error} onRetry={() => profile.refetch()} /> : <><Skeleton h={64} r={18} /><Skeleton h={64} r={18} /></>}
      </Page>
    );
  }

  return (
    <Page>
      <Rise><header><h1 className="display">Settings</h1></header></Rise>

      <Group title="You">
        <button className="setting" onClick={() => setGoalOpen(true)}>
          <span className="setting-icon"><User size={18} /></span>
          <div className="grow"><div className="title-sm">{p.display_name ?? "You"}</div><div className="meta">{p.goal}{p.interests.length ? ` · ${p.interests.slice(0, 3).join(", ")}` : ""}</div></div>
          <ChevronRight size={18} className="meta" />
        </button>
        <div className="setting">
          <span className="setting-icon"><Target size={18} /></span>
          <div className="grow"><div className="title-sm">Daily target</div><div className="meta">What you'll realistically hit</div></div>
          <select className="input" style={{ width: 104, height: 40, padding: "0 14px" }} value={p.daily_target_minutes} onChange={(e) => update.mutate({ daily_target_minutes: +e.target.value }, { onError: fail("Couldn't save your target") })}>
            {TARGETS.map((t) => <option key={t} value={t}>{t} min</option>)}
          </select>
        </div>
        <div className="setting" style={{ flexWrap: "wrap" }}>
          <span className="setting-icon"><Moon size={18} /></span>
          <div className="grow title-sm">Appearance</div>
          <Segmented value={theme} onChange={(t) => { setTheme(t); applyTheme(t); }} options={[{ value: "system", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
        </div>
        <button className="setting" onClick={() => setBreakOpen(true)}>
          <span className="setting-icon"><Coffee size={18} /></span>
          <div className="grow">
            <div className="title-sm">{onBreak ? "On a break" : "Take a break"}</div>
            <div className="meta">
              {onBreak
                ? p!.settings.break_until === "indefinite" ? "Until you resume" : `Until ${new Date(p!.settings.break_until as string).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                : "Pause nudges, keep your streak"}
            </div>
          </div>
          <ChevronRight size={18} className="meta" />
        </button>
      </Group>

      <Group title="Notifications" hint={onBreak ? "Paused while you're on a break." : "A morning plan, a nudge for things waiting too long, and a reminder when today's goal is close — timed from when you actually learn. Wins show up in the app, not as notifications."}>
        <div className="setting">
          <span className="setting-icon"><Bell size={18} /></span>
          <div className="grow"><div className="title-sm">Smart notifications</div><div className="meta">{isTauri ? "UpWise decides when — you just get the useful ones" : "Available in the installed app"}</div></div>
          <Switch on={s.enabled} onChange={(v) => saveSettings({ enabled: v, weekly_recap: v })} label="Smart notifications" />
        </div>
      </Group>

      <Group title="Export" hint="A summary of what you've learned, by area — for a resume or LinkedIn.">
        <button className="setting" onClick={() => setExportOpen(true)}>
          <span className="setting-icon"><FileText size={18} /></span>
          <div className="grow"><div className="title-sm">Skills summary</div><div className="meta">Grouped by area, ready to copy</div></div>
          <ChevronRight size={18} className="meta" />
        </button>
      </Group>

      <Group title="Library">
        <div className="setting">
          <span className="setting-icon"><CopyCheck size={18} /></span>
          <div className="grow"><div className="title-sm">Warn about similar saves</div><div className="meta">Flag likely duplicates when you save something new</div></div>
          <Switch on={p.settings.warn_duplicates !== false} onChange={(v) => update.mutate({ settings: { ...p.settings, warn_duplicates: v } }, { onError: fail("Couldn't save that") })} label="Warn about similar saves" />
        </div>
      </Group>

      <Group title="App">
        <button className="setting" onClick={doCheck} disabled={checking || !isTauri}>
          <span className="setting-icon"><Download size={18} /></span>
          <div className="grow"><div className="title-sm">Check for updates</div><div className="meta">v{version} · {platform()}{upd === "none" ? " · up to date" : ""}</div></div>
          <RefreshCw size={17} className="meta" style={{ animation: checking ? "spin 0.8s linear infinite" : undefined }} />
        </button>
      </Group>

      <Sheet open={breakOpen} onClose={() => setBreakOpen(false)} title={onBreak ? "On a break" : "Take a break"}>
        <BreakEditor
          settings={p?.settings ?? {}}
          onStart={async (until, reason) => {
            await saveSettings({ break_started: isoDay(), break_until: until, break_reason: reason || null });
            setBreakOpen(false);
            toast("Break started — nudges are off, your streak is safe");
          }}
          onEnd={async () => {
            await saveSettings({ break_started: null, break_until: null, break_reason: null });
            setBreakOpen(false);
            toast("Welcome back");
          }}
        />
      </Sheet>

      <Sheet open={goalOpen} onClose={() => setGoalOpen(false)} title="Your goal">
        <GoalEditor profile={p} onSave={async (goal, interests, name) => {
          try { await update.mutateAsync({ goal, interests, display_name: name }); setGoalOpen(false); toast("Saved"); }
          catch (e) { fail("Couldn't save")(e); }
        }} />
      </Sheet>

      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title="Skills summary">
        <div className="col" style={{ gap: 14 }}>
          <pre className="body selectable" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", maxHeight: 360, overflow: "auto", margin: 0, background: "var(--surface-mid)", borderRadius: 16, padding: 16 }}>
            {skillsText || "Nothing completed yet — finish a few items and come back."}
          </pre>
          <Pill variant="filled" size="lg" disabled={!skillsText} onClick={async () => {
            try { await navigator.clipboard.writeText(skillsText); toast("Copied"); }
            catch { toast("Couldn't copy automatically — select the text above manually"); }
          }}>
            <Copy size={16} /> Copy to clipboard
          </Pill>
        </div>
      </Sheet>

      <Sheet open={!!upd && upd !== "none"} onClose={() => setUpd(null)} title={`Update to v${upd !== "none" && upd ? upd.version : ""}`}>
        {upd && upd !== "none" && (
          <div className="col" style={{ gap: 14 }}>
            <p className="meta">You're on v{upd.current}.</p>
            {(() => { const notes = extractNotes(upd.notes ?? ""); return notes.length > 0 && (
              <ul className="whatsnew-list" style={{ maxHeight: 200, overflow: "auto" }}>
                {notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            ); })()}
            {upd.apkUrl
              ? <p className="meta">Downloads in the background, then opens the installer automatically — tap Update on the next screen.</p>
              : <p className="meta">The app will close to install. Windows sometimes silently blocks the installer (no code-signing certificate) — if it doesn't reopen on v{upd.version} within a minute, grab the installer manually from <a href={`https://github.com/${RELEASE_REPO}/releases/latest`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>the latest release</a>.</p>}
            {progress != null && <div className="bar"><i style={{ width: "100%", transform: `scaleX(${progress / 100})`, transition: "transform .2s var(--out)" }} /></div>}
            <Pill variant="filled" size="lg" loading={progress != null && progress < 100} onClick={async () => {
              setProgress(upd.apkUrl ? null : 0);
              try { await upd.install(setProgress); if (upd.apkUrl) { setUpd(null); toast("Downloading — watch the notification"); } }
              catch (e) { setProgress(null); toast(isNetworkError(e) ? "Download failed — check your connection and try again" : `Couldn't install — ${describeError(e).message}`); }
            }}>
              {upd.apkUrl ? "Download & install" : "Install and restart"}
            </Pill>
          </div>
        )}
      </Sheet>
    </Page>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Rise>
      <section className="col" style={{ gap: 4 }}>
        <p className="section-title" style={{ paddingLeft: 4 }}>{title}</p>
        <div className="col" style={{ gap: 0 }}>{children}</div>
        {hint && <p className="meta" style={{ paddingLeft: 4 }}>{hint}</p>}
      </section>
    </Rise>
  );
}

const BREAK_PRESETS: { label: string; days: number }[] = [
  { label: "Tomorrow", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
];

function BreakEditor({ settings, onStart, onEnd }: {
  settings: Profile["settings"];
  onStart: (until: string | "indefinite", reason: string) => Promise<void>;
  onEnd: () => Promise<void>;
}) {
  const onBreak = isOnBreak(settings);
  const [until, setUntil] = useState<string | "indefinite">("indefinite");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (onBreak) {
    return (
      <div className="col" style={{ gap: 14 }}>
        <p className="body-lg">
          {settings.break_until === "indefinite"
            ? "No end date set — resume whenever you're ready."
            : `Back on ${new Date(settings.break_until as string).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.`}
        </p>
        {settings.break_reason && <p className="meta">{settings.break_reason}</p>}
        <Pill variant="filled" size="lg" loading={busy} onClick={async () => { setBusy(true); try { await onEnd(); } finally { setBusy(false); } }}>End break now</Pill>
      </div>
    );
  }

  const dayOption = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return isoDay(d); };

  return (
    <div className="col" style={{ gap: 14 }}>
      <p className="meta">Nudges go quiet and your streak won't break while you're away.</p>
      <div className="chips">
        {BREAK_PRESETS.map((preset) => (
          <Chip key={preset.label} active={until === dayOption(preset.days)} onClick={() => setUntil(dayOption(preset.days))}>{preset.label}</Chip>
        ))}
        <Chip active={until === "indefinite"} onClick={() => setUntil("indefinite")}>Until I resume</Chip>
      </div>
      <div className="field">
        <span className="label">Reason (optional)</span>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Exams, travel, burnout..." />
      </div>
      <Pill variant="filled" size="lg" loading={busy} onClick={async () => { setBusy(true); try { await onStart(until, reason.trim()); } finally { setBusy(false); } }}>Start break</Pill>
    </div>
  );
}

const INTERESTS = ["LLMs", "RAG", "Agents", "Fine-tuning", "MLOps", "DSA", "System Design", "Python", "Cloud", "Math for ML", "Frontend", "Career"];

function GoalEditor({ profile, onSave }: { profile: { goal: string; interests: string[]; display_name: string | null }; onSave: (g: string, i: string[], n: string) => Promise<void> }) {
  const [name, setName] = useState(profile.display_name ?? "");
  const [goal, setGoal] = useState(profile.goal);
  const [interests, setInterests] = useState(profile.interests);
  const [busy, setBusy] = useState(false);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="field"><span className="label">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><span className="label">Goal</span><input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="AI Engineer" /></div>
      <div className="field">
        <span className="label">Interests</span>
        <div className="chips">{INTERESTS.map((i) => <Chip key={i} active={interests.includes(i)} onClick={() => setInterests((s) => s.includes(i) ? s.filter((x) => x !== i) : [...s, i])}>{i}</Chip>)}</div>
      </div>
      <Pill variant="filled" size="lg" loading={busy} onClick={async () => { setBusy(true); try { await onSave(goal.trim() || "AI Engineer", interests, name.trim()); } finally { setBusy(false); } }}>Save</Pill>
    </div>
  );
}
