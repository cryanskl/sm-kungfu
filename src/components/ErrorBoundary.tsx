'use client';

import React from 'react';

interface State { hasError: boolean }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="font-display text-xl text-gold mb-3">江湖出了点问题</h2>
          <p className="text-sm text-[--text-dim] mb-6">页面发生错误，请刷新重试</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-gold px-8 py-2"
          >
            重新进入江湖
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
