// components/admin/tournament/StatsMvpPanel.tsx
// Admin : suivi en direct des votes MVP d'un tournoi (sous-onglet `mvp` de la
// page Résultats). Lecture seule — GET /api/admin/tournament/[id]/mvp-votes.
//
// Se rafraîchit seul tant qu'un vote est ouvert et que l'onglet est visible :
// c'est un écran qu'on laisse ouvert pendant un match.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAdminFetch, type AdminFetchError } from '@/hooks/useAdminFetch';
import { useDocumentVisible } from '@/hooks/useDocumentVisible';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useLocale } from '@/lib/i18n/useLocale';
import { MIN_VOTES_FOR_AWARD } from '@/utils/mvp/awards';
import type {
  MvpPollState,
  VoteBoard,
  VoteBoardMatch,
} from '@/utils/mvp/voteBoard';
import nsAdminTournamentMvpVotes from '@/lib/i18n/locales/admin-fr/adminTournamentMvpVotes';

type Response = VoteBoard & { tournament: { id: string; name: string } };
type Filter = 'all' | 'open' | 'closed';
type Dict = typeof nsAdminTournamentMvpVotes.fr;

const REFRESH_SECONDS = 30;

const STATE_CLASSES: Record<MvpPollState, string> = {
  open: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  expired: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  closed: 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30',
  none: 'bg-neutral-800 text-neutral-400 border-neutral-700',
};

function stateLabel(t: Dict, s: MvpPollState): string {
  if (s === 'open') return t.stateOpen;
  if (s === 'expired') return t.stateExpired;
  if (s === 'closed') return t.stateClosed;
  return t.stateNone;
}

function sourceLabel(t: Dict, s: string | null): string {
  if (s === 'twitch') return t.sourceTwitch;
  if (s === 'discord') return t.sourceDiscord;
  return t.winnerManual;
}

export default function StatsMvpPanel() {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const t = useAdminT(nsAdminTournamentMvpVotes);
  const locale = useLocale();
  const visible = useDocumentVisible();
  const { adminFetchJson } = useAdminFetch();

  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(
    async (quiet = false) => {
      if (!tournamentId) return;
      if (!quiet) setLoading(true);
      try {
        const json = await adminFetchJson<Response>(
          `/api/admin/tournament/${tournamentId}/mvp-votes`
        );
        setData(json);
        setError(null);
      } catch (err) {
        setError((err as AdminFetchError).message || t.errorLoad);
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [tournamentId, adminFetchJson, t.errorLoad]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const hasOpen = (data?.totals.openPolls ?? 0) > 0;
  useEffect(() => {
    if (!hasOpen || !visible) return;
    const timer = setInterval(() => void load(true), REFRESH_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [hasOpen, visible, load]);

  const fmtDate = useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso)),
    [locale]
  );

  const shown = useMemo(() => {
    const all = data?.matches ?? [];
    if (filter === 'open') {
      return all.filter((m) => m.state === 'open' || m.state === 'expired');
    }
    if (filter === 'closed') return all.filter((m) => m.state === 'closed');
    return all;
  }, [data, filter]);

  if (loading && !data) {
    return <p className="text-neutral-400">{t.loading}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold">{t.heading}</h2>
          <p className="text-sm text-neutral-400 mt-1">
            {format(t.intro, { min: MIN_VOTES_FOR_AWARD })}
          </p>
          {hasOpen && (
            <p className="text-xs text-neutral-500 mt-1">
              {format(t.autoRefresh, { seconds: REFRESH_SECONDS })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition-colors"
        >
          {t.refresh}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      {data && (
        <div className="grid grid-cols-3 gap-4">
          <Kpi label={t.totalVotes} value={data.totals.votes} />
          <Kpi label={t.openPolls} value={data.totals.openPolls} />
          <Kpi
            label={t.matchesWithVotes}
            value={data.totals.matchesWithVotes}
          />
        </div>
      )}

      {data && data.matches.length === 0 && (
        <p className="text-neutral-400">{t.empty}</p>
      )}

      {data && data.matches.length > 0 && (
        <>
          <fieldset className="flex gap-2">
            {(
              [
                ['all', t.filterAll],
                ['open', t.filterOpen],
                ['closed', t.filterClosed],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  filter === value
                    ? 'bg-purple-600/30 border-purple-500/50 text-white'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </fieldset>

          <ul className="space-y-4">
            {shown.map((m) => (
              <MatchCard key={m.id} match={m} t={t} fmtDate={fmtDate} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
        {label}
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function MatchCard({
  match: m,
  t,
  fmtDate,
}: {
  match: VoteBoardMatch;
  t: Dict;
  fmtDate: (iso: string) => string;
}) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">
            {m.team1Name ?? t.tbd}{' '}
            <span className="text-neutral-500 font-normal">{t.vs}</span>{' '}
            {m.team2Name ?? t.tbd}
          </div>
          <div className="text-xs text-neutral-400 mt-0.5">
            {[m.roundName, m.scheduledAt ? fmtDate(m.scheduledAt) : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${STATE_CLASSES[m.state]}`}
          >
            {stateLabel(t, m.state)}
          </span>
          {m.state === 'closed' && m.closedAt && (
            <span className="text-[11px] text-neutral-500">
              {format(t.closedAt, { date: fmtDate(m.closedAt) })}
            </span>
          )}
          {(m.state === 'open' || m.state === 'expired') && m.closesAt && (
            <span className="text-[11px] text-neutral-500">
              {format(t.closesAt, { date: fmtDate(m.closesAt) })}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 text-sm">
        {m.winner ? (
          <p className="font-semibold text-amber-300">
            🏅 {format(t.winner, { name: m.winner.label })}{' '}
            <span className="text-neutral-400 font-normal">
              (
              {m.winner.source === 'manual' || m.winner.votes == null
                ? t.winnerManual
                : format(t.leaderDetail, {
                    votes: m.winner.votes,
                    total: m.winner.total ?? 0,
                    source: sourceLabel(t, m.winner.source),
                  })}
              )
            </span>
          </p>
        ) : m.leader.memberId !== null ? (
          <p className="font-semibold text-emerald-300">
            {format(t.leader, { name: m.leader.label })}{' '}
            <span className="text-neutral-400 font-normal">
              (
              {format(t.leaderDetail, {
                votes: m.leader.votes,
                total: m.leader.total,
                source: sourceLabel(t, m.leader.source),
              })}
              )
            </span>
          </p>
        ) : (
          <p className="text-neutral-400">
            {m.leader.reason === 'tie'
              ? t.reasonTie
              : m.leader.reason === 'too_few_votes'
                ? format(t.reasonTooFew, { min: MIN_VOTES_FOR_AWARD })
                : t.reasonNoVotes}
          </p>
        )}
      </div>

      {m.sources.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">{t.noVotes}</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {m.sources.map((s) => (
            <div key={s.source}>
              <div className="flex items-baseline justify-between text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2">
                <span>{sourceLabel(t, s.source)}</span>
                <span className="tabular-nums">
                  {format(t.votesCount, { count: s.total })}
                </span>
              </div>
              <ol className="space-y-1.5">
                {s.rows.map((r) => (
                  <li key={r.memberId}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        {r.label}
                        {r.teamName && (
                          <span className="text-neutral-500">
                            {' '}
                            · {r.teamName}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums text-neutral-300">
                        {r.votes} · {Math.round(r.share * 100)} %
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          s.source === 'twitch'
                            ? 'bg-purple-500'
                            : 'bg-indigo-400'
                        }`}
                        style={{ width: `${Math.round(r.share * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
