// pages/admin/stages/[stageId]/swiss.tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { MatchStatus } from '@/types/admin';

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

function statusLabel(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'À venir';
    case 'ongoing':
      return 'En cours';
    case 'finished':
      return 'Terminé';
    case 'cancelled':
      return 'Annulé';
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
  const router = useRouter();
  const { stageId } = router.query;
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

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
      const res = await fetch(`/api/admin/stages/${stageId}/swiss`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || 'Impossible de charger les données Swiss'
        );
      }

      const json: SwissApiResponse = await res.json();
      setStage(json.stage);
      setTournament(json.tournament ?? null);
      setStandings(json.standings || []);
      setRounds(json.rounds || []);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
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
      const res = await fetch(
        `/api/admin/stages/${stageId}/generate-swiss-round`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun: true }),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || "Erreur lors de l'apercu des pairings Swiss"
        );
      }

      const json = await res.json();
      setPreview(json.preview || []);
      setPreviewRound(json.roundNumber ?? null);
      setPreviewHasRematches(json.hasRematches ?? false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? "Erreur lors de l'apercu");
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
        title: 'Cet appariement contient des rematches',
        subtitle:
          'Deux equipes vont se rejouer (le solveur n a pas trouve mieux). Confirmer la generation ?',
        variant: 'warning',
        confirmLabel: 'Generer quand meme',
      });
      if (!ok) return;
    }

    setLoadingGenerate(true);
    setErrorMsg(null);

    try {
      const res = await fetch(
        `/api/admin/stages/${stageId}/generate-swiss-round`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            acceptRematches: previewHasRematches || undefined,
          }),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || 'Erreur lors de la generation de la ronde Swiss'
        );
      }

      const json = await res.json();
      const roundNumber = json.roundNumber ?? '?';
      const createdCount = json.createdMatches?.length ?? 0;

      addToast(
        `Ronde Swiss #${roundNumber} generee : ${createdCount} matchs crees.`,
        'info'
      );
      setPreview(null);
      setPreviewRound(null);
      fetchSwissData();
    } catch (err: unknown) {
      setErrorMsg(
        (err as Error)?.message ?? 'Erreur lors de la generation de la ronde'
      );
    } finally {
      setLoadingGenerate(false);
    }
  }

  function handleExportCsv() {
    if (!stageId) return;
    window.open(`/api/admin/stages/${stageId}/standings?export=csv`, '_blank');
  }

  const backStageUrl = `/admin/stages/${stageId}`;
  const backTournamentUrl = tournament?.id
    ? `/admin/tournament/${tournament.id}`
    : '/admin/tournaments';

  return (
    <>
      {confirmDialog}
      <Head>
        <title>Admin – Swiss stage</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(backStageUrl)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour à la phase
            </button>
            <h1 className="text-3xl font-bold">Gestion Swiss</h1>

            {stage && (
              <p className="text-neutral-400 text-sm mt-1">
                Phase : <span className="font-semibold">{stage.name}</span>
                {stage.stage_type && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 rounded">
                    {stage.stage_type}
                  </span>
                )}
                {tournament && (
                  <>
                    {' '}
                    • Tournoi{' '}
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
                Ronde actuelle : {currentRoundNumber()}
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
            Rafraichir les donnees
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
            {loadingPreview
              ? 'Calcul en cours…'
              : 'Apercu de la prochaine ronde'}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!stageId || standings.length === 0}
            className="px-4 py-2 rounded text-sm border border-neutral-600 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Exporter CSV
          </button>

          <p className="text-xs text-neutral-500">
            La generation utilise le systeme de pairing Swiss (victoires,
            Buchholz, etc.) et evite les rematches autant que possible.
          </p>
        </div>

        {/* Swiss round preview panel */}
        {preview && preview.length > 0 && (
          <section className="bg-neutral-800/80 border border-blue-500/40 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">
                  Apercu — Ronde #{previewRound ?? '?'}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {preview.length} match{preview.length > 1 ? 'es' : ''}{' '}
                  proposes
                  {previewHasRematches && (
                    <span className="ml-2 text-amber-400 font-medium">
                      (contient des rematches)
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
                      <span className="text-neutral-500 text-xs">vs</span>
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
                {loadingGenerate
                  ? 'Generation en cours…'
                  : 'Confirmer et generer'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setPreviewRound(null);
                }}
                className="px-4 py-2 rounded text-sm bg-neutral-700 hover:bg-neutral-600"
              >
                Annuler
              </button>
            </div>
          </section>
        )}

        {loading && (
          <div className="text-neutral-300">Chargement des donnees Swiss…</div>
        )}

        {!loading && !stage && !errorMsg && (
          <div className="text-neutral-300">Phase introuvable.</div>
        )}

        {!loading && stage && (
          <div className="grid gap-6 pt-20 lg:grid-cols-[1.5fr,2fr] xl:grid-cols-[1.3fr,2fr]">
            {/* Standings */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
                <h2 className="text-sm font-semibold">
                  Classement Swiss (standings)
                </h2>
                <span className="text-xs text-neutral-400">
                  {standings.length} équipe
                  {standings.length > 1 ? 's' : ''}
                </span>
              </div>

              {standings.length === 0 ? (
                <div className="px-4 py-6 text-sm text-neutral-400">
                  Aucun classement disponible. Assure-toi que des équipes sont
                  rattachées à la phase et que des rondes ont été jouées.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-neutral-750 text-neutral-300">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Équipe</th>
                        <th className="px-3 py-2 text-center">V</th>
                        <th className="px-3 py-2 text-center">D</th>
                        <th className="px-3 py-2 text-center">N</th>
                        <th className="px-3 py-2 text-center">Pts</th>
                        <th className="px-3 py-2 text-center">Maps +/−</th>
                        <th className="px-3 py-2 text-center">Buchholz</th>
                        <th className="px-3 py-2 text-center">Winrate adv.</th>
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
                <h2 className="text-sm font-semibold">
                  Rondes Swiss & matches
                </h2>
                <span className="text-xs text-neutral-400">
                  {rounds.length} ronde
                  {rounds.length > 1 ? 's' : ''}
                </span>
              </div>

              {rounds.length === 0 ? (
                <div className="px-4 py-6 text-sm text-neutral-400">
                  Aucune ronde n&apos;est encore générée. Utilise le bouton
                  &quot;Générer la prochaine ronde Swiss&quot; pour créer la
                  ronde #1.
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
  return (
    <div className="border-b border-neutral-700 last:border-b-0">
      <div className="px-4 py-2 bg-neutral-825 flex justify-between items-center">
        <div className="text-sm font-semibold">
          Ronde Swiss #{round.round_number}
        </div>
        <div className="text-xs text-neutral-400">
          {round.matches.length} match
          {round.matches.length > 1 ? 'es' : ''}
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
            <span className="text-neutral-400">vs</span>
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
              Score : <span className="text-neutral-200">{scoreStr}</span>
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
          {statusLabel(match.status)}
        </span>
        <Link
          href={`/admin/matches/${match.id}`}
          className="px-2 py-1 rounded bg-neutral-750 hover:bg-neutral-700 text-[11px]"
        >
          Ouvrir (admin)
        </Link>
        <Link
          href={`/match/${match.id}`}
          target="_blank"
          className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-[11px]"
        >
          Public
        </Link>
      </div>
    </div>
  );
}

export default AdminSwissStagePage;
