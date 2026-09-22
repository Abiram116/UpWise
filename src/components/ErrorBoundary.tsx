import { Component, type ReactNode } from "react";

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 32, maxWidth: 640, margin: "0 auto" }}>
        <h1 className="headline-sm">Something broke</h1>
        <p className="body selectable" style={{ marginTop: 12, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12 }}>
          {this.state.error.message}{"\n"}{this.state.error.stack?.split("\n").slice(1, 6).join("\n")}
        </p>
        <button className="pill pill-tonal" style={{ marginTop: 20 }} onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
