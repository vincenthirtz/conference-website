import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import {
  useStage,
  useStageHistory,
} from '@/features/admin/stages/hooks/useStage';
import StageTabsNav from '@/components/admin/stages/StageTabsNav';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StageType } from '@/types/admin';
import nsAdminStageHistory from '@/lib/i18n/locales/admin-fr/adminStageHistory';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

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
  /**
   * Contenu du journal staff : JSON libre, sérialisé tel quel à l'affichage.
   *
   * `unknown` et non `any` — le seul usage est un `JSON.stringify`, et `any`
   * aurait laissé passer `log.payload.champ` sans que rien ne garantisse que
   * ce champ existe pour CE type d'action.
   */
  payload?: unknown;
  staff?: FormattedStaff | null;
  message?: string;
};

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

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

function AdminStageHistoryPage(_props: StaffProps) {
  const t = useAdminT(nsAdminStageHistory);
  const router = useRouter();
  const { stageId } = router.query;

  // Contexte de la phase, uniquement pour la barre d'onglets (gating + retour).
  // Best-effort : la barre reste utilisable sans ces infos.
  const stageQuery = useStage<{
    stage_type?: StageType | null;
    tournament_id?: string | null;
  }>(String(stageId ?? ''));
  const stageType = stageQuery.data?.stage?.stage_type ?? null;
  const tournamentId = stageQuery.data?.stage?.tournament_id ?? null;

  // filtres
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(100);
  // Filtres appliqués seulement au clic « Filtrer » (pas à chaque frappe).
  const [applied, setApplied] = useState({ entityType: '', action: '' });

  const historyQuery = useStageHistory<FormattedStaffLog>(
    String(stageId ?? ''),
    { limit, ...applied },
    t.errLoadHistory
  );
  const logs = historyQuery.data ?? [];
  const loading = historyQuery.isFetching;
  const errorMsg = historyQuery.error
    ? (historyQuery.error.message ?? t.errUnknown)
    : null;

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = { entityType: entityType.trim(), action: action.trim() };
    if (
      next.entityType === applied.entityType &&
      next.action === applied.action
    ) {
      void historyQuery.refetch();
    } else {
      setApplied(next);
    }
  }

  const filterLabelClass = 'text-xs text-[var(--t3,#a39ba6)]';
  const filterInputClass =
    'h-[38px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 text-sm text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)]';

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <StageTabsNav
          stageId={String(stageId ?? '')}
          active="history"
          stageType={stageType}
          tournamentId={tournamentId}
        />
        <AdminPageHeader title={t.heading} subtitle={t.subtitle} />

        {/* Filtres */}
        <form
          onSubmit={handleFilterSubmit}
          className="mb-6 flex flex-wrap items-end gap-4 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4"
        >
          <div className="flex flex-col gap-1">
            <label className={filterLabelClass}>{t.entityTypeLabel}</label>
            <input
              type="text"
              className={filterInputClass}
              placeholder={t.entityTypePlaceholder}
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={filterLabelClass}>{t.actionLabel}</label>
            <input
              type="text"
              className={filterInputClass}
              placeholder={t.actionPlaceholder}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={filterLabelClass}>{t.limitLabel}</label>
            <select
              className={filterInputClass}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 50)}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>

          <AdminButton
            type="submit"
            variant="secondary"
            size="sm"
            className="ml-auto"
          >
            {t.filter}
          </AdminButton>
        </form>

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[var(--t1,#f4edf7)]">
            {errorMsg}
          </div>
        )}

        {/* Liste des logs */}
        <div className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
          <div className="flex items-center justify-between border-b border-[var(--line,rgba(194,196,201,.12))] px-5 py-3">
            <span
              className="text-sm font-semibold text-[var(--t1,#f4edf7)]"
              data-numeric
            >
              {loading
                ? t.loading
                : format(t.logsCount, { count: logs.length })}
            </span>
            <span className="text-xs text-[var(--t3,#a39ba6)]">
              {t.sortedHint}
            </span>
          </div>

          {logs.length === 0 && !loading && (
            <div className="px-5 py-8 text-center text-sm text-[var(--t3,#a39ba6)]">
              {t.emptyLogs}
            </div>
          )}

          {logs.length > 0 && (
            <ul className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex flex-col gap-1 px-5 py-3 text-sm"
                >
                  {/* Ligne principale */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-[var(--t4,#807984)]">
                        {formatDateTime(log.created_at)}
                      </span>
                      <Chip tone="brand">{log.action}</Chip>
                      {log.entity_type && (
                        <Chip>
                          {log.entity_type}
                          {log.entity_id ? ` #${shortId(log.entity_id)}` : ''}
                        </Chip>
                      )}
                    </div>

                    {log.staff && (
                      <div className="flex items-center gap-2 text-xs text-[var(--t3,#a39ba6)]">
                        <span className="text-[var(--t4,#807984)]">{t.by}</span>
                        <span className="font-medium text-[var(--t1,#f4edf7)]">
                          {log.staff.display_name || log.staff.id}
                        </span>
                        {log.staff.role && <Chip>{log.staff.role}</Chip>}
                      </div>
                    )}
                  </div>

                  {/* Message formatté si dispo */}
                  {log.message && (
                    <div className="text-[var(--t2,#c7bfca)]">
                      {log.message}
                    </div>
                  )}

                  {/* Payload brut */}
                  {log.payload ? (
                    <details className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                      <summary className="cursor-pointer select-none hover:text-[var(--t1,#f4edf7)]">
                        {t.payloadDetails}
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-2 text-[11px]">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </details>
                  ) : null}

                  {/* Liens rapides */}
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--or-200,#eec4ff)]">
                    {log.entity_type === 'match' && log.entity_id && (
                      <Link
                        href={`/admin/matches/${log.entity_id}`}
                        className="hover:underline"
                      >
                        {t.openMatch}
                      </Link>
                    )}

                    {log.entity_type === 'stage' && log.entity_id && (
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

                    {log.entity_type === 'tournament' && log.tournament_id && (
                      <Link
                        href={`/admin/tournament/${log.tournament_id}`}
                        className="hover:underline"
                      >
                        {t.openTournament}
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

export default withAdminQuery(AdminStageHistoryPage);
