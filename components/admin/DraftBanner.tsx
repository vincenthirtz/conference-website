// components/admin/DraftBanner.tsx
// Banner shown when a localStorage draft is available for restoration.

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
  return (
    <div className="rounded-xl bg-amber-900/40 border border-amber-500/50 px-4 py-3 text-sm flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <svg
          className="w-5 h-5 text-amber-400 flex-shrink-0"
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
        <span className="text-amber-200">
          Un brouillon non sauvegarde a ete trouve
          {lastSaved ? ` (${formatSavedAt(lastSaved)})` : ''}.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRestore}
          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
        >
          Restaurer
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-xs font-medium transition-colors"
        >
          Ignorer
        </button>
      </div>
    </div>
  );
}
