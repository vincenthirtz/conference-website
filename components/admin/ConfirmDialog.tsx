import { ReactNode, useEffect } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

type ConfirmDialogVariant = 'danger' | 'warning' | 'info';

type ConfirmDialogProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  errorMsg?: string | null;
  loading: boolean;
  variant?: ConfirmDialogVariant;
  confirmLabel?: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

const VARIANT_STYLES: Record<
  ConfirmDialogVariant,
  { iconBg: string; iconColor: string; btnBg: string; btnHover: string; btnActive: string }
> = {
  danger: {
    iconBg: 'bg-red-900/50',
    iconColor: 'text-red-400',
    btnBg: 'bg-red-600',
    btnHover: 'hover:bg-red-500',
    btnActive: 'bg-red-800',
  },
  warning: {
    iconBg: 'bg-amber-900/50',
    iconColor: 'text-amber-400',
    btnBg: 'bg-amber-600',
    btnHover: 'hover:bg-amber-500',
    btnActive: 'bg-amber-800',
  },
  info: {
    iconBg: 'bg-blue-900/50',
    iconColor: 'text-blue-400',
    btnBg: 'bg-blue-600',
    btnHover: 'hover:bg-blue-500',
    btnActive: 'bg-blue-800',
  },
};

const VARIANT_ICONS: Record<ConfirmDialogVariant, ReactNode> = {
  danger: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
      />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
      />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

export default function ConfirmDialog({
  title,
  subtitle,
  children,
  errorMsg,
  loading,
  variant = 'danger',
  confirmLabel = 'Confirmer',
  confirmingLabel = 'En cours...',
  cancelLabel = 'Annuler',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const styles = VARIANT_STYLES[variant];
  const trapRef = useFocusTrap<HTMLDivElement>();

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loading, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div ref={trapRef} className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full ${styles.iconBg} flex items-center justify-center ${styles.iconColor}`}>
            {VARIANT_ICONS[variant]}
          </div>
          <div>
            <h3 id="confirm-dialog-title" className="text-lg font-semibold">{title}</h3>
            {subtitle && <p className="text-sm text-neutral-400">{subtitle}</p>}
          </div>
        </div>

        {children && <div className="mb-4">{children}</div>}

        {errorMsg && (
          <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm flex items-center gap-2">
            <svg
              className="w-4 h-4 text-red-400 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            {errorMsg}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
              loading
                ? `${styles.btnActive} cursor-not-allowed`
                : `${styles.btnBg} ${styles.btnHover}`
            }`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {confirmingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
