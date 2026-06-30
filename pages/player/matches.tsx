// pages/player/matches.tsx
// Espace joueur — "Mes matchs". Liste les matchs de l'equipe du joueur,
// scindes en "A venir" et "Resultats". Donnees via GET /api/player/matches.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import ReportScoreModal, {
  type LocalReport,
  type ReportOutcome,
} from '@/components/player/ReportScoreModal';
import { useLang, type Lang } from '@/lib/i18n/LanguageProvider';
import { useT, format } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { PlayerMatchesPayload } from '@/pages/api/player/matches';

import { logger } from '../../utils/logger';

type PlayerMatch = PlayerMatchesPayload['matches'][number];

type T = ReturnType<typeof useT<'playerMatches'>>;

function formatScheduled(iso: string | null, lang: Lang, t: T): string {
  if (!iso) return t.dateToCome;
  return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

function formatLabel(match: PlayerMatch): string | null {
  if (match.format) return match.format.toUpperCase();
  if (match.bestOf) return `BO${match.bestOf}`;
  return null;
}

function isUpcoming(match: PlayerMatch): boolean {
  if (match.status === 'pending' || match.status === 'ongoing') return true;
  if (match.scheduledAt) {
    return new Date(match.scheduledAt).getTime() > Date.now();
  }
  return false;
}

function scheduledTime(match: PlayerMatch): number {
  return match.scheduledAt ? new Date(match.scheduledAt).getTime() : 0;
}

/** Statuts terminaux côté backend : plus rapportables par un capitaine. */
const TERMINAL_STATUSES = new Set(['finished', 'walkover', 'cancelled']);

/**
 * Un match est rapportable si les deux équipes sont assignées (opponent connu)
 * et que le match n'est pas clôturé. Le droit "capitaine" est vérifié côté
 * serveur (403 sinon) — on ne le connaît pas depuis la liste.
 */
function isReportable(match: PlayerMatch): boolean {
  if (!match.opponent) return false;
  return !TERMINAL_STATUSES.has(match.status);
}

/** État local d'un report soumis durant la session (idempotence côté client). */
type ReportState = { outcome: ReportOutcome; report: LocalReport };

function ResultBadge({ result, t }: { result: PlayerMatch['result']; t: T }) {
  if (result === 'win') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
        {t.win}
      </span>
    );
  }
  if (result === 'loss') {
    return (
      <span className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
        {t.loss}
      </span>
    );
  }
  if (result === 'draw') {
    return (
      <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-200">
        {t.draw}
      </span>
    );
  }
  return null;
}

function MatchCard({
  match,
  lang,
  t,
  reportState,
  onReport,
}: {
  match: PlayerMatch;
  lang: Lang;
  t: T;
  reportState: ReportState | null;
  onReport: (match: PlayerMatch) => void;
}) {
  const upcoming = isUpcoming(match);
  const checkin = match.checkin;
  const label = formatLabel(match);
  const isLive = match.status === 'ongoing';
  const reportable = isReportable(match);
  // Statut report dérivé : état local de session sinon statut serveur "disputed".
  const reportOutcome: ReportOutcome | null =
    reportState?.outcome ?? (match.status === 'disputed' ? 'disputed' : null);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-purple-200/80">
        {isLive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-rose-100 text-[10px] font-semibold">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
            </span>
            {t.live}
          </span>
        )}
        {match.tournament && (
          <span>
            {match.tournament.slug ? (
              <Link
                href={`/tournament/${encodeURIComponent(match.tournament.slug)}`}
                className="hover:text-white transition"
              >
                {match.tournament.name}
              </Link>
            ) : (
              match.tournament.name
            )}
          </span>
        )}
        {match.roundName && <span>{match.roundName}</span>}
        {label && <span className="tabular-nums">{label}</span>}
        {reportOutcome === 'awaiting_opponent' && (
          <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-100">
            {t.badgeAwaiting}
          </span>
        )}
        {reportOutcome === 'disputed' && (
          <span className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold text-rose-100">
            {t.badgeDisputed}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl md:text-2xl font-bold text-white leading-tight">
            <span className="text-white/50">vs</span>{' '}
            {match.opponent?.name ?? t.opponentTbd}
          </h3>
          <p className="text-sm text-gray-300 mt-1">
            <span className="capitalize">
              {formatScheduled(match.scheduledAt, lang, t)}
            </span>
          </p>
        </div>

        {!upcoming && match.score && (
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-2xl font-bold text-white">
              {match.score.mine ?? '–'} <span className="text-white/40">–</span>{' '}
              {match.score.opponent ?? '–'}
            </span>
            <ResultBadge result={match.result} t={t} />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/match/${match.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
        >
          {t.viewMatch}
          <span aria-hidden>→</span>
        </Link>

        {match.streamUrl && (
          <a
            href={match.streamUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-100 transition hover:bg-fuchsia-500/20"
          >
            {t.liveCast}
            <span aria-hidden>↗</span>
          </a>
        )}

        {upcoming && checkin?.alreadyCheckedIn && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
            {t.checkedIn}
          </span>
        )}

        {upcoming && checkin?.isOpen && !checkin.alreadyCheckedIn && (
          <Link
            href="/player/checkin"
            className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            {t.checkin}
            <span aria-hidden>→</span>
          </Link>
        )}

        {reportable && (
          <button
            type="button"
            onClick={() => onReport(match)}
            className="inline-flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-100 transition hover:bg-purple-500/20"
          >
            {reportState ? t.editReport : t.reportScore}
            <span aria-hidden>→</span>
          </button>
        )}
      </div>

      {reportState && (
        <p className="mt-3 text-xs text-gray-400">
          {reportState.outcome === 'awaiting_opponent' && t.statusAwaitingShort}
          {reportState.outcome === 'disputed' && t.statusDisputedShort}
          {reportState.outcome === 'finalized' && t.statusFinalized}
          {' · '}
          <span className="tabular-nums text-gray-300">
            {t.myTeamLabel} {reportState.report.mine} –{' '}
            {reportState.report.opponent} {t.opponentLabel}
          </span>
        </p>
      )}
    </div>
  );
}

function PlayerMatches() {
  const {
    user,
    loading: authLoading,
    ready,
  } = usePlayerSession({
    redirectTo: '/login?next=/player/matches',
  });
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { lang } = useLang();
  const t = useT('playerMatches');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PlayerMatchesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, ReportState>>({});
  const [activeMatch, setActiveMatch] = useState<PlayerMatch | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await adminFetchJson<PlayerMatchesPayload>(
        '/api/player/matches',
        { skipAuthRedirect: true }
      );
      setData(json);
    } catch (err) {
      logger.error('[player/matches] load error:', err);
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  const handleReported = useCallback(
    (outcome: ReportOutcome, report: LocalReport) => {
      const matchId = activeMatch?.id;
      if (matchId) {
        setReports((prev) => ({ ...prev, [matchId]: { outcome, report } }));
      }
      // Sur finalisation, le statut serveur change : on rafraîchit la liste.
      if (outcome === 'finalized') {
        load();
      }
    },
    [activeMatch, load]
  );

  if (authLoading || (loading && !data)) {
    return <PlayerPageSkeleton rows={3} />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-md mx-auto px-4 py-10 pt-32 text-center">
          <h1 className="text-3xl font-bold text-gradient">{t.title}</h1>
          <p className="mt-4 text-gray-300">{t.signinPrompt}</p>
          <Link
            href="/login?next=/player/matches"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:brightness-110"
          >
            {t.signin}
          </Link>
        </main>
      </div>
    );
  }

  const matches = data?.matches ?? [];
  const upcoming = matches
    .filter(isUpcoming)
    .sort((a, b) => scheduledTime(a) - scheduledTime(b));
  const past = matches
    .filter((m) => !isUpcoming(m))
    .sort((a, b) => scheduledTime(b) - scheduledTime(a));

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="max-w-4xl mx-auto px-4 py-10 pt-24 pb-16">
        <div className="mb-8">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <Link href="/player" className="hover:text-white transition">
              &larr; {t.backToDashboard}
            </Link>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient mt-2">
            {t.title}
          </h1>
          {data?.team ? (
            <p className="text-sm text-gray-400 mt-2">
              {format(t.teamSchedule, { team: data.team.name })}
            </p>
          ) : (
            <p className="text-sm text-gray-400 mt-2">{t.yourSchedule}</p>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {!data?.team && !error ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 text-center">
            <p className="text-lg font-semibold text-white">{t.noTeamTitle}</p>
            <p className="mt-2 text-sm text-gray-400">{t.noTeamBody}</p>
            <Link
              href="/player"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-purple-600 hover:bg-purple-500 px-5 py-2.5 text-sm font-medium text-white transition"
            >
              {t.goToDashboard}
            </Link>
          </div>
        ) : data?.team && matches.length === 0 && !error ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 text-center">
            <p className="text-lg font-semibold text-white">{t.noMatchTitle}</p>
            <p className="mt-2 text-sm text-gray-400">{t.noMatchBody}</p>
          </div>
        ) : (
          <div className="space-y-10">
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4 text-white">
                  {t.upcoming}
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({upcoming.length})
                  </span>
                </h2>
                <div className="space-y-4">
                  {upcoming.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      lang={lang}
                      t={t}
                      reportState={reports[m.id] ?? null}
                      onReport={setActiveMatch}
                    />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4 text-white">
                  {t.results}
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({past.length})
                  </span>
                </h2>
                <div className="space-y-4">
                  {past.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      lang={lang}
                      t={t}
                      reportState={reports[m.id] ?? null}
                      onReport={setActiveMatch}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {activeMatch && (
        <ReportScoreModal
          open={!!activeMatch}
          onClose={() => setActiveMatch(null)}
          matchId={activeMatch.id}
          slot={activeMatch.slot}
          opponentName={activeMatch.opponent?.name ?? t.opponentTbd}
          myTeamName={data?.team?.name ?? t.myTeamLabel}
          bestOf={activeMatch.bestOf}
          currentReport={reports[activeMatch.id]?.report ?? null}
          t={t}
          onReported={handleReported}
        />
      )}
    </div>
  );
}

const playerMatchesSeo: SeoProps = {
  title: 'Mes matchs',
  description:
    "Calendrier et résultats des matchs de ton équipe OW Women's Cup.",
  noindex: true,
};

PlayerMatches.seo = playerMatchesSeo;

export default PlayerMatches;
