// features/player/tournamentRules/ui/RulesReaderScreen.tsx — l'écran de la
// liseuse (/player/tournaments/[id]/reglement).
//
// Ce qu'il montre, selon la réponse de GET /api/player/tournaments/[id]/rules :
//   - pas de version déposée → le dire (et rien à valider) ;
//   - version en vigueur, avec son numéro, sa date et sa note « ce qui
//     change » ;
//   - à valider (`required && me.mustValidate && !me.accepted`) → la liseuse,
//     la case, le bouton, puis « Merci, ta validation est enregistrée » datée ;
//   - déjà validé → le dire (version, date) et proposer de relire ;
//   - sinon (réglage éteint, pas membre, rôle non concerné) → lecture seule.
//
// Le PDF affiché est TOUJOURS celui de la version qu'on validera
// (`?version=<n>`) ; si une nouvelle version arrive entre-temps, le serveur
// répond 409 `rules_version_outdated` et l'écran recharge la nouvelle, case
// décochée, lecture à refaire.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ButtonLink,
  Button,
  Card,
  PageHeader,
  rubanErrBox,
  rubanMuted,
  rubanOkBox,
  rubanStrong,
} from '@/features/ruban';
import { format, useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsPlayerTournamentRules from '@/lib/i18n/locales/fr/playerTournamentRules';
import { rulesErrorCode, tournamentRulesUrls } from '../client';
import { formatRulesDate, formatRulesDateTime } from '../format';
import {
  useAcceptTournamentRules,
  useActiveTournaments,
  useTournamentRules,
} from '../hooks/useTournamentRules';
import RulesAcceptPanel, { type RulesAcceptError } from './RulesAcceptPanel';
import RulesPdfReader from './RulesPdfReader';

export default function RulesReaderScreen({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const t = useT(nsPlayerTournamentRules);
  const locale = useLocale();
  const rules = useTournamentRules(tournamentId);
  const tournaments = useActiveTournaments(true);
  const accept = useAcceptTournamentRules(tournamentId);

  const [reachedEnd, setReachedEnd] = useState(false);
  const [acceptError, setAcceptError] = useState<RulesAcceptError>(null);
  const [acceptedNow, setAcceptedNow] = useState<string | null>(null);
  const [rereading, setRereading] = useState(false);
  const thanksRef = useRef<HTMLHeadingElement>(null);

  const data = rules.data;
  const version = data?.version ?? null;
  const me = data?.me ?? null;
  const versionId = version?.id ?? null;

  // Nouvelle version : tout est à refaire (lecture, case).
  useEffect(() => {
    void versionId;
    setReachedEnd(false);
    setAcceptError(null);
  }, [versionId]);

  // Après la validation, le focus va sur la confirmation (annoncée).
  useEffect(() => {
    if (acceptedNow) thanksRef.current?.focus();
  }, [acceptedNow]);

  const tournamentName =
    tournaments.data?.find((x) => x.id === tournamentId)?.name ?? null;
  const title = tournamentName
    ? format(t.titleWithTournament, { tournament: tournamentName })
    : t.pageTitle;

  if (rules.isPending) {
    return (
      <Shell title={title}>
        <p role="status" className={`text-sm ${rubanMuted}`}>
          {t.loading}
        </p>
      </Shell>
    );
  }

  if (rules.isError || !data) {
    return (
      <Shell title={title}>
        <div role="alert" className={`${rubanErrBox} space-y-3`}>
          <p>{t.loadError}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void rules.refetch()}
          >
            {t.retry}
          </Button>
        </div>
      </Shell>
    );
  }

  if (!version) {
    return (
      <Shell title={title}>
        <Card padding="md">
          <p className={rubanStrong}>{t.noVersion}</p>
          {data.required && me?.mustValidate && (
            <p className={`mt-2 text-sm ${rubanMuted}`}>
              {t.noVersionRequired}
            </p>
          )}
        </Card>
      </Shell>
    );
  }

  const mustAccept = Boolean(
    data.required && me?.mustValidate && !me.accepted && !acceptedNow
  );
  const acceptedAt = acceptedNow ?? (me?.accepted ? me.acceptedAt : null);
  const hasAccepted = Boolean(acceptedNow || (data.required && me?.accepted));

  async function handleAccept() {
    if (!version || !reachedEnd) return;
    setAcceptError(null);
    try {
      const res = await accept.mutateAsync(version.id);
      setAcceptedNow(res.acceptedAt);
      setRereading(false);
    } catch (err) {
      setAcceptError(
        rulesErrorCode(err) === 'rules_version_outdated'
          ? 'outdated'
          : 'generic'
      );
    }
  }

  const subtitle = format(
    version.pageCount ? t.versionMetaPages : t.versionMeta,
    {
      number: version.number,
      pages: version.pageCount ?? 0,
      date: formatRulesDate(version.createdAt, locale),
    }
  );

  // Lecture seule : réglage éteint, pas membre d'une équipe engagée, rôle
  // non concerné.
  const readOnlyNote = !data.required
    ? t.notRequired
    : !me
      ? t.notMember
      : !me.mustValidate
        ? t.notConcerned
        : null;

  const showReader = mustAccept || !hasAccepted || rereading;

  return (
    <Shell title={title} subtitle={subtitle}>
      {me?.teamName && (
        <p className={`-mt-4 mb-4 text-sm ${rubanMuted}`}>
          {format(t.teamLine, { team: me.teamName })}
        </p>
      )}

      {version.note && (
        <Card padding="sm" className="mb-4">
          <h2 className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
            {t.whatChanges}
          </h2>
          <p className="mt-1 whitespace-pre-line text-sm text-[var(--t2,#c7bfca)]">
            {version.note}
          </p>
          <p className={`mt-2 text-xs ${rubanMuted}`}>
            {version.requiresRevalidation ? t.importantChange : t.minorChange}
          </p>
        </Card>
      )}

      {hasAccepted && (
        <div role="status" className={`${rubanOkBox} mb-4 space-y-2`}>
          <h2
            ref={thanksRef}
            tabIndex={-1}
            className="text-base font-semibold focus:outline-none"
          >
            {acceptedNow
              ? t.thanks
              : format(t.alreadyAccepted, { number: version.number })}
          </h2>
          {acceptedAt && (
            <p>
              {format(t.acceptedOn, {
                date: formatRulesDateTime(acceptedAt, locale),
              })}
            </p>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRereading((v) => !v)}
            aria-expanded={rereading}
          >
            {rereading ? t.hideReader : t.reread}
          </Button>
        </div>
      )}

      {readOnlyNote && (
        <p className={`mb-4 text-sm ${rubanMuted}`}>{readOnlyNote}</p>
      )}

      {showReader && (
        <div className="mb-4">
          <RulesPdfReader
            key={version.id}
            tournamentId={tournamentId}
            versionNumber={version.number}
            onReachedEnd={() => setReachedEnd(true)}
            t={t}
          />
        </div>
      )}

      {mustAccept && (
        <RulesAcceptPanel
          reachedEnd={reachedEnd}
          pending={accept.isPending}
          error={acceptError}
          onAccept={() => void handleAccept()}
          onReloadVersion={() => void rules.refetch()}
          reloading={rules.isFetching}
          t={t}
        />
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <ButtonLink
          size="sm"
          href={tournamentRulesUrls.file(tournamentId, version.number)}
          target="_blank"
        >
          {t.download}
        </ButtonLink>
        <ButtonLink size="sm" href="/player">
          {t.backToSpace}
        </ButtonLink>
      </div>
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--canvas,#07030a)] pt-header text-[var(--t1,#f4edf7)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pb-10 lg:px-6">
        <PageHeader title={title} subtitle={subtitle} />
        {children}
      </div>
    </div>
  );
}
