// pages/admin/stages/[stageId]/swiss.tsx

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { stageUrls } from '@/features/admin/stages/client';
import { useStageRead } from '@/features/admin/stages/hooks/useStage';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import StageTabsNav from '@/components/admin/stages/StageTabsNav';
import nsAdminStageSwiss from '@/lib/i18n/locales/admin-fr/adminStageSwiss';
import {
  SwissRoundBlock,
  type SwissRound,
  type TeamMini,
} from '@/features/admin/stages/ui/SwissRounds';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

const CARD =
  'overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';
const CARD_HEAD =
  'flex items-center justify-between border-b border-[var(--line2,rgba(194,196,201,.2))] px-4 py-3';
const CARD_TITLE = 'text-[15px] text-[var(--t1,#f4edf7)]';
const COUNT = 'font-mono text-xs text-[var(--t3,#a39ba6)]';
const MUTED = 'text-sm text-[var(--t3,#a39ba6)]';

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

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function AdminSwissStagePage(_props: StaffProps) {
  const t = useAdminT(nsAdminStageSwiss);
  const router = useRouter();
  const { stageId } = router.query;
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { mutate: mutateIdempotent } = useIdempotentMutation();

  const swissQuery = useStageRead<SwissApiResponse>(
    String(stageId ?? ''),
    'swiss',
    stageUrls.swiss
  );
  const loading = swissQuery.isFetching;
  const [actionError, setErrorMsg] = useState<string | null>(null);
  const errorMsg =
    actionError ??
    (swissQuery.error ? (swissQuery.error.message ?? t.errUnexpected) : null);
  const stage: StageMini | null = swissQuery.data?.stage ?? null;
  const tournament: TournamentMini | null = swissQuery.data?.tournament ?? null;
  const standings: SwissStanding[] = swissQuery.data?.standings || [];
  const rounds: SwissRound[] = swissQuery.data?.rounds || [];

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

  const fetchSwissData = () => {
    setErrorMsg(null);
    void swissQuery.refetch();
  };

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
        stageUrls.generateSwissRound(String(stageId)),
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
        stageUrls.generateSwissRound(String(stageId)),
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
    window.open(stageUrls.standingsCsv(String(stageId)), '_blank');
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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <StageTabsNav
          stageId={String(stageId ?? '')}
          active="swiss"
          stageType={stage?.stage_type}
          tournamentId={tournament?.id}
          tournamentName={tournament?.name}
        />
        <AdminPageHeader
          title={t.heading}
          subtitle={
            stage && (
              <>
                {t.phaseLabel}{' '}
                <span className="font-semibold text-[var(--t1,#f4edf7)]">
                  {stage.name}
                </span>
                {tournament && (
                  <>
                    {' '}
                    {t.tournamentLabel}{' '}
                    <Link
                      href={backTournamentUrl}
                      className="font-semibold text-[var(--t1,#f4edf7)] hover:underline"
                    >
                      {tournament.name}
                    </Link>
                  </>
                )}
                {!!rounds.length && (
                  <span className="ml-3 font-mono text-[13px] text-[var(--t3,#a39ba6)]">
                    {format(t.currentRound, { round: currentRoundNumber() })}
                  </span>
                )}
              </>
            )
          }
          badge={
            stage?.stage_type && <Chip tone="neutral">{stage.stage_type}</Chip>
          }
          actions={
            <>
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={fetchSwissData}
                disabled={loading || loadingGenerate}
              >
                {t.refreshData}
              </AdminButton>
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={handleExportCsv}
                disabled={!stageId || standings.length === 0}
              >
                {t.exportCsv}
              </AdminButton>
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={handlePreviewNextRound}
                disabled={loadingPreview || loadingGenerate}
              >
                {loadingPreview ? t.previewCalculating : t.previewNextRound}
              </AdminButton>
            </>
          }
        />

        {errorMsg && (
          <div className="mb-4 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]">
            {errorMsg}
          </div>
        )}
        <p className="mb-6 text-xs text-[var(--t3,#a39ba6)]">{t.toolbarHelp}</p>

        {/* Swiss round preview panel */}
        {preview && preview.length > 0 && (
          <section className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(180,103,209,.45)] bg-[var(--s1,#100812)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-[17px] text-[var(--t1,#f4edf7)]">
                  {format(t.previewTitle, { round: previewRound ?? '?' })}
                </h3>
                <p className="mt-0.5 font-mono text-xs text-[var(--t3,#a39ba6)]">
                  {format(
                    preview.length > 1
                      ? t.previewMatchCount_other
                      : t.previewMatchCount_one,
                    { count: preview.length }
                  )}
                  {previewHasRematches && (
                    <span className="ml-2 font-sans font-medium text-[var(--warn,#f5a524)]">
                      {t.previewHasRematches}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="mb-4 divide-y divide-[var(--line,rgba(194,196,201,.12))]">
              {preview.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-4 py-2.5 text-sm"
                >
                  <span className="w-8 text-center font-mono text-xs text-[var(--t4,#807984)]">
                    {idx + 1}
                  </span>
                  <span className="flex-1 font-medium">
                    {p.team1_name || p.team1_id.slice(0, 8)}
                  </span>
                  {p.is_bye ? (
                    <Chip tone="neutral">BYE</Chip>
                  ) : (
                    <>
                      <span className="text-xs text-[var(--t3,#a39ba6)]">
                        {t.vs}
                      </span>
                      <span className="flex-1 font-medium">
                        {p.team2_name || (p.team2_id ?? 'TBD').slice(0, 8)}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <AdminButton
                variant="primary"
                onClick={handleConfirmGenerate}
                disabled={loadingGenerate}
              >
                {loadingGenerate ? t.generating : t.confirmGenerate}
              </AdminButton>
              <AdminButton
                variant="ghost"
                onClick={() => {
                  setPreview(null);
                  setPreviewRound(null);
                }}
              >
                {t.cancel}
              </AdminButton>
            </div>
          </section>
        )}

        {loading && <div className={MUTED}>{t.loadingData}</div>}

        {!loading && !stage && !errorMsg && (
          <div className={MUTED}>{t.stageNotFound}</div>
        )}

        {!loading && stage && (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_2fr] xl:grid-cols-[1.3fr_2fr]">
            {/* Standings */}
            <section className={CARD}>
              <div className={CARD_HEAD}>
                <h2 className={CARD_TITLE}>{t.standingsTitle}</h2>
                <span className={COUNT}>
                  {format(
                    standings.length > 1 ? t.teamCount_other : t.teamCount_one,
                    { count: standings.length }
                  )}
                </span>
              </div>

              {standings.length === 0 ? (
                <div className={`px-4 py-6 ${MUTED}`}>{t.emptyStandings}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-[var(--s2,#1d1520)] font-[family-name:var(--fd)] text-[11px] uppercase tracking-[0.12em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
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
                    <tbody className="font-mono text-[var(--t2,#c7bfca)]">
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
                            className="border-t border-[var(--line,rgba(194,196,201,.12))]"
                          >
                            <td className="px-3 py-2 text-center font-mono font-semibold">
                              {s.rank}
                            </td>
                            <td className="px-3 py-2 font-sans">
                              <div className="flex items-center gap-2">
                                {s.team?.logo_url && (
                                  <Image
                                    src={s.team.logo_url}
                                    alt={display}
                                    width={24}
                                    height={24}
                                    className="h-6 w-6 rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] object-cover"
                                  />
                                )}
                                <div>
                                  <div className="font-semibold text-[var(--t1,#f4edf7)]">
                                    {display}
                                  </div>
                                  {s.team?.short_name && (
                                    <div className="text-[10px] text-[var(--t3,#a39ba6)]">
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
                                    ? 'text-[var(--lf,#7fca65)]'
                                    : diff < 0
                                      ? 'text-[var(--err,#ff6b6b)]'
                                      : 'text-[var(--t3,#a39ba6)]'
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
            <section className={CARD}>
              <div className={CARD_HEAD}>
                <h2 className={CARD_TITLE}>{t.roundsTitle}</h2>
                <span className={COUNT}>
                  {format(
                    rounds.length > 1 ? t.roundCount_other : t.roundCount_one,
                    { count: rounds.length }
                  )}
                </span>
              </div>

              {rounds.length === 0 ? (
                <div className={`px-4 py-6 ${MUTED}`}>{t.emptyRounds}</div>
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

export default withAdminQuery(AdminSwissStagePage);
