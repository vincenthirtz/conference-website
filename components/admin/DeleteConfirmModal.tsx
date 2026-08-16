import { ReactNode, useEffect } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDeleteConfirmModal from '@/lib/i18n/locales/admin-fr/adminDeleteConfirmModal';

type DeleteConfirmModalProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  errorMsg?: string | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteConfirmModal({
  title,
  subtitle,
  children,
  errorMsg,
  deleting,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  const t = useAdminT(nsAdminDeleteConfirmModal);
  const resolvedSubtitle = subtitle ?? t.defaultSubtitle;
  const trapRef = useFocusTrap<HTMLDivElement>();

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !deleting) onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deleting, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      <div
        ref={trapRef}
        className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </div>
          <div>
            <h3 id="delete-modal-title" className="text-lg font-semibold">
              {title}
            </h3>
            <p className="text-sm text-neutral-400">{resolvedSubtitle}</p>
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
            disabled={deleting}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
              deleting
                ? 'bg-red-800 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-500'
            }`}
          >
            {deleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.deleting}
              </>
            ) : (
              t.delete
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
