// pages/admin/tournament/[id]/history.tsx

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useTournamentHistory } from '@/features/admin/tournaments/hooks/useTournamentHistory';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentHistory from '@/lib/i18n/locales/admin-fr/adminTournamentHistory';

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
  // formatStaffLog peut aussi renvoyer un champ "message" ou similaire
  message?: string;
};

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';
const LABEL = 'text-xs text-[var(--t3,#a39ba6)]';
const INPUT =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

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

function AdminTournamentHistoryPage(_props: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const t = useAdminT(nsAdminTournamentHistory);

  // filtres
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(100);
  // Filtres appliqués seulement au clic « Filtrer » (pas à chaque frappe).
  const [applied, setApplied] = useState({ entityType: '', action: '' });

  const historyQuery = useTournamentHistory<FormattedStaffLog>(
    String(id ?? ''),
    { limit, ...applied },
    t.errorLoad
  );
  const logs = historyQuery.data ?? [];
  const loading = historyQuery.isFetching;
  const errorMsg = historyQuery.error
    ? (historyQuery.error.message ?? t.errorUnknown)
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

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <TournamentTabsNav tournamentId={String(id ?? '')} active="tools" />
        {/* Header */}
        <AdminPageHeader title={t.heading} subtitle={t.intro} />

        {/* Filtres */}
        <form
          onSubmit={handleFilterSubmit}
          className={`${CARD} mb-6 flex flex-wrap items-end gap-4 p-4`}
        >
          <div className="flex flex-col gap-1">
            <label className={LABEL}>{t.labelEntityType}</label>
            <input
              type="text"
              className={INPUT}
              placeholder={t.placeholderEntityType}
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={LABEL}>{t.labelAction}</label>
            <input
              type="text"
              className={INPUT}
              placeholder={t.placeholderAction}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={LABEL}>{t.labelLimit}</label>
            <select
              className={INPUT}
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
            variant="primary"
            size="sm"
            className="ml-auto"
          >
            {t.filter}
          </AdminButton>
        </form>

        {/* Error / Loading */}
        {errorMsg && (
          <div className="mb-4 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]">
            {errorMsg}
          </div>
        )}

        {/* Liste des logs */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-[var(--line2,rgba(194,196,201,.2))] px-4 py-3">
            <span
              className="font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]"
              data-numeric
            >
              {loading
                ? t.loading
                : format(t.logsCount, { count: logs.length })}
            </span>
            <span className="text-xs text-[var(--t3,#a39ba6)]">
              {t.sortedNewestFirst}
            </span>
          </div>

          {logs.length === 0 && !loading && (
            <div className="px-4 py-6 text-sm text-[var(--t3,#a39ba6)]">
              {t.empty}
            </div>
          )}

          {logs.length > 0 && (
            <ul className="divide-y divide-[var(--line2,rgba(194,196,201,.2))]">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="px-4 py-3 text-sm flex flex-col gap-1"
                >
                  {/* Ligne principale */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
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
                        <span className="font-medium text-[var(--t2,#c7bfca)]">
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

                  {/* Payload brut (mini) */}
                  {log.payload ? (
                    <details className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                      <summary className="cursor-pointer select-none hover:text-[var(--t1,#f4edf7)]">
                        {t.detailsPayload}
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-2 text-[11px]">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </details>
                  ) : null}

                  {/* Liens rapides vers entités si possible */}
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--or-200,#eec4ff)]">
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

export default withAdminQuery(AdminTournamentHistoryPage);
