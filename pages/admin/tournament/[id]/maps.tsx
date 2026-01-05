// pages/admin/tournament/[id]/maps.tsx
// Gestion (lecture) du pool de maps d'un tournoi

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

type TournamentMini = {
  id: string;
  name: string | null;
  slug: string | null;
};

type TournamentMapRow = {
  id: string;
  tournament_id: string;
  map_name: string;
  map_slug: string | null;
  map_type: string | null;
  enabled: boolean;
  order_index: number | null;
  created_at?: string;
};

type ApiResponse = {
  maps: TournamentMapRow[];
  tournament?: TournamentMini | null;
};

const TYPE_LABEL: Record<string, string> = {
  control: 'Contrôle',
  hybrid: 'Hybride',
  escort: 'Convoi',
  push: 'Push',
};

function typeLabel(t: string | null | undefined) {
  if (!t) return '—';
  return TYPE_LABEL[t] || t;
}

export const getServerSideProps = withStaffPage('manager');

function AdminTournamentMapsPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [maps, setMaps] = useState<TournamentMapRow[]>([]);
  const [tournament, setTournament] = useState<TournamentMini | null>(null);

  useEffect(() => {
    if (!tournamentId) return;
    fetchMaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  async function fetchMaps() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/maps`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les maps');
      }
      const json: ApiResponse = await res.json();
      setMaps(json.maps || []);
      setTournament(json.tournament ?? null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin · Pool de maps</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                Admin · Pool de maps
              </p>
              <h1 className="text-2xl font-semibold">
                {tournament?.name || 'Tournoi'} · Maps
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
                onClick={() => fetchMaps()}
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

          {!loading && !errorMsg && maps.length === 0 && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              Aucune map configurée pour ce tournoi.
            </div>
          )}

          {maps.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {maps
                .slice()
                .sort(
                  (a, b) =>
                    (a.order_index ?? 0) - (b.order_index ?? 0) ||
                    a.map_name.localeCompare(b.map_name)
                )
                .map((m, idx) => (
                  <div
                    key={m.id || `${m.map_name}-${idx}`}
                    className="p-4 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{m.map_name}</p>
                        <p className="text-xs text-gray-400">
                          {typeLabel(m.map_type)}
                          {m.map_slug ? ` • ${m.map_slug}` : ''}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs border ${
                          m.enabled
                            ? 'border-emerald-400/50 text-emerald-200'
                            : 'border-gray-500/50 text-gray-300'
                        }`}
                      >
                        {m.enabled ? 'Activée' : 'Désactivée'}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      Ordre : {m.order_index ?? '—'}
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

export default AdminTournamentMapsPage;
