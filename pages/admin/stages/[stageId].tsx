// pages/admin/stages/[stageId].tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';

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

type Stage = {
  id: string;
  tournament_id: string;
  name: string;
  slug: string | null;
  stage_type: StageType | null;
  order_index: number | null;
  is_active: boolean;
  is_public: boolean;
  start_date: string | null;
  end_at: string | null;
  settings: any | null;
  created_at: string;
  updated_at: string | null;
};

type StageApiResponse = {
  stage: Stage;
};

type Tournament = {
  id: string;
  name: string;
  slug: string | null;
};

type TournamentApiResponse = {
  tournament: Tournament;
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

function stageTypeLabel(type: StageType | null) {
  switch (type) {
    case 'group':
      return 'Groupes';
    case 'bracket':
      return 'Bracket';
    case 'swiss':
      return 'Swiss';
    case 'round_robin':
      return 'Round Robin';
    case 'showmatch':
      return 'Showmatch';
    case 'other':
      return 'Autre';
    default:
      return 'Non défini';
  }
}

function AdminStagePage({ staff }: StaffProps) {
  const router = useRouter();
  const { stageId } = router.query;

  const [stage, setStage] = useState<Stage | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingActions, setLoadingActions] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!stageId) return;
    fetchStage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId]);

  async function fetchStage() {
    if (!stageId) return;
    setLoading(true);
    setErrorMsg(null);
    setActionMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger la phase');
      }
      const json: StageApiResponse = await res.json();
      const s = json.stage;
      setStage(s);

      // Charger le tournoi parent
      if (s.tournament_id) {
        try {
          const res2 = await fetch(`/api/admin/tournament/${s.tournament_id}`);
          if (res2.ok) {
            const json2: TournamentApiResponse = await res2.json();
            setTournament(json2.tournament);
          }
        } catch (e) {
          // non bloquant
          console.error('fetch parent tournament error', e);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoByes() {
    if (!stageId) return;
    setLoadingActions(true);
    setActionMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/auto-byes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // utilise les valeurs par défaut de l'API
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors de l'application des BYE");
      }

      const json = await res.json();
      setActionMsg(
        `Auto-BYEs appliqués : ${json.updatedMatchIds?.length ?? 0} matchs mis à jour.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur lors de l'auto-BYE");
    } finally {
      setLoadingActions(false);
    }
  }

  async function handleGenerateSwissRound() {
    if (!stageId || stage?.stage_type !== 'swiss') return;
    setLoadingActions(true);
    setActionMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch(
        `/api/admin/stages/${stageId}/generate-swiss-round`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}), // roundNumber sera nextRound auto
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || 'Erreur lors de la génération de la ronde Swiss'
        );
      }

      const json = await res.json();
      setActionMsg(
        `Nouvelle ronde Swiss #${json.roundNumber} générée : ${json.createdMatches?.length ?? 0} matchs.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur lors de la génération Swiss');
    } finally {
      setLoadingActions(false);
    }
  }

  const tournamentDashboardUrl = tournament
    ? `/admin/tournament/${tournament.id}`
    : stage
      ? `/admin/tournament/${stage.tournament_id}`
      : '/admin/tournaments';

  const matchesUrl =
    stage && stage.tournament_id
      ? `/admin/tournament/${stage.tournament_id}/matches?stageId=${stage.id}`
      : null;

  return (
    <>
      <Head>
        <title>Admin – Phase du tournoi</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(tournamentDashboardUrl)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour au tournoi
            </button>
            <h1 className="text-3xl font-bold">Phase du tournoi</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Overview et actions rapides pour cette phase (stage).
            </p>
          </div>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {actionMsg && (
          <div className="mb-4 rounded bg-emerald-900/60 border border-emerald-600 px-4 py-3 text-sm">
            {actionMsg}
          </div>
        )}

        {loading && !stage && (
          <div className="text-neutral-300">Chargement de la phase…</div>
        )}

        {!loading && !stage && !errorMsg && (
          <div className="text-neutral-300">Phase introuvable.</div>
        )}

        {stage && (
          <div className="space-y-6">
            {/* Top layout : infos stage + actions */}
            <div className="grid gap-6 pt-20 md:grid-cols-[2fr,1fr]">
              {/* Infos phase */}
              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{stage.name}</h2>
                    {stage.slug && (
                      <p className="text-xs text-neutral-400 mt-1">
                        Slug :{' '}
                        <span className="font-mono bg-neutral-900 border border-neutral-700 px-2 py-0.5 rounded">
                          {stage.slug}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full font-semibold ${
                        stage.is_active
                          ? 'bg-emerald-600/80 text-white'
                          : 'bg-neutral-700 text-neutral-200'
                      }`}
                    >
                      {stage.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full ${
                        stage.is_public
                          ? 'bg-blue-600/80 text-white'
                          : 'bg-neutral-800 text-neutral-300 border border-neutral-600'
                      }`}
                    >
                      {stage.is_public
                        ? 'Visible publiquement'
                        : 'Non publique'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {tournament && (
                    <div>
                      <div className="text-neutral-400">Tournoi</div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={tournamentDashboardUrl}
                          className="font-semibold hover:underline"
                        >
                          {tournament.name}
                        </Link>
                        {tournament.slug && (
                          <span className="text-xs font-mono bg-neutral-900 border border-neutral-700 px-2 py-0.5 rounded">
                            {tournament.slug}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-neutral-400">Type</div>
                    <div className="font-medium">
                      {stageTypeLabel(stage.stage_type)}
                    </div>
                  </div>

                  <div>
                    <div className="text-neutral-400">
                      Ordre dans le tournoi
                    </div>
                    <div className="font-medium">
                      {stage.order_index ?? 'Non défini'}
                    </div>
                  </div>

                  <div>
                    <div className="text-neutral-400">Début de la phase</div>
                    <div className="font-medium">
                      {formatDateTime(stage.start_date)}
                    </div>
                  </div>

                  <div>
                    <div className="text-neutral-400">Fin de la phase</div>
                    <div className="font-medium">
                      {formatDateTime(stage.end_at)}
                    </div>
                  </div>

                  <div>
                    <div className="text-neutral-400">Créée le</div>
                    <div className="font-medium">
                      {formatDateTime(stage.created_at)}
                    </div>
                  </div>
                </div>
              </section>

              {/* Actions rapides */}
              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
                <h2 className="text-lg font-semibold">Actions rapides</h2>

                <div className="flex flex-col gap-2 text-sm">
                  {matchesUrl && (
                    <Link
                      href={matchesUrl}
                      className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 flex justify-between items-center"
                    >
                      <span>Voir les matchs de cette phase</span>
                      <span className="text-xs text-neutral-300">
                        filtre stage_id={stage.id}
                      </span>
                    </Link>
                  )}

                  <Link
                    href={`/admin/tournament/${stage.tournament_id}/history?entityType=stage`}
                    className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 flex justify-between items-center"
                  >
                    <span>Journal staff du tournoi (filtrer sur stages)</span>
                    <span className="text-xs text-neutral-300">
                      logs stage / matches liés
                    </span>
                  </Link>
                </div>

                <div className="pt-3 border-t border-neutral-700 mt-3 space-y-2">
                  <h3 className="text-sm font-semibold">Outils automatiques</h3>

                  <button
                    type="button"
                    onClick={handleAutoByes}
                    disabled={loadingActions}
                    className={`w-full px-3 py-2 rounded text-sm font-semibold ${
                      loadingActions
                        ? 'bg-neutral-700 cursor-wait'
                        : 'bg-neutral-700 hover:bg-neutral-600'
                    }`}
                  >
                    {loadingActions
                      ? 'Traitement des BYE…'
                      : 'Détecter et valider les matches BYE'}
                  </button>

                  {stage.stage_type === 'swiss' && (
                    <button
                      type="button"
                      onClick={handleGenerateSwissRound}
                      disabled={loadingActions}
                      className={`w-full px-3 py-2 rounded text-sm font-semibold ${
                        loadingActions
                          ? 'bg-blue-800 cursor-wait'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {loadingActions
                        ? 'Génération Swiss…'
                        : 'Générer la prochaine ronde Swiss'}
                    </button>
                  )}
                </div>
              </section>
            </div>

            {/* Settings / debug */}
            <div className="grid gap-6 pt-20 lg:grid-cols-[2fr,1.5fr]">
              {/* Settings JSON */}
              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
                <h2 className="text-lg font-semibold">
                  Configuration de la phase (settings)
                </h2>
                <p className="text-xs text-neutral-400">
                  Ce JSON contient la configuration avancée de la phase (ex:
                  format Swiss, options de bracket, etc.). Modifiable via
                  l&apos;API ou un écran dédié.
                </p>
                <pre className="mt-2 bg-neutral-900 border border-neutral-800 rounded p-3 text-[11px] overflow-x-auto text-neutral-200">
                  {JSON.stringify(stage.settings ?? {}, null, 2)}
                </pre>
              </section>

              {/* Meta / debug */}
              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
                <h2 className="text-lg font-semibold">Meta & debug</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">ID du stage</span>
                    <span className="font-mono text-xs bg-neutral-900 px-2 py-1 rounded border border-neutral-700">
                      {stage.id}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">ID du tournoi</span>
                    <span className="font-mono text-xs bg-neutral-900 px-2 py-1 rounded border border-neutral-700">
                      {stage.tournament_id}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">
                      Dernière mise à jour
                    </span>
                    <span className="text-neutral-200">
                      {formatDateTime(stage.updated_at || stage.created_at)}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                  API liée :{' '}
                  <code className="font-mono bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-700">
                    /api/admin/stages/{stage.id}
                  </code>{' '}
                  (GET / PUT / DELETE).
                </p>
              </section>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default AdminStagePage;
