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
        selected ? 'bg-emerald-900/30' : 'hover:bg-neutral-700/50'
      }`}
    >
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(s.teamId)}
          className="rounded border-neutral-500 bg-neutral-700"
        />
      </td>
      <td className="px-3 py-2 text-neutral-500 font-mono text-xs">{s.rank}</td>
      <td className="px-3 py-2 font-medium">
        {s.teamName || s.teamId.slice(0, 8)}
      </td>
      <td className="px-3 py-2 text-center text-emerald-400">{s.wins}</td>
      <td className="px-3 py-2 text-center text-red-400">{s.losses}</td>
      <td className="px-3 py-2 text-center text-neutral-400">{s.draws}</td>
      <td className="px-3 py-2 text-right font-semibold">{s.score}</td>
      <td className="px-3 py-2 text-right text-xs text-neutral-500">
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
    <div className="border border-neutral-700 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-900/80 text-neutral-400 text-xs uppercase tracking-wider">
            <th scope="col" className="px-3 py-2 text-left w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="rounded border-neutral-500 bg-neutral-700"
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
