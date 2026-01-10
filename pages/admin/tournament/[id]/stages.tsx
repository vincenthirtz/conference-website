// pages/admin/tournament/[id]/stages.tsx
// Liste des phases (stages) d'un tournoi pour le staff

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

type StaffProps = { staff: StaffShape };

type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'other';

type StageSummary = {
  id: string;
  name: string;
  stage_type: StageType | null;
  order_index: number | null;
  is_active?: boolean | null;
  is_public?: boolean | null;
  start_date?: string | null;
  end_at?: string | null;
};

type MatchesApiResponse = {
  tournament: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
  stages: StageSummary[];
};

export const getServerSideProps = withStaffPage('manager');

function typeLabel(t: StageType | null) {
  switch (t) {
    case 'group':
      return 'Poule';
    case 'bracket':
      return 'Bracket';
    case 'swiss':
      return 'Swiss';
    case 'round_robin':
      return 'Round robin';
    case 'showmatch':
      return 'Showmatch';
    default:
      return 'Autre';
  }
}

function StagesPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [tournamentName, setTournamentName] = useState<string>('Tournoi');

  useEffect(() => {
    if (!tournamentId) return;
    fetchStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  async function fetchStages() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Fetch stages
      const stagesRes = await fetch(`/api/admin/tournament/${tournamentId}/stages`);
      if (!stagesRes.ok) {
        const json = await stagesRes.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les phases');
      }
      const stagesJson = await stagesRes.json();
      setStages(stagesJson.stages || []);

      // Fetch tournament name
      const tournamentRes = await fetch(`/api/admin/tournament/${tournamentId}`);
      if (tournamentRes.ok) {
        const tournamentJson = await tournamentRes.json();
        setTournamentName(tournamentJson.tournament?.name || tournamentId || 'Tournoi');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin · Phases du tournoi</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                Admin · Phases
              </p>
              <h1 className="text-2xl font-semibold">
                {tournamentName} · Phases
              </h1>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/tournament/${tournamentId}/matches`}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
              >
                Voir les matchs
              </Link>
              <button
                onClick={() => fetchStages()}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10"
              >
                Rafraîchir
              </button>
            </div>
          </div>

          {loading && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              Chargement…
            </div>
          )}

          {errorMsg && !loading && (
            <div className="p-4 rounded-lg bg-red-900/60 border border-red-500/40 text-red-100">
              {errorMsg}
            </div>
          )}

          {!loading && !errorMsg && stages.length === 0 && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              Aucune phase pour ce tournoi.
            </div>
          )}

          {stages.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stages
                .slice()
                .sort(
                  (a, b) =>
                    (a.order_index ?? 0) - (b.order_index ?? 0) ||
                    a.name.localeCompare(b.name)
                )
                .map((stage) => (
                  <div
                    key={stage.id}
                    className="p-4 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm font-semibold">{stage.name}</p>
                        <p className="text-xs text-gray-400">
                          {typeLabel(stage.stage_type)} · Ordre{' '}
                          {stage.order_index ?? '—'}
                        </p>
                      </div>
                      <Link
                        href={`/admin/stages/${stage.id}`}
                        className="text-sm px-3 py-1 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15"
                      >
                        Ouvrir
                      </Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                      <span
                        className={`px-2 py-0.5 rounded-full border ${
                          stage.is_active ? 'border-emerald-400/50 text-emerald-200' : 'border-gray-500/40 text-gray-300'
                        }`}
                      >
                        {stage.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full border ${
                          stage.is_public ? 'border-blue-300/50 text-blue-200' : 'border-gray-500/40 text-gray-300'
                        }`}
                      >
                        {stage.is_public ? 'Publique' : 'Privée'}
                      </span>
                      {stage.start_date && (
                        <span className="px-2 py-0.5 rounded-full border border-white/10 text-gray-200">
                          Débute : {new Date(stage.start_date).toLocaleString()}
                        </span>
                      )}
                      {stage.end_at && (
                        <span className="px-2 py-0.5 rounded-full border border-white/10 text-gray-200">
                          Fin : {new Date(stage.end_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default StagesPage;
