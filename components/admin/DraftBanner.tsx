// components/admin/DraftBanner.tsx
// Banner shown when a localStorage draft is available for restoration.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminDraftBanner from '@/lib/i18n/locales/admin-fr/adminDraftBanner';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

type DraftBannerProps = {
  lastSaved: string | null;
  onRestore: () => void;
  onDiscard: () => void;
};

function formatSavedAt(iso: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function DraftBanner({
  lastSaved,
  onRestore,
  onDiscard,
}: DraftBannerProps) {
  const t = useAdminT(nsAdminDraftBanner);
  const suffix = lastSaved ? ` (${formatSavedAt(lastSaved)})` : '';
  return (
    <div className="rounded-[var(--r-ctrl,4px)] bg-[rgba(245,165,36,.08)] border border-[rgba(245,165,36,.38)] px-4 py-3 text-sm flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <svg
          className="w-5 h-5 text-[var(--warn,#f5a524)] flex-shrink-0"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-[#ffd9a3]">{format(t.message, { suffix })}</span>
      </div>
      <div className="flex items-center gap-2">
        <AdminButton variant="secondary" size="xs" onClick={onRestore}>
          {t.restore}
        </AdminButton>
        <AdminButton size="xs" onClick={onDiscard}>
          {t.discard}
        </AdminButton>
      </div>
    </div>
  );
}
