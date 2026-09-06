// components/admin/AdminPagination.tsx
//
// Contrôles de pagination des listes admin.
//
// POURQUOI : le même bloc « Précédent / x–y sur N / Suivant » était recopié à
// l'identique dans chaque liste paginée — et chaque nouvelle liste en ajoutait
// une copie. Les libellés restent fournis par l'appelant : chaque panneau a son
// propre namespace i18n, et les centraliser ici obligerait à un namespace
// partagé pour trois chaînes.
//
// Ne rend RIEN quand il n'y a qu'une page : une pagination sur sept entrées est
// du bruit.

import { format } from '@/lib/i18n/useAdminT';

type Props = {
  /** Index de la première ligne affichée (0 = première page). */
  offset: number;
  /** Nombre de lignes de la page courante. */
  count: number;
  /** Total connu, ou null quand l'API ne le renvoie pas. */
  total: number | null;
  hasMore: boolean;
  loading?: boolean;
  onPrev: () => void;
  onNext: () => void;
  labels: { prev: string; next: string; info: string };
};

export default function AdminPagination({
  offset,
  count,
  total,
  hasMore,
  loading = false,
  onPrev,
  onNext,
  labels,
}: Props) {
  if (offset === 0 && !hasMore) return null;

  return (
    <div className="flex items-center justify-center gap-3 mt-4">
      <button
        type="button"
        onClick={onPrev}
        disabled={offset === 0 || loading}
        className="px-4 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
      >
        {labels.prev}
      </button>
      {typeof total === 'number' && (
        <span className="text-xs text-neutral-500">
          {format(labels.info, {
            from: offset + 1,
            to: offset + count,
            total,
          })}
        </span>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={!hasMore || loading}
        className="px-4 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
      >
        {labels.next}
      </button>
    </div>
  );
}
