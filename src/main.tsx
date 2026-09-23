import React from "react";
import ReactDOM from "react-dom/client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import { ToastProvider } from "./components/ui";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DAY_MS, queryClient } from "./lib/queryClient";
import { initTheme } from "./theme";
import { isDesktop } from "./lib/platform";
import "@fontsource-variable/figtree";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

initTheme();

// The library, profile and stats survive restarts, so the app opens straight into your data
// — even with no signal or a paused database — and refreshes in the background.
const persister = createAsyncStoragePersister({
  storage: window.localStorage,
  key: "upwise:query-cache",
  throttleTime: 2000,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 14 * DAY_MS,
          // Bump when a cached shape changes incompatibly.
          buster: "v2-lean-items",
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => q.state.status === "success" && q.meta?.persist !== false,
          },
        }}
      >
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Windows starts the window hidden; reveal it once the first frame has actually painted.
if (isDesktop()) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().show()).catch(() => {});
  }));
}
