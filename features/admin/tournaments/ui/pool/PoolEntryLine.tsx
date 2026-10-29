// features/admin/tournaments/ui/pool/PoolEntryLine.tsx — une joueuse de la
// répartition (liste d'attente ou équipe) : nom, détail, actions, et ses deux
// champs (pseudo, BattleTag) quand on la corrige.

import { type ReactNode, useState } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import type { AdminPoolEntry } from '@/features/admin/tournaments/model';
import nsAdminTournamentPool from '@/lib/i18n/locales/admin-fr/adminTournamentPool';
import {
  poolInput,
  poolLabel,
  poolLinkBtn,
  poolNameOk,
  poolTagOk,
} from './poolUi';

type Draft = { displayName: string; battleTag: string };

type Props = {
  entry: AdminPoolEntry;
  /** BattleTag ou équipe d'origine, en gris après le nom. */
  detail: ReactNode;
  /** Avant le nom (case à cocher de la liste d'attente). */
  lead?: ReactNode;
  /** Actions propres au bloc (déplacer, remettre en attente). */
  actions?: ReactNode;
  busy: boolean;
  /** Résout `true` si la correction a réussi (les champs se ferment alors). */
  onSave: (draft: Draft) => Promise<boolean>;
  onWithdraw: (entry: AdminPoolEntry) => void;
};

export default function PoolEntryLine({
  entry,
  detail,
  lead,
  actions,
  busy,
  onSave,
  onWithdraw,
}: Props) {
  const t = useAdminT(nsAdminTournamentPool);
  const [draft, setDraft] = useState<Draft | null>(null);

  if (draft) {
    return (
      <div className="flex flex-wrap items-end gap-2 py-1">
        <label className={poolLabel}>
          {t.fieldName}
          <input
            className={`${poolInput} mt-1 block`}
            value={draft.displayName}
            maxLength={40}
            onChange={(ev) =>
              setDraft({ ...draft, displayName: ev.target.value })
            }
          />
        </label>
        <label className={poolLabel}>
          {t.fieldBattleTag}
          <input
            className={`${poolInput} mt-1 block`}
            value={draft.battleTag}
            maxLength={40}
            onChange={(ev) =>
              setDraft({ ...draft, battleTag: ev.target.value })
            }
          />
        </label>
        <AdminButton
          size="xs"
          variant="primary"
          disabled={
            busy ||
            !poolNameOk(draft.displayName) ||
            !poolTagOk(draft.battleTag)
          }
          onClick={async () => {
            const done = await onSave({
              displayName: draft.displayName.trim(),
              battleTag: draft.battleTag.trim(),
            });
            if (done) setDraft(null);
          }}
        >
          {t.save}
        </AdminButton>
        <AdminButton size="xs" variant="ghost" onClick={() => setDraft(null)}>
          {t.cancel}
        </AdminButton>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--t2,#c7bfca)]">
      <span className="flex flex-wrap items-center gap-2">
        {lead}
        <span>{entry.displayName}</span>
        <span className="text-[var(--t4,#807984)]">{detail}</span>
        {entry.manual && <Chip tone="neutral">{t.manualChip}</Chip>}
      </span>
      <span className="flex flex-wrap items-center gap-3">
        {actions}
        <button
          type="button"
          className={poolLinkBtn}
          disabled={busy}
          onClick={() =>
            setDraft({
              displayName: entry.displayName,
              battleTag: entry.battleTag,
            })
          }
        >
          {t.edit}
        </button>
        <button
          type="button"
          className={poolLinkBtn}
          disabled={busy}
          onClick={() => onWithdraw(entry)}
        >
          {t.withdraw}
        </button>
      </span>
    </div>
  );
}
