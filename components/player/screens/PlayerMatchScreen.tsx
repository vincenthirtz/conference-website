// components/player/screens/PlayerMatchScreen.tsx
//
// LE FIL DU MATCH (docs/PLAN-espace-joueur.md § J1).
//
// Un match se jouait sur trois surfaces : le check-in sur /player/checkin, le
// rappel sur le dashboard, le report du score sur /player/matches. Une
// capitaine devait donc connaître trois écrans qu'elle n'a aucune raison de
// connaître à l'avance — et la saison en compte 69, joués par une dizaine de
// capitaines qui n'en ont jamais vu un seul.
//
// Cet écran ne réinvente rien : il recompose les briques déjà livrées
// (MatchLineupCard, ReportScoreModal, POST /api/checkin/{token}) derrière une
// URL unique et partageable, dans l'ordre où les gestes arrivent réellement :
//
//   préparation → check-in → feuille de match → live → score → revue
//
// Deux règles :
//   1. On n'affiche JAMAIS un geste que le serveur refusera. Les permissions
//      viennent de la réponse (`permissions`), calculées avec les règles des
//      routes d'écriture — pas devinées ici.
//   2. Une étape sans objet se tait ou s'explique, mais ne propose pas un
//      bouton mort : « la feuille s'ouvre après le check-in » est actionnable,
//      un bouton grisé ne l'est pas.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import MatchLineupCard from '@/components/player/MatchLineupCard';
import MatchPrepCard from '@/components/player/MatchPrepCard';
import ReportScoreModal, {
  type LocalReport,
} from '@/components/player/ReportScoreModal';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsPlayerMatch from '@/lib/i18n/locales/fr/playerMatch';
import nsPlayerMatches from '@/lib/i18n/locales/fr/playerMatches';
import type { PlayerMatchDetail } from '@/pages/api/player/matches/[matchId]';

import { logger } from '../../../utils/logger';

type T = typeof nsPlayerMatch.fr;

const FINISHED = new Set(['finished', 'completed', 'finalized', 'walkover']);

function formatDateTime(iso: string | null, locale: string, t: T): string {
  if (!iso) return t.dateTbd;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return t.dateTbd;
  return d.toLocaleString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Une étape du fil. `state` porte la seule information qui compte au premier
 * coup d'œil : est-ce à moi de faire quelque chose, est-ce fait, ou est-ce
 * encore fermé.
 */
function Step({
  index,
  title,
  state,
  children,
}: {
  index: number;
  title: string;
  state: 'done' | 'active' | 'idle';
  children: ReactNode;
}) {
  const ring =
    state === 'active'
      ? 'border-purple-400/40 bg-purple-500/[0.07]'
      : state === 'done'
        ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
        : 'border-white/10 bg-white/[0.03]';
  const badge =
    state === 'active'
      ? 'bg-purple-500 text-white'
      : state === 'done'
        ? 'bg-emerald-500/20 text-emerald-200'
        : 'bg-white/10 text-gray-400';

  return (
    <section className={`rounded-2xl border p-5 backdrop-blur-xl ${ring}`}>
      <h2 className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.14em] text-gray-300">
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${badge}`}
          aria-hidden
        >
          {state === 'done' ? '✓' : index}
        </span>
        {title}
      </h2>
      <div className="mt-3 text-sm text-gray-300">{children}</div>
    </section>
  );
}

export default function PlayerMatchScreen({ matchId }: { matchId: string }) {
  const t = useT(nsPlayerMatch);
  const tMatches = useT(nsPlayerMatches);
  const locale = useLocale();
  const { user, loading: authLoading, ready } = usePlayerSession();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withSubject, readOnly } = usePlayerArea();
  const { addToast } = useToast();

  const [data, setData] = useState<PlayerMatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const payload = await adminFetchJson<PlayerMatchDetail>(
        withSubject(`/api/player/matches/${encodeURIComponent(matchId)}`)
      );
      setData(payload);
    } catch (err) {
      logger.error('[player/match] load error:', err);
      setData(null);
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, matchId, withSubject, t]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  // Le check-in passe par la route PUBLIQUE à jeton (idempotente) : c'est la
  // même que /player/checkin et que le lien envoyé par le bot. Un second envoi
  // répond `alreadyCheckedIn` sans double écriture — on distingue les deux
  // pour que le retour soit honnête.
  const handleCheckin = useCallback(async () => {
    const token = data?.checkin.token;
    if (!token || checkinBusy) return;
    setCheckinBusy(true);
    try {
      const res = await fetch(`/api/checkin/${encodeURIComponent(token)}`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || t.checkinFailed);
      addToast(
        json?.alreadyCheckedIn === true ? t.checkinAlready : t.checkinSuccess,
        json?.alreadyCheckedIn === true ? 'info' : 'success'
      );
      await load();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t.checkinFailed, 'error');
    } finally {
      setCheckinBusy(false);
    }
  }, [addToast, checkinBusy, data?.checkin.token, load, t]);

  if (authLoading || loading) return <PlayerPageSkeleton rows={3} />;

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="mx-auto max-w-md px-4 py-10 pt-32 text-center">
          <p className="text-gray-300">{t.connectPrompt}</p>
          <Link
            href={`/login?next=/player/match/${encodeURIComponent(matchId)}`}
            className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-6 py-3 text-sm font-bold text-white"
          >
            {t.signIn}
          </Link>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="mx-auto max-w-2xl px-4 py-10 pt-28">
          <div
            role="alert"
            className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-4 text-sm text-red-100"
          >
            {error ?? t.notFound}
          </div>
          <div className="mt-6 flex gap-4 text-sm">
            <button
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="text-purple-300 hover:text-purple-200"
            >
              {t.retry}
            </button>
            <Link
              href="/player/matches"
              className="text-gray-400 hover:text-white"
            >
              {t.back}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { match, team, opponent, tournament, checkin, readiness, report } =
    data;
  const isFinished = FINISHED.has(match.status);
  const isDisputed = match.status === 'disputed';
  const canAct = !readOnly;

  const statusLabel = isDisputed
    ? t.statusDisputed
    : isFinished
      ? t.statusFinished
      : match.status === 'ongoing'
        ? t.statusOngoing
        : t.statusUpcoming;

  // État de l'étape check-in : fait / à faire maintenant / pas encore ouvert /
  // manqué. C'est la seule étape dont la fenêtre se referme toute seule.
  const checkinState: 'done' | 'active' | 'idle' = checkin.alreadyCheckedIn
    ? 'done'
    : checkin.isOpen
      ? 'active'
      : 'idle';

  const scoreState: 'done' | 'active' | 'idle' =
    report.state === 'agreed' || (isFinished && !isDisputed)
      ? 'done'
      : isFinished || report.state === 'awaiting_me' || isDisputed
        ? 'active'
        : 'idle';

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="mx-auto max-w-2xl px-4 py-10 pt-24">
        <Link
          href="/player/matches"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          &larr; {t.back}
        </Link>

        {/* Affiche du match : qui, quand, dans quoi. */}
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
            {[tournament?.name, match.roundName].filter(Boolean).join(' · ')}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-gradient text-balance">
            {format(t.pageTitle, {
              team: team.name,
              opponent: opponent?.name ?? '—',
            })}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
            <span>{formatDateTime(match.scheduledAt, locale, t)}</span>
            {match.format && (
              <span className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                {match.format}
              </span>
            )}
            <span
              className={
                isDisputed
                  ? 'text-amber-300'
                  : isFinished
                    ? 'text-emerald-300'
                    : 'text-gray-300'
              }
            >
              {statusLabel}
            </span>
          </p>
        </header>

        <div className="flex flex-col gap-4">
          {/* 1 — Préparation */}
          <Step index={1} title={t.stepPrepare} state="idle">
            {opponent ? (
              <>
                <p>{t.prepareBody}</p>
                <div className="mt-3 flex flex-wrap gap-4">
                  <Link
                    href={`/player/scouting/${encodeURIComponent(opponent.id)}`}
                    className="text-purple-300 hover:text-purple-200"
                  >
                    {t.prepareScouting}
                  </Link>
                  <Link
                    href={`/team/${encodeURIComponent(opponent.slug || opponent.id)}`}
                    className="text-gray-400 hover:text-white"
                  >
                    {t.prepareTeamPage}
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-gray-400">{t.prepareNoOpponent}</p>
            )}

            {/* Objectifs du match (J5) : la moitié « avant » de la boucle du
                coach. Lecture ouverte au roster, écriture sur `validate_lineup`. */}
            <MatchPrepCard
              matchId={match.id}
              canEdit={data.permissions.validateLineup && canAct}
            />

            {/* L'effectif ne vaut avertissement que sous le minimum : sur un
                tournoi sans minimum, `readiness` est nul et on se tait. */}
            {readiness && readiness.shortfall > 0 && (
              <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100">
                {format(t.rosterWarning, { n: readiness.shortfall })}
              </p>
            )}
          </Step>

          {/* 2 — Check-in */}
          <Step index={2} title={t.stepCheckin} state={checkinState}>
            {checkin.alreadyCheckedIn ? (
              <p className="text-emerald-200">
                {format(t.checkinDone, {
                  date: formatDateTime(checkin.checkedInAt, locale, t),
                })}
              </p>
            ) : checkin.isOpen ? (
              <>
                <p>{t.checkinOpenNow}</p>
                {!checkin.token ? (
                  <p className="mt-2 text-gray-400">{t.checkinNoToken}</p>
                ) : canAct ? (
                  <button
                    onClick={handleCheckin}
                    disabled={checkinBusy}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-neutral-900 transition hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {checkinBusy ? t.checkinPending : t.checkinCta}
                  </button>
                ) : (
                  <p className="mt-2 text-gray-400">{t.checkinReadOnly}</p>
                )}
              </>
            ) : checkin.isPassed ? (
              <p className="text-amber-200">{t.checkinMissed}</p>
            ) : (
              <p className="text-gray-400">
                {format(t.checkinOpensAt, {
                  date: formatDateTime(checkin.opensAt, locale, t),
                })}
              </p>
            )}
          </Step>

          {/* 3 — Feuille de match. La carte se tait d'elle-même sans permission
              `validate_lineup` ou tant que le check-in n'est pas fait : on ne
              double pas sa règle ici, on la laisse parler. */}
          {data.permissions.validateLineup && (
            <Step
              index={3}
              title={t.stepLineup}
              state={checkin.alreadyCheckedIn ? 'active' : 'idle'}
            >
              <MatchLineupCard matchId={match.id} />
            </Step>
          )}

          {/* 4 — Pendant le match */}
          <Step
            index={4}
            title={t.stepLive}
            state={match.status === 'ongoing' ? 'active' : 'idle'}
          >
            <div className="flex flex-wrap gap-4">
              {match.streamUrl ? (
                <a
                  href={match.streamUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-purple-300 hover:text-purple-200"
                >
                  {t.liveWatch}
                </a>
              ) : (
                <span className="text-gray-400">{t.liveNoStream}</span>
              )}
              <Link
                href={`/match/${encodeURIComponent(match.id)}`}
                className="text-gray-400 hover:text-white"
              >
                {t.liveMatchPage}
              </Link>
            </div>
          </Step>

          {/* 5 — Score et revue */}
          <Step index={5} title={t.stepScore} state={scoreState}>
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
              <p className="text-gray-400">{t.scoreNone}</p>
            )}

            {data.score && data.score.mine !== null && (
              <p className="mt-2 font-mono text-sm tabular-nums text-white">
                {format(t.scoreFinal, {
                  mine: data.score.mine,
                  opponent: data.score.opponent ?? 0,
                })}
              </p>
            )}

            {/* Le rapport de score est réservé à la capitaine au sens strict
                (teams.captain_id) — même règle que la route qui l'enregistre. */}
            {data.permissions.reportScore && canAct ? (
              <button
                onClick={() => setReportOpen(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                {report.mine ? t.scoreEditCta : t.scoreReportCta}
              </button>
            ) : (
              !isFinished && (
                <p className="mt-2 text-xs text-gray-500">
                  {t.scoreCaptainOnly}
                </p>
              )
            )}

            {isFinished && (
              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="text-gray-400">{t.reviewBody}</p>
                <Link
                  href="/player#team-memory"
                  className="mt-2 inline-block text-purple-300 hover:text-purple-200"
                >
                  {t.reviewCta}
                </Link>
              </div>
            )}
          </Step>
        </div>
      </main>

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
            void load();
          }}
        />
      )}
    </div>
  );
}
