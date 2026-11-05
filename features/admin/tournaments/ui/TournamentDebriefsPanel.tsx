// features/admin/tournaments/ui/TournamentDebriefsPanel.tsx — sous-onglet
// « Debriefs » de Résultats (pages/admin/tournament/[id]/stats?tab=debriefs).
//
// Ce que les équipes ont répondu au bot Discord en fin de tournoi : deux
// cases, « Points positifs » et « Points négatifs ». Lecture SEULE, staff
// seulement — aucune surface publique, aucune annonce sur Discord.
//
// Le bouton « Demander le debrief » fait poster au bot, dans le salon privé de
// chaque équipe engagée, le message qui ouvre la boîte de saisie. La
// finalisation du podium l'envoie déjà d'elle-même : le bouton sert pour un
// tournoi clos sans finalisation, ou pour relancer. Il passe toujours par une
// confirmation.
//
// Endpoints (conference-api) :
//   GET  /api/admin/tournament/[id]/debriefs        → { teams: [{ team_id, name, logo_url, debrief }] }
//   POST /api/admin/tournament/[id]/debrief-request → { requested, withChannel }

import Image from 'next/image';
import { useMemo } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsAdminTournamentDebriefs from '@/lib/i18n/locales/admin-fr/adminTournamentDebriefs';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  rubanCard,
  rubanFaint,
  rubanInset,
  rubanLabel,
  rubanMuted,
  rubanStrong,
} from '@/features/admin/_shared/ui/ruban';
import { serverErrorText } from '@/features/admin/_shared/serverErrorText';
import AlertBanner from '@/components/admin/AlertBanner';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { AdminHttpError, adminErrorMessage } from '@/utils/admin/adminHttp';
import { formatSiteDate } from '@/utils/timezone';
import type {
  TournamentDebriefRequestResult,
  TournamentDebriefTeam,
} from '../client';
import {
  useRequestTournamentDebrief,
  useTournamentDebriefs,
} from '../hooks/useTournamentDebriefs';

type Dict = typeof nsAdminTournamentDebriefs.fr;

const HEADING_ID = 'tournament-debriefs-heading';
const NO_TEAMS_ID = 'tournament-debriefs-no-teams';

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const time = (iso: string) => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * Les équipes qui ont répondu d'abord, la réponse la plus récente en tête ;
 * puis celles qui n'ont pas encore répondu, par nom.
 */
export function sortDebriefTeams(
  teams: TournamentDebriefTeam[]
): TournamentDebriefTeam[] {
  return [...teams].sort((a, b) => {
    if (a.debrief && b.debrief)
      return time(b.debrief.updated_at) - time(a.debrief.updated_at);
    if (a.debrief) return -1;
    if (b.debrief) return 1;
    return a.name.localeCompare(b.name, 'fr');
  });
}

/** « Envoyé à N équipes, dont M sans salon Discord. » */
export function debriefRequestMessage(
  t: Dict,
  result: TournamentDebriefRequestResult
): string {
  const requested = Math.max(0, result.requested);
  if (requested === 0) return t.resultNone;
  const without = Math.max(0, requested - result.withChannel);
  const plural = requested > 1;
  if (without === 0)
    return format(plural ? t.resultSent_other : t.resultSent_one, {
      requested,
    });
  return `${format(
    plural ? t.resultSentWithout_other : t.resultSentWithout_one,
    { requested, without }
  )} ${t.resultWithoutHint}`;
}

/** Le libellé de l'écran, suivi du message du serveur et de sa référence. */
function errorText(err: unknown, fallback: string): string {
  const server = err instanceof AdminHttpError ? serverErrorText(err) : '';
  return adminErrorMessage(err, server ? `${fallback} ${server}` : fallback);
}

export default function TournamentDebriefsPanel({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const t = useAdminT(nsAdminTournamentDebriefs);
  const locale = useLocale();
  const { confirm, dialog } = useConfirmDialog();
  const debriefs = useTournamentDebriefs(tournamentId);
  const request = useRequestTournamentDebrief(tournamentId);

  const teams = useMemo(
    () => sortDebriefTeams(debriefs.data?.teams ?? []),
    [debriefs.data]
  );
  const answered = teams.filter((team) => team.debrief).length;
  const noTeams = debriefs.isSuccess && teams.length === 0;
  const result = request.isSuccess ? request.data : null;
  const resultHasGaps = !!result && result.withChannel < result.requested;

  async function onRequest() {
    if (request.isPending) return;
    const ok = await confirm({
      title: t.confirmTitle,
      subtitle: t.confirmSubtitle,
      body:
        answered > 0 ? (
          <p className={`text-sm ${rubanMuted}`}>
            {format(
              answered > 1 ? t.confirmAnswered_other : t.confirmAnswered_one,
              { count: answered }
            )}
          </p>
        ) : undefined,
      variant: 'info',
      confirmLabel: t.confirmLabel,
    });
    if (!ok) return;
    // L'issue (résultat ou erreur) s'affiche sous les boutons, depuis l'état
    // de la mutation : pas de promesse à rattraper ici.
    request.mutate();
  }

  return (
    <section aria-labelledby={HEADING_ID}>
      {dialog}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id={HEADING_ID} className="text-2xl font-bold tracking-tight">
            {t.heading}
          </h2>
          <p className={`mt-1 text-sm ${rubanMuted}`}>{t.intro}</p>
          <p className={`mt-1 text-xs ${rubanFaint}`}>{t.autoNote}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton
            size="sm"
            onClick={() => void debriefs.refetch()}
            disabled={debriefs.isFetching}
          >
            {t.refresh}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={() => void onRequest()}
            disabled={request.isPending || noTeams}
            aria-busy={request.isPending || undefined}
            aria-describedby={noTeams ? NO_TEAMS_ID : undefined}
          >
            {request.isPending ? t.requesting : t.requestCta}
          </AdminButton>
        </div>
      </div>

      {noTeams && (
        <p id={NO_TEAMS_ID} className={`-mt-3 mb-4 text-xs ${rubanFaint}`}>
          {t.noTeamsToRequest}
        </p>
      )}

      {result && (
        <AlertBanner
          variant={resultHasGaps ? 'warning' : 'success'}
          message={debriefRequestMessage(t, result)}
          className="mb-4"
        />
      )}
      {request.isError && (
        <AlertBanner
          message={errorText(request.error, t.requestError)}
          className="mb-4"
        />
      )}

      {debriefs.isPending ? (
        <LoadingSpinner className="py-16" label={t.loading} />
      ) : debriefs.isError ? (
        <div className="space-y-3">
          <AlertBanner message={errorText(debriefs.error, t.loadError)} />
          <AdminButton size="sm" onClick={() => void debriefs.refetch()}>
            {t.retry}
          </AdminButton>
        </div>
      ) : teams.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyDescription} />
      ) : (
        <>
          <p className={`mb-3 text-xs ${rubanFaint}`}>
            {format(t.answeredCount, { answered, total: teams.length })}
          </p>
          <ul aria-label={t.listLabel} className="space-y-3">
            {teams.map((team) => (
              <DebriefCard
                key={team.team_id}
                team={team}
                t={t}
                locale={locale}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function DebriefCard({
  team,
  t,
  locale,
}: {
  team: TournamentDebriefTeam;
  t: Dict;
  locale: string;
}) {
  const headingId = `tournament-debrief-${team.team_id}`;
  const debrief = team.debrief;
  return (
    <li className={`${rubanCard} p-4`} data-testid="tournament-debrief-team">
      <article aria-labelledby={headingId}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {team.logo_url && (
              <Image
                src={team.logo_url}
                alt=""
                width={24}
                height={24}
                className="h-6 w-6 rounded-[3px] object-cover"
              />
            )}
            <h3
              id={headingId}
              className={`truncate text-base font-semibold ${rubanStrong}`}
            >
              {team.name}
            </h3>
          </div>
          {debrief ? (
            <time
              dateTime={debrief.updated_at}
              className={`text-xs ${rubanMuted}`}
            >
              {format(t.updatedAt, {
                date: formatSiteDate(
                  debrief.updated_at,
                  locale,
                  DATE_OPTIONS,
                  debrief.updated_at
                ),
              })}
            </time>
          ) : (
            <Chip tone="neutral">{t.noAnswer}</Chip>
          )}
        </div>
        {debrief && (
          <dl className="mt-3 grid gap-3 md:grid-cols-2">
            <DebriefField
              label={t.positives}
              value={debrief.positives}
              empty={t.nothingNoted}
            />
            <DebriefField
              label={t.negatives}
              value={debrief.negatives}
              empty={t.nothingNoted}
            />
          </dl>
        )}
      </article>
    </li>
  );
}

function DebriefField({
  label,
  value,
  empty,
}: {
  label: string;
  value: string | null;
  empty: string;
}) {
  const text = value?.trim();
  return (
    <div className={`${rubanInset} p-3`}>
      <dt className={rubanLabel}>{label}</dt>
      <dd className={`whitespace-pre-line break-words text-sm ${rubanStrong}`}>
        {text ? text : <span className={`italic ${rubanFaint}`}>{empty}</span>}
      </dd>
    </div>
  );
}
