// features/admin/tournaments/ui/pool/PoolCreateTeamForm.tsx — création d'une
// équipe mixte vide, inscrite au tournoi, à remplir depuis la liste d'attente.

import { useState } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import nsAdminTournamentPool from '@/lib/i18n/locales/admin-fr/adminTournamentPool';
import { poolInner, poolInput, poolLabel, poolTeamNameOk } from './poolUi';

type Props = {
  busy: boolean;
  /** Résout `true` si la création a réussi (le champ se vide alors). */
  onCreate: (teamName: string) => Promise<boolean>;
};

export default function PoolCreateTeamForm({ busy, onCreate }: Props) {
  const t = useAdminT(nsAdminTournamentPool);
  const [name, setName] = useState('');

  return (
    <div className={`${poolInner} mt-3 p-3`} data-testid="pool-create-team">
      <p className="text-sm font-medium text-[var(--t1,#f4edf7)]">
        {t.createTeamTitle}
      </p>
      <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
        {t.createTeamHelp}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className={poolLabel}>
          {t.teamNameLabel}
          <input
            className={`${poolInput} mt-1 block`}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <AdminButton
          variant="secondary"
          size="sm"
          disabled={busy || !poolTeamNameOk(name)}
          onClick={async () => {
            if (await onCreate(name.trim())) setName('');
          }}
        >
          {t.createTeamSubmit}
        </AdminButton>
      </div>
    </div>
  );
}
