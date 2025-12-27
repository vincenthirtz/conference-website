import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { StaffRoleBadge } from '@/components/admin/StaffRoleBadge';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};
type FormattedStaff = {
  id: string;
  role?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type FormattedStaffLog = {
  id: string;
  created_at: string;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  tournament_id?: string | null;
  payload?: any;
  staff?: FormattedStaff | null;
  message?: string;
};

type ApiResponse = {
  stageId: string;
  logs: FormattedStaffLog[];
};

export const getServerSideProps = withStaffPage('manager');

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortId(id: string) {
  if (id.length <= 8) return id;
  return id.slice(0, 4) + '…' + id.slice(-3);
}

function AdminStageHistoryPage({ staff }: StaffProps) {
  const router = useRouter();
  const { stageId } = router.query;

  const [logs, setLogs] = useState<FormattedStaffLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // filtres
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(100);

  async function fetchLogs() {
    if (!stageId) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));

      if (entityType.trim()) params.set('entityType', entityType.trim());
      if (action.trim()) params.set('action', action.trim());

      const res = await fetch(
        `/api/admin/stages/${stageId}/history?` + params.toString()
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger l’historique');
      }

      const json: ApiResponse = await res.json();
      setLogs(json.logs || []);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!stageId) return;
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, limit]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchLogs();
  }

  return (
    <>
      <Head>
        <title>Admin – Historique de la phase</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(`/admin/stages/${stageId}`)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour à la phase
            </button>
            <h1 className="text-3xl font-bold">Historique staff de la phase</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Journal des actions staff liées à cette phase (stages, matches,
              etc.).
            </p>
          </div>
          <StaffRoleBadge staff={staff} />
        </div>

        {/* Filtres */}
        <form
          onSubmit={handleFilterSubmit}
          className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">
              Type d&apos;entité (entity_type)
            </label>
            <input
              type="text"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder='ex: "stage", "match", "team"...'
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Action</label>
            <input
              type="text"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder='ex: "create_match", "update_stage"...'
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Limite</label>
            <select
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 50)}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>

          <button
            type="submit"
            className="ml-auto px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-sm font-semibold"
          >
            Filtrer
          </button>
        </form>

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Liste des logs */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
            <span className="text-sm font-semibold">
              {loading ? 'Chargement...' : `Logs (${logs.length})`}
            </span>
            <span className="text-xs text-neutral-400">
              Trié du plus récent au plus ancien
            </span>
          </div>

          {logs.length === 0 && !loading && (
            <div className="px-4 py-6 text-sm text-neutral-400">
              Aucun log trouvé pour ces filtres.
            </div>
          )}

          {logs.length > 0 && (
            <ul className="divide-y divide-neutral-700">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="px-4 py-3 text-sm flex flex-col gap-1"
                >
                  {/* Ligne principale */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-neutral-500">
                        {formatDateTime(log.created_at)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-700 text-neutral-100">
                        {log.action}
                      </span>
                      {log.entity_type && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-900 border border-neutral-700 text-neutral-300">
                          {log.entity_type}
                          {log.entity_id ? ` #${shortId(log.entity_id)}` : ''}
                        </span>
                      )}
                    </div>

                    {log.staff && (
                      <div className="flex items-center gap-2 text-xs text-neutral-400">
                        <span className="text-neutral-500">par</span>
                        <span className="font-medium text-neutral-200">
                          {log.staff.display_name || log.staff.id}
                        </span>
                        {log.staff.role && (
                          <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-[10px] uppercase tracking-wide">
                            {log.staff.role}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Message formatté si dispo */}
                  {log.message && (
                    <div className="text-neutral-200">{log.message}</div>
                  )}

                  {/* Payload brut */}
                  {log.payload && (
                    <details className="mt-1 text-xs text-neutral-400">
                      <summary className="cursor-pointer select-none hover:text-neutral-200">
                        Détails (payload)
                      </summary>
                      <pre className="mt-1 bg-neutral-900 border border-neutral-800 rounded p-2 text-[11px] overflow-x-auto">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </details>
                  )}

                  {/* Liens rapides */}
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-blue-300">
                    {log.entity_type === 'match' && log.entity_id && (
                      <Link
                        href={`/admin/matches/${log.entity_id}`}
                        className="hover:underline"
                      >
                        Ouvrir le match
                      </Link>
                    )}

                    {log.entity_type === 'stage' && log.entity_id && (
                      <Link
                        href={`/admin/stages/${log.entity_id}`}
                        className="hover:underline"
                      >
                        Ouvrir la phase
                      </Link>
                    )}

                    {log.entity_type === 'team' && log.entity_id && (
                      <Link
                        href={`/admin/teams/${log.entity_id}`}
                        className="hover:underline"
                      >
                        Ouvrir l&apos;équipe
                      </Link>
                    )}

                    {log.entity_type === 'tournament' && log.tournament_id && (
                      <Link
                        href={`/admin/tournament/${log.tournament_id}`}
                        className="hover:underline"
                      >
                        Ouvrir le tournoi
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminStageHistoryPage;
