// components/admin/moderation/SupportPanel.tsx
// Admin: list + manage support tickets (litiges, comportement, technique, autre).
// Rendered as the "Support" tab of the /admin/moderation hub.

import { useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import EmptyState from '@/components/admin/EmptyState';
import Modal from '@/components/admin/Modal';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type Severity = 'low' | 'medium' | 'high';
type Category = 'dispute' | 'behavior' | 'technical' | 'other';
type Status = 'open' | 'in_progress' | 'resolved' | 'closed';
type Source = 'web' | 'discord_bot';

type Ticket = {
  id: string;
  tournament_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  is_anonymous: boolean;
  category: Category;
  severity: Severity;
  subject: string | null;
  message: string;
  status: Status;
  resolved_at: string | null;
  resolution_note: string | null;
  source: Source | null;
  discord_user_id: string | null;
  discord_username: string | null;
  created_at: string;
  updated_at: string;
};

// Aggregate counts computed server-side over the WHOLE filtered set (not just
// the current page) so the dashboard cards stay accurate beyond 50 tickets.
type TicketCounts = {
  total: number;
  open: number;
  high_severity: number;
  resolved: number;
};

const FILTER_KEYS = ['status', 'severity', 'category', 'search'] as const;

const PAGE_SIZE = 50;

type Dict = ReturnType<typeof useAdminT<'adminSupport'>>;

function getCategoryLabels(tx: Dict): Record<Category, string> {
  return {
    dispute: tx.catDispute,
    behavior: tx.catBehavior,
    technical: tx.catTechnical,
    other: tx.catOther,
  };
}

function getStatusLabels(tx: Dict): Record<Status, string> {
  return {
    open: tx.statusOpen,
    in_progress: tx.statusInProgress,
    resolved: tx.statusResolved,
    closed: tx.statusClosed,
  };
}

function formatDateFr(value: string): string {
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

function severityBadge(severity: Severity): string {
  switch (severity) {
    case 'high':
      return 'bg-red-700/30 text-red-200 border-red-500/40';
    case 'medium':
      return 'bg-amber-700/30 text-amber-200 border-amber-500/40';
    default:
      return 'bg-blue-700/30 text-blue-200 border-blue-500/40';
  }
}

function statusBadge(status: Status): string {
  switch (status) {
    case 'open':
      return 'bg-red-600/20 text-red-200 border-red-500/40';
    case 'in_progress':
      return 'bg-amber-600/20 text-amber-200 border-amber-500/40';
    case 'resolved':
      return 'bg-emerald-600/20 text-emerald-200 border-emerald-500/40';
    case 'closed':
      return 'bg-neutral-600/20 text-neutral-300 border-neutral-500/40';
  }
}

type TicketsResponse = {
  tickets?: Ticket[];
  total?: number;
  counts?: {
    total?: number | string;
    open?: number | string;
    high_severity?: number | string;
    resolved?: number | string;
  };
};

type TicketUpdateResponse = { ticket: Ticket };

export default function SupportPanel() {
  const tx = useAdminT('adminSupport');
  const categoryLabels = getCategoryLabels(tx);
  const statusLabels = getStatusLabels(tx);
  const { addToast } = useToast();
  const { filters, setFilters } = useUrlFilters(FILTER_KEYS);
  const { adminFetchJson } = useAdminFetch();
  const { mutate: blacklistMutate, regenerate: regenerateBlacklistKey } =
    useIdempotentMutation({ autoRegenerateOnSuccess: false });

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [counts, setCounts] = useState<TicketCounts | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [blacklistRows, setBlacklistRows] = useState<string[]>(['']);
  const [blacklistReason, setBlacklistReason] = useState('');
  const [blacklisting, setBlacklisting] = useState(false);

  const status = filters.status ?? '';
  const severity = filters.severity ?? '';
  const category = filters.category ?? '';
  const search = filters.search ?? '';

  // Champ de recherche local (debounce → query param `search`).
  const [searchInput, setSearchInput] = useState(search);

  // Garde le champ local synchronisé si l'URL change (navigation, lien partagé).
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Debounce ~300ms : propage la saisie vers le query param `search`.
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => {
      setFilters({ search: searchInput.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Tout changement de filtre/recherche repart de la première page.
  useEffect(() => {
    setOffset(0);
  }, [status, severity, category, search]);

  // Guard de séquence : le reset d'offset (effet ci-dessus) et le changement
  // de filtre déclenchent deux fetchs successifs dans le même commit ; seule
  // la dernière requête lancée peut appliquer sa réponse (sinon une réponse
  // périmée — ancien offset — peut revenir après la bonne et l'écraser).
  const fetchSeqRef = useRef(0);

  const fetchTickets = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (severity) params.set('severity', severity);
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    try {
      const json = await adminFetchJson<TicketsResponse>(
        `/api/admin/support/tickets?${params.toString()}`
      );
      if (seq !== fetchSeqRef.current) return; // réponse périmée
      setTickets(json.tickets || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
      setCounts(
        json.counts && typeof json.counts === 'object'
          ? {
              total: Number(json.counts.total) || 0,
              open: Number(json.counts.open) || 0,
              high_severity: Number(json.counts.high_severity) || 0,
              resolved: Number(json.counts.resolved) || 0,
            }
          : null
      );
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setErrorMsg((err as Error).message);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [status, severity, category, search, offset, adminFetchJson]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  function openDetail(t: Ticket) {
    setSelected(t);
    setResolutionNote(t.resolution_note || '');
    setBlacklistRows(['']);
    setBlacklistReason(
      format(tx.blacklistReasonDefault, {
        id: t.id.slice(0, 8),
        category: categoryLabels[t.category],
      })
    );
  }

  function setBlacklistRow(index: number, value: string) {
    setBlacklistRows((rows) => rows.map((r, i) => (i === index ? value : r)));
  }

  function addBlacklistRow() {
    setBlacklistRows((rows) => [...rows, '']);
  }

  function removeBlacklistRow(index: number) {
    setBlacklistRows((rows) => {
      const next = rows.filter((_, i) => i !== index);
      return next.length > 0 ? next : [''];
    });
  }

  async function addToBlacklist() {
    if (!selected) return;
    const entries = blacklistRows
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    if (entries.length === 0) {
      addToast(tx.noBlacklistPseudo, 'error');
      return;
    }

    const reason = blacklistReason.trim() || null;
    const notes = `ticket_id: ${selected.id}`;

    setBlacklisting(true);
    try {
      const results = await Promise.all(
        entries.map(async (value) => {
          const body: Record<string, unknown> = { reason, notes };
          if (value.includes('#')) {
            body.battle_tag = value;
          } else {
            body.display_name = value;
          }
          try {
            // One idempotency key per pseudo so a transparent network retry
            // can't double-insert the same blacklist entry.
            const idempotencyKey = regenerateBlacklistKey();
            const res = await blacklistMutate(
              '/api/admin/moderation/blacklist',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify(body),
              }
            );
            return res.ok;
          } catch {
            return false;
          }
        })
      );

      const added = results.filter(Boolean).length;
      const failed = results.length - added;

      if (failed === 0) {
        addToast(
          format(added > 1 ? tx.blacklistAdded_other : tx.blacklistAdded_one, {
            count: added,
          }),
          'success'
        );
        setBlacklistRows(['']);
      } else if (added === 0) {
        addToast(format(tx.blacklistAllFailed, { failed }), 'error');
      } else {
        addToast(format(tx.blacklistPartial, { added, failed }), 'error');
      }
    } finally {
      setBlacklisting(false);
    }
  }

  async function updateStatus(newStatus: Status, note?: string) {
    if (!selected) return;
    setUpdating(true);
    try {
      const body: Record<string, unknown> = { status: newStatus };
      if (note !== undefined) body.resolution_note = note;
      const json = await adminFetchJson<TicketUpdateResponse>(
        `/api/admin/support/tickets/${selected.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        }
      );
      addToast(tx.ticketUpdated, 'success');
      setSelected(json.ticket);
      await fetchTickets();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setUpdating(false);
    }
  }

  // Cards reflect the server-computed aggregates over the FULL filtered result
  // set (not just the current page of ≤50). Falls back to the page count while
  // the first response is in flight or if `counts` is absent.
  const stats = {
    total: counts ? counts.total : (total ?? tickets.length),
    open: counts ? counts.open : 0,
    high: counts ? counts.high_severity : 0,
    resolved: counts ? counts.resolved : 0,
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{tx.heading}</h1>
        <p className="text-sm text-neutral-400 mt-1">{tx.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label={tx.statTickets} value={stats.total} />
        <Stat label={tx.statOpen} value={stats.open} accent="red" />
        <Stat label={tx.statHigh} value={stats.high} accent="amber" />
        <Stat label={tx.statResolved} value={stats.resolved} accent="emerald" />
      </div>

      {/* Filters */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4 mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={tx.searchPlaceholder}
            className="w-full pl-10 pr-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        <select
          className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
          value={status}
          onChange={(e) => setFilters({ status: e.target.value || null })}
        >
          <option value="">{tx.filterAllStatus}</option>
          <option value="open">{tx.statusOpen}</option>
          <option value="in_progress">{tx.statusInProgress}</option>
          <option value="resolved">{tx.statusResolved}</option>
          <option value="closed">{tx.statusClosed}</option>
        </select>

        <select
          className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
          value={severity}
          onChange={(e) => setFilters({ severity: e.target.value || null })}
        >
          <option value="">{tx.filterAllSeverity}</option>
          <option value="high">{tx.sevHigh}</option>
          <option value="medium">{tx.sevMedium}</option>
          <option value="low">{tx.sevLow}</option>
        </select>

        <select
          className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
          value={category}
          onChange={(e) => setFilters({ category: e.target.value || null })}
        >
          <option value="">{tx.filterAllCategory}</option>
          <option value="dispute">{tx.catFilterDispute}</option>
          <option value="behavior">{tx.catFilterBehavior}</option>
          <option value="technical">{tx.catFilterTechnical}</option>
          <option value="other">{tx.catFilterOther}</option>
        </select>

        <button
          type="button"
          onClick={fetchTickets}
          className="ml-auto px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
        >
          {tx.refresh}
        </button>
      </section>

      {errorMsg && (
        <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <LoadingSpinner className="py-20" label={tx.loadingTickets} />
      ) : tickets.length === 0 ? (
        <EmptyState
          title={tx.emptyTitle}
          description={
            status || severity || category || search
              ? tx.emptyFiltered
              : tx.emptyNone
          }
        />
      ) : (
        <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
          <div className="divide-y divide-neutral-700/50">
            {tickets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openDetail(t)}
                className="w-full text-left px-4 py-3 hover:bg-neutral-700/30 transition-colors flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border ${severityBadge(t.severity)}`}
                  >
                    {t.severity.toUpperCase()}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(t.status)}`}
                  >
                    {statusLabels[t.status]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-neutral-400">
                      {categoryLabels[t.category]}
                    </span>
                    <span className="text-xs text-neutral-600">·</span>
                    <span className="text-xs text-neutral-500">
                      {formatDateFr(t.created_at)}
                    </span>
                    {t.source === 'discord_bot' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-700/30 text-indigo-200 border border-indigo-500/40">
                        {tx.discordBadge}
                      </span>
                    )}
                    {t.is_anonymous && (
                      <span className="text-xs text-purple-300">
                        {tx.anonymousTag}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-white mt-1 truncate">
                    {t.subject || t.message.slice(0, 100)}
                  </div>
                  {!t.is_anonymous &&
                    (t.reporter_name ||
                      t.reporter_email ||
                      t.discord_username) && (
                      <div className="text-xs text-neutral-500 mt-0.5 truncate">
                        {t.reporter_name || t.discord_username || ''}{' '}
                        {t.reporter_email && (
                          <span className="font-mono">
                            ({t.reporter_email})
                          </span>
                        )}
                        {!t.reporter_email && t.discord_username && (
                          <span className="font-mono">
                            (@{t.discord_username})
                          </span>
                        )}
                      </div>
                    )}
                </div>
                <div className="text-xs text-neutral-500 font-mono flex-shrink-0">
                  {t.id.slice(0, 8)}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Pagination */}
      {(tickets.length > 0 || offset > 0) && (
        <div className="flex justify-between items-center mt-6">
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {tx.prev}
          </button>

          <span className="text-neutral-400 text-sm">
            {tickets.length > 0 ? offset + 1 : 0} – {offset + tickets.length}
            {total !== null ? format(tx.paginationOf, { total }) : ''}
          </span>

          <button
            type="button"
            disabled={
              loading ||
              (total !== null && offset + PAGE_SIZE >= total) ||
              (total === null && tickets.length < PAGE_SIZE)
            }
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {tx.next}
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          size="2xl"
          title={
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border ${severityBadge(selected.severity)}`}
                >
                  {selected.severity.toUpperCase()}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(selected.status)}`}
                >
                  {statusLabels[selected.status]}
                </span>
                <span className="text-xs text-neutral-400">
                  {categoryLabels[selected.category]}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-white">
                {selected.subject || tx.subjectFallback}
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                {selected.id}
              </p>
            </div>
          }
        >
          <>
            <div className="space-y-3 mb-5">
              <Field label={tx.fieldAuthor}>
                {selected.is_anonymous ? (
                  <span className="text-purple-300 italic">
                    {tx.authorAnonymous}
                  </span>
                ) : (
                  <>
                    {selected.reporter_name ||
                      selected.discord_username ||
                      tx.authorNoName}
                    {selected.reporter_email && (
                      <span className="block text-xs text-neutral-400 font-mono mt-0.5">
                        {selected.reporter_email}
                      </span>
                    )}
                    {selected.discord_username && (
                      <span className="block text-xs text-indigo-300 font-mono mt-0.5">
                        {format(tx.discordAuthor, {
                          username: selected.discord_username,
                        })}
                        {selected.discord_user_id && (
                          <span className="text-neutral-500">
                            {' '}
                            {format(tx.discordIdSuffix, {
                              id: selected.discord_user_id,
                            })}
                          </span>
                        )}
                      </span>
                    )}
                  </>
                )}
              </Field>
              {selected.source && (
                <Field label={tx.fieldSource}>
                  {selected.source === 'discord_bot'
                    ? tx.sourceBot
                    : tx.sourceWeb}
                </Field>
              )}
              <Field label={tx.fieldCreatedAt}>
                {formatDateFr(selected.created_at)}
              </Field>
              <Field label={tx.fieldMessage}>
                <div className="bg-neutral-900/50 border border-neutral-700 rounded-xl p-3 text-sm whitespace-pre-wrap leading-relaxed">
                  {selected.message}
                </div>
              </Field>
              {selected.resolved_at && (
                <Field label={tx.fieldResolvedAt}>
                  {formatDateFr(selected.resolved_at)}
                </Field>
              )}
            </div>

            <div className="space-y-3 border-t border-neutral-700 pt-4">
              <div>
                <label className="block text-sm font-medium text-neutral-200">
                  {tx.blacklistHeading}
                </label>
                <p className="text-xs text-neutral-500 mt-1">
                  {tx.blacklistHelp}
                </p>
              </div>

              <div className="space-y-2">
                {blacklistRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row}
                      onChange={(e) => setBlacklistRow(i, e.target.value)}
                      placeholder={tx.blacklistRowPlaceholder}
                      className="flex-1 px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeBlacklistRow(i)}
                      disabled={blacklisting}
                      aria-label={tx.removeRowAria}
                      className="p-2 rounded-lg text-neutral-400 hover:text-red-300 hover:bg-neutral-700 transition-colors disabled:opacity-50"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addBlacklistRow}
                  disabled={blacklisting}
                  className="text-xs text-blue-300 hover:text-blue-200 transition-colors disabled:opacity-50"
                >
                  {tx.addRow}
                </button>
              </div>

              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wide mb-1">
                  {tx.reasonLabel}
                </label>
                <input
                  type="text"
                  value={blacklistReason}
                  onChange={(e) => setBlacklistReason(e.target.value)}
                  placeholder={tx.reasonPlaceholder}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={addToBlacklist}
                  disabled={
                    blacklisting ||
                    blacklistRows.every((r) => r.trim().length === 0)
                  }
                  className="px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {blacklisting ? tx.blacklisting : tx.addToBlacklist}
                </button>
              </div>
            </div>

            <div className="space-y-3 border-t border-neutral-700 pt-4">
              <label className="block text-sm font-medium text-neutral-200">
                {tx.resolutionLabel}
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder={tx.resolutionPlaceholder}
              />
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => updateStatus('in_progress', resolutionNote)}
                  disabled={updating || selected.status === 'in_progress'}
                  className="px-3 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {tx.markInProgress}
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus('resolved', resolutionNote)}
                  disabled={updating || selected.status === 'resolved'}
                  className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {tx.markResolved}
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus('closed', resolutionNote)}
                  disabled={updating || selected.status === 'closed'}
                  className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {tx.close}
                </button>
              </div>
            </div>
          </>
        </Modal>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'red' | 'amber' | 'emerald';
}) {
  const colors: Record<string, string> = {
    red: 'text-red-300',
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
  };
  return (
    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-4 py-3">
      <p className="text-xs text-neutral-400 uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${accent ? colors[accent] : 'text-white'}`}
      >
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="block text-xs text-neutral-500 uppercase tracking-wide mb-1">
        {label}
      </span>
      <div className="text-sm text-neutral-200">{children}</div>
    </div>
  );
}
