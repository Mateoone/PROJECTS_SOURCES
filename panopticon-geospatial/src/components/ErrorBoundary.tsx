import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Capture les erreurs de rendu pour éviter un écran blanc et les exposer. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[PANOPTICON_FATAL]', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-hud-bg p-8 text-center">
          <div className="text-hud-danger text-lg tracking-widest mb-3">
            ⚠ DÉFAILLANCE SYSTÈME
          </div>
          <pre className="text-hud-amber text-xs max-w-2xl whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="hud-btn mt-6 border-hud-emerald/50 text-hud-emerald hover:bg-hud-emerald/15"
          >
            ⟲ REDÉMARRAGE
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
