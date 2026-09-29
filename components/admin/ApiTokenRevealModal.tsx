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
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminApiTokenReveal from '@/lib/i18n/locales/admin-fr/adminApiTokenReveal';

type Props = {
  token: string;
  onClose: () => void;
};

export default function ApiTokenRevealModal({ token, onClose }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const { addToast } = useToast();
  const t = useAdminT(nsAdminApiTokenReveal);
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
        className="bg-[var(--s1,#100812)] border border-[rgba(245,165,36,.38)] rounded-[var(--r-card,14px)] p-6 w-full max-w-xl shadow-[var(--sh3)]"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.13)] flex items-center justify-center text-[var(--warn,#f5a524)] flex-shrink-0">
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
              className="text-lg font-semibold text-[var(--t1,#f4edf7)]"
            >
              {t.title}
            </h3>
            <p className="mt-1 text-sm text-[#ffd9a3]">{t.warning}</p>
          </div>
        </div>

        <div>
          <label
            htmlFor="api-token-reveal-input"
            className="mb-2 block font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--t3,#a39ba6)] [font-stretch:75%]"
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
              className="flex-1 min-w-0 h-[38px] px-3 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:border-[var(--or,#b467d1)] text-xs font-mono text-[var(--t1,#f4edf7)]"
              data-testid="api-token-reveal-input"
            />
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={copy}
              data-testid="api-token-reveal-copy-btn"
            >
              {copied ? t.copied : t.copy}
            </AdminButton>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <AdminButton
            variant="primary"
            size="sm"
            onClick={onClose}
            data-testid="api-token-reveal-close-btn"
          >
            {t.close}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
