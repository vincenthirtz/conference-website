// components/player/screens/PlayerMatchScreen.tsx
//
// LE FIL DU MATCH (docs/PLAN-espace-joueur.md § J1) — archétype FIL du kit
// « Le Ruban » (lot P12, docs/PLAN-industrialisation-joueur.md).
//
// Un match se jouait sur trois surfaces (check-in, rappel, report). Cet écran
// les recompose derrière une URL unique et partageable — celle qu'une
// capitaine colle dans le fil Discord de son match — dans l'ordre où les
// gestes arrivent réellement :
//
//   préparation → check-in → feuille de match → live → score → revue
//
// L'écran ne fait plus que composer :
//   * l'état vivant (chargement, cadence, check-in) : usePlayerMatchThread ;
//   * ce qui s'affiche (étapes, action principale) : matchThreadState, pur ;
//   * les étapes : features/player/matches/ui, briques du kit.
// L'action principale du moment (check-in, sinon report du score) est collée
// en bas du pouce (ActionDock) : c'est un geste fait au téléphone, le soir.

import { useState } from 'react';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import ReportScoreModal, {
  type LocalReport,
} from '@/components/player/ReportScoreModal';
import { ButtonLink, Chip } from '@/features/ruban';
import { FilView } from '@/features/player/_shared/ui';
import { usePlayerMatchThread } from '@/features/player/matches/hooks/usePlayerMatchThread';
import { matchThreadState } from '@/features/player/matches/threadState';
import MatchThreadSteps, {
  CheckinButton,
  ReportButton,
} from '@/features/player/matches/ui/MatchThreadSteps';
import {
  MatchLoadFailure,
  MatchSessionNotice,
  MatchSignInPrompt,
} from '@/features/player/matches/ui/MatchThreadStates';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsPlayerMatch from '@/lib/i18n/locales/fr/playerMatch';
import nsPlayerMatches from '@/lib/i18n/locales/fr/playerMatches';
import { formatMatchDateTime } from '@/utils/dates/formatMatchDateTime';
import { loginHrefFor } from '@/utils/player/sessionExpiry';

const PAGE =
  'min-h-screen bg-[var(--canvas,#07030a)] pt-header text-[var(--t1,#f4edf7)]';

const STATUS_TONE = {
  disputed: 'warn',
  finished: 'ok',
  ongoing: 'live',
  upcoming: 'neutral',
} as const;

export default function PlayerMatchScreen({ matchId }: { matchId: string }) {
  const t = useT(nsPlayerMatch);
  const tMatches = useT(nsPlayerMatches);
  const locale = useLocale();
  // L'URL collée dans le fil Discord : une personne pas encore connectée doit
  // y REVENIR après la connexion, pas atterrir sur /player.
  const loginHref = loginHrefFor(
    `/player/match/${encodeURIComponent(matchId)}`
  );
  const {
    user,
    loading: authLoading,
    ready,
  } = usePlayerSession({ redirectTo: loginHref });
  const { readOnly } = usePlayerArea();
  const thread = usePlayerMatchThread(matchId, ready, t);
  const [reportOpen, setReportOpen] = useState(false);

  // Heure de PARIS, pas celle du téléphone (calendrier, annonces Discord et
  // cron de check-in raisonnent tous en Europe/Paris).
  const formatDate = (iso: string | null) =>
    formatMatchDateTime(iso, locale, 'long', t.dateTbd);

  if (authLoading || thread.loading) return <PlayerPageSkeleton rows={3} />;

  if (!user) {
    return (
      <div className={PAGE}>
        <MatchSignInPrompt t={t} loginHref={loginHref} />
      </div>
    );
  }

  const sessionNotice = thread.sessionExpired ? (
    <MatchSessionNotice t={t} loginHref={loginHref} />
  ) : null;

  const { data } = thread;
  if (!data) {
    return (
      <div className={PAGE}>
        <div className="mx-auto max-w-2xl px-4 py-10">
          {sessionNotice ?? (
            <MatchLoadFailure
              t={t}
              error={thread.error}
              onRetry={thread.retry}
            />
          )}
        </div>
      </div>
    );
  }

  const { match, team, opponent, tournament, report } = data;
  const canAct = !readOnly;
  const view = matchThreadState(data, thread.now, canAct);
  const statusLabel = {
    disputed: t.statusDisputed,
    finished: t.statusFinished,
    ongoing: t.statusOngoing,
    upcoming: t.statusUpcoming,
  }[view.status];
  const openReport = () => setReportOpen(true);

  const primaryAction =
    view.primary === 'checkin' ? (
      <CheckinButton t={t} busy={thread.checkinBusy} onClick={thread.checkIn} />
    ) : view.primary === 'report' ? (
      <ReportButton t={t} hasReport={!!report.mine} onClick={openReport} />
    ) : undefined;

  return (
    <div className={PAGE}>
      <div className="mx-auto max-w-2xl px-4 pt-6 lg:px-6">{sessionNotice}</div>
      <FilView
        columns={1}
        title={format(t.pageTitle, {
          team: team.name,
          opponent: opponent?.name ?? '—',
        })}
        subtitle={
          <>
            {[tournament?.name, match.roundName].filter(Boolean).join(' · ')}
            {(tournament?.name || match.roundName) && ' — '}
            {formatDate(match.scheduledAt)}
            {match.format && ` · ${match.format}`}
          </>
        }
        actions={
          <>
            <Chip tone={STATUS_TONE[view.status]}>{statusLabel}</Chip>
            <ButtonLink size="sm" href="/player/matches">
              &larr; {t.back}
            </ButtonLink>
          </>
        }
        primaryAction={primaryAction}
      >
        <MatchThreadSteps
          data={data}
          view={view}
          t={t}
          canAct={canAct}
          formatDate={formatDate}
          checkinBusy={thread.checkinBusy}
          onCheckin={thread.checkIn}
          onReport={openReport}
        />
      </FilView>

      {data.permissions.reportScore && opponent && (
        <ReportScoreModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          matchId={match.id}
          slot={team.slot}
          opponentName={opponent.name}
          myTeamName={team.name}
          bestOf={match.bestOf}
          currentReport={
            report.mine
              ? ({
                  mine: report.mine.mine,
                  opponent: report.mine.opponent,
                } as LocalReport)
              : null
          }
          t={tMatches}
          onReported={() => {
            setReportOpen(false);
            void thread.load();
          }}
        />
      )}
    </div>
  );
}
