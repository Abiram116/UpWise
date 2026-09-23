import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { connection } from "./connection";

export const DAY_MS = 86_400_000;

// One client for the whole app, importable outside React (session store, outbox flush).
export const queryClient = new QueryClient({
  // Every request doubles as a connectivity probe: failures flip the banner, successes clear it.
  queryCache: new QueryCache({ onError: (e) => connection.reportError(e), onSuccess: () => connection.reportOk() }),
  mutationCache: new MutationCache({ onError: (e) => connection.reportError(e) }),
  defaultOptions: {
    queries: {
      // Switching apps and coming back shouldn't refire every active query at once — that's
      // exactly the moment the user is looking at the screen, so it's the worst time for jank.
      refetchOnWindowFocus: false,
      // Always actually try: a failure is what tells the connection store (and the banner)
      // what's wrong, and cached data stays on screen regardless. Reconnecting refetches.
      networkMode: "always",
      // Cached data is persisted to disk; keep it around long enough to be useful offline.
      // (must be >= the persister's maxAge or restored entries get collected straight away).
      gcTime: 14 * DAY_MS,
      // One quick retry for blips; a paused project or no signal won't fix itself in a second.
      retry: (count, e) => count < 1 && !/PGRST|JWT|42\d{3}/.test(String((e as { code?: string }).code ?? "")),
    },
    // Writes go through the outbox, which decides for itself what to do offline — React
    // Query's default of pausing them until "online" would just hang the UI.
    mutations: { networkMode: "always" },
  },
});
