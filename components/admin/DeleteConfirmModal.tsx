import { ReactNode, useEffect } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
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
        className="bg-[var(--s1,#100812)] border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-card,14px)] p-6 w-full max-w-md shadow-[var(--sh3)]"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.13)] flex items-center justify-center">
            <svg
              className="w-5 h-5 text-[var(--err,#ff6b6b)]"
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
            <p className="text-sm text-[var(--t3,#a39ba6)]">
              {resolvedSubtitle}
            </p>
          </div>
        </div>

        {children && <div className="mb-4">{children}</div>}

        {errorMsg && (
          <div className="mb-4 rounded-[var(--r-ctrl,4px)] bg-[rgba(255,107,107,.08)] border border-[rgba(255,107,107,.4)] px-3 py-2 text-sm text-[#ffc2c2] flex items-center gap-2">
            <svg
              className="w-4 h-4 text-[var(--err,#ff6b6b)] flex-shrink-0"
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
          <AdminButton size="sm" onClick={onCancel} disabled={deleting}>
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="danger"
            size="sm"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <span
                  aria-hidden="true"
                  className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                />
                {t.deleting}
              </>
            ) : (
              t.delete
            )}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
