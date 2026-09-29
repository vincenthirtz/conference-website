// features/admin/simulator/ui/SimulatorOverview.tsx — tête des résultats
// d'une simulation générée : sélecteur d'occurrence (tournoi récurrent) et
// tuiles de synthèse (équipes, matchs, terminés, en attente, durée, prochain
// round). Présentationnel : les chiffres viennent de `computeSimStats`.

import StatTile from '@/features/admin/_shared/ui/StatTile';
import type { OccurrenceData } from '@/utils/simulatorSerialization';
import type { SimStats } from '@/utils/simulatorStats';
import type { SimulatorDict } from '../hooks/simulatorHookTypes';
import { SIM_EYEBROW, simOptionClass } from './simulatorClasses';

export default function SimulatorOverview({
  tx,
  occurrences,
  activeOccurrence,
  onSelectOccurrence,
  teamCount,
  stats,
}: {
  tx: SimulatorDict;
  occurrences: OccurrenceData[];
  activeOccurrence: number;
  onSelectOccurrence: (i: number) => void;
  teamCount: number;
  stats: SimStats;
}) {
  return (
    <>
      {/* Occurrence selector */}
      {occurrences.length > 1 && (
        <div className="mb-6">
          <p className={`${SIM_EYEBROW} mb-2`}>{tx.occurrenceLabelHeading}</p>
          <div className="flex flex-wrap gap-2">
            {occurrences.map((occ, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSelectOccurrence(i)}
                aria-pressed={activeOccurrence === i}
                className={simOptionClass(activeOccurrence === i)}
              >
                {occ.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label={tx.summaryTeams} value={teamCount} />
        <StatTile label={tx.summaryMatches} value={stats.total} />
        <StatTile label={tx.summaryFinished} value={stats.finished} tone="ok" />
        <StatTile label={tx.summaryPending} value={stats.pending} tone="warn" />
        {stats.estimatedDuration && (
          <StatTile
            label={tx.summaryDuration}
            value={stats.estimatedDuration}
          />
        )}
        {stats.nextRoundName && (
          <StatTile
            label={tx.summaryNextRound}
            value={stats.nextRoundName}
            tone="brand"
          />
        )}
      </div>
    </>
  );
}
