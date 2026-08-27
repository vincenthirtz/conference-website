// components/player/TeamRegistrationCard.tsx
//
// « Inscription au tournoi » dans l'espace équipe — le bouton qui manquait.
//
// Le problème qu'elle ferme : l'inscription au tournoi tentée à la création de
// l'équipe (`/api/teams/create-with-member`) est BEST-EFFORT. Quand elle
// échoue — roster incomplet au moment de la création, ce qui est le cas normal
// depuis que les coéquipières sont INVITÉES et non insérées — le wizard crée
// quand même l'équipe et affiche « Réessaie depuis ton espace capitaine ».
// Sauf que l'espace équipe n'offrait aucun geste : `/api/demandes/register-team`
// existait, acceptait capitaine ET manager, et n'avait aucun appelant côté
// front. Le renvoi tournait à l'impasse, et l'équipe restait hors tournoi sans
// que personne s'en aperçoive.
//
// Trois partis pris :
//
//   1. ELLE DISPARAÎT quand il n'y a rien à dire — pas d'équipe, pas de
//      tournoi en cours. Une carte permanente « tout va bien » n'est plus lue
//      (même règle que `utils/teams/teamHealth.ts`).
//   2. LES BLOCAGES SONT NOMMÉS, pas devinés. Le serveur renvoie des CODES
//      (`TeamRegistrationBlocker`) ; le libellé et le geste qui répare vivent
//      ici. Une équipe à 3 membres lit « il faut au moins 5 membres, vous êtes
//      3 » et un lien vers le roster, pas un bouton grisé sans explication.
//   3. L'ÉLIGIBILITÉ VIENT DU SERVEUR, du même décompte que le POST
//      (`countRegistrationMembers`). Recalculer côté client ferait mentir la
//      carte le jour où la règle bouge.
//
// En INSPECTION admin (`?as=`), la carte se retire complètement :
// `/api/demandes/register-team` est une route `withAuthRoute`, elle ignore le
// paramètre `as=` et répondrait sur l'équipe de l'ADMIN. Afficher ça dans la
// vue d'une capitaine serait pire que ne rien afficher. Le staff a ses propres
// écrans d'inscription (`/admin/demandes`).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import type { RegistrationField } from '@/utils/registrationFields';
import type {
  TeamRegistrationBlocker,
  TeamRegistrationStatus,
} from '../../pages/api/demandes/register-team';
import { logger } from '../../utils/logger';
import nsTeamRegistration from '@/lib/i18n/locales/fr/teamRegistration';

/** Valeur d'un champ personnalisé, avant coercition serveur. */
type FieldValue = string | boolean;

const CARD_CLS =
  'rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 mb-6';
const INPUT_CLS =
  'w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-violet)]/70 focus:border-[var(--color-violet)]/70 transition';
const LABEL_CLS =
  'block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2';

export default function TeamRegistrationCard({
  /** Ancre du formulaire d'invitation, cible du « compléter le roster ». */
  rosterAnchor = '#invite-email',
}: {
  rosterAnchor?: string;
}) {
  const t = useT(nsTeamRegistration);
  const locale = useLocale();
  const { isInspecting, readOnly } = usePlayerArea();
  const { withTeam } = useActiveTeam();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const [status, setStatus] = useState<TeamRegistrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [message, setMessage] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetchJson<{
        status?: TeamRegistrationStatus | null;
      }>(withTeam('/api/demandes/register-team'), {
        skipAuthRedirect: true,
      });
      setStatus(data?.status ?? null);
      setLoadFailed(false);
    } catch (err) {
      logger.error('[TeamRegistrationCard] load error', err);
      // On ne sait pas : on le DIT, plutôt que de masquer la carte. Masquer
      // sur une erreur réseau reproduirait exactement l'impasse qu'elle ferme.
      setStatus(null);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, withTeam]);

  useEffect(() => {
    if (isInspecting) return;
    void load();
  }, [isInspecting, load]);

  const handleFieldChange = (key: string, value: FieldValue) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!status?.team || !status.tournament || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      await adminFetchJson(withTeam('/api/demandes/register-team'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: status.team.id,
          tournamentId: status.tournament.id,
          message: message.trim() || undefined,
          field_values: status.fields.length ? fieldValues : undefined,
        }),
      });
      setSubmitted(true);
      setMessage('');
      await load();
    } catch (err) {
      // Le serveur valide les champs personnalisés et renvoie `fieldErrors` :
      // sans les réafficher, un refus sur un champ requis serait un « réessaie »
      // sans indication de ce qu'il faut corriger.
      const payload =
        err instanceof AdminFetchError
          ? (err.payload as {
              error?: string;
              fieldErrors?: Record<string, string>;
            } | null)
          : null;
      if (payload?.fieldErrors) setFieldErrors(payload.fieldErrors);
      setSubmitError(payload?.error || (err as Error).message || t.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  if (isInspecting) return null;

  if (loading && !status) {
    return (
      <div className={CARD_CLS}>
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <p className="mt-1 text-sm text-gray-400">{t.loading}</p>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className={CARD_CLS}>
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <p className="mt-1 text-sm text-amber-200/90">{t.loadError}</p>
      </div>
    );
  }

  // Rien à dire : pas d'équipe gérée, ou aucun tournoi en cours (parti pris 1).
  if (!status?.team || !status.tournament) return null;

  const tournamentName = status.tournament.name;

  if (status.registered) {
    return (
      <div className={CARD_CLS}>
        <h2 className="text-lg font-semibold text-emerald-200">
          {format(t.registeredTitle, { tournament: tournamentName })}
        </h2>
        <p className="mt-1 text-sm text-gray-400">{t.registeredDesc}</p>
      </div>
    );
  }

  if (status.pendingDemandeId) {
    return (
      <div className={CARD_CLS}>
        <h2 className="text-lg font-semibold">{t.pendingTitle}</h2>
        <p className="mt-1 text-sm text-gray-400">{t.pendingDesc}</p>
      </div>
    );
  }

  const blockerLabel = (code: TeamRegistrationBlocker): string | null => {
    switch (code) {
      case 'not_open':
        return t.blockerNotOpen;
      case 'tournament_full':
        return format(t.blockerTournamentFull, {
          registered: status.registeredTeams,
          max: status.maxTeams ?? 0,
        });
      case 'no_permission':
        return t.blockerNoPermission;
      default:
        // `already_registered` / `pending_request` sont déjà rendus au-dessus,
        // `no_tournament` masque la carte : rien à afficher ici.
        return null;
    }
  };

  const blockerLines = status.blockers
    .map((code) => ({ code, label: blockerLabel(code) }))
    .filter((b): b is { code: TeamRegistrationBlocker; label: string } =>
      Boolean(b.label)
    );

  // Roster incomplet : AVERTISSEMENT, pas blocage. On le dit avant le bouton —
  // la personne doit savoir que le staff regardera ce chiffre — mais on ne lui
  // retire pas le geste : c'est souvent en se déclarant qu'une équipe finit de
  // se composer.
  const showRosterWarning = status.rosterShortfall > 0;

  const rejectedAt = status.lastDemande?.created_at
    ? new Date(status.lastDemande.created_at).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className={CARD_CLS}>
      <h2 className="text-lg font-semibold">
        {format(t.notRegisteredTitle, { tournament: tournamentName })}
      </h2>
      <p className="mt-1 text-sm text-gray-400">{t.notRegisteredDesc}</p>

      {status.lastDemande?.status === 'rejected' && rejectedAt && (
        <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
          {format(t.rejectedNotice, { date: rejectedAt })}
        </p>
      )}

      {showRosterWarning && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-100">
            {format(t.rosterWarning, {
              missing: status.rosterShortfall,
              min: status.minPlayers ?? 0,
              count: status.playerCount,
            })}
          </p>
          <p className="mt-1 text-xs text-amber-100/80">
            {t.rosterWarningStillOpen}
          </p>
          {!readOnly && (
            <div className="mt-3">
              <Link
                href={rosterAnchor}
                className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/25"
              >
                {t.rosterCta}
              </Link>
            </div>
          )}
        </div>
      )}

      {blockerLines.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-300">
            {t.blockersTitle}
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-300">
            {blockerLines.map((b) => (
              <li key={b.code} className="flex gap-2">
                <span aria-hidden className="text-amber-300">
                  •
                </span>
                <span>{b.label}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/support"
              className="inline-flex items-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-white/40 hover:bg-white/10"
            >
              {t.contactStaffCta}
            </Link>
          </div>
        </div>
      )}

      {submitted && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
        >
          {t.submitSuccess}
        </p>
      )}

      {readOnly ? (
        <p className="mt-4 text-xs text-gray-500">{t.readOnlyNote}</p>
      ) : (
        status.canSubmit && (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {status.fields.length > 0 && (
              <div className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-sm font-semibold text-white">
                  {t.customFieldsTitle}
                </h3>
                {status.fields.map((field) => (
                  <CustomField
                    key={field.key}
                    field={field}
                    value={fieldValues[field.key]}
                    error={
                      fieldErrors[field.key] === 'Ce champ est requis.'
                        ? t.customFieldRequiredError
                        : fieldErrors[field.key]
                    }
                    requiredMark={t.customFieldRequiredMark}
                    selectPlaceholder={t.customFieldSelectPlaceholder}
                    onChange={handleFieldChange}
                  />
                ))}
              </div>
            )}

            <div>
              <label htmlFor="registration-message" className={LABEL_CLS}>
                {t.messageLabel}{' '}
                <span className="normal-case tracking-normal text-gray-500">
                  ({t.messageOptional})
                </span>
              </label>
              <textarea
                id="registration-message"
                rows={3}
                maxLength={1000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t.messagePlaceholder}
                className={INPUT_CLS}
              />
            </div>

            {submitError && (
              <p
                role="alert"
                className="text-sm text-[var(--status-error)]"
              >
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-full bg-[var(--color-violet)] px-6 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? t.submitting : t.submitCta}
            </button>
          </form>
        )
      )}
    </div>
  );
}

/**
 * Un champ d'inscription personnalisé du tournoi.
 *
 * NB : le wizard public (`pages/team/create.tsx`) porte sa propre copie de ce
 * rendu. Les deux restent alignés sur `utils/registrationFields.ts`, seule
 * source de vérité de la FORME des champs ; consolider les deux rendus est une
 * tâche à part, qui touche un écran de 1900 lignes couvert par des e2e.
 */
function CustomField({
  field,
  value,
  error,
  requiredMark,
  selectPlaceholder,
  onChange,
}: {
  field: RegistrationField;
  value: FieldValue | undefined;
  error?: string;
  requiredMark: string;
  selectPlaceholder: string;
  onChange: (key: string, value: FieldValue) => void;
}) {
  const controlId = `registration-field-${field.key}`;
  const describedBy = field.help ? `${controlId}-help` : undefined;
  const stringValue = typeof value === 'string' ? value : '';

  const help = field.help ? (
    <p id={describedBy} className="mt-1 text-[11px] text-gray-500">
      {field.help}
    </p>
  ) : null;
  const errorLine = error ? (
    <p className="mt-1 text-xs text-[var(--status-error)]">{error}</p>
  ) : null;

  if (field.type === 'checkbox') {
    return (
      <div>
        <label className="inline-flex items-start gap-2 text-sm text-gray-200">
          <input
            id={controlId}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(field.key, e.target.checked)}
            aria-describedby={describedBy}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/60"
          />
          <span>
            {field.label}
            {field.required && (
              <span className="text-[var(--color-green)]"> {requiredMark}</span>
            )}
          </span>
        </label>
        {help}
        {errorLine}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={controlId} className={LABEL_CLS}>
        {field.label}
        {field.required && (
          <span className="text-[var(--color-green)]"> {requiredMark}</span>
        )}
      </label>

      {field.type === 'textarea' ? (
        <textarea
          id={controlId}
          rows={4}
          required={field.required}
          maxLength={field.maxLength}
          value={stringValue}
          onChange={(e) => onChange(field.key, e.target.value)}
          aria-describedby={describedBy}
          className={INPUT_CLS}
        />
      ) : field.type === 'select' ? (
        <select
          id={controlId}
          required={field.required}
          value={stringValue}
          onChange={(e) => onChange(field.key, e.target.value)}
          aria-describedby={describedBy}
          className={INPUT_CLS}
        >
          <option value="">{selectPlaceholder}</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={controlId}
          type={
            field.type === 'number'
              ? 'number'
              : field.type === 'url'
                ? 'url'
                : 'text'
          }
          required={field.required}
          maxLength={field.type === 'text' ? field.maxLength : undefined}
          value={stringValue}
          onChange={(e) => onChange(field.key, e.target.value)}
          aria-describedby={describedBy}
          className={INPUT_CLS}
        />
      )}
      {help}
      {errorLine}
    </div>
  );
}
