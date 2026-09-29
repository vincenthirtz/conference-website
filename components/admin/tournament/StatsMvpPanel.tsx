// components/admin/tournament/StatsMvpPanel.tsx
// Admin : suivi en direct des votes MVP d'un tournoi (sous-onglets `mvp` et
// `mvp-public` de la page Résultats).
// GET /api/admin/tournament/[id]/mvp-votes (vote des équipes, lecture seule) ou
// /mvp-public-votes (vote du public, Twitch + Discord additionnés).
//
// Le vote du PUBLIC se pilote aussi d'ici : le lancer à la main sur un match
// terminé, ou le clore avant l'échéance — pour un match sans régie, où le
// cockpit caster n'est pas ouvert. Le site prévient le bot, qui poste le vote
// dans son salon Discord (POST /api/admin/matches/[matchId]/mvp-public).
//
// Se rafraîchit seul tant qu'un vote est ouvert et que l'onglet est visible :
// c'est un écran qu'on laisse ouvert pendant un match.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAdminFetch, type AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
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
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import StatTile from '@/features/admin/_shared/ui/StatTile';
import {
  rubanCardPadded,
  rubanErrBox,
  rubanEyebrowSnug,
  rubanFaint,
  rubanFormInput,
  rubanMuted,
  rubanStrong,
} from '@/features/admin/_shared/ui/ruban';

/** Match terminé sans vote du public : on peut le lancer à la main. */
type OpenableMatch = {
  id: string;
  roundName: string | null;
  scheduledAt: string | null;
  team1Name: string | null;
  team2Name: string | null;
};

type Response = VoteBoard & {
  tournament: { id: string; name: string };
  /** Vote du public seulement. */
  openable?: OpenableMatch[];
};

/** Défaut du serveur (DEFAULT_PUBLIC_WINDOW_MINUTES), rappelé dans le champ. */
const DEFAULT_PUBLIC_MINUTES = 10;
type Filter = 'all' | 'open' | 'closed';
type Dict = typeof nsAdminTournamentMvpVotes.fr;

const REFRESH_SECONDS = 30;
/**
 * Le vote du public dure une dizaine de minutes : à 30 s, l'écran raterait un
 * tiers de ce qui s'y passe. Toujours seulement tant qu'un vote est ouvert.
 */
const PUBLIC_REFRESH_SECONDS = 10;

const STATE_TONES: Record<MvpPollState, ChipTone> = {
  open: 'live',
  expired: 'warn',
  closed: 'neutral',
  none: 'neutral',
};

function stateLabel(t: Dict, s: MvpPollState): string {
  if (s === 'open') return t.stateOpen;
  if (s === 'expired') return t.stateExpired;
  if (s === 'closed') return t.stateClosed;
  return t.stateNone;
}

/** Quel vote le panneau suit : celui des équipes, ou celui du public. */
export type StatsMvpKind = 'teams' | 'public';

function sourceLabel(t: Dict, s: string | null): string {
  if (s === 'combined') return t.sourceCombined;
  if (s === 'twitch') return t.sourceTwitch;
  if (s === 'discord') return t.sourceDiscord;
  return t.winnerManual;
}

export default function StatsMvpPanel({
  kind = 'teams',
}: {
  kind?: StatsMvpKind;
}) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const t = useAdminT(nsAdminTournamentMvpVotes);
  const locale = useLocale();
  const visible = useDocumentVisible();
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const [data, setData] = useState<Response | null>(null);
  const [openMatchId, setOpenMatchId] = useState('');
  const [minutes, setMinutes] = useState(String(DEFAULT_PUBLIC_MINUTES));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(
    async (quiet = false) => {
      if (!tournamentId) return;
      if (!quiet) setLoading(true);
      try {
        const json = await adminFetchJson<Response>(
          `/api/admin/tournament/${tournamentId}/${
            kind === 'public' ? 'mvp-public-votes' : 'mvp-votes'
          }`
        );
        setData(json);
        setError(null);
      } catch (err) {
        setError((err as AdminFetchError).message || t.errorLoad);
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [tournamentId, kind, adminFetchJson, t.errorLoad]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const hasOpen = (data?.totals.openPolls ?? 0) > 0;
  const refreshSeconds =
    kind === 'public' ? PUBLIC_REFRESH_SECONDS : REFRESH_SECONDS;
  useEffect(() => {
    if (!hasOpen || !visible) return;
    const timer = setInterval(() => void load(true), refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [hasOpen, visible, load, refreshSeconds]);

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

  /** Lancer / clore le vote du public d'un match, puis recharger. */
  const runPublic = useCallback(
    async (
      matchId: string,
      body: { action: 'open'; windowMinutes: number } | { action: 'close' }
    ) => {
      setBusy(true);
      try {
        await adminFetchJson(`/api/admin/matches/${matchId}/mvp-public`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        addToast(body.action === 'open' ? t.openDone : t.closeDone, 'success');
        if (body.action === 'open') setOpenMatchId('');
        await load(true);
      } catch (err) {
        addToast((err as AdminFetchError).message || t.actionError, 'error');
      } finally {
        setBusy(false);
      }
    },
    [adminFetchJson, addToast, load, t.openDone, t.closeDone, t.actionError]
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
    return <p className={rubanMuted}>{t.loading}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold">
            {kind === 'public' ? t.headingPublic : t.heading}
          </h2>
          <p className={`mt-1 text-sm ${rubanMuted}`}>
            {format(kind === 'public' ? t.introPublic : t.intro, {
              min: MIN_VOTES_FOR_AWARD,
            })}
          </p>
          {hasOpen && (
            <p className={`mt-1 text-xs ${rubanFaint}`}>
              {format(t.autoRefresh, { seconds: refreshSeconds })}
            </p>
          )}
        </div>
        <AdminButton size="sm" onClick={() => void load()}>
          {t.refresh}
        </AdminButton>
      </div>

      {error && (
        <p role="alert" className={rubanErrBox}>
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

      {kind === 'public' && data && (
        <section className={rubanCardPadded}>
          <h3 className={rubanStrong}>{t.openTitle}</h3>
          <p className={`mt-1 text-xs ${rubanMuted}`}>{t.openHelp}</p>
          {(data.openable ?? []).length === 0 ? (
            <p className={`mt-3 text-sm ${rubanFaint}`}>{t.openNone}</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className={`text-xs ${rubanMuted}`}>
                {t.openMatchLabel}
                <select
                  className={`mt-1 block !w-auto ${rubanFormInput}`}
                  value={openMatchId}
                  onChange={(e) => setOpenMatchId(e.target.value)}
                >
                  <option value="">—</option>
                  {(data.openable ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.team1Name ?? t.tbd} {t.vs} {m.team2Name ?? t.tbd}
                      {m.roundName ? ` · ${m.roundName}` : ''}
                      {m.scheduledAt ? ` · ${fmtDate(m.scheduledAt)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`text-xs ${rubanMuted}`}>
                {t.openMinutesLabel}
                <input
                  type="number"
                  min={1}
                  max={360}
                  className={`mt-1 block !w-24 font-mono ${rubanFormInput}`}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </label>
              <AdminButton
                variant="primary"
                size="sm"
                disabled={
                  busy ||
                  !openMatchId ||
                  !(Number(minutes) >= 1 && Number(minutes) <= 360)
                }
                onClick={() =>
                  void runPublic(openMatchId, {
                    action: 'open',
                    windowMinutes: Math.round(Number(minutes)),
                  })
                }
              >
                {t.openCta}
              </AdminButton>
            </div>
          )}
        </section>
      )}

      {data && data.matches.length === 0 && (
        <p className={rubanMuted}>
          {kind === 'public' ? t.emptyPublic : t.empty}
        </p>
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
              <AdminButton
                key={value}
                size="xs"
                variant={filter === value ? 'secondary' : 'ghost'}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </AdminButton>
            ))}
          </fieldset>

          <ul className="space-y-4">
            {shown.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                t={t}
                fmtDate={fmtDate}
                onClose={
                  kind === 'public' &&
                  (m.state === 'open' || m.state === 'expired')
                    ? () => void runPublic(m.id, { action: 'close' })
                    : undefined
                }
                busy={busy}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return <StatTile label={label} value={value} />;
}

function MatchCard({
  match: m,
  t,
  fmtDate,
  onClose,
  busy = false,
}: {
  match: VoteBoardMatch;
  t: Dict;
  fmtDate: (iso: string) => string;
  /** Vote du public ouvert : le clore maintenant. */
  onClose?: () => void;
  busy?: boolean;
}) {
  return (
    <li className={rubanCardPadded}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className={`font-semibold ${rubanStrong}`}>
            {m.team1Name ?? t.tbd}{' '}
            <span className={`font-normal ${rubanFaint}`}>{t.vs}</span>{' '}
            {m.team2Name ?? t.tbd}
          </div>
          <div className={`mt-0.5 text-xs ${rubanMuted}`}>
            {[m.roundName, m.scheduledAt ? fmtDate(m.scheduledAt) : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Chip tone={STATE_TONES[m.state]}>{stateLabel(t, m.state)}</Chip>
          {m.state === 'closed' && m.closedAt && (
            <span className={`font-mono text-[11px] ${rubanFaint}`}>
              {format(t.closedAt, { date: fmtDate(m.closedAt) })}
            </span>
          )}
          {(m.state === 'open' || m.state === 'expired') && m.closesAt && (
            <span className={`font-mono text-[11px] ${rubanFaint}`}>
              {format(t.closesAt, { date: fmtDate(m.closesAt) })}
            </span>
          )}
          {onClose && (
            <AdminButton
              size="xs"
              className="mt-1"
              onClick={onClose}
              disabled={busy}
            >
              {t.closeCta}
            </AdminButton>
          )}
        </div>
      </div>

      <div className="mt-3 text-sm">
        {m.winner ? (
          <p className="font-semibold text-[var(--or-200,#eec4ff)]">
            🏅 {format(t.winner, { name: m.winner.label })}{' '}
            <span className={`font-normal ${rubanMuted}`}>
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
          <p className={`font-semibold ${rubanStrong}`}>
            {format(t.leader, { name: m.leader.label })}{' '}
            <span className={`font-normal ${rubanMuted}`}>
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
          <p className={rubanMuted}>
            {m.leader.reason === 'tie'
              ? t.reasonTie
              : m.leader.reason === 'too_few_votes'
                ? format(t.reasonTooFew, { min: MIN_VOTES_FOR_AWARD })
                : t.reasonNoVotes}
          </p>
        )}
      </div>

      {m.sources.length === 0 ? (
        <p className={`mt-3 text-sm ${rubanFaint}`}>{t.noVotes}</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {m.sources.map((s) => (
            <div key={s.source}>
              <div
                className={`mb-2 flex items-baseline justify-between ${rubanEyebrowSnug}`}
              >
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
                          <span className={rubanFaint}> · {r.teamName}</span>
                        )}
                      </span>
                      <span className="font-mono text-[var(--t2,#c7bfca)]">
                        {r.votes} · {Math.round(r.share * 100)} %
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-[2px] bg-[var(--s3,#2f2732)]">
                      <div
                        className={`h-full rounded-[2px] ${
                          s.source === 'twitch'
                            ? 'bg-[var(--or,#b467d1)]'
                            : 'bg-[var(--t3,#a39ba6)]'
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
