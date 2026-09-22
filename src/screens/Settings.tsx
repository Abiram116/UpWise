import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronRight, Copy, Download, FileText, Moon, RefreshCw, Target, User } from "lucide-react";
import { useCategories, useProfile, useUpdateProfile, useItems, useSessions } from "../lib/api";
import { replanNotifications, sendTestNotification, settingsOf } from "../lib/notifications";
import { checkForUpdate, currentVersion, type UpdateInfo } from "../lib/updater";
import { isTauri, platform } from "../lib/platform";
import { applyTheme, type Theme } from "../theme";
import { formatSkillsExport, skillsSummary } from "../lib/stats";
import { useCoach } from "./Home";
import { Chip, Page, Pill, Rise, Segmented, Sheet, Switch, useToast } from "../components/ui";

const TARGETS = [15, 30, 45, 60, 90];
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

export function SettingsScreen() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const cats = useCategories();
  const items = useItems();
  const sessions = useSessions(30);
  const toast = useToast();
  const { coach } = useCoach(false);
  const [version, setVersion] = useState("");
  const [upd, setUpd] = useState<UpdateInfo | null | "none">(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>((localStorage.getItem("upwise:theme") as Theme) || "system");

  useEffect(() => { currentVersion().then(setVersion); }, []);

  const sessionsAll = useSessions(365); // export should cover everything completed, not just the last 30 days
  const skillsText = useMemo(() => {
    if (!items.data || !sessionsAll.data || !profile.data) return "";
    return formatSkillsExport(skillsSummary(items.data, sessionsAll.data), profile.data.goal, profile.data.display_name);
  }, [items.data, sessionsAll.data, profile.data]);

  const p = profile.data;
  const s = settingsOf(p);
  const saveSettings = async (patch: Partial<typeof s>) => {
    const next = { ...(p?.settings ?? {}), ...patch };
    await update.mutateAsync({ settings: next });
    if (p && items.data && sessions.data) {
      const n = await replanNotifications({ profile: { ...p, settings: next }, items: items.data, sessions: sessions.data, coach });
      if (patch.enabled !== undefined) toast(patch.enabled ? `Nudges on · ${n} scheduled` : "Nudges off");
    }
  };

  const doCheck = async () => {
    setChecking(true);
    try { const u = await checkForUpdate(); setUpd(u ?? "none"); }
    catch (e) { toast(`Update check failed: ${(e as Error).message}`); }
    finally { setChecking(false); }
  };

  if (!p) return <Page><h1 className="display">Settings</h1></Page>;

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
          <select className="input" style={{ width: 104, height: 40, padding: "0 14px" }} value={p.daily_target_minutes} onChange={(e) => update.mutate({ daily_target_minutes: +e.target.value })}>
            {TARGETS.map((t) => <option key={t} value={t}>{t} min</option>)}
          </select>
        </div>
        <div className="setting" style={{ flexWrap: "wrap" }}>
          <span className="setting-icon"><Moon size={18} /></span>
          <div className="grow title-sm">Appearance</div>
          <Segmented value={theme} onChange={(t) => { setTheme(t); applyTheme(t); }} options={[{ value: "system", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
        </div>
      </Group>

      <Group title="Nudges" hint="Times come from when you actually learn. You stay in control.">
        <div className="setting">
          <span className="setting-icon"><Bell size={18} /></span>
          <div className="grow"><div className="title-sm">Notifications</div><div className="meta">{isTauri ? "About what to learn next" : "Available in the installed app"}</div></div>
          <Switch on={s.enabled} onChange={(v) => saveSettings({ enabled: v })} label="Notifications" />
        </div>
        {s.enabled && (
          <>
            <div className="setting">
              <div className="grow title-sm">Max per day</div>
              <Segmented value={String(s.max_per_day)} onChange={(v) => saveSettings({ max_per_day: +v })} options={[{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }]} />
            </div>
            <div className="setting">
              <div className="grow"><div className="title-sm">Quiet hours</div><div className="meta">No nudges in this window</div></div>
              <select className="input" style={{ width: 92, height: 40, padding: "0 12px" }} value={s.quiet_start} onChange={(e) => saveSettings({ quiet_start: e.target.value })}>{HOURS.map((h) => <option key={h}>{h}</option>)}</select>
              <span className="meta">to</span>
              <select className="input" style={{ width: 92, height: 40, padding: "0 12px" }} value={s.quiet_end} onChange={(e) => saveSettings({ quiet_end: e.target.value })}>{HOURS.map((h) => <option key={h}>{h}</option>)}</select>
            </div>
            {!!cats.data?.length && (
              <div className="setting" style={{ flexWrap: "wrap" }}>
                <div style={{ width: "100%" }}><div className="title-sm">Nudge about</div><div className="meta">Tap to mute an area</div></div>
                <div className="chips">
                  {cats.data.map((c) => {
                    const muted = s.muted_categories.includes(c.id);
                    return <Chip key={c.id} active={!muted} onClick={() => saveSettings({ muted_categories: muted ? s.muted_categories.filter((x) => x !== c.id) : [...s.muted_categories, c.id] })}>{c.name}</Chip>;
                  })}
                </div>
              </div>
            )}
            <button className="setting" onClick={async () => { (await sendTestNotification()) ? toast("Sent a test nudge") : toast("Permission denied"); }}>
              <div className="grow title-sm" style={{ color: "var(--primary)" }}>Send a test notification</div>
            </button>
          </>
        )}
      </Group>

      <Group title="Export" hint="A summary of what you've learned, by area — for a resume or LinkedIn.">
        <button className="setting" onClick={() => setExportOpen(true)}>
          <span className="setting-icon"><FileText size={18} /></span>
          <div className="grow"><div className="title-sm">Skills summary</div><div className="meta">Grouped by area, ready to copy</div></div>
          <ChevronRight size={18} className="meta" />
        </button>
      </Group>

      <Group title="App">
        <button className="setting" onClick={doCheck} disabled={checking || !isTauri}>
          <span className="setting-icon"><Download size={18} /></span>
          <div className="grow"><div className="title-sm">Check for updates</div><div className="meta">v{version} · {platform()}{upd === "none" ? " · up to date" : ""}</div></div>
          <RefreshCw size={17} className="meta" style={{ animation: checking ? "spin 0.8s linear infinite" : undefined }} />
        </button>
      </Group>

      <Sheet open={goalOpen} onClose={() => setGoalOpen(false)} title="Your goal">
        <GoalEditor profile={p} onSave={async (goal, interests, name) => { await update.mutateAsync({ goal, interests, display_name: name }); setGoalOpen(false); toast("Saved"); }} />
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
            {upd.notes && <p className="body selectable" style={{ whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>{upd.notes}</p>}
            {upd.apkUrl && <p className="meta">Your browser downloads the APK; open it to install over the current version.</p>}
            {progress != null && <div className="bar"><i style={{ width: "100%", transform: `scaleX(${progress / 100})`, transition: "transform .2s var(--out)" }} /></div>}
            <Pill variant="filled" size="lg" loading={progress != null && progress < 100} onClick={async () => { setProgress(upd.apkUrl ? null : 0); await upd.install(setProgress); if (upd.apkUrl) setUpd(null); }}>
              {upd.apkUrl ? "Download update" : "Install and restart"}
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
