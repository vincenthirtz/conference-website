// components/admin/tournament/mapPool/RoundPoolSelector.tsx
//
// Choix du pool édité : celui du tournoi (par défaut) ou celui d'une JOURNÉE.
//
// Les journées viennent du PLANNING, pas d'une saisie libre : on ne déclare un
// pool que pour une journée qui existe au calendrier. Chaque pastille dit
// combien de cartes la journée porte déjà — zéro signifiant « cette journée
// retombera sur le pool par défaut », ce qui n'est pas une erreur mais un
// choix, et doit donc se lire d'un coup d'œil.

import type { RoundOption } from './types';

type Labels = {
  legend: string;
  defaultPool: string;
  defaultPoolHint: string;
  mapsCount: string;
  inheritsDefault: string;
  noRounds: string;
};

type Props = {
  rounds: RoundOption[];
  /** Journée éditée ; `null` = pool par défaut du tournoi. */
  value: number | null;
  onChange: (round: number | null) => void;
  /** Nombre de cartes du pool par défaut, pour sa propre pastille. */
  defaultCount: number;
  labels: Labels;
  /** Formate `YYYY-MM-DD` pour l'affichage (locale de l'écran). */
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

export default function RoundPoolSelector({
  rounds,
  value,
  onChange,
  defaultCount,
  labels,
  formatDay,
  disabled = false,
}: Props) {
  return (
    <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
      <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80 mb-3">
        {labels.legend}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-pressed={value === null}
          className={pillClass(value === null)}
          title={labels.defaultPoolHint}
        >
          <span className="block font-medium">{labels.defaultPool}</span>
          <span className="block text-xs opacity-80">
            {labels.mapsCount.replace('{count}', String(defaultCount))}
          </span>
        </button>

        {rounds.map((r) => {
          const active = value === r.round;
          return (
            <button
              key={r.round}
              type="button"
              onClick={() => onChange(r.round)}
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
                {r.mapsCount > 0
                  ? labels.mapsCount.replace('{count}', String(r.mapsCount))
                  : labels.inheritsDefault}
              </span>
            </button>
          );
        })}
      </div>

      {rounds.length === 0 && (
        <p className="mt-3 text-xs text-gray-400">{labels.noRounds}</p>
      )}
    </div>
  );
}
