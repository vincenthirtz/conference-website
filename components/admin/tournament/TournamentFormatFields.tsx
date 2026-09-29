// components/admin/tournament/TournamentFormatFields.tsx
//
// Les champs « format et effectifs » de l'édition d'un tournoi : libellé de
// format, structure, nombre d'équipes, effectif min/max par équipe, et
// l'inscription individuelle.
//
// EXTRAIT DE `pages/admin/tournament/[id]/edit.tsx` — cet écran fait partie des
// god-components gelés par `tests/unit/adminFileSizeGuard.test.ts`, dont la
// règle est « tout lot qui touche un de ces fichiers en extrait au moins un
// panneau ». Ajouter la case « inscription individuelle » l'a fait grossir ;
// ce bloc est ce qui pouvait partir sans rien démêler : six champs contrôlés,
// aucun état propre, aucune dépendance au reste du formulaire.
//
// Volontairement des CHAMPS et non une `<section>` : ils vivent dans la grille
// de la section parente (`md:grid-cols-2`), dont ils héritent le gabarit. Les
// en sortir emporterait la mise en page avec eux.

import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTournamentEdit from '@/lib/i18n/locales/admin-fr/adminTournamentEdit';
import {
  FAINT,
  INPUT,
  LABEL,
  TILE,
} from '@/features/admin/stages/ui/rubanClasses';

/** Les seuls champs du formulaire que ce bloc touche. */
export type TournamentFormatForm = {
  format: string;
  format_type: string;
  max_teams: string;
  min_players: string;
  max_players: string;
  solo_mode: boolean;
  pooled_teams: boolean;
};

/**
 * `updateField` en SURCHARGES et non en générique sur ce seul type : l'écran
 * parent expose un générique sur SON formulaire complet, qui n'est pas
 * assignable à un générique sur un sous-ensemble (TypeScript le refuse dans ce
 * sens). Deux signatures suffisent ici — tous ces champs sont des chaînes,
 * sauf l'inscription individuelle qui est une case à cocher.
 */
type UpdateFormatField = {
  (
    field:
      | 'format'
      | 'format_type'
      | 'max_teams'
      | 'min_players'
      | 'max_players',
    value: string
  ): void;
  (field: 'solo_mode' | 'pooled_teams', value: boolean): void;
};

type Props = {
  form: TournamentFormatForm;
  updateField: UpdateFormatField;
};

export default function TournamentFormatFields({ form, updateField }: Props) {
  const t = useAdminT(nsAdminTournamentEdit);

  return (
    <>
      <div>
        <label className={LABEL}>{t.formatLabel}</label>
        <input
          type="text"
          className={INPUT}
          value={form.format}
          onChange={(e) => updateField('format', e.target.value)}
          placeholder="BO3"
        />
        <p className={`mt-1 text-xs ${FAINT}`}>{t.formatHelp}</p>
      </div>

      <div>
        <label className={LABEL}>{t.formatTypeLabel}</label>
        <select
          className={INPUT}
          value={form.format_type}
          onChange={(e) => updateField('format_type', e.target.value)}
        >
          <option value="">{t.formatTypeNone}</option>
          <option value="single_elim">{t.formatSingleElim}</option>
          <option value="double_elim">{t.formatDoubleElim}</option>
          <option value="swiss">{t.formatSwiss}</option>
          <option value="round_robin">{t.formatRoundRobin}</option>
          <option value="showmatch">{t.formatShowmatch}</option>
        </select>
      </div>

      <div>
        <label className={LABEL}>{t.maxTeamsLabel}</label>
        <input
          type="number"
          min={2}
          className={INPUT}
          value={form.max_teams}
          onChange={(e) => updateField('max_teams', e.target.value)}
          placeholder="16"
        />
      </div>

      <div className="md:col-span-2">
        <label className={LABEL}>{t.minPlayersLabel}</label>
        <input
          type="number"
          min={1}
          className={INPUT}
          value={form.min_players}
          onChange={(e) => updateField('min_players', e.target.value)}
          placeholder="5"
        />
        <p className={`mt-1 text-xs ${FAINT}`}>{t.minPlayersHelp}</p>
      </div>
      <div className="md:col-span-2">
        <label className={LABEL}>{t.maxPlayersLabel}</label>
        <input
          type="number"
          min={1}
          className={INPUT}
          value={form.max_players}
          onChange={(e) => updateField('max_players', e.target.value)}
          placeholder="10"
        />
        <p className={`mt-1 text-xs ${FAINT}`}>{t.maxPlayersHelp}</p>
      </div>
      {/* Inscription individuelle : une case, deux
          conséquences (parcours d'inscription + silence
          Discord), toutes deux dites dans l'aide — aucune ne
          se devine depuis le libellé. */}
      <label
        className={`flex cursor-pointer items-start gap-3 p-3 text-sm md:col-span-2 ${TILE}`}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-neutral-600 bg-neutral-900"
          checked={form.solo_mode}
          onChange={(e) => {
            updateField('solo_mode', e.target.checked);
            // Exclusifs : cocher l'un décoche l'autre.
            if (e.target.checked) updateField('pooled_teams', false);
          }}
        />
        <span>
          <span className="font-medium">{t.soloModeLabel}</span>
          <span className={`mt-1 block text-xs ${FAINT}`}>
            {t.soloModeHelp}
          </span>
        </span>
      </label>

      {/* Inscription individuelle REGROUPÉE en équipes de 5 : exclusive du
          mode solo ci-dessus. */}
      <label
        className={`flex cursor-pointer items-start gap-3 p-3 text-sm md:col-span-2 ${TILE}`}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-neutral-600 bg-neutral-900"
          checked={form.pooled_teams}
          onChange={(e) => {
            updateField('pooled_teams', e.target.checked);
            if (e.target.checked) updateField('solo_mode', false);
          }}
        />
        <span>
          <span className="font-medium">{t.pooledTeamsLabel}</span>
          <span className={`mt-1 block text-xs ${FAINT}`}>
            {t.pooledTeamsHelp}
          </span>
        </span>
      </label>
    </>
  );
}
