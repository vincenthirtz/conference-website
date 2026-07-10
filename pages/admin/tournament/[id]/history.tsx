// pages/admin/tournament/[id]/history.tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

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
  // formatStaffLog peut aussi renvoyer un champ "message" ou similaire
  message?: string;
};

type ApiResponse = {
  tournamentId: string;
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

function AdminTournamentHistoryPage({ staff }: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const t = useAdminT('adminTournamentHistory');

  const [logs, setLogs] = useState<FormattedStaffLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // filtres
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(100);

  async function fetchLogs() {
    if (!id) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));

      if (entityType.trim()) params.set('entityType', entityType.trim());
      if (action.trim()) params.set('action', action.trim());

      const res = await fetch(
        `/api/admin/tournament/${id}/history?` + params.toString()
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorLoad);
      }

      const json: ApiResponse = await res.json();
      setLogs(json.logs || []);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorUnknown);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- GARDÉ : exclusion INTENTIONNELLE de entityType/action, appliqués seulement au clic « Filtrer » (fetchLogs les lit via closure au submit) ; les lister rechargerait à chaque frappe. (fetchLogs utilise `fetch` brut, pas adminFetch* : la stabilisation du hook ne change rien ici.)
  }, [id, limit]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchLogs();
  }

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <TournamentTabsNav tournamentId={String(id ?? '')} active="history" />
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t.heading}</h1>
            <p className="text-neutral-400 text-sm mt-1">{t.intro}</p>
          </div>
        </div>

        {/* Filtres */}
        <form
          onSubmit={handleFilterSubmit}
          className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">
              {t.labelEntityType}
            </label>
            <input
              type="text"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t.placeholderEntityType}
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">{t.labelAction}</label>
            <input
              type="text"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t.placeholderAction}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">{t.labelLimit}</label>
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
            {t.filter}
          </button>
        </form>

        {/* Error / Loading */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Liste des logs */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
            <span className="text-sm font-semibold">
              {loading
                ? t.loading
                : format(t.logsCount, { count: logs.length })}
            </span>
            <span className="text-xs text-neutral-400">
              {t.sortedNewestFirst}
            </span>
          </div>

          {logs.length === 0 && !loading && (
            <div className="px-4 py-6 text-sm text-neutral-400">{t.empty}</div>
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
                        <span className="text-neutral-500">{t.by}</span>
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

                  {/* Payload brut (mini) */}
                  {log.payload && (
                    <details className="mt-1 text-xs text-neutral-400">
                      <summary className="cursor-pointer select-none hover:text-neutral-200">
                        {t.detailsPayload}
                      </summary>
                      <pre className="mt-1 bg-neutral-900 border border-neutral-800 rounded p-2 text-[11px] overflow-x-auto">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </details>
                  )}

                  {/* Liens rapides vers entités si possible */}
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-blue-300">
                    {log.entity_type === 'match' && log.entity_id && (
                      <Link
                        href={`/admin/matches/${log.entity_id}`}
                        className="hover:underline"
                      >
                        {t.openMatch}
                      </Link>
                    )}

                    {log.entity_type === 'stage' && log.entity_id && id && (
                      <Link
                        href={`/admin/stages/${log.entity_id}`}
                        className="hover:underline"
                      >
                        {t.openStage}
                      </Link>
                    )}

                    {log.entity_type === 'team' && log.entity_id && (
                      <Link
                        href={`/admin/teams/${log.entity_id}`}
                        className="hover:underline"
                      >
                        {t.openTeam}
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

function shortId(id: string) {
  if (id.length <= 8) return id;
  return id.slice(0, 4) + '…' + id.slice(-3);
}

export default AdminTournamentHistoryPage;
