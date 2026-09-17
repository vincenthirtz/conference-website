// components/admin/tournament/mapPool/RoundPoolSelector.tsx
//
// Choix du pool édité : celui du tournoi (par défaut), celui d'une JOURNÉE ou
// celui d'une DATE de jeu.
//
// Journées et dates viennent du PLANNING, pas d'une saisie libre : on ne
// déclare un pool que pour une journée ou un jour qui existe au calendrier.
// Chaque pastille dit combien de cartes le pool porte déjà — zéro signifiant
// « retombera sur le niveau suivant », ce qui n'est pas une erreur mais un
// choix, et doit donc se lire d'un coup d'œil.
//
// Priorité appliquée aux matchs : date > journée > tournoi. Une date réunit
// souvent plusieurs journées (le 30/09 porte J2 et J3) : sa pastille les cite.

import type { PoolScope } from '@/utils/maps/poolScope';
import type { DateOption, RoundOption } from './types';

type Labels = {
  legend: string;
  defaultPool: string;
  defaultPoolHint: string;
  mapsCount: string;
  inheritsDefault: string;
  noRounds: string;
  datesLegend: string;
  datesHint: string;
  dateInherits: string;
};

type Props = {
  rounds: RoundOption[];
  dates: DateOption[];
  /** Pool édité. */
  value: PoolScope;
  onChange: (scope: PoolScope) => void;
  /** Nombre de cartes du pool par défaut, pour sa propre pastille. */
  defaultCount: number;
  labels: Labels;
  /** Formate `YYYY-MM-DD` pour l'affichage. */
  formatDay: (day: string) => string;
  disabled?: boolean;
};

function pillClass(active: boolean): string {
  return [
    'px-3 py-2 rounded-lg border text-sm text-left transition-colors',
    active
      ? 'bg-purple-600 border-purple-400/60 text-white'
      : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10',
  ].join(' ');
}

function countLabel(labels: Labels, count: number, fallback: string): string {
  return count > 0
    ? labels.mapsCount.replace('{count}', String(count))
    : fallback;
}

export default function RoundPoolSelector({
  rounds,
  dates,
  value,
  onChange,
  defaultCount,
  labels,
  formatDay,
  disabled = false,
}: Props) {
  const isDefault = value.kind === 'default';
  return (
    <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
      <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80 mb-3">
        {labels.legend}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange({ kind: 'default' })}
          disabled={disabled}
          aria-pressed={isDefault}
          className={pillClass(isDefault)}
          title={labels.defaultPoolHint}
        >
          <span className="block font-medium">{labels.defaultPool}</span>
          <span className="block text-xs opacity-80">
            {labels.mapsCount.replace('{count}', String(defaultCount))}
          </span>
        </button>

        {rounds.map((r) => {
          const active = value.kind === 'round' && value.round === r.round;
          return (
            <button
              key={r.round}
              type="button"
              onClick={() => onChange({ kind: 'round', round: r.round })}
              disabled={disabled}
              aria-pressed={active}
              className={pillClass(active)}
            >
              <span className="block font-medium">
                {r.label}
                {r.days.length > 0 && (
                  <span className="opacity-80 font-normal">
                    {' · '}
                    {r.days.map(formatDay).join(', ')}
                  </span>
                )}
              </span>
              <span className="block text-xs opacity-80">
                {countLabel(labels, r.mapsCount, labels.inheritsDefault)}
              </span>
            </button>
          );
        })}
      </div>

      {rounds.length === 0 && (
        <p className="mt-3 text-xs text-gray-400">{labels.noRounds}</p>
      )}

      {dates.length > 0 && (
        <>
          <p
            className="text-xs uppercase tracking-[0.18em] text-purple-200/80 mt-4 mb-1"
            title={labels.datesHint}
          >
            {labels.datesLegend}
          </p>
          <p className="text-xs text-gray-400 mb-3">{labels.datesHint}</p>
          <div className="flex flex-wrap gap-2">
            {dates.map((d) => {
              const active = value.kind === 'date' && value.date === d.date;
              const hasPool = d.mapsCount > 0;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => onChange({ kind: 'date', date: d.date })}
                  disabled={disabled}
                  aria-pressed={active}
                  className={`${pillClass(active)}${
                    hasPool && !active ? ' border-emerald-400/40' : ''
                  }`}
                >
                  <span className="block font-medium">
                    {formatDay(d.date)}
                    {d.rounds.length > 0 && (
                      <span className="opacity-80 font-normal">
                        {' · '}
                        {d.rounds.join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs opacity-80">
                    {countLabel(labels, d.mapsCount, labels.dateInherits)}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
