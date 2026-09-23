import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useProfile, useUpdateProfile } from "../lib/api";
import { ensurePermission, sendTestNotification } from "../lib/notifications";
import { isAndroid, isTauri } from "../lib/platform";
import { DEFAULT_NOTIFICATIONS } from "../lib/config";
import { Chip, Pill, easeOut, spring, useToast } from "../components/ui";
import { describeError } from "../lib/errors";
import { BrandMark } from "../components/BrandMark";
import "../lib/android-bridge";

const GOALS = ["AI Engineer", "ML Engineer", "Backend Engineer", "Full-stack Engineer", "Data Scientist"];
const INTERESTS = ["LLMs", "RAG", "Agents", "Fine-tuning", "MLOps", "DSA", "System Design", "Python", "Cloud", "Math for ML", "Frontend", "Career"];
const TARGETS = [15, 30, 45, 60];

const wordsIn = { hidden: {}, show: { transition: { staggerChildren: 0.03, delayChildren: 0 } } };
const word = { hidden: { opacity: 0, y: 18, filter: "blur(6px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.05, 0.7, 0.1, 1] as const } } };

function Welcome({ name }: { name?: string | null }) {
  const title = `Hi${name ? ` ${name}` : ""}. Stop hoarding links.`;
  return (
    <div className="col" style={{ gap: 28 }}>
      <BrandMark />
      <motion.h1 className="display" variants={wordsIn} initial="hidden" animate="show" style={{ display: "flex", flexWrap: "wrap", gap: "0 0.28em" }}>
        {title.split(" ").map((w, i) => <motion.span key={i} variants={word}>{w}</motion.span>)}
      </motion.h1>
      <motion.p className="body-lg" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: 0.2 }}>
        Every reel or video you'd normally dump into Telegram goes here instead. UpWise reads it, tells you what it actually teaches, and how long it really takes.
        {isAndroid() && <><br /><br />In YouTube, tap <b style={{ fontWeight: 500, color: "var(--on-surface)" }}>Share → UpWise</b>. That's the whole workflow.</>}
      </motion.p>
    </div>
  );
}

export function Onboarding() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(profile.data?.goal ?? "AI Engineer");
  const [interests, setInterests] = useState<string[]>(profile.data?.interests?.length ? profile.data.interests : ["LLMs", "RAG"]);
  const [target, setTarget] = useState(profile.data?.daily_target_minutes ?? 30);
  const [notif, setNotif] = useState<boolean | null>(null);
  const [canInstall, setCanInstall] = useState(true);

  useEffect(() => {
    if (isAndroid() && window.AndroidNative?.canInstallPackages) setCanInstall(window.AndroidNative.canInstallPackages());
  }, []);

  const toast = useToast();
  const finish = async () => {
    try {
      await update.mutateAsync({
        goal, interests, daily_target_minutes: target, onboarded: true,
        settings: { ...DEFAULT_NOTIFICATIONS, enabled: notif !== false },
      });
    } catch (e) { toast(`Couldn't save your setup — ${describeError(e).message}`); }
  };

  const steps = [
    <Welcome key="0" name={profile.data?.display_name?.split(" ")[0]} />,
    <Step key="1" title="What are you aiming for?" body="Every link gets scored on how much it helps this.">
      <div className="chips">{GOALS.map((g) => <Chip key={g} active={g === goal} onClick={() => setGoal(g)}>{g}</Chip>)}</div>
      <input className="input" placeholder="Or type your own" value={GOALS.includes(goal) ? "" : goal} onChange={(e) => setGoal(e.target.value || "AI Engineer")} />
      <p className="section-title" style={{ marginTop: 8 }}>Interests</p>
      <div className="chips">{INTERESTS.map((i) => <Chip key={i} active={interests.includes(i)} onClick={() => setInterests((s) => s.includes(i) ? s.filter((x) => x !== i) : [...s, i])}>{i}</Chip>)}</div>
    </Step>,
    <Step key="2" title="A realistic daily target." body="Consistency beats binges. Pick what you'll hit on a busy college day.">
      <div className="chips">{TARGETS.map((t) => <Chip key={t} active={t === target} onClick={() => setTarget(t)}>{t} min</Chip>)}</div>
    </Step>,
    <Step key="3" title="Nudges, on your terms." body="UpWise learns when you actually learn and nudges you then. A couple a day at most, never at night, mutable per category.">
      {isTauri ? (
        <div className="row" style={{ gap: 8 }}>
          <Pill variant="tonal" size="lg" className="grow" onClick={() => setNotif(false)}>Not now</Pill>
          <Pill variant="filled" size="lg" className="grow" onClick={async () => { const ok = await ensurePermission(); setNotif(ok); if (ok) void sendTestNotification(); }}>
            {notif === true ? "Enabled" : "Enable"}
          </Pill>
        </div>
      ) : <p className="meta">Notifications work in the installed app.</p>}
      {isAndroid() && !canInstall && (
        <div className="row" style={{ gap: 10, alignItems: "center", marginTop: 4 }}>
          <p className="meta grow">Updates install themselves smoother if UpWise can do it directly.</p>
          <Pill variant="text" size="sm" onClick={() => { window.AndroidNative?.openInstallPermissionSettings?.(); setCanInstall(true); }}>Allow</Pill>
        </div>
      )}
    </Step>,
  ];

  const last = step === steps.length - 1;
  return (
    <div className="onboard">
      <div className="progress-dots">{steps.map((_, i) => <i key={i} data-on={i <= step} />)}</div>
      <div className="onboard-body">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={spring} className="col" style={{ gap: 24 }}>
            {steps[step]}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {step > 0 && <Pill variant="text" size="lg" onClick={() => setStep(step - 1)}>Back</Pill>}
        <Pill variant="filled" size="lg" className="grow" loading={update.isPending} disabled={step === 1 && !goal.trim()} onClick={() => (last ? finish() : setStep(step + 1))}>
          {last ? "Start learning" : "Continue"}
        </Pill>
      </div>
    </div>
  );
}

function Step({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <>
      <div>
        <h1 className="display" style={{ fontSize: 34 }}>{title}</h1>
        <p className="body-lg" style={{ marginTop: 12 }}>{body}</p>
      </div>
      {children && <div className="col" style={{ gap: 12 }}>{children}</div>}
    </>
  );
}
