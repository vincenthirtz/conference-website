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
import AuditChangesView from './AuditChanges';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

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
        className="flex w-full max-w-md flex-col border-l border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] shadow-[var(--sh3)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--line,rgba(194,196,201,.12))] px-4 py-3">
          <div>
            <p className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
              {t.kicker}
            </p>
            <h3 className="font-[family-name:var(--fd)] text-base font-bold uppercase tracking-[0.01em] text-[var(--t1,#f4edf7)]">
              {t.title}
            </h3>
          </div>
          <AdminButton size="xs" onClick={onClose}>
            {t.close}
          </AdminButton>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <p className="text-sm text-[var(--t3,#a39ba6)]">{t.loading}</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-[var(--err,#ff6b6b)]">
              {error}
            </p>
          )}
          {!loading && !error && logs.length === 0 && (
            <p className="text-sm text-[var(--t4,#807984)]">{t.empty}</p>
          )}
          {!loading && logs.length > 0 && (
            <ol className="space-y-3">
              {logs.map((log) => {
                const isOpen = expanded === log.id;
                return (
                  <li
                    key={log.id}
                    className="overflow-hidden rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)]"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      data-case="normal"
                      className="w-full px-3 py-2 text-left transition-colors hover:bg-[var(--s3,#2f2732)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[var(--or-200,#eec4ff)]">
                          {log.readableAction}
                        </span>
                        <span className="font-mono text-xs text-[var(--t4,#807984)]">
                          {log.date}
                        </span>
                      </div>
                      <span className="mt-0.5 block truncate text-xs text-[var(--t2,#c7bfca)]">
                        {log.staff?.display_name || t.unknownStaff}
                        {log.staff?.role ? ` · ${log.staff.role}` : ''}
                      </span>
                    </button>
                    {isOpen && log.payload && (
                      <AuditChangesView payload={log.payload} />
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
