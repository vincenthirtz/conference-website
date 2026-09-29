// features/admin/matches/ui/MatchEditForm.tsx — les champs de l'écran
// d'édition d'un match (statut & round, planning & stream, score, forfait,
// notes et actions), sortis de pages/admin/matches/[matchId]/edit.tsx.
// Purement présentationnel : la page tient l'état du formulaire et les
// appels réseau, et passe ici valeurs et rappels.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { MatchStatus } from '@/types/admin';
import nsAdminMatchEdit from '@/lib/i18n/locales/admin-fr/adminMatchEdit';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';

type Dict = typeof nsAdminMatchEdit.fr;

export const MATCH_EDIT_LABEL = 'mb-1 block text-sm text-[var(--t2,#c7bfca)]';
export const MATCH_EDIT_HELP = 'mt-1 text-xs text-[var(--t3,#a39ba6)]';
export const MATCH_EDIT_INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

export type MatchEditFormState = {
  status: MatchStatus;
  best_of: string;
  round_number: string;
  scheduled_at: string;
  stream_url: string;
  notes: string;
  team1_score: string;
  team2_score: string;
};

export type MatchEditUpdateField = <K extends keyof MatchEditFormState>(
  key: K,
  value: MatchEditFormState[K]
) => void;

export function matchEditStatusLabel(status: MatchStatus, t: Dict) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
      return t.statusFinished;
    case 'cancelled':
      return t.statusCancelled;
    case 'postponed':
      return t.statusPostponed;
    case 'disputed':
      return t.statusDisputed;
    case 'walkover':
      return t.statusWalkover;
    default:
      return status;
  }
}

/** Statut & round, planning & stream, score, forfait. */
export function MatchEditFields({
  form,
  updateField,
  team1Name,
  team2Name,
  forfeit,
}: {
  form: MatchEditFormState;
  updateField: MatchEditUpdateField;
  team1Name: string | null;
  team2Name: string | null;
  /** Absent quand le forfait n'a pas lieu d'être (équipe manquante, terminé). */
  forfeit: {
    team1Id: string;
    team2Id: string;
    onPick: (id: string) => void;
  } | null;
}) {
  const t = useAdminT(nsAdminMatchEdit);
  const name1 = team1Name || t.team1Fallback;
  const name2 = team2Name || t.team2Fallback;
  return (
    <>
      <FicheSection title={t.statusRoundHeading}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={MATCH_EDIT_LABEL}>{t.statusFieldLabel}</label>
            <select
              className={MATCH_EDIT_INPUT}
              value={form.status}
              onChange={(e) =>
                updateField('status', e.target.value as MatchStatus)
              }
            >
              <option value="pending">{t.statusPending}</option>
              <option value="ongoing">{t.statusOngoing}</option>
              <option value="finished">{t.statusFinished}</option>
              <option value="cancelled">{t.statusCancelled}</option>
              <option value="postponed">{t.statusPostponed}</option>
              <option value="disputed">{t.statusDisputed}</option>
              <option value="walkover">{t.statusWalkover}</option>
            </select>
          </div>
          <div>
            <label className={MATCH_EDIT_LABEL}>{t.roundHashLabel}</label>
            <input
              type="number"
              className={MATCH_EDIT_INPUT}
              value={form.round_number}
              onChange={(e) => updateField('round_number', e.target.value)}
              placeholder="1"
            />
          </div>
          <div>
            <label className={MATCH_EDIT_LABEL}>{t.formatBoLabel}</label>
            <input
              type="number"
              min={1}
              className={MATCH_EDIT_INPUT}
              value={form.best_of}
              onChange={(e) => updateField('best_of', e.target.value)}
              placeholder="3, 5…"
            />
          </div>
        </div>
      </FicheSection>

      <FicheSection title={t.planningStreamHeading}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={MATCH_EDIT_LABEL}>{t.scheduledLabel}</label>
            <input
              type="datetime-local"
              className={MATCH_EDIT_INPUT}
              value={form.scheduled_at}
              onChange={(e) => updateField('scheduled_at', e.target.value)}
            />
            <p className={MATCH_EDIT_HELP}>{t.scheduledHint}</p>
          </div>
          <div>
            <label className={MATCH_EDIT_LABEL}>{t.streamUrlLabel}</label>
            <input
              type="text"
              className={MATCH_EDIT_INPUT}
              value={form.stream_url}
              onChange={(e) => updateField('stream_url', e.target.value)}
              placeholder="https://twitch.tv/..."
            />
          </div>
        </div>
      </FicheSection>

      <FicheSection title={t.scoreHeading}>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className={MATCH_EDIT_LABEL}>{name1}</label>
            <input
              type="number"
              min={0}
              className={`font-mono ${MATCH_EDIT_INPUT}`}
              value={form.team1_score}
              onChange={(e) => updateField('team1_score', e.target.value)}
              placeholder="0"
            />
          </div>
          <span className="pt-6 text-xl font-bold text-[var(--t4,#807984)]">
            —
          </span>
          <div className="flex-1">
            <label className={MATCH_EDIT_LABEL}>{name2}</label>
            <input
              type="number"
              min={0}
              className={`font-mono ${MATCH_EDIT_INPUT}`}
              value={form.team2_score}
              onChange={(e) => updateField('team2_score', e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <p className={MATCH_EDIT_HELP}>{t.scoreHint}</p>
      </FicheSection>

      {forfeit && (
        <FicheSection title={t.forfeitHeading}>
          <p className={`mb-4 ${MATCH_EDIT_HELP}`}>{t.forfeitHint}</p>
          <div className="flex flex-wrap gap-3">
            <AdminButton
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={() => forfeit.onPick(forfeit.team1Id)}
            >
              {format(t.forfeitTeam, { team: name1 })}
            </AdminButton>
            <AdminButton
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={() => forfeit.onPick(forfeit.team2Id)}
            >
              {format(t.forfeitTeam, { team: name2 })}
            </AdminButton>
          </div>
        </FicheSection>
      )}
    </>
  );
}

/** Notes internes + barre d'actions (annuler / enregistrer). */
export function MatchEditNotesActions({
  notes,
  onNotesChange,
  saving,
  onCancel,
}: {
  notes: string;
  onNotesChange: (value: string) => void;
  saving: boolean;
  onCancel: () => void;
}) {
  const t = useAdminT(nsAdminMatchEdit);
  return (
    <>
      <FicheSection title={t.notesHeading}>
        <textarea
          className={`min-h-[120px] ${MATCH_EDIT_INPUT}`}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={t.notesPlaceholder}
        />
      </FicheSection>

      <div className="flex items-center justify-between gap-3">
        <AdminButton
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          {t.cancel}
        </AdminButton>
        <AdminButton type="submit" variant="primary" disabled={saving}>
          {saving ? t.saving : t.saveChanges}
        </AdminButton>
      </div>
    </>
  );
}
