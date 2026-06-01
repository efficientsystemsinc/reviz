"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/** Isolates a single component preview so one runtime error can't take down the page. */
export class PreviewErrorBoundary extends Component<
  { children: ReactNode; resetKey?: unknown },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode; resetKey?: unknown }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex max-w-md flex-col items-center gap-2 rounded-reviz border border-bad/30 bg-bad/5 p-6 text-center">
          <AlertTriangle className="h-5 w-5 text-bad" />
          <div className="text-[13px] font-medium text-ink">This configuration threw an error</div>
          <div className="font-mono text-[11px] text-ink-muted">{this.state.error.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
