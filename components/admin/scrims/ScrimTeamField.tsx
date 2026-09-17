import { useId } from 'react';

/** Valeur sentinelle du <select> : « équipe extérieure, saisie libre ». */
export const EXTERNAL_TEAM_OPTION = '__external__';

export type ScrimTeamOption = { id: string; name: string };

export type ScrimTeamValue = {
  /** Id d'une équipe existante, ou '' (aucune / extérieure). */
  teamId: string;
  /** `true` = saisie d'une équipe extérieure (créée à l'enregistrement). */
  external: boolean;
  externalName: string;
};

type ScrimTeamFieldProps = {
  label: string;
  noneLabel: string;
  externalOptionLabel: string;
  externalPlaceholder: string;
  externalHint: string;
  teams: ScrimTeamOption[];
  /**
   * Équipe actuellement liée, affichée même si elle manque à `teams` (une
   * équipe extérieure est inactive, donc absente de la liste chargée).
   */
  currentTeam?: ScrimTeamOption | null;
  value: ScrimTeamValue;
  onChange: (value: ScrimTeamValue) => void;
};

/**
 * Sélecteur d'une équipe de scrim : une équipe inscrite, ou une équipe
 * EXTÉRIEURE saisie par son nom. L'API crée alors l'équipe (sans effectif,
 * logo par défaut) — cf. `utils/teams/externalScrimTeam.ts`.
 */
export default function ScrimTeamField({
  label,
  noneLabel,
  externalOptionLabel,
  externalPlaceholder,
  externalHint,
  teams,
  currentTeam,
  value,
  onChange,
}: ScrimTeamFieldProps) {
  const selectId = useId();
  const inputId = useId();
  const showCurrent =
    currentTeam && !teams.some((team) => team.id === currentTeam.id);

  return (
    <div>
      <label htmlFor={selectId} className="block text-sm text-neutral-400 mb-1">
        {label}
      </label>
      <select
        id={selectId}
        value={value.external ? EXTERNAL_TEAM_OPTION : value.teamId}
        onChange={(e) => {
          const v = e.target.value;
          if (v === EXTERNAL_TEAM_OPTION) {
            onChange({ ...value, teamId: '', external: true });
          } else {
            onChange({ ...value, teamId: v, external: false });
          }
        }}
        className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
      >
        <option value="">{noneLabel}</option>
        {showCurrent && (
          <option value={currentTeam.id}>{currentTeam.name}</option>
        )}
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
        <option value={EXTERNAL_TEAM_OPTION}>{externalOptionLabel}</option>
      </select>
      {value.external && (
        <div className="mt-2">
          <input
            id={inputId}
            aria-label={externalPlaceholder}
            value={value.externalName}
            maxLength={80}
            onChange={(e) =>
              onChange({ ...value, externalName: e.target.value })
            }
            placeholder={externalPlaceholder}
            className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
          />
          <p className="mt-1 text-xs text-neutral-500">{externalHint}</p>
        </div>
      )}
    </div>
  );
}

/** Champs `teamN_id` / `teamN_name` du corps envoyé à l'API admin. */
export function scrimTeamBody(
  side: 1 | 2,
  value: ScrimTeamValue
): Record<string, string | null> {
  const name = value.externalName.trim();
  if (value.external && name) {
    return { [`team${side}_id`]: null, [`team${side}_name`]: name };
  }
  return { [`team${side}_id`]: value.external ? null : value.teamId || null };
}
