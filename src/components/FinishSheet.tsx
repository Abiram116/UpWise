import { useState } from "react";
import { Chip, Sheet } from "./ui";

// A "Mark done" with no session behind it is exactly how stats end up claiming "2 things
// learned, 1 min invested" — so completing always asks for an honest minute estimate first.
// No 0-min option on purpose: if truly no time was spent, "Skip" is the honest status, not "done".
export function FinishSheet({ open, onClose, onDone }: {
  open: boolean; onClose: () => void; onDone: (minutes: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const pick = async (m: number) => { setBusy(m); try { await onDone(m); } finally { setBusy(null); } };
  return (
    <Sheet open={open} onClose={onClose} title="How long did that take?">
      <p className="body" style={{ marginBottom: 16 }}>Pick roughly how long you actually spent, so your stats stay honest.</p>
      <div className="chips">{[1, 3, 5, 10, 15, 20, 30, 45, 60].map((m) => <Chip key={m} onClick={() => busy === null && pick(m)}>{m} min</Chip>)}</div>
    </Sheet>
  );
}
