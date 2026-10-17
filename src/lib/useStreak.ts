import { useMemo } from "react";
import { useActivity, useProfile } from "./api";
import { breakDaySet, streakState, type StreakState } from "./stats";

/** The one place the streak is computed from: full history (a short window would miscount the
 * freeze bank on long streaks) and the declared breaks. */
export function useStreak(): StreakState | null {
  const activity = useActivity(400);
  const profile = useProfile();
  return useMemo(
    () => (activity.data ? streakState(activity.data, breakDaySet(profile.data?.settings)) : null),
    [activity.data, profile.data?.settings],
  );
}
