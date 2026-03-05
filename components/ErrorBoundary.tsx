import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center text-white">
          <h2 className="text-2xl font-bold">Quelque chose s&apos;est mal passé</h2>
          <p className="mt-3 text-gray-400">
            Une erreur inattendue est survenue. Essaie de recharger la page.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-6 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold transition hover:bg-white/10"
          >
            Réessayer
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
