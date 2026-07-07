// One-shot modal that reveals a freshly-minted public API token in clear text.
//
// The plain token is passed as a string from the parent (which receives it from
// POST /api/admin/api-tokens). It is NEVER persisted client-side — closing the
// modal drops it, and it can never be retrieved again (only the sha256 hash is
// stored server-side).
//
// Mirrors components/admin/BotSecretsRevealModal.tsx for consistency.
//
// Usage :
//   const [revealed, setRevealed] = useState<string | null>(null);
//   ...
//   {revealed && (
//     <ApiTokenRevealModal token={revealed} onClose={() => setRevealed(null)} />
//   )}

import { useCallback, useEffect, useState } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';

type Props = {
  token: string;
  onClose: () => void;
};

export default function ApiTokenRevealModal({ token, onClose }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const { addToast } = useToast();
  const t = useAdminT('adminApiTokenReveal');
  const [copied, setCopied] = useState(false);

  // Close on Escape.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      addToast(t.copiedToast, 'success');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      addToast(t.copyError, 'error');
    }
  }, [addToast, t, token]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-token-reveal-title"
    >
      <div
        ref={trapRef}
        className="bg-neutral-800 border border-amber-500/40 rounded-2xl p-6 w-full max-w-xl shadow-2xl"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-900/40 flex items-center justify-center text-amber-300 flex-shrink-0">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h3
              id="api-token-reveal-title"
              className="text-lg font-semibold text-white"
            >
              {t.title}
            </h3>
            <p className="mt-1 text-sm text-amber-200/90">{t.warning}</p>
          </div>
        </div>

        <div>
          <label
            htmlFor="api-token-reveal-input"
            className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1"
          >
            {t.tokenLabel}
          </label>
          <div className="flex gap-2">
            <input
              id="api-token-reveal-input"
              type="text"
              readOnly
              value={token}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-mono text-white"
              data-testid="api-token-reveal-input"
            />
            <button
              type="button"
              onClick={copy}
              className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-xs font-semibold text-white transition-colors whitespace-nowrap"
              data-testid="api-token-reveal-copy-btn"
            >
              {copied ? t.copied : t.copy}
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold text-white transition-colors"
            data-testid="api-token-reveal-close-btn"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
