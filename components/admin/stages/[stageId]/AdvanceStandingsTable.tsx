// components/admin/stages/[stageId]/AdvanceStandingsTable.tsx
import React from 'react';
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

/** Table des standings avec cases à cocher (sélection des équipes à avancer). */
function AdvanceStandingsTable({
  standings,
  selectedIds,
  allSelected,
  onToggleTeam,
  onToggleAll,
  t,
}: Props) {
  return (
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
              tiebreakLabel={tiebreakLabel(s.tiebrokenBy, t)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default React.memo(AdvanceStandingsTable);
