// components/admin/EntityHistoryDrawer.tsx
//
// « Qui a touché à ça, et quand ? » sur N'IMPORTE QUELLE fiche — lot A6 de
// docs/PLAN-espace-admin.md.
//
// Le tiroir existait et faisait exactement ce qu'il faut… pour les MATCHS
// seulement (`MatchHistoryDrawer`). Ailleurs — équipe, joueuse, tournoi,
// ticket — il fallait quitter la fiche pour aller filtrer le journal global, et
// reconstruire de tête le contexte qu'on venait d'abandonner.
//
// Ce composant est la version générique. Le tiroir des matchs RESTE : il fait
// davantage (rattrape les logs `game` reliés par `payload.match_id`, décrit les
// changements de score) et n'a aucune raison d'être appauvri pour rentrer ici.

import { useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminEntityHistory from '@/lib/i18n/locales/admin-fr/adminEntityHistory';
import type { HistoryEntityType } from '@/pages/api/admin/entity-history';

type FormattedLog = {
  id: string;
  created_at: string;
  action: string;
  payload: Record<string, unknown> | null;
  staff: { display_name: string | null; role: string } | null;
  readableAction: string;
  date: string;
};

export default function EntityHistoryDrawer({
  entityType,
  entityId,
  open,
  onClose,
}: {
  entityType: HistoryEntityType;
  entityId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useAdminT(nsAdminEntityHistory);
  const { adminFetchJson } = useAdminFetch();
  const [logs, setLogs] = useState<FormattedLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entityId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminFetchJson<{ logs: FormattedLog[] }>(
      `/api/admin/entity-history?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(entityId)}`
    )
      .then((data) => {
        if (!cancelled) setLogs(data.logs ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError((e as Error).message || t.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, entityId, entityType, adminFetchJson, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="flex-1 bg-black/60 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        className="flex w-full max-w-md flex-col border-l border-neutral-700 bg-neutral-900"
      >
        <header className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-purple-200/80">
              {t.kicker}
            </p>
            <h3 className="text-base font-semibold">{t.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-white/15 bg-white/10 px-2 py-1 text-sm hover:bg-white/15"
          >
            {t.close}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && <p className="text-sm text-neutral-400">{t.loading}</p>}
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          {!loading && !error && logs.length === 0 && (
            <p className="text-sm italic text-neutral-500">{t.empty}</p>
          )}
          {!loading && logs.length > 0 && (
            <ol className="space-y-3">
              {logs.map((log) => {
                const isOpen = expanded === log.id;
                return (
                  <li
                    key={log.id}
                    className="overflow-hidden rounded-lg border border-white/10 bg-white/5"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      className="w-full px-3 py-2 text-left hover:bg-white/5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-purple-200">
                          {log.readableAction}
                        </span>
                        <span className="font-mono text-xs text-neutral-500">
                          {log.date}
                        </span>
                      </div>
                      <span className="mt-0.5 block truncate text-xs text-neutral-300">
                        {log.staff?.display_name || t.unknownStaff}
                        {log.staff?.role ? ` · ${log.staff.role}` : ''}
                      </span>
                    </button>
                    {isOpen && log.payload && (
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all border-t border-neutral-800 bg-neutral-950 p-3 text-[10px] text-neutral-300">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
