// features/player/tournamentRules/ui/TeamRulesCard.tsx — « Règlement : 5/7
// validations » dans la gestion de l'équipe (capitaine, manager), sous la
// carte « Inscription au tournoi ».
//
//   - Réglage éteint pour ce tournoi → la carte se tait.
//   - Équipe pas encore candidate → ce qui l'attend (chaque membre validera
//     après l'envoi de l'inscription).
//   - Candidate ou inscrite → le décompte, la liste des membres (validé le… /
//     pas encore / sans compte) et « Relancer » : une notification SITE aux
//     manquants, au plus une fois par 24 h et par équipe (429
//     `remind_too_soon` → la date de la prochaine relance possible).
//   - Et la ligne de la capitaine elle-même, si elle n'a pas encore validé.

import { useState } from 'react';
import {
  Button,
  ButtonLink,
  Card,
  Chip,
  rubanErr,
  rubanInset,
  rubanMuted,
  rubanOk,
  rubanWarn,
} from '@/features/ruban';
import { format, useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsPlayerTournamentRules from '@/lib/i18n/locales/fr/playerTournamentRules';
import { remindRetryAt, rulesErrorCode, tournamentRulesUrls } from '../client';
import { formatRulesDateTime, rulesRoleLabel } from '../format';
import {
  needsValidation,
  useRemindTeamRules,
  useTeamTournamentRules,
  useTournamentRules,
} from '../hooks/useTournamentRules';

type RemindOutcome =
  | { kind: 'done'; notified: number }
  | { kind: 'tooSoon'; retryAt: string | null }
  | { kind: 'error' }
  | null;

export default function TeamRulesCard({
  tournamentId,
  teamId,
  engaged,
  registered = false,
  readOnly = false,
}: {
  tournamentId: string;
  /** Équipe gérée (`?teamId=` des appels capitaine). */
  teamId: string | null;
  /** Candidature en attente OU inscription acceptée. */
  engaged: boolean;
  /** Inscription déjà acceptée (un membre ajouté depuis la rend incomplète). */
  registered?: boolean;
  readOnly?: boolean;
}) {
  const t = useT(nsPlayerTournamentRules);
  const locale = useLocale();
  const rules = useTournamentRules(tournamentId);
  const required = rules.data?.required === true;
  const team = useTeamTournamentRules(
    tournamentId,
    teamId,
    required && engaged
  );
  const remind = useRemindTeamRules(tournamentId, teamId);
  const [outcome, setOutcome] = useState<RemindOutcome>(null);

  // Réglage éteint, ou lecture impossible : rien à dire ici.
  if (!required) return null;

  const selfPending = needsValidation(rules.data);
  const readerHref = tournamentRulesUrls.readerPage(tournamentId);

  if (!engaged) {
    return (
      <Card as="section" padding="md" className="mb-6">
        <h2 className="text-lg font-semibold">{t.teamTitleShort}</h2>
        <p className={`mt-1 text-sm ${rubanMuted}`}>{t.teamBeforeSubmit}</p>
        <div className="mt-3">
          <ButtonLink size="sm" href={readerHref}>
            {t.readCta}
          </ButtonLink>
        </div>
      </Card>
    );
  }

  async function handleRemind() {
    setOutcome(null);
    try {
      const res = await remind.mutateAsync();
      setOutcome({ kind: 'done', notified: res.notified });
    } catch (err) {
      if (rulesErrorCode(err) === 'remind_too_soon') {
        setOutcome({ kind: 'tooSoon', retryAt: remindRetryAt(err) });
      } else {
        setOutcome({ kind: 'error' });
      }
    }
  }

  const view = team.data;
  const hasVersion = Boolean(rules.data?.version);

  return (
    <Card
      as="section"
      padding="md"
      className="mb-6"
      aria-labelledby="team-rules-title"
      data-testid="team-rules-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="team-rules-title" className="text-lg font-semibold">
          {view
            ? format(t.teamTitle, {
                validated: view.validated,
                total: view.total,
              })
            : t.teamTitleShort}
        </h2>
        {view && (
          <Chip tone={view.complete ? 'ok' : 'warn'}>
            {view.complete ? t.teamComplete : t.teamIncomplete}
          </Chip>
        )}
      </div>
      <p className={`mt-1 text-sm ${rubanMuted}`}>{t.teamIntro}</p>

      {!hasVersion && (
        <p className={`${rubanWarn} mt-3 px-3 py-2 text-sm`}>
          {t.teamNoVersion}
        </p>
      )}
      {registered && view && !view.complete && (
        <p className={`${rubanWarn} mt-3 px-3 py-2 text-sm`}>
          {t.teamRegisteredIncomplete}
        </p>
      )}

      {team.isPending && (
        <p role="status" className={`mt-3 text-sm ${rubanMuted}`}>
          {t.teamLoading}
        </p>
      )}
      {team.isError && (
        <p role="alert" className={`${rubanErr} mt-3 px-3 py-2 text-sm`}>
          {t.teamLoadError}
        </p>
      )}

      {view && view.members.length > 0 && (
        <ul
          aria-label={t.teamMembersLabel}
          className="mt-4 flex flex-col gap-2"
        >
          {view.members.map((m, i) => {
            const role = rulesRoleLabel(m.role, t.roles);
            const state = m.accepted
              ? format(t.memberAccepted, {
                  date: m.acceptedAt
                    ? formatRulesDateTime(m.acceptedAt, locale)
                    : '—',
                })
              : m.userId
                ? t.memberPending
                : t.memberNoAccount;
            return (
              <li
                key={m.userId ?? `no-account-${i}`}
                className={`${rubanInset} flex flex-wrap items-center justify-between gap-2 px-3 py-2`}
              >
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-[var(--t1,#f4edf7)]">
                    {m.name}
                  </span>
                  {role && (
                    <span className={`ml-2 text-xs ${rubanMuted}`}>{role}</span>
                  )}
                </span>
                <Chip tone={m.accepted ? 'ok' : m.userId ? 'warn' : 'err'}>
                  {state}
                </Chip>
              </li>
            );
          })}
        </ul>
      )}

      {selfPending && (
        <div
          className={`${rubanWarn} mt-4 flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm`}
        >
          <span>{t.selfPending}</span>
          <ButtonLink size="sm" variant="primary" href={readerHref}>
            {t.selfCta}
          </ButtonLink>
        </div>
      )}

      {view && !readOnly && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleRemind()}
              disabled={view.complete || remind.isPending || !hasVersion}
            >
              {remind.isPending ? t.reminding : t.remind}
            </Button>
            {!selfPending && (
              <ButtonLink size="sm" href={readerHref}>
                {t.readCta}
              </ButtonLink>
            )}
          </div>
          <p className={`text-xs ${rubanMuted}`}>{t.remindHelp}</p>
          <RemindMessage outcome={outcome} t={t} locale={locale} />
        </div>
      )}
    </Card>
  );
}

function RemindMessage({
  outcome,
  t,
  locale,
}: {
  outcome: RemindOutcome;
  t: typeof nsPlayerTournamentRules.fr;
  locale: string;
}) {
  if (!outcome) return null;
  if (outcome.kind === 'done') {
    const text =
      outcome.notified === 0
        ? t.remindNone
        : format(
            outcome.notified === 1 ? t.remindDone_one : t.remindDone_other,
            { count: outcome.notified }
          );
    return (
      <p role="status" className={`${rubanOk} px-3 py-2 text-sm`}>
        {text}
      </p>
    );
  }
  if (outcome.kind === 'tooSoon') {
    return (
      <p role="status" className={`${rubanWarn} px-3 py-2 text-sm`}>
        {outcome.retryAt
          ? format(t.remindTooSoon, {
              date: formatRulesDateTime(outcome.retryAt, locale),
            })
          : t.remindTooSoonNoDate}
      </p>
    );
  }
  return (
    <p role="alert" className={`${rubanErr} px-3 py-2 text-sm`}>
      {t.remindError}
    </p>
  );
}
