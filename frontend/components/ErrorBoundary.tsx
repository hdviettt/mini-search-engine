"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-4 text-[11px] font-mono text-red-400 bg-[var(--bg-card)] border border-red-900">
            <div className="mb-1">Component error:</div>
            <div className="text-red-500">{this.state.error?.message}</div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-2 text-[var(--accent)] underline cursor-pointer"
            >
              Retry
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
