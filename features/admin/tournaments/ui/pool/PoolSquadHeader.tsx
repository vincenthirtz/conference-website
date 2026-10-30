// features/admin/tournaments/ui/pool/PoolSquadHeader.tsx — en-tête d'une équipe
// inscrite dans la répartition : nom et pastilles, « Renommer » (équipe formée
// par le staff seulement) et « Supprimer l'équipe » (impossible une fois des
// matchs créés : la base le refuse aussi).

import { useState } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { format as fmt } from '@/lib/i18n/useT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import type { AdminPoolView } from '@/features/admin/tournaments/model';
import nsAdminTournamentPool from '@/lib/i18n/locales/admin-fr/adminTournamentPool';
import { poolInput, poolLabel, poolLinkBtn, poolTeamNameOk } from './poolUi';

type Props = {
  squad: AdminPoolView['squads'][number];
  size: number;
  busy: boolean;
  /** Résout `true` si le renommage a réussi (le champ se ferme alors). */
  onRename: (teamName: string) => Promise<boolean>;
  onDissolve: () => void;
};

export default function PoolSquadHeader({
  squad,
  size,
  busy,
  onRename,
  onDissolve,
}: Props) {
  const t = useAdminT(nsAdminTournamentPool);
  const [renaming, setRenaming] = useState<string | null>(null);
  const incomplete =
    squad.members.length < size && (squad.members.length > 0 || squad.mixed);
  const subs = squad.members.length - size;

  if (renaming !== null) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <label className={poolLabel}>
          {t.teamNameLabel}
          <input
            className={`${poolInput} mt-1 block`}
            value={renaming}
            maxLength={60}
            onChange={(e) => setRenaming(e.target.value)}
          />
        </label>
        <AdminButton
          size="xs"
          variant="primary"
          disabled={busy || !poolTeamNameOk(renaming)}
          onClick={async () => {
            if (await onRename(renaming.trim())) setRenaming(null);
          }}
        >
          {t.save}
        </AdminButton>
        <AdminButton
          size="xs"
          variant="ghost"
          onClick={() => setRenaming(null)}
        >
          {t.cancel}
        </AdminButton>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex flex-wrap items-center gap-2 font-medium text-[var(--t1,#f4edf7)]">
        {squad.teamName}
        {squad.mixed && <Chip tone="brand">{t.squadMixed}</Chip>}
        {incomplete && (
          <Chip tone="warn">
            {fmt(t.squadIncomplete, {
              count: String(squad.members.length),
              size: String(size),
            })}
          </Chip>
        )}
        {subs > 0 && (
          <Chip tone="ok">
            {fmt(t.squadSubs, { size: String(size), subs: String(subs) })}
          </Chip>
        )}
      </p>
      <span className="flex flex-wrap items-center gap-3">
        {squad.mixed && (
          <button
            type="button"
            className={poolLinkBtn}
            disabled={busy}
            onClick={() => setRenaming(squad.teamName)}
          >
            {t.rename}
          </button>
        )}
        <button
          type="button"
          className={poolLinkBtn}
          disabled={busy || squad.hasMatches}
          title={squad.hasMatches ? t.dissolveLocked : undefined}
          onClick={onDissolve}
        >
          {t.dissolve}
        </button>
      </span>
    </div>
  );
}
