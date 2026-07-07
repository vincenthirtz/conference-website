// pages/cast/[matchId].tsx
// Single-screen dashboard for casters during a live match.
// Layout: header (tournament/round/status), big lobby code, two team panels
// (logo, players, captain), live veto state, H2H stats, last meetings.
// Auto-refreshes every 10 seconds.

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { maskBattleTag } from '@/utils/battleTag';
import type { StaffProps } from '@/types/admin';
import { useT, format } from '@/lib/i18n/useT';

type CastViewerDict = ReturnType<typeof useT<'castViewer'>>;

type Member = {
  id: string;
  battle_tag: string | null;
  role: string;
  is_substitute: boolean;
  is_captain: boolean;
  is_manager: boolean;
};

type Team = {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  country: string | null;
  members: Member[];
};

type VetoStep = {
  id: string;
  step_number: number;
  action: 'ban' | 'pick' | 'decider';
  team_id: string | null;
  map_name: string;
  map_type: string | null;
};

type FlowStep = {
  action: 'ban' | 'pick' | 'decider';
  side: 'team1' | 'team2' | null;
};

type CastProfile = {
  id: string;
  name: string;
  title: string | null;
  imageUrl: string | null;
  twitchUrl: string | null;
};

type CastData = {
  castProfile: CastProfile | null;
  match: {
    id: string;
    status: string;
    matchFormat: string;
    roundName: string | null;
    roundNumber: number | null;
    team1Id: string | null;
    team2Id: string | null;
    team1Score: number | null;
    team2Score: number | null;
    winnerTeamId: string | null;
    scheduledAt: string | null;
    streamUrl: string | null;
    replayUrl: string | null;
    lobbyCode: string | null;
    notes: string | null;
  };
  team1: Team | null;
  team2: Team | null;
  tournament: { id: string; name: string; slug: string | null } | null;
  stage: { id: string; name: string; stageType: string | null } | null;
  veto: {
    format: string;
    flow: FlowStep[];
    steps: VetoStep[];
    currentStepIndex: number;
    isComplete: boolean;
    pickedMaps: {
      map_name: string;
      map_type: string | null;
      picked_by: string | null;
    }[];
  };
  h2h: {
    total: number;
    winsTeam1: number;
    winsTeam2: number;
    meetings: {
      matchId: string;
      team1Score: number | null;
      team2Score: number | null;
      winnerTeamId: string | null;
      completedAt: string | null;
      tournamentName: string | null;
    }[];
  };
};

const REFRESH_MS = 10_000;

export const getServerSideProps = withStaffPage('caster');

function formatDateFr(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

function statusBadge(
  t: CastViewerDict,
  status: string
): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return {
        label: t.statusUpcoming,
        className: 'bg-blue-600/20 text-blue-300 border-blue-500/40',
      };
    case 'ongoing':
      return {
        label: t.statusOngoing,
        className:
          'bg-emerald-600/30 text-emerald-200 border-emerald-500/50 animate-pulse',
      };
    case 'finished':
      return {
        label: t.statusFinished,
        className: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/40',
      };
    case 'walkover':
      return {
        label: t.statusWalkover,
        className: 'bg-red-700/30 text-red-200 border-red-500/40',
      };
    default:
      return {
        label: status.toUpperCase(),
        className: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/40',
      };
  }
}

function CastPage(_: StaffProps) {
  const router = useRouter();
  const t = useT('castViewer');
  const { matchId } = router.query;
  const id = Array.isArray(matchId) ? matchId[0] : matchId;

  const [data, setData] = useState<CastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copied, setCopied] = useState(false);

  // Replay URL editor
  const [replayDraft, setReplayDraft] = useState('');
  const [savingReplay, setSavingReplay] = useState(false);
  const [replayMsg, setReplayMsg] = useState<string | null>(null);

  // Sync draft from server data
  useEffect(() => {
    if (data?.match.replayUrl !== undefined) {
      setReplayDraft(data.match.replayUrl ?? '');
    }
  }, [data?.match.replayUrl]);

  async function saveReplayUrl() {
    if (!id) return;
    const value = replayDraft.trim();
    if (value.length > 0) {
      try {
        const u = new URL(value);
        if (!['http:', 'https:'].includes(u.protocol)) {
          setReplayMsg(t.urlInvalidHttp);
          return;
        }
      } catch {
        setReplayMsg(t.urlInvalid);
        return;
      }
    }
    setSavingReplay(true);
    setReplayMsg(null);
    try {
      const res = await fetch(`/api/admin/matches/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replay_url: value || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t.errorGeneric);
      setReplayMsg(t.replaySaved);
      // Refresh cast data so the displayed value reflects the new state
      await fetchData();
      setTimeout(() => setReplayMsg(null), 3000);
    } catch (e: unknown) {
      setReplayMsg((e as Error).message || t.errorGeneric);
    } finally {
      setSavingReplay(false);
    }
  }

  const fetchData = useCallback(async () => {
    if (!id) return;
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/cast/${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t.errorGeneric);
      setData(json);
      setLastRefresh(new Date());
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(t);
  }, [autoRefresh, fetchData]);

  async function copyLobby() {
    if (!data?.match.lobbyCode) return;
    try {
      await navigator.clipboard.writeText(data.match.lobbyCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </main>
    );
  }

  if (errorMsg && !data) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-lg mb-2">{t.errorTitle}</div>
          <p className="text-sm text-neutral-400">{errorMsg}</p>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { castProfile, match, team1, team2, tournament, stage, veto, h2h } =
    data;
  const badge = statusBadge(t, match.status);

  return (
    <>
      <Head>
        <title>
          {format(t.docTitle, {
            team1: team1?.name || '?',
            team2: team2?.name || '?',
          })}
        </title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${badge.className}`}
              >
                {badge.label}
              </span>
              {tournament && (
                <span className="text-sm text-neutral-300">
                  {tournament.name}
                </span>
              )}
              {stage && (
                <span className="text-sm text-neutral-500">· {stage.name}</span>
              )}
              {match.roundName && (
                <span className="text-sm text-neutral-500">
                  · {match.roundName}
                </span>
              )}
              <span className="text-xs text-neutral-600">
                · {match.matchFormat.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-neutral-500">
              {castProfile && (
                <span
                  className="flex items-center gap-2 px-2 py-1 rounded-full bg-purple-600/15 border border-purple-500/30 text-purple-200"
                  title={castProfile.title || t.casterConnected}
                >
                  {castProfile.imageUrl ? (
                    <Image
                      src={castProfile.imageUrl}
                      alt={castProfile.name}
                      width={20}
                      height={20}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-purple-500/40 flex items-center justify-center text-[10px] font-bold text-purple-100">
                      {castProfile.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="font-medium">{castProfile.name}</span>
                  {castProfile.twitchUrl && (
                    <a
                      href={castProfile.twitchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-300 hover:text-purple-100 underline-offset-2 hover:underline"
                    >
                      Twitch ↗
                    </a>
                  )}
                </span>
              )}
              {match.scheduledAt && (
                <span>{formatDateFr(match.scheduledAt)}</span>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-neutral-600 bg-neutral-900"
                />
                {format(t.autoRefresh, { seconds: REFRESH_MS / 1000 })}
              </label>
              {lastRefresh && (
                <span className="text-neutral-600">
                  {t.updatedLabel}&nbsp;{lastRefresh.toLocaleTimeString('fr-FR')}
                </span>
              )}
              <button
                type="button"
                onClick={fetchData}
                className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 transition-colors"
              >
                ⟳
              </button>
            </div>
          </div>

          {/* Score / teams banner */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 mb-4 items-stretch">
            {/* Team 1 */}
            <TeamBanner
              team={team1}
              score={match.team1Score}
              isWinner={match.winnerTeamId === team1?.id}
              side="left"
            />

            {/* Center: lobby code */}
            <div className="bg-neutral-800/60 backdrop-blur border border-neutral-700/50 rounded-2xl p-5 flex flex-col items-center justify-center min-w-[220px]">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">
                {t.lobbyCode}
              </div>
              {match.lobbyCode ? (
                <button
                  type="button"
                  onClick={copyLobby}
                  className="text-2xl md:text-3xl font-mono font-bold text-amber-300 hover:text-amber-200 transition-colors break-all"
                  title={t.copyHint}
                >
                  {match.lobbyCode}
                </button>
              ) : (
                <span className="text-neutral-600 italic text-sm">
                  {t.undefinedValue}
                </span>
              )}
              {copied && (
                <span className="text-[11px] text-emerald-400 mt-1">
                  {t.copied}
                </span>
              )}
              {match.streamUrl && (
                <a
                  href={match.streamUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-blue-400 hover:text-blue-300 mt-3 truncate max-w-full"
                >
                  {t.streamLink}
                </a>
              )}
            </div>

            {/* Team 2 */}
            <TeamBanner
              team={team2}
              score={match.team2Score}
              isWinner={match.winnerTeamId === team2?.id}
              side="right"
            />
          </div>

          {/* Main grid: Players (left), Veto+H2H (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
            {/* Rosters */}
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-5">
              <h2 className="text-sm uppercase tracking-widest text-neutral-400 mb-3">
                {t.rosters}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <RosterColumn team={team1} />
                <RosterColumn team={team2} />
              </div>
            </section>

            {/* Veto + H2H */}
            <div className="space-y-4">
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm uppercase tracking-widest text-neutral-400">
                    {t.veto} ({veto.format.toUpperCase()})
                  </h2>
                  <span className="text-[11px] text-neutral-500">
                    {format(t.stepProgress, {
                      current: Math.min(
                        veto.currentStepIndex + 1,
                        veto.flow.length
                      ),
                      total: veto.flow.length,
                    })}
                    {veto.isComplete && (
                      <span className="text-emerald-400 ml-2">
                        {t.vetoComplete}
                      </span>
                    )}
                  </span>
                </div>
                <VetoTimeline
                  flow={veto.flow}
                  steps={veto.steps}
                  team1Name={team1?.shortName || team1?.name || 'T1'}
                  team2Name={team2?.shortName || team2?.name || 'T2'}
                  team1Id={team1?.id ?? null}
                  team2Id={team2?.id ?? null}
                />

                {/* Picked maps (game order) */}
                {veto.pickedMaps.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-neutral-700/50">
                    <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
                      {t.mapsInPlay}
                    </div>
                    <ol className="space-y-1.5">
                      {veto.pickedMaps.map((m, idx) => {
                        const byTeam =
                          m.picked_by === team1?.id
                            ? team1?.shortName || team1?.name
                            : m.picked_by === team2?.id
                              ? team2?.shortName || team2?.name
                              : t.decider;
                        const isDecider = m.picked_by === null;
                        return (
                          <li
                            key={idx}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className="text-neutral-500 text-xs w-5">
                              {idx + 1}.
                            </span>
                            <span
                              className={`font-medium ${isDecider ? 'text-amber-300' : 'text-white'}`}
                            >
                              {m.map_name}
                            </span>
                            {m.map_type && (
                              <span className="text-[10px] text-neutral-500 uppercase tracking-wide">
                                {m.map_type}
                              </span>
                            )}
                            <span className="text-xs text-neutral-500 ml-auto">
                              {byTeam}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </section>

              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-5">
                <h2 className="text-sm uppercase tracking-widest text-neutral-400 mb-3">
                  {t.headToHead}
                </h2>
                {h2h.total === 0 ? (
                  <p className="text-sm text-neutral-500 italic">
                    {t.noPreviousMatch}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-4 mb-3">
                      <div className="text-center flex-1">
                        <div className="text-3xl font-bold text-white">
                          {h2h.winsTeam1}
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-neutral-500 mt-0.5">
                          {team1?.shortName || team1?.name || 'T1'}
                        </div>
                      </div>
                      <div className="text-neutral-600 text-xs">
                        {format(
                          h2h.total > 1 ? t.matchCount_other : t.matchCount_one,
                          { count: h2h.total }
                        )}
                      </div>
                      <div className="text-center flex-1">
                        <div className="text-3xl font-bold text-white">
                          {h2h.winsTeam2}
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-neutral-500 mt-0.5">
                          {team2?.shortName || team2?.name || 'T2'}
                        </div>
                      </div>
                    </div>
                    {h2h.meetings.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-neutral-700/50">
                        <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
                          {t.lastMeetings}
                        </div>
                        <ul className="space-y-1.5">
                          {h2h.meetings.map((m) => (
                            <li
                              key={m.matchId}
                              className="flex items-center gap-2 text-xs"
                            >
                              <span className="text-neutral-500 w-16">
                                {m.completedAt
                                  ? new Date(m.completedAt).toLocaleDateString(
                                      'fr-FR',
                                      {
                                        day: '2-digit',
                                        month: 'short',
                                      }
                                    )
                                  : '—'}
                              </span>
                              <span
                                className={`font-mono font-semibold ${m.winnerTeamId === team1?.id ? 'text-emerald-300' : 'text-neutral-400'}`}
                              >
                                {m.team1Score ?? '?'}
                              </span>
                              <span className="text-neutral-600">-</span>
                              <span
                                className={`font-mono font-semibold ${m.winnerTeamId === team2?.id ? 'text-emerald-300' : 'text-neutral-400'}`}
                              >
                                {m.team2Score ?? '?'}
                              </span>
                              {m.tournamentName && (
                                <span className="text-neutral-600 truncate ml-1">
                                  · {m.tournamentName}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>

          {match.notes && (
            <div className="mt-4 bg-neutral-800/40 border border-neutral-700/40 rounded-xl p-3 text-xs text-neutral-400">
              <span className="uppercase tracking-widest text-neutral-500 mr-2">
                {t.notes}
              </span>
              {match.notes}
            </div>
          )}

          {/* Replay / VOD editor — visible after match end */}
          {(match.status === 'finished' ||
            match.status === 'walkover' ||
            match.replayUrl) && (
            <div className="mt-4 bg-neutral-800/40 border border-neutral-700/40 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-widest text-neutral-500">
                  {t.replayVod}
                </span>
                {match.replayUrl && (
                  <a
                    href={match.replayUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-300 hover:text-blue-200 underline"
                  >
                    {t.openCurrentReplay}
                  </a>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={replayDraft}
                  onChange={(e) => setReplayDraft(e.target.value)}
                  className="flex-1 px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={saveReplayUrl}
                  disabled={
                    savingReplay || replayDraft === (match.replayUrl ?? '')
                  }
                  className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium disabled:opacity-50"
                >
                  {savingReplay ? t.saving : t.save}
                </button>
              </div>
              {replayMsg && (
                <p
                  className={`text-xs mt-2 ${
                    /erreur|error|invalide|invalid/.test(
                      replayMsg.toLowerCase()
                    )
                      ? 'text-red-300'
                      : 'text-emerald-300'
                  }`}
                >
                  {replayMsg}
                </p>
              )}
              <p className="text-xs text-neutral-500 mt-2">{t.replayHint}</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function TeamBanner({
  team,
  score,
  isWinner,
  side,
}: {
  team: Team | null;
  score: number | null;
  isWinner: boolean;
  side: 'left' | 'right';
}) {
  return (
    <div
      className={`bg-neutral-800/60 backdrop-blur border ${isWinner ? 'border-emerald-500/40' : 'border-neutral-700/50'} rounded-2xl p-4 flex items-center gap-4 ${side === 'right' ? 'flex-row-reverse text-right' : ''}`}
    >
      {team?.logoUrl ? (
        <Image
          src={team.logoUrl}
          alt={team.name}
          width={64}
          height={64}
          className="w-14 h-14 rounded-xl object-cover border border-neutral-700 flex-shrink-0"
        />
      ) : (
        <div className="w-14 h-14 rounded-xl bg-neutral-700/50 border border-neutral-700 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-lg font-bold text-white truncate">
          {team?.name || '—'}
        </div>
        <div className="text-xs text-neutral-500">
          {team?.shortName ? `[${team.shortName}]` : ''} {team?.country || ''}
        </div>
      </div>
      <div
        className={`text-4xl font-bold ${isWinner ? 'text-emerald-300' : 'text-neutral-300'}`}
      >
        {score ?? 0}
      </div>
    </div>
  );
}

function RosterColumn({ team }: { team: Team | null }) {
  const t = useT('castViewer');
  if (!team) return <div className="text-neutral-500 italic">—</div>;
  return (
    <div>
      <div className="text-xs font-semibold text-white mb-2 truncate">
        {team.name}
      </div>
      {team.members.length === 0 ? (
        <p className="text-xs text-neutral-500 italic">{t.noRoster}</p>
      ) : (
        <ul className="space-y-1">
          {team.members.map((m) => (
            <li
              key={m.id}
              className={`flex items-center gap-2 text-xs ${m.is_substitute ? 'opacity-60' : ''}`}
            >
              {m.is_captain && (
                <span className="text-amber-400 text-xs" title={t.captain}>
                  ★
                </span>
              )}
              {!m.is_captain && m.is_manager && (
                <span className="text-sky-400 text-xs" title={t.manager}>
                  ◆
                </span>
              )}
              <span
                className={`font-mono ${
                  m.is_captain
                    ? 'text-amber-200 font-semibold'
                    : m.is_manager
                      ? 'text-sky-200 font-semibold'
                      : 'text-neutral-200'
                }`}
              >
                {maskBattleTag(m.battle_tag) || `(${m.id.slice(0, 6)})`}
              </span>
              {m.is_substitute && (
                <span className="text-[9px] uppercase text-neutral-500 tracking-widest">
                  {t.sub}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VetoTimeline({
  flow,
  steps,
  team1Name,
  team2Name,
  team1Id,
  team2Id,
}: {
  flow: FlowStep[];
  steps: VetoStep[];
  team1Name: string;
  team2Name: string;
  team1Id: string | null;
  team2Id: string | null;
}) {
  const t = useT('castViewer');
  return (
    <ol className="space-y-1.5">
      {flow.map((f, idx) => {
        const step = steps[idx];
        const isDone = !!step;
        const isCurrent = !isDone && idx === steps.length;
        const sideName =
          f.side === 'team1'
            ? team1Name
            : f.side === 'team2'
              ? team2Name
              : t.auto;

        const actionColor =
          f.action === 'ban'
            ? 'text-red-400'
            : f.action === 'pick'
              ? 'text-emerald-400'
              : 'text-amber-300';

        const actionEmoji =
          f.action === 'ban' ? '✕' : f.action === 'pick' ? '✓' : '★';

        const stepTeamName =
          step?.team_id === team1Id
            ? team1Name
            : step?.team_id === team2Id
              ? team2Name
              : null;

        return (
          <li
            key={idx}
            className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${
              isCurrent
                ? 'bg-blue-900/30 border border-blue-500/40 animate-pulse'
                : isDone
                  ? ''
                  : 'opacity-40'
            }`}
          >
            <span className="w-5 text-neutral-500">{idx + 1}.</span>
            <span className={`w-5 ${actionColor} font-bold`}>
              {actionEmoji}
            </span>
            <span className="text-neutral-400 w-12 uppercase tracking-wider text-[10px]">
              {f.action}
            </span>
            <span className="text-neutral-300 w-16 truncate">
              {stepTeamName || sideName}
            </span>
            <span
              className={`flex-1 truncate font-medium ${isDone ? 'text-white' : 'text-neutral-600'}`}
            >
              {step?.map_name || '—'}
            </span>
            {step?.map_type && (
              <span className="text-[9px] text-neutral-500 uppercase tracking-widest">
                {step.map_type}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default CastPage;
