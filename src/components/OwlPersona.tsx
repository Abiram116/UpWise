import { motion } from "motion/react";
import { Check } from "lucide-react";
import { useProfile, useUpdateProfile } from "../lib/api";
import { haptic } from "../lib/haptics";
import { Owl, PERSONAS, owlPersona, useOwlPersona, type OwlPersona } from "./BrandMark";
import { Sheet, spring, useToast } from "./ui";

/** Pick who your owl is. It changes how it looks, moves and talks — Today's line, the cheers,
 * everything the AI says follows the personality. Synced through your profile. */
export function OwlPersonaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useOwlPersona();
  const profile = useProfile();
  const update = useUpdateProfile();
  const toast = useToast();
  const choose = (id: OwlPersona) => {
    if (id === current) return;
    haptic.success();
    owlPersona.set(id);
    update.mutate({ settings: { ...(profile.data?.settings ?? {}), owl_persona: id } }, { onError: () => toast("Couldn't sync that — it's saved on this device") });
  };
  return (
    <Sheet open={open} onClose={onClose} title="Your owl">
      <div className="col" style={{ gap: 10 }}>
        <p className="meta">Tap one to wear it. Try poking it, stroking it, or tapping it five times.</p>
        <div className="persona-grid">
          {PERSONAS.map((p) => (
            <motion.button key={p.id} className="persona-card" data-on={p.id === current} onClick={() => choose(p.id)} whileTap={{ scale: 0.96 }} transition={spring}>
              <Owl size={76} persona={p.id} alive interactive />
              <span className="title-sm row" style={{ gap: 6 }}>{p.name}{p.id === current && <Check size={15} strokeWidth={3} />}</span>
              <span className="meta" style={{ textAlign: "center" }}>{p.tagline}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
