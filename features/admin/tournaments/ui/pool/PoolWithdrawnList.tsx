// features/admin/tournaments/ui/pool/PoolWithdrawnList.tsx — joueuses retirées
// du tournoi (par elles-mêmes ou par le staff), qu'on remet en attente d'un
// clic. Repliée par défaut.

import { useAdminT } from '@/lib/i18n/useAdminT';
import { format as fmt } from '@/lib/i18n/useT';
import Chip from '@/features/admin/_shared/ui/Chip';
import type { AdminPoolEntry } from '@/features/admin/tournaments/model';
import nsAdminTournamentPool from '@/lib/i18n/locales/admin-fr/adminTournamentPool';
import { poolLinkBtn } from './poolUi';

type Props = {
  entries: AdminPoolEntry[];
  busy: boolean;
  onRestore: (entryId: string) => void;
  className: string;
  titleClassName: string;
};

export default function PoolWithdrawnList({
  entries,
  busy,
  onRestore,
  className,
  titleClassName,
}: Props) {
  const t = useAdminT(nsAdminTournamentPool);
  if (entries.length === 0) return null;
  return (
    <details className={className} data-testid="pool-withdrawn">
      <summary className={`${titleClassName} cursor-pointer`}>
        {fmt(t.withdrawnTitle, { count: String(entries.length) })}
      </summary>
      <ul className="mt-3 space-y-1">
        {entries.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--t2,#c7bfca)]"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span>{e.displayName}</span>
              <span className="text-[var(--t4,#807984)]">
                {e.battleTag} · {e.originTeamName ?? t.noTeam}
              </span>
              {e.manual && <Chip tone="neutral">{t.manualChip}</Chip>}
            </span>
            <button
              type="button"
              className={poolLinkBtn}
              disabled={busy}
              onClick={() => onRestore(e.id)}
            >
              {t.restore}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
