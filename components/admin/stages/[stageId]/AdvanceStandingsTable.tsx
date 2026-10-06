// components/admin/stages/[stageId]/AdvanceStandingsTable.tsx
import React, { useState } from 'react';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanFormInput,
  rubanFormLabel,
  rubanInset,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';
import type { TiebreakerOverride } from '@/features/admin/stages/client';
import {
  type OverrideDraft,
  validateOverrideDraft,
} from '@/features/admin/stages/hooks/useTiebreakerOverrides';
import { format } from '@/lib/i18n/useAdminT';
import type { Dict } from './stageDisplay';

export type AdvanceStanding = {
  teamId: string;
  teamName: string | null;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  score: number;
  /**
   * Critère qui a départagé cette équipe des autres à égalité de points.
   * Affiché en clair : un classement qu'on ne peut pas expliquer est un
   * classement qu'on conteste — et c'est le staff qui doit pouvoir répondre.
   */
  tiebrokenBy?: string | null;
};

/**
 * Ligne mémoïsée : ne se re-rend que si son `selected` change. Combiné au tableau
 * ci-dessous, une (dé)sélection ne reconcilie que les lignes réellement affectées
 * plutôt que toute la table (audit P2-5, priorité 2).
 */
const StandingRow = React.memo(function StandingRow({
  s,
  selected,
  onToggle,
  tiebreakLabel,
}: {
  s: AdvanceStanding;
  selected: boolean;
  onToggle: (teamId: string) => void;
  tiebreakLabel: string | null;
}) {
  return (
    <tr
      onClick={() => onToggle(s.teamId)}
      className={`cursor-pointer transition-colors ${
        selected ? 'bg-[rgba(127,202,101,.1)]' : 'hover:bg-[var(--s2,#1d1520)]'
      }`}
    >
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(s.teamId)}
        />
      </td>
      <td className="px-3 py-2 font-mono text-xs text-[var(--t4,#807984)]">
        {s.rank}
      </td>
      <td className="px-3 py-2 font-medium text-[var(--t1,#f4edf7)]">
        {s.teamName || s.teamId.slice(0, 8)}
      </td>
      <td className="px-3 py-2 text-center font-mono text-[var(--lf,#7fca65)]">
        {s.wins}
      </td>
      <td className="px-3 py-2 text-center font-mono text-[var(--err,#ff6b6b)]">
        {s.losses}
      </td>
      <td className="px-3 py-2 text-center font-mono text-[var(--t3,#a39ba6)]">
        {s.draws}
      </td>
      <td className="px-3 py-2 text-right font-mono font-semibold">
        {s.score}
      </td>
      <td className="px-3 py-2 text-right text-xs text-[var(--t3,#a39ba6)]">
        {tiebreakLabel ?? '—'}
      </td>
    </tr>
  );
});

type Props = {
  standings: AdvanceStanding[];
  selectedIds: Set<string>;
  allSelected: boolean;
  onToggleTeam: (teamId: string) => void;
  onToggleAll: () => void;
  t: Dict;
  /**
   * Dérogations de départage (« Forcer l'ordre »). Sans `onAddOverride`, la
   * table reste en lecture seule (aucune barre d'outils).
   */
  overrides?: TiebreakerOverride[];
  overrideSaving?: boolean;
  onAddOverride?: (draft: OverrideDraft) => Promise<boolean>;
  onRemoveOverride?: (ov: TiebreakerOverride) => void;
};

const NO_OVERRIDES: TiebreakerOverride[] = [];

const EMPTY_DRAFT: OverrideDraft = {
  winnerTeamId: '',
  loserTeamId: '',
  reason: '',
};

/** Slug du départage → libellé lisible. Inconnu ou absent → rien à dire. */
function tiebreakLabel(key: string | null | undefined, t: Dict): string | null {
  switch (key) {
    case 'head_to_head':
      return t.tbHeadToHead;
    case 'score_diff':
      return t.tbScoreDiff;
    case 'wins':
      return t.tbWins;
    case 'scored':
      return t.tbScored;
    case 'seed':
      return t.tbSeed;
    default:
      return null;
  }
}

function TeamSelect({
  id,
  label,
  value,
  standings,
  onChange,
  t,
}: {
  id: string;
  label: string;
  value: string;
  standings: AdvanceStanding[];
  onChange: (teamId: string) => void;
  t: Dict;
}) {
  return (
    <div>
      <label htmlFor={id} className={rubanFormLabel}>
        {label}
      </label>
      <select
        id={id}
        className={rubanFormInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t.ovPickTeam}</option>
        {standings.map((s) => (
          <option key={s.teamId} value={s.teamId}>
            {s.rank}. {s.teamName || s.teamId.slice(0, 8)} ({s.score})
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * « Forcer l'ordre » : formulaire (motif obligatoire) + dérogations actives.
 * La validation locale reprend celle du serveur, plus l'égalité de points
 * (le moteur ignore une dérogation entre scores différents).
 */
function OverrideToolbar({
  standings,
  overrides,
  saving,
  onAdd,
  onRemove,
  t,
}: {
  standings: AdvanceStanding[];
  overrides: TiebreakerOverride[];
  saving: boolean;
  onAdd: (draft: OverrideDraft) => Promise<boolean>;
  onRemove?: (ov: TiebreakerOverride) => void;
  t: Dict;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<OverrideDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string) =>
    standings.find((s) => s.teamId === id)?.teamName || id.slice(0, 8);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const key = validateOverrideDraft(draft, standings);
    if (key) {
      setError(t[key]);
      return;
    }
    setError(null);
    if (await onAdd(draft)) {
      setDraft(EMPTY_DRAFT);
      setOpen(false);
    }
  }

  return (
    <div
      className={`${rubanInset} space-y-3 p-3`}
      data-testid="tiebreaker-overrides"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${rubanMuted}`}>{t.ovIntro}</p>
        <AdminButton
          size="xs"
          variant={open ? 'ghost' : 'secondary'}
          onClick={() => {
            setOpen((o) => !o);
            setError(null);
          }}
        >
          {open ? t.ovCancel : t.ovForce}
        </AdminButton>
      </div>

      {open && (
        <form
          onSubmit={submit}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <TeamSelect
            id="ov-winner"
            label={t.ovWinnerLabel}
            value={draft.winnerTeamId}
            standings={standings}
            onChange={(v) => setDraft((d) => ({ ...d, winnerTeamId: v }))}
            t={t}
          />
          <TeamSelect
            id="ov-loser"
            label={t.ovLoserLabel}
            value={draft.loserTeamId}
            standings={standings}
            onChange={(v) => setDraft((d) => ({ ...d, loserTeamId: v }))}
            t={t}
          />
          <div className="sm:col-span-2">
            <label htmlFor="ov-reason" className={rubanFormLabel}>
              {t.ovReasonLabel}
            </label>
            <textarea
              id="ov-reason"
              rows={2}
              maxLength={500}
              className={rubanFormInput}
              placeholder={t.ovReasonPlaceholder}
              value={draft.reason}
              onChange={(e) =>
                setDraft((d) => ({ ...d, reason: e.target.value }))
              }
            />
          </div>
          {error && (
            <p
              role="alert"
              className="text-xs text-[var(--err,#ff6b6b)] sm:col-span-2"
            >
              {error}
            </p>
          )}
          <div className="sm:col-span-2">
            <AdminButton
              type="submit"
              size="sm"
              variant="primary"
              disabled={saving}
            >
              {t.ovSubmit}
            </AdminButton>
          </div>
        </form>
      )}

      {overrides.length > 0 && (
        <div>
          <p className={`mb-1 text-xs font-semibold ${rubanMuted}`}>
            {t.ovActiveTitle}
          </p>
          <ul className="space-y-1">
            {overrides.map((ov) => (
              <li
                key={ov.id}
                data-testid="tiebreaker-override-row"
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="text-[var(--t1,#f4edf7)]">
                  {format(t.ovActiveRow, {
                    winner: ov.winner?.name ?? nameOf(ov.winner_team_id),
                    loser: ov.loser?.name ?? nameOf(ov.loser_team_id),
                  })}
                  {ov.reason && (
                    <span className={`ml-2 text-xs ${rubanMuted}`}>
                      — {ov.reason}
                    </span>
                  )}
                </span>
                {onRemove && (
                  <AdminButton
                    size="xs"
                    variant="danger"
                    disabled={saving}
                    onClick={() => onRemove(ov)}
                  >
                    {t.ovRemove}
                  </AdminButton>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Table des standings avec cases à cocher (sélection des équipes à avancer). */
function AdvanceStandingsTable({
  standings,
  selectedIds,
  allSelected,
  onToggleTeam,
  onToggleAll,
  t,
  overrides = NO_OVERRIDES,
  overrideSaving = false,
  onAddOverride,
  onRemoveOverride,
}: Props) {
  // Équipes placées d'office devant une autre : leur départage, c'est le staff.
  const forcedAhead = new Set(overrides.map((o) => o.winner_team_id));
  return (
    <div className="space-y-3">
      {onAddOverride && (
        <OverrideToolbar
          standings={standings}
          overrides={overrides}
          saving={overrideSaving}
          onAdd={onAddOverride}
          onRemove={onRemoveOverride}
          t={t}
        />
      )}
      <div className="overflow-hidden rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--s2,#1d1520)]">
              <th scope="col" className="px-3 py-2 text-left w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                />
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                #
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                {t.thTeam}
              </th>
              <th scope="col" className="px-3 py-2 text-center">
                {t.thWins}
              </th>
              <th scope="col" className="px-3 py-2 text-center">
                {t.thLosses}
              </th>
              <th scope="col" className="px-3 py-2 text-center">
                {t.thDraws}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t.thPoints}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t.thTiebreak}
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <StandingRow
                key={s.teamId}
                s={s}
                selected={selectedIds.has(s.teamId)}
                onToggle={onToggleTeam}
                tiebreakLabel={
                  forcedAhead.has(s.teamId)
                    ? t.tbOverride
                    : tiebreakLabel(s.tiebrokenBy, t)
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default React.memo(AdvanceStandingsTable);
