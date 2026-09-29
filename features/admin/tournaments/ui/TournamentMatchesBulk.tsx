// features/admin/tournaments/ui/TournamentMatchesBulk.tsx — actions en lot de
// l'écran « matchs du tournoi » : bandeau de sélection, panneau de
// planification groupée, panneau d'édition groupée. Présentationnel : les
// écritures, leur confirmation et l'état restent dans la page ; ici, des
// valeurs et des rappels.

import { useEffect, useRef, useState } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type { Match } from '@/types/admin';
import {
  TM_HINT,
  TM_INPUT,
  TM_LABEL,
  TM_PANEL,
  TM_PANEL_TITLE,
  type TournamentMatchesDict,
} from './TournamentMatchesShared';

export type BulkEditFields = {
  status?: string;
  best_of?: number | null;
  round_number?: number | null;
  notes?: string;
};

/** Bandeau orchidée au-dessus des lignes quand une sélection existe. */
export function TournamentMatchesBulkBar({
  t,
  count,
  showModeButtons,
  onBulkSchedule,
  onBulkEdit,
  bulkDeleting,
  onBulkDelete,
  onClearSelection,
}: {
  t: TournamentMatchesDict;
  count: number;
  /** Faux quand un panneau (planification / édition) est déjà ouvert. */
  showModeButtons: boolean;
  onBulkSchedule: () => void;
  onBulkEdit: () => void;
  bulkDeleting: boolean;
  onBulkDelete: (hard: boolean) => void;
  onClearSelection: () => void;
}) {
  return (
    <section
      className="mb-6 flex flex-wrap items-center gap-3 rounded-[var(--r-card,14px)] border border-[rgba(180,103,209,.4)] bg-[rgba(180,103,209,.10)] px-4 py-3"
      role="status"
    >
      <span className="text-[13px] text-[var(--or-200,#eec4ff)]" data-numeric>
        {format(count > 1 ? t.selectedCount_other : t.selectedCount_one, {
          count,
        })}
      </span>

      <div className="flex-1" />

      {showModeButtons && (
        <>
          <AdminButton variant="secondary" size="xs" onClick={onBulkSchedule}>
            {t.bulkScheduleBtn}
          </AdminButton>
          <AdminButton variant="secondary" size="xs" onClick={onBulkEdit}>
            {t.bulkEditBtn}
          </AdminButton>
        </>
      )}

      <AdminButton
        variant="danger"
        size="xs"
        onClick={() => onBulkDelete(false)}
        disabled={bulkDeleting}
      >
        {bulkDeleting ? t.inProgress : t.bulkCancelBtn}
      </AdminButton>

      <AdminButton
        variant="danger"
        size="xs"
        onClick={() => onBulkDelete(true)}
        disabled={bulkDeleting}
      >
        {bulkDeleting ? t.inProgress : t.bulkDeleteBtn}
      </AdminButton>

      <AdminButton variant="ghost" size="xs" onClick={onClearSelection}>
        {t.cancelSelection}
      </AdminButton>
    </section>
  );
}

// --- Ligne du panneau de planification groupée ----------------------------
// Valeur locale (pas de state page) → taper ne re-render que cette ligne. La
// valeur est remontée dans une ref via `onChange`. Le broadcast « même
// date/heure pour toutes » est appliqué via un effet piloté par un nonce.
type BulkScheduleRowProps = {
  match: Match;
  initialValue: string;
  broadcastValue: string;
  broadcastNonce: number;
  onChange: (matchId: string, value: string) => void;
};

function BulkScheduleRow({
  match,
  initialValue,
  broadcastValue,
  broadcastNonce,
  onChange,
}: BulkScheduleRowProps) {
  const [value, setValue] = useState(initialValue);
  const seenNonce = useRef(broadcastNonce);

  useEffect(() => {
    // On ignore le nonce initial (montage) ; on ne réagit qu'aux bumps.
    if (broadcastNonce === seenNonce.current) return;
    seenNonce.current = broadcastNonce;
    setValue(broadcastValue);
  }, [broadcastNonce, broadcastValue]);

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-48 truncate text-[var(--t2,#c7bfca)]">
        {match.team1?.short_name || match.team1?.name || 'TBD'} vs{' '}
        {match.team2?.short_name || match.team2?.name || 'TBD'}
      </span>
      <span className="font-mono text-xs text-[var(--t4,#807984)]">
        R{match.round_number ?? '?'}
      </span>
      <input
        type="datetime-local"
        className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-1.5 text-xs text-[var(--t1,#f4edf7)] [color-scheme:dark] focus:border-[var(--or,#b467d1)] focus:outline-none"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(match.id, e.target.value);
        }}
      />
    </div>
  );
}

export function TournamentMatchesBulkSchedulePanel({
  t,
  count,
  timezone,
  selectedMatches,
  initialValues,
  broadcast,
  onBroadcastAll,
  onRowChange,
  saving,
  onSave,
  onClose,
  stageSelected,
}: {
  t: TournamentMatchesDict;
  count: number;
  timezone: string;
  selectedMatches: Match[];
  initialValues: Record<string, string>;
  broadcast: { value: string; nonce: number };
  onBroadcastAll: (dateTime: string) => void;
  onRowChange: (matchId: string, value: string) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  stageSelected: boolean;
}) {
  return (
    <section className={TM_PANEL}>
      <h3 className={TM_PANEL_TITLE}>
        {format(
          count > 1 ? t.bulkScheduleTitle_other : t.bulkScheduleTitle_one,
          { count }
        )}
      </h3>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className={TM_LABEL}>
            {t.applySameDateTime} ({timezone})
          </label>
          <input
            type="datetime-local"
            className={`${TM_INPUT} [color-scheme:dark]`}
            onChange={(e) => onBroadcastAll(e.target.value)}
          />
        </div>
        <div className="py-2 text-xs text-[var(--t3,#a39ba6)]">
          {t.orAdjustIndividually}
        </div>
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {selectedMatches.map((m) => (
          <BulkScheduleRow
            key={m.id}
            match={m}
            initialValue={initialValues[m.id] ?? ''}
            broadcastValue={broadcast.value}
            broadcastNonce={broadcast.nonce}
            onChange={onRowChange}
          />
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <AdminButton
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saving}
          className={saving ? 'cursor-wait' : ''}
        >
          {saving ? t.bulkScheduleSaving : t.bulkScheduleSave}
        </AdminButton>
        <AdminButton variant="ghost" size="sm" onClick={onClose}>
          {t.close}
        </AdminButton>
      </div>

      {!stageSelected && <p className={TM_HINT}>{t.bulkScheduleHint}</p>}
    </section>
  );
}

export function TournamentMatchesBulkEditPanel({
  t,
  count,
  fields,
  setFields,
  saving,
  onSave,
  onClose,
  stageSelected,
}: {
  t: TournamentMatchesDict;
  count: number;
  fields: BulkEditFields;
  setFields: (update: (prev: BulkEditFields) => BulkEditFields) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  stageSelected: boolean;
}) {
  return (
    <section className={TM_PANEL}>
      <h3 className={TM_PANEL_TITLE}>
        {format(count > 1 ? t.bulkEditTitle_other : t.bulkEditTitle_one, {
          count,
        })}
      </h3>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={TM_LABEL}>{t.filterStatus}</label>
          <select
            className={TM_INPUT}
            value={fields.status ?? ''}
            onChange={(e) =>
              setFields((prev) => ({
                ...prev,
                status: e.target.value || undefined,
              }))
            }
          >
            <option value="">{t.dontModify}</option>
            <option value="pending">{t.statusPending}</option>
            <option value="ongoing">{t.statusOngoing}</option>
            <option value="finished">{t.statusFinished}</option>
            <option value="cancelled">{t.statusCancelled}</option>
          </select>
        </div>

        <div>
          <label className={TM_LABEL}>{t.bulkFormatLabel}</label>
          <select
            className={TM_INPUT}
            value={fields.best_of ?? ''}
            onChange={(e) =>
              setFields((prev) => ({
                ...prev,
                best_of: e.target.value
                  ? parseInt(e.target.value, 10)
                  : undefined,
              }))
            }
          >
            <option value="">{t.dontModify}</option>
            <option value="1">BO1</option>
            <option value="3">BO3</option>
            <option value="5">BO5</option>
            <option value="7">BO7</option>
          </select>
        </div>

        <div>
          <label className={TM_LABEL}>{t.bulkRoundLabel}</label>
          <input
            type="number"
            min={1}
            placeholder={t.dontModify}
            className={TM_INPUT}
            value={fields.round_number ?? ''}
            onChange={(e) =>
              setFields((prev) => ({
                ...prev,
                round_number: e.target.value
                  ? parseInt(e.target.value, 10)
                  : undefined,
              }))
            }
          />
        </div>

        <div>
          <label className={TM_LABEL}>{t.bulkNotesLabel}</label>
          <input
            type="text"
            placeholder={t.dontModify}
            className={TM_INPUT}
            value={fields.notes ?? ''}
            onChange={(e) =>
              setFields((prev) => ({
                ...prev,
                notes: e.target.value || undefined,
              }))
            }
          />
        </div>
      </div>

      <div className="flex gap-3">
        <AdminButton
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saving}
          className={saving ? 'cursor-wait' : ''}
        >
          {saving ? t.bulkEditSaving : t.bulkEditSave}
        </AdminButton>
        <AdminButton variant="ghost" size="sm" onClick={onClose}>
          {t.close}
        </AdminButton>
      </div>

      {!stageSelected && <p className={TM_HINT}>{t.bulkEditHint}</p>}
    </section>
  );
}
