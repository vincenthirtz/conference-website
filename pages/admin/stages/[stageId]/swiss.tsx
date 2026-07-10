// pages/admin/stages/[stageId]/swiss.tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import StageTabsNav from '@/components/admin/stages/StageTabsNav';
import type { MatchStatus } from '@/types/admin';

type Dict = ReturnType<typeof useAdminT<'adminStageSwiss'>>;

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'other';

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type SwissStanding = {
  team_id: string;
  team: TeamMini | null;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  games_won: number;
  games_lost: number;
  games_drawn: number;
  buchholz: number | null;
  opp_score_sum: number | null;
  opp_winrate: number | null;
  match_count: number;
};

type SwissRoundMatch = {
  id: string;
  round_number: number;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  best_of: number | null;
  scheduled_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1: TeamMini | null;
  team2: TeamMini | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

type SwissRound = {
  round_number: number;
  matches: SwissRoundMatch[];
};

type StageMini = {
  id: string;
  name: string;
  stage_type: StageType | null;
};

type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

type SwissApiResponse = {
  stage: StageMini;
  tournament: TournamentMini | null;
  standings: SwissStanding[];
  rounds: SwissRound[];
};

export const getServerSideProps = withStaffPage('manager');

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(status: MatchStatus, t: Dict) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
      return t.statusFinished;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

function statusColor(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'bg-neutral-700 text-neutral-100';
    case 'ongoing':
      return 'bg-amber-600/80 text-neutral-900';
    case 'finished':
      return 'bg-emerald-600/80 text-white';
    case 'cancelled':
      return 'bg-red-700/80 text-white';
    default:
      return 'bg-neutral-700 text-neutral-100';
  }
}

function AdminSwissStagePage({ staff }: StaffProps) {
  const t = useAdminT('adminStageSwiss');
  const router = useRouter();
  const { stageId } = router.query;
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { mutate: mutateIdempotent } = useIdempotentMutation();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [stage, setStage] = useState<StageMini | null>(null);
  const [tournament, setTournament] = useState<TournamentMini | null>(null);
  const [standings, setStandings] = useState<SwissStanding[]>([]);
  const [rounds, setRounds] = useState<SwissRound[]>([]);

  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Swiss round preview
  type PreviewPairing = {
    team1_id: string;
    team1_name: string | null;
    team2_id: string | null;
    team2_name: string | null;
    is_bye: boolean;
  };
  const [preview, setPreview] = useState<PreviewPairing[] | null>(null);
  const [previewRound, setPreviewRound] = useState<number | null>(null);
  const [previewHasRematches, setPreviewHasRematches] = useState(false);

  useEffect(() => {
    if (!stageId) return;
    fetchSwissData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId]);

  async function fetchSwissData() {
    if (!stageId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      // Endpoint Swiss global (standings + rounds)
      // Adapte si tu as choisi un autre nom : /swiss, /standings, etc.
      const json = await adminFetchJson<SwissApiResponse>(
        `/api/admin/stages/${stageId}/swiss`
      );
      setStage(json.stage);
      setTournament(json.tournament ?? null);
      setStandings(json.standings || []);
      setRounds(json.rounds || []);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setLoading(false);
    }
  }

  function currentRoundNumber() {
    if (!rounds.length) return 0;
    return Math.max(...rounds.map((r) => r.round_number));
  }

  async function handlePreviewNextRound() {
    if (!stageId) return;
    setLoadingPreview(true);
    setErrorMsg(null);
    setPreview(null);

    try {
      const res = await mutateIdempotent(
        `/api/admin/stages/${stageId}/generate-swiss-round`,
        {
          method: 'POST',
          body: JSON.stringify({ dryRun: true }),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errPreview);
      }

      const json = await res.json();
      setPreview(json.preview || []);
      setPreviewRound(json.roundNumber ?? null);
      setPreviewHasRematches(json.hasRematches ?? false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errPreviewShort);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleConfirmGenerate() {
    if (!stageId) return;

    // Si l'apercu signale des rematches, demander une confirmation explicite
    // avant d'envoyer la requete de generation. Le back exigera acceptRematches=true.
    if (previewHasRematches) {
      const ok = await confirm({
        title: t.confirmRematchTitle,
        subtitle: t.confirmRematchSubtitle,
        variant: 'warning',
        confirmLabel: t.confirmRematchLabel,
      });
      if (!ok) return;
    }

    setLoadingGenerate(true);
    setErrorMsg(null);

    try {
      const res = await mutateIdempotent(
        `/api/admin/stages/${stageId}/generate-swiss-round`,
        {
          method: 'POST',
          body: JSON.stringify({
            acceptRematches: previewHasRematches || undefined,
          }),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errGenerate);
      }

      const json = await res.json();
      const roundNumber = json.roundNumber ?? '?';
      const createdCount = json.createdMatches?.length ?? 0;

      addToast(
        format(t.toastGenerated, {
          round: roundNumber,
          count: createdCount,
        }),
        'info'
      );
      setPreview(null);
      setPreviewRound(null);
      fetchSwissData();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errGenerateShort);
    } finally {
      setLoadingGenerate(false);
    }
  }

  function handleExportCsv() {
    if (!stageId) return;
    window.open(`/api/admin/stages/${stageId}/standings?export=csv`, '_blank');
  }

  const backTournamentUrl = tournament?.id
    ? `/admin/tournament/${tournament.id}`
    : '/admin/tournaments';

  return (
    <>
      {confirmDialog}
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <StageTabsNav
          stageId={String(stageId ?? '')}
          active="swiss"
          stageType={stage?.stage_type}
          tournamentId={tournament?.id}
          tournamentName={tournament?.name}
        />
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t.heading}</h1>

            {stage && (
              <p className="text-neutral-400 text-sm mt-1">
                {t.phaseLabel}{' '}
                <span className="font-semibold">{stage.name}</span>
                {stage.stage_type && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 rounded">
                    {stage.stage_type}
                  </span>
                )}
                {tournament && (
                  <>
                    {' '}
                    {t.tournamentLabel}{' '}
                    <Link
                      href={backTournamentUrl}
                      className="font-semibold hover:underline"
                    >
                      {tournament.name}
                    </Link>
                  </>
                )}
              </p>
            )}
            {!!rounds.length && (
              <p className="text-xs text-neutral-500 mt-1">
                {format(t.currentRound, { round: currentRoundNumber() })}
              </p>
            )}
          </div>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center mb-6">
          <button
            type="button"
            onClick={fetchSwissData}
            disabled={loading || loadingGenerate}
            className={`px-4 py-2 rounded text-sm border border-neutral-600 ${
              loading
                ? 'bg-neutral-800 cursor-wait'
                : 'bg-neutral-800 hover:bg-neutral-700'
            }`}
          >
            {t.refreshData}
          </button>

          <button
            type="button"
            onClick={handlePreviewNextRound}
            disabled={loadingPreview || loadingGenerate}
            className={`px-4 py-2 rounded text-sm font-semibold ${
              loadingPreview
                ? 'bg-blue-800 cursor-wait'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loadingPreview ? t.previewCalculating : t.previewNextRound}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!stageId || standings.length === 0}
            className="px-4 py-2 rounded text-sm border border-neutral-600 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t.exportCsv}
          </button>

          <p className="text-xs text-neutral-500">{t.toolbarHelp}</p>
        </div>

        {/* Swiss round preview panel */}
        {preview && preview.length > 0 && (
          <section className="bg-neutral-800/80 border border-blue-500/40 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">
                  {format(t.previewTitle, { round: previewRound ?? '?' })}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {format(
                    preview.length > 1
                      ? t.previewMatchCount_other
                      : t.previewMatchCount_one,
                    { count: preview.length }
                  )}
                  {previewHasRematches && (
                    <span className="ml-2 text-amber-400 font-medium">
                      {t.previewHasRematches}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="divide-y divide-neutral-700/50 mb-4">
              {preview.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-4 py-2.5 text-sm"
                >
                  <span className="w-8 text-center text-neutral-500 text-xs font-mono">
                    {idx + 1}
                  </span>
                  <span className="flex-1 font-medium">
                    {p.team1_name || p.team1_id.slice(0, 8)}
                  </span>
                  {p.is_bye ? (
                    <span className="px-2 py-0.5 rounded bg-neutral-700 text-xs text-neutral-400">
                      BYE
                    </span>
                  ) : (
                    <>
                      <span className="text-neutral-500 text-xs">{t.vs}</span>
                      <span className="flex-1 font-medium">
                        {p.team2_name || (p.team2_id ?? 'TBD').slice(0, 8)}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirmGenerate}
                disabled={loadingGenerate}
                className={`px-4 py-2 rounded text-sm font-semibold ${
                  loadingGenerate
                    ? 'bg-emerald-800 cursor-wait'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {loadingGenerate ? t.generating : t.confirmGenerate}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setPreviewRound(null);
                }}
                className="px-4 py-2 rounded text-sm bg-neutral-700 hover:bg-neutral-600"
              >
                {t.cancel}
              </button>
            </div>
          </section>
        )}

        {loading && <div className="text-neutral-300">{t.loadingData}</div>}

        {!loading && !stage && !errorMsg && (
          <div className="text-neutral-300">{t.stageNotFound}</div>
        )}

        {!loading && stage && (
          <div className="grid gap-6 pt-20 lg:grid-cols-[1.5fr,2fr] xl:grid-cols-[1.3fr,2fr]">
            {/* Standings */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
                <h2 className="text-sm font-semibold">{t.standingsTitle}</h2>
                <span className="text-xs text-neutral-400">
                  {format(
                    standings.length > 1 ? t.teamCount_other : t.teamCount_one,
                    { count: standings.length }
                  )}
                </span>
              </div>

              {standings.length === 0 ? (
                <div className="px-4 py-6 text-sm text-neutral-400">
                  {t.emptyStandings}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-neutral-750 text-neutral-300">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left">
                          #
                        </th>
                        <th scope="col" className="px-3 py-2 text-left">
                          {t.thTeam}
                        </th>
                        <th scope="col" className="px-3 py-2 text-center">
                          {t.thWins}
                        </th>
                        <th scope="col" className="px-3 py-2 text-center">
                          {t.thLosses}
                        </th>
                        <th scope="col" className="px-3 py-2 text-center">
                          {t.thDraws}
                        </th>
                        <th scope="col" className="px-3 py-2 text-center">
                          {t.thPoints}
                        </th>
                        <th scope="col" className="px-3 py-2 text-center">
                          {t.thMaps}
                        </th>
                        <th scope="col" className="px-3 py-2 text-center">
                          {t.thBuchholz}
                        </th>
                        <th scope="col" className="px-3 py-2 text-center">
                          {t.thOppWinrate}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((s) => {
                        const display = s.team?.name || s.team_id;
                        const diff = (s.games_won ?? 0) - (s.games_lost ?? 0);
                        const wr =
                          s.opp_winrate != null
                            ? `${(s.opp_winrate * 100).toFixed(1)}%`
                            : '—';

                        return (
                          <tr
                            key={s.team_id}
                            className="border-t border-neutral-700"
                          >
                            <td className="px-3 py-2 text-center font-semibold">
                              {s.rank}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {s.team?.logo_url && (
                                  <Image
                                    src={s.team.logo_url}
                                    alt={display}
                                    width={24}
                                    height={24}
                                    className="w-6 h-6 rounded object-cover border border-neutral-700"
                                  />
                                )}
                                <div>
                                  <div className="font-semibold text-neutral-50">
                                    {display}
                                  </div>
                                  {s.team?.short_name && (
                                    <div className="text-[10px] text-neutral-400">
                                      {s.team.short_name}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">{s.wins}</td>
                            <td className="px-3 py-2 text-center">
                              {s.losses}
                            </td>
                            <td className="px-3 py-2 text-center">{s.draws}</td>
                            <td className="px-3 py-2 text-center font-semibold">
                              {s.points}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {s.games_won} / {s.games_lost}{' '}
                              <span
                                className={
                                  diff > 0
                                    ? 'text-emerald-300'
                                    : diff < 0
                                      ? 'text-red-300'
                                      : 'text-neutral-300'
                                }
                              >
                                ({diff > 0 ? '+' : ''}
                                {diff})
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {s.buchholz != null ? s.buchholz.toFixed(1) : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">{wr}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Rounds & matches */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
                <h2 className="text-sm font-semibold">{t.roundsTitle}</h2>
                <span className="text-xs text-neutral-400">
                  {format(
                    rounds.length > 1 ? t.roundCount_other : t.roundCount_one,
                    { count: rounds.length }
                  )}
                </span>
              </div>

              {rounds.length === 0 ? (
                <div className="px-4 py-6 text-sm text-neutral-400">
                  {t.emptyRounds}
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto">
                  {rounds
                    .slice()
                    .sort((a, b) => a.round_number - b.round_number)
                    .map((round) => (
                      <SwissRoundBlock key={round.round_number} round={round} />
                    ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}

type RoundBlockProps = {
  round: SwissRound;
};

function SwissRoundBlock({ round }: RoundBlockProps) {
  const t = useAdminT('adminStageSwiss');
  return (
    <div className="border-b border-neutral-700 last:border-b-0">
      <div className="px-4 py-2 bg-neutral-825 flex justify-between items-center">
        <div className="text-sm font-semibold">
          {format(t.roundTitle, { round: round.round_number })}
        </div>
        <div className="text-xs text-neutral-400">
          {format(
            round.matches.length > 1 ? t.matchCount_other : t.matchCount_one,
            { count: round.matches.length }
          )}
        </div>
      </div>
      <div className="divide-y divide-neutral-800">
        {round.matches.map((m) => (
          <SwissMatchRow key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}

type SwissMatchRowProps = {
  match: SwissRoundMatch;
};

function SwissMatchRow({ match }: SwissMatchRowProps) {
  const t = useAdminT('adminStageSwiss');
  const label1 = match.team1?.name || match.team1_id || 'TBD';
  const label2 = match.team2?.name || match.team2_id || 'TBD';

  const scoreStr =
    match.status === 'finished' || match.status === 'ongoing'
      ? `${match.team1_score ?? 0} - ${match.team2_score ?? 0}`
      : '—';

  const isBo = match.best_of ? `BO${match.best_of}` : '';

  return (
    <div className="px-4 py-2 text-xs flex flex-col md:flex-row md:items-center md:justify-between gap-2">
      <div className="flex items-center gap-3">
        <div className="hidden md:block text-[11px] text-neutral-500 font-mono">
          #{match.id.slice(0, 6)}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {match.team1?.logo_url && (
              <Image
                src={match.team1.logo_url}
                alt={label1}
                width={20}
                height={20}
                className="w-5 h-5 rounded object-cover border border-neutral-700"
              />
            )}
            <span className="font-semibold text-neutral-50">{label1}</span>
            <span className="text-neutral-400">{t.vs}</span>
            {match.team2?.logo_url && (
              <Image
                src={match.team2.logo_url}
                alt={label2}
                width={20}
                height={20}
                className="w-5 h-5 rounded object-cover border border-neutral-700"
              />
            )}
            <span className="font-semibold text-neutral-50">{label2}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-neutral-500">
            <span>
              {isBo && <>{isBo} • </>}
              {t.scorePrefix}{' '}
              <span className="text-neutral-200">{scoreStr}</span>
            </span>
            <span>|</span>
            <span>{formatDateTime(match.scheduled_at)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:justify-end">
        <span
          className={`px-2 py-1 rounded-full text-[10px] font-semibold ${statusColor(
            match.status
          )}`}
        >
          {statusLabel(match.status, t)}
        </span>
        <Link
          href={`/admin/matches/${match.id}`}
          className="px-2 py-1 rounded bg-neutral-750 hover:bg-neutral-700 text-[11px]"
        >
          {t.openAdmin}
        </Link>
        <Link
          href={`/match/${match.id}`}
          target="_blank"
          className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-[11px]"
        >
          {t.publicLink}
        </Link>
      </div>
    </div>
  );
}

export default AdminSwissStagePage;
