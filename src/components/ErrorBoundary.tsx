import { Component, type ReactNode } from "react";

interface State { error: Error | null; details: boolean }

// A render crash is a bug, not something the user caused — say so plainly, offer the one fix
// that always works (reload; the library is cached and pending changes are in the outbox),
// and keep the technical text one tap away for reporting instead of up front.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, details: false };
  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }
  render() {
    const { error, details } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, padding: "32px 24px", maxWidth: 520, margin: "0 auto" }}>
        <h1 className="headline-sm">UpWise hit a snag</h1>
        <p className="body" style={{ color: "var(--on-surface-2)" }}>
          Something on this screen broke. Reloading fixes it — your library and any unsynced changes are kept.
        </p>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="pill pill-filled" onClick={() => location.reload()}>Reload</button>
          <button className="pill pill-text" onClick={() => this.setState({ details: !details })}>{details ? "Hide details" : "Details"}</button>
        </div>
        {details && (
          <pre className="meta selectable" style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "var(--surface-low)", borderRadius: 16, padding: 16, margin: 0 }}>
            {error.message}{"\n"}{error.stack?.split("\n").slice(1, 6).join("\n")}
          </pre>
        )}
      </div>
    );
  }
}
