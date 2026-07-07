import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useT } from '@/lib/i18n/useT';

import { logger } from '../utils/logger';
type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

// `useT` est un hook : il ne peut pas être appelé dans un composant classe.
// On isole donc l'UI de repli dans un petit composant fonctionnel qui consomme
// la traduction, rendu par le `render()` de la classe.
function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const t = useT('errorBoundary');
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center text-white">
      <h2 className="text-2xl font-bold">{t.title}</h2>
      <p className="mt-3 text-gray-400">{t.body}</p>
      <button
        onClick={onRetry}
        className="mt-6 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold transition hover:bg-white/10"
      >
        {t.retry}
      </button>
    </div>
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback onRetry={() => this.setState({ hasError: false })} />
      );
    }

    return this.props.children;
  }
}
