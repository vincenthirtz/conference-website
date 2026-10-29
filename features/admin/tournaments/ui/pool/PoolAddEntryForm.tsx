// features/admin/tournaments/ui/pool/PoolAddEntryForm.tsx — ajout à la main
// d'une joueuse inscrite hors formulaire (sans compte sur le site) à la liste
// d'attente de la répartition.

import { useState } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import nsAdminTournamentPool from '@/lib/i18n/locales/admin-fr/adminTournamentPool';
import {
  poolInner,
  poolInput,
  poolLabel,
  poolNameOk,
  poolTagOk,
} from './poolUi';

type Props = {
  busy: boolean;
  /** Équipes d'origine proposées : [id, nom], triées. */
  origins: Array<[string, string]>;
  /** Résout `true` si l'ajout a réussi (le formulaire se vide alors). */
  onAdd: (entry: {
    displayName: string;
    battleTag: string;
    originTeamId: string | null;
  }) => Promise<boolean>;
};

export default function PoolAddEntryForm({ busy, origins, onAdd }: Props) {
  const t = useAdminT(nsAdminTournamentPool);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [origin, setOrigin] = useState('');

  return (
    <div className={`${poolInner} mt-3 p-3`} data-testid="pool-add-entry">
      <p className="text-sm font-medium text-[var(--t1,#f4edf7)]">
        {t.addTitle}
      </p>
      <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">{t.addHelp}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className={poolLabel}>
          {t.fieldName}
          <input
            className={`${poolInput} mt-1 block`}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className={poolLabel}>
          {t.fieldBattleTag}
          <input
            className={`${poolInput} mt-1 block`}
            value={tag}
            maxLength={40}
            placeholder="Pseudo#1234"
            onChange={(e) => setTag(e.target.value)}
          />
        </label>
        <label className={poolLabel}>
          {t.fieldOrigin}
          <select
            className={`${poolInput} mt-1 block`}
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            <option value="">{t.noTeam}</option>
            {origins.map(([teamId, teamName]) => (
              <option key={teamId} value={teamId}>
                {teamName}
              </option>
            ))}
          </select>
        </label>
        <AdminButton
          variant="secondary"
          size="sm"
          disabled={busy || !poolNameOk(name) || !poolTagOk(tag)}
          onClick={async () => {
            const done = await onAdd({
              displayName: name.trim(),
              battleTag: tag.trim(),
              originTeamId: origin || null,
            });
            if (done) {
              setName('');
              setTag('');
              setOrigin('');
            }
          }}
        >
          {t.addSubmit}
        </AdminButton>
      </div>
    </div>
  );
}
