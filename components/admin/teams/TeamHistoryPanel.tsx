// components/admin/teams/TeamHistoryPanel.tsx
//
// Historique staff d'une équipe.
//
// L'endpoint `/api/admin/teams/[teamId]/history` existait déjà — et n'était
// appelé par personne. Il agrège pourtant ce qu'on cherche en premier quand un
// roster paraît faux : qui a touché à cette équipe, quand, et pour quoi faire.
// Sans lui, la réponse se cherchait dans `/admin/logs` en filtrant à la main.
//
// Replié par défaut : c'est une question qu'on se pose parfois, pas à chaque
// ouverture de la fiche, et l'écran est déjà dense. Le chargement n'a lieu qu'au
// dépliage — un historique que personne n'ouvre ne doit rien coûter.

import { useCallback, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';

type LogRow = {
  id: string;
  readableAction: string;
  readableEntity: string | null;
  date: string;
  staff_id?: string | null;
  payload?: Record<string, unknown> | null;
};

const PAGE_SIZE = 20;

export default function TeamHistoryPanel({ teamId }: { teamId: string }) {
  const t = useAdminT(nsAdminTeamEdit);
  const { adminFetchJson } = useAdminFetch();

  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await adminFetchJson<{ logs: LogRow[] }>(
        `/api/admin/teams/${teamId}/history?limit=${PAGE_SIZE}`
      );
      setLogs(data.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.historyLoadError);
      setLogs([]);
    }
  }, [adminFetchJson, teamId, t.historyLoadError]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && logs === null) void load();
  };

  return (
    <section
      className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6"
      data-testid="team-history"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h2 className="text-sm font-semibold text-neutral-400">
          {t.historyTitle}
        </h2>
        <span className="text-xs text-neutral-500" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="mt-3">
          {error && (
            <p className="text-xs text-red-300" role="alert">
              {error}
            </p>
          )}
          {logs === null ? (
            <p className="text-xs text-neutral-500">{t.historyLoading}</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-neutral-500">{t.historyEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {logs.map((l) => (
                <li
                  key={l.id}
                  className="rounded-lg bg-neutral-900/50 px-3 py-2 text-xs"
                >
                  <div className="text-neutral-200">{l.readableAction}</div>
                  <div className="mt-0.5 text-neutral-500">
                    {l.date}
                    {l.readableEntity ? ` • ${l.readableEntity}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {logs !== null && logs.length >= PAGE_SIZE && (
            <p className="mt-2 text-[11px] text-neutral-500">
              {format(t.historyTruncated, { count: PAGE_SIZE })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
