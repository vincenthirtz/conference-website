// features/player/matches/ui/MatchThreadSteps.tsx — les cinq étapes du fil du
// match, dans l'ordre où les gestes arrivent réellement (lot P12) :
//
//   préparation → check-in → feuille de match → live → score et revue
//
// Présentationnel : aucune lecture réseau ici (les cartes de préparation et
// de feuille de match se chargent elles-mêmes, comme avant). Une étape sans
// objet se tait ou s'explique, mais ne propose pas un bouton mort.

import type nsPlayerMatch from '@/lib/i18n/locales/fr/playerMatch';
import { format } from '@/lib/i18n/useT';
import { Button, ButtonLink } from '@/features/ruban';
import MatchLineupCard, {
  MATCH_CHECKIN_ANCHOR,
} from '@/components/player/MatchLineupCard';
import MatchPrepCard from '@/components/player/MatchPrepCard';
import { isLineupClosedStatus } from '@/utils/matches/lineup';
import type { PlayerMatchDetail } from '../schemas';
import type { MatchThreadState } from '../threadState';
import MatchThreadStep from './MatchThreadStep';

type T = typeof nsPlayerMatch.fr;

type Props = {
  data: PlayerMatchDetail;
  view: MatchThreadState;
  t: T;
  canAct: boolean;
  /** Date au fuseau de Paris (cf. formatMatchDateTime). */
  formatDate: (iso: string | null) => string;
  checkinBusy: boolean;
  onCheckin: () => void;
  onReport: () => void;
};

/** `primary` dans le dock (l'action du pouce), `secondary` dans une étape. */
type Variant = 'primary' | 'secondary';

export function CheckinButton({
  t,
  busy,
  onClick,
  variant = 'primary',
}: {
  t: T;
  busy: boolean;
  onClick: () => void;
  variant?: Variant;
}) {
  return (
    <Button variant={variant} onClick={onClick} disabled={busy}>
      {busy ? t.checkinPending : t.checkinCta}
    </Button>
  );
}

export function ReportButton({
  t,
  hasReport,
  onClick,
  variant = 'primary',
}: {
  t: T;
  hasReport: boolean;
  onClick: () => void;
  variant?: Variant;
}) {
  return (
    <Button variant={variant} onClick={onClick}>
      {hasReport ? t.scoreEditCta : t.scoreReportCta}
    </Button>
  );
}

function PrepareStep({ data, t, canAct }: Props) {
  const { opponent, readiness } = data;
  return (
    <MatchThreadStep index={1} title={t.stepPrepare} state="idle">
      {opponent ? (
        <>
          <p>{t.prepareBody}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink
              size="sm"
              href={`/player/scouting/${encodeURIComponent(opponent.id)}`}
            >
              {t.prepareScouting}
            </ButtonLink>
            <ButtonLink
              size="sm"
              href={`/team/${encodeURIComponent(opponent.slug || opponent.id)}`}
            >
              {t.prepareTeamPage}
            </ButtonLink>
          </div>
        </>
      ) : (
        <p>{t.prepareNoOpponent}</p>
      )}

      {/* Objectifs du match (J5) : lecture ouverte au roster, écriture sur
          `validate_lineup`. */}
      <MatchPrepCard
        matchId={data.match.id}
        canEdit={data.permissions.validateLineup && canAct}
      />

      {/* L'effectif n'avertit que sous le minimum (`readiness` nul sinon). */}
      {readiness && readiness.shortfall > 0 && (
        <p className="mt-3 text-amber-200">
          {format(t.rosterWarning, { n: readiness.shortfall })}
        </p>
      )}
    </MatchThreadStep>
  );
}

function CheckinStep(props: Props) {
  const { data, view, t, canAct, formatDate } = props;
  const { checkin } = data;
  return (
    <MatchThreadStep
      index={2}
      title={t.stepCheckin}
      state={view.checkinState}
      id={MATCH_CHECKIN_ANCHOR}
    >
      {checkin.alreadyCheckedIn ? (
        <p className="text-emerald-200">
          {format(t.checkinDone, { date: formatDate(checkin.checkedInAt) })}
        </p>
      ) : view.checkinOpen ? (
        <>
          <p>{t.checkinOpenNow}</p>
          {/* Membre qui ne peut pas pointer : dit AVANT le cas « pas de
              jeton », sinon elle lirait que le check-in n'est pas géré ici. */}
          {checkin.canCheckIn === false ? (
            <p className="mt-2">{t.checkinRestricted}</p>
          ) : !checkin.token ? (
            <p className="mt-2">{t.checkinNoToken}</p>
          ) : !canAct ? (
            <p className="mt-2">{t.checkinReadOnly}</p>
          ) : view.primary !== 'checkin' ? (
            <div className="mt-3">
              <CheckinButton
                variant="secondary"
                t={t}
                busy={props.checkinBusy}
                onClick={props.onCheckin}
              />
            </div>
          ) : null}
        </>
      ) : view.checkinPassed ? (
        <p className="text-amber-200">{t.checkinMissed}</p>
      ) : (
        <p>{format(t.checkinOpensAt, { date: formatDate(checkin.opensAt) })}</p>
      )}
    </MatchThreadStep>
  );
}

function LineupStep({ data, t }: Props) {
  const { checkin, match, team } = data;
  // La carte se tait d'elle-même sans permission ou avant le check-in.
  if (!data.permissions.validateLineup) return null;
  return (
    <MatchThreadStep
      index={3}
      title={t.stepLineup}
      state={checkin.alreadyCheckedIn ? 'active' : 'idle'}
    >
      {/* `key` : remonte la carte sur les deux seules bascules qui changent
          sa règle (check-in fait, match clos) — pas sur pending → ongoing, qui
          effacerait une sélection en cours de saisie. */}
      <MatchLineupCard
        key={`${checkin.alreadyCheckedIn}-${isLineupClosedStatus(match.status)}`}
        matchId={match.id}
        teamId={team.id}
      />
    </MatchThreadStep>
  );
}

function LiveStep({ data, t }: Props) {
  const { match } = data;
  return (
    <MatchThreadStep
      index={4}
      title={t.stepLive}
      state={match.status === 'ongoing' ? 'active' : 'idle'}
    >
      <div className="flex flex-wrap items-center gap-2">
        {match.streamUrl ? (
          <ButtonLink size="sm" href={match.streamUrl} target="_blank">
            {t.liveWatch}
          </ButtonLink>
        ) : (
          <span>{t.liveNoStream}</span>
        )}
        <ButtonLink size="sm" href={`/match/${encodeURIComponent(match.id)}`}>
          {t.liveMatchPage}
        </ButtonLink>
      </div>
    </MatchThreadStep>
  );
}

function ScoreStep(props: Props) {
  const { data, view, t, canAct } = props;
  const { report } = data;
  return (
    <MatchThreadStep index={5} title={t.stepScore} state={view.scoreState}>
      {report.state === 'disputed' ? (
        <p className="text-amber-200">{t.scoreDisputed}</p>
      ) : report.state === 'agreed' ? (
        <p className="text-emerald-200">{t.scoreAgreed}</p>
      ) : report.state === 'awaiting_opponent' && report.mine ? (
        <p>
          {format(t.scoreAwaitingOpponent, {
            mine: report.mine.mine,
            opponent: report.mine.opponent,
          })}
        </p>
      ) : report.state === 'awaiting_me' ? (
        <p className="text-amber-200">{t.scoreAwaitingMe}</p>
      ) : (
        <p>{t.scoreNone}</p>
      )}

      {data.score && data.score.mine !== null && (
        <p className="mt-2 font-mono tabular-nums text-[var(--t1,#f4edf7)]">
          {format(t.scoreFinal, {
            mine: data.score.mine,
            opponent: data.score.opponent ?? 0,
          })}
        </p>
      )}

      {/* Rapport réservé à qui en a le droit (même règle que la route). */}
      {view.showReportCta
        ? view.primary !== 'report' && (
            <div className="mt-3">
              <ReportButton
                variant="secondary"
                t={t}
                hasReport={!!report.mine}
                onClick={props.onReport}
              />
            </div>
          )
        : !view.isFinished && (
            <p className="mt-2 text-xs">
              {/* Capitaine, mais trop tôt : le dire, plutôt que « réservé à la
                capitaine » à la capitaine elle-même. */}
              {data.permissions.reportScore && canAct
                ? t.scoreAfterKickoff
                : t.scoreCaptainOnly}
            </p>
          )}

      {view.isFinished && (
        <div className="mt-4 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3">
          <p>{t.reviewBody}</p>
          <ButtonLink size="sm" href="/player#team-memory" className="mt-2">
            {t.reviewCta}
          </ButtonLink>
        </div>
      )}
    </MatchThreadStep>
  );
}

/** Les cinq étapes, empilées dans l'ordre du soir de match. */
export default function MatchThreadSteps(props: Props) {
  return (
    <>
      <PrepareStep {...props} />
      <CheckinStep {...props} />
      <LineupStep {...props} />
      <LiveStep {...props} />
      <ScoreStep {...props} />
    </>
  );
}
