import { ReactNode, useEffect } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminConfirmDialog from '@/lib/i18n/locales/admin-fr/adminConfirmDialog';

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

// « Le Ruban » SANS changer le rendu public. Ce dialogue sert aussi l'espace
// joueuse (hooks/useConfirmDialog), où les jetons Ruban n'existent pas : les
// classes ci-dessous ne s'appliquent que sous `:root:has([data-surface=admin])`
// — la portée exacte de styles/admin-ruban.css — et, plus spécifiques, elles
// l'emportent sur l'allure historique (restée en classes de base, intacte hors
// admin). Même grammaire que features/admin/_shared/ui/AdminButton (taille sm) :
// un seul bouton plein (primary), le destructif en contour erreur (danger).
const RUBAN_BTN_BASE = [
  '[:root:has([data-surface=admin])_&]:h-[38px]',
  '[:root:has([data-surface=admin])_&]:py-0',
  '[:root:has([data-surface=admin])_&]:px-[14px]',
  '[:root:has([data-surface=admin])_&]:text-[12px]',
  '[:root:has([data-surface=admin])_&]:rounded-[var(--r-ctrl)]',
  '[:root:has([data-surface=admin])_&]:border',
  '[:root:has([data-surface=admin])_&]:font-[family-name:var(--fd)]',
  '[:root:has([data-surface=admin])_&]:font-bold',
  '[:root:has([data-surface=admin])_&]:uppercase',
  '[:root:has([data-surface=admin])_&]:tracking-[0.02em]',
  '[:root:has([data-surface=admin])_&]:disabled:opacity-50',
].join(' ');
const RUBAN_BTN_GHOST = [
  RUBAN_BTN_BASE,
  '[:root:has([data-surface=admin])_&]:bg-transparent',
  '[:root:has([data-surface=admin])_&]:text-[var(--t2)]',
  '[:root:has([data-surface=admin])_&]:border-[var(--line2)]',
  '[:root:has([data-surface=admin])_&]:hover:bg-transparent',
  '[:root:has([data-surface=admin])_&]:hover:text-[var(--t1)]',
  '[:root:has([data-surface=admin])_&]:hover:border-[var(--t4)]',
].join(' ');
const RUBAN_BTN_PRIMARY = [
  RUBAN_BTN_BASE,
  '[:root:has([data-surface=admin])_&]:bg-[var(--lf)]',
  '[:root:has([data-surface=admin])_&]:text-[#0f0a12]',
  '[:root:has([data-surface=admin])_&]:border-[var(--lf-300)]',
  '[:root:has([data-surface=admin])_&]:hover:bg-[var(--lf-300)]',
].join(' ');
const RUBAN_BTN_DANGER = [
  RUBAN_BTN_BASE,
  '[:root:has([data-surface=admin])_&]:bg-transparent',
  '[:root:has([data-surface=admin])_&]:text-[var(--err)]',
  '[:root:has([data-surface=admin])_&]:border-[rgba(255,107,107,.45)]',
  '[:root:has([data-surface=admin])_&]:hover:bg-[rgba(255,107,107,.08)]',
].join(' ');
// Panneau : surface s1, filet, rayon carte, ombre haute. Hors admin, les
// replis `var(--color-neutral-…)` redonnent exactement bg-neutral-800 /
// border-neutral-700 / shadow-2xl.
const PANEL =
  'bg-[var(--s1,var(--color-neutral-800))] border border-[var(--line2,var(--color-neutral-700))] rounded-2xl p-6 w-full max-w-md shadow-[var(--sh3,var(--shadow-2xl))]';

const VARIANT_STYLES: Record<
  ConfirmDialogVariant,
  {
    iconBg: string;
    iconColor: string;
    btnBg: string;
    btnHover: string;
    btnActive: string;
    /** Allure « Le Ruban » du bouton de confirmation (admin seulement). */
    ruban: string;
  }
> = {
  danger: {
    iconBg: 'bg-red-900/50',
    iconColor: 'text-red-400',
    btnBg: 'bg-red-600',
    btnHover: 'hover:bg-red-500',
    btnActive: 'bg-red-800',
    ruban: RUBAN_BTN_DANGER,
  },
  warning: {
    iconBg: 'bg-amber-900/50',
    iconColor: 'text-amber-400',
    btnBg: 'bg-amber-600',
    btnHover: 'hover:bg-amber-500',
    btnActive: 'bg-amber-800',
    ruban: RUBAN_BTN_PRIMARY,
  },
  info: {
    iconBg: 'bg-blue-900/50',
    iconColor: 'text-blue-400',
    btnBg: 'bg-blue-600',
    btnHover: 'hover:bg-blue-500',
    btnActive: 'bg-blue-800',
    ruban: RUBAN_BTN_PRIMARY,
  },
};

const VARIANT_ICONS: Record<ConfirmDialogVariant, ReactNode> = {
  danger: (
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
  ),
  warning: (
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
  ),
  info: (
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
  confirmLabel,
  confirmingLabel,
  cancelLabel,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const t = useAdminT(nsAdminConfirmDialog);
  const resolvedConfirmLabel = confirmLabel ?? t.confirm;
  const resolvedConfirmingLabel = confirmingLabel ?? t.confirming;
  const resolvedCancelLabel = cancelLabel ?? t.cancel;
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
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div ref={trapRef} className={PANEL}>
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-full [:root:has([data-surface=admin])_&]:rounded-[var(--r-ctrl)] ${styles.iconBg} flex items-center justify-center ${styles.iconColor}`}
          >
            {VARIANT_ICONS[variant]}
          </div>
          <div>
            <h3 id="confirm-dialog-title" className="text-lg font-semibold">
              {title}
            </h3>
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
            className={`px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors ${RUBAN_BTN_GHOST}`}
            disabled={loading}
          >
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${styles.ruban} ${
              loading
                ? `${styles.btnActive} cursor-not-allowed`
                : `${styles.btnBg} ${styles.btnHover}`
            }`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white [:root:has([data-surface=admin])_&]:border-current [:root:has([data-surface=admin])_&]:border-t-transparent rounded-full animate-spin" />
                {resolvedConfirmingLabel}
              </>
            ) : (
              resolvedConfirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
