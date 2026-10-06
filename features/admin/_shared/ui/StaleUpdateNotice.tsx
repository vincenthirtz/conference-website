// features/admin/_shared/ui/StaleUpdateNotice.tsx — 409 du verrou optimiste
// (features/admin/_shared/optimisticLock.ts) : la fiche a été modifiée par
// quelqu'un d'autre depuis son ouverture. On explique et on propose de
// recharger, plutôt que d'afficher un message d'erreur sans issue.

import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import { useAdminT } from '@/lib/i18n/useAdminT';
import AdminButton from './AdminButton';

type Props = {
  /** Relit la fiche et réinitialise le formulaire. */
  onReload: () => void;
  reloading?: boolean;
  className?: string;
};

export default function StaleUpdateNotice({
  onReload,
  reloading = false,
  className = '',
}: Props) {
  const t = useAdminT(nsAdminFiche);
  return (
    <div
      role="alert"
      data-testid="stale-update-notice"
      className={`mb-6 flex flex-col gap-3 rounded-[var(--r-card,14px)] border border-[rgba(255,184,77,.45)] bg-[rgba(255,184,77,.08)] px-4 py-3 text-sm text-[#ffe2b3] sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div>
        <p className="font-semibold">{t.staleTitle}</p>
        <p className="mt-1 text-[#f3d9ad]">{t.staleBody}</p>
      </div>
      <AdminButton
        type="button"
        variant="primary"
        size="sm"
        onClick={onReload}
        disabled={reloading}
      >
        {t.reload}
      </AdminButton>
    </div>
  );
}
