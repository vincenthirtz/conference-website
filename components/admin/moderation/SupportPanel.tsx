// components/admin/moderation/SupportPanel.tsx
// Admin: list + manage support tickets (litiges, comportement, technique, autre).
// Rendered as the "Support" tab of the /admin/moderation hub.

import { useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import EmptyState from '@/components/admin/EmptyState';
import Modal from '@/components/admin/Modal';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type Severity = 'low' | 'medium' | 'high';
type Category = 'dispute' | 'behavior' | 'technical' | 'other';
type Status = 'open' | 'in_progress' | 'resolved' | 'closed';
type Source = 'web' | 'discord_bot';
type ReportedTargetType = 'player' | 'team' | 'org';
// Kind UI du formulaire de conversion : 'player' → blacklist joueurs ;
// 'team' / 'org' → blacklist entités (kind API 'entity' + entity_type).
type ConvertKind = 'player' | 'team' | 'org';

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
  reported_target_type: ReportedTargetType | null;
  reported_target_name: string | null;
  reported_battle_tag: string | null;
  converted_player_blacklist_id: string | null;
  converted_entity_blacklist_id: string | null;
  created_at: string;
  updated_at: string;
};

type ConvertBlacklistResponse = {
  kind: 'player' | 'entity';
  entry: { id: string };
  ticket_id: string;
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
  // Conversion signalement → blacklist : une clé par intention, régénérée
  // après chaque 2xx (défaut) pour pouvoir enchaîner joueur puis entité.
  const { mutateJson: convertMutateJson } = useIdempotentMutation();

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

  // Formulaire « Convertir en blacklist » (replié par défaut dans le détail).
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertKind, setConvertKind] = useState<ConvertKind>('player');
  const [convertForm, setConvertForm] = useState({
    battle_tag: '',
    display_name: '',
    discord_user_id: '',
    name: '',
    reason: '',
    notes: '',
  });
  const [converting, setConverting] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce piloté par la seule saisie utilisateur ; ajouter search/setFilters réinitialiserait le timer
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

    // Conversion → blacklist : présélectionne le kind depuis la cible signalée
    // ('player' → joueur ; 'team'/'org' → entité) et pré-remplit les champs.
    // Sans cible structurée : kind joueur par défaut, champs vides.
    const playerDone = Boolean(t.converted_player_blacklist_id);
    const entityDone = Boolean(t.converted_entity_blacklist_id);
    let kind: ConvertKind =
      t.reported_target_type === 'team' || t.reported_target_type === 'org'
        ? t.reported_target_type
        : 'player';
    // Évite de présélectionner un kind déjà converti quand l'autre reste dispo.
    if (kind === 'player' && playerDone && !entityDone) kind = 'team';
    else if (kind !== 'player' && entityDone && !playerDone) kind = 'player';
    setConvertKind(kind);
    setConvertOpen(false);
    setConvertForm({
      battle_tag: t.reported_battle_tag ?? '',
      display_name:
        t.reported_target_type === 'player'
          ? (t.reported_target_name ?? '')
          : '',
      discord_user_id: '',
      name:
        t.reported_target_type === 'team' || t.reported_target_type === 'org'
          ? (t.reported_target_name ?? '')
          : '',
      reason: t.subject ?? '',
      notes: format(tx.convertNotesDefault, {
        ref: t.subject || t.id.slice(0, 8),
      }),
    });
  }

  const convertValid =
    convertKind === 'player'
      ? [
          convertForm.battle_tag,
          convertForm.display_name,
          convertForm.discord_user_id,
        ].some((v) => v.trim().length > 0)
      : convertForm.name.trim().length > 0;

  async function convertToBlacklist() {
    if (!selected) return;
    if (!convertValid) {
      addToast(
        convertKind === 'player'
          ? tx.convertErrorPlayerIdentifier
          : tx.convertErrorNameRequired,
        'error'
      );
      return;
    }

    setConverting(true);
    try {
      const body: Record<string, unknown> =
        convertKind === 'player'
          ? { kind: 'player' }
          : {
              kind: 'entity',
              entity_type: convertKind,
              name: convertForm.name.trim(),
            };
      if (convertKind === 'player') {
        if (convertForm.battle_tag.trim())
          body.battle_tag = convertForm.battle_tag.trim();
        if (convertForm.display_name.trim())
          body.display_name = convertForm.display_name.trim();
        if (convertForm.discord_user_id.trim())
          body.discord_user_id = convertForm.discord_user_id.trim();
      }
      if (convertForm.reason.trim()) body.reason = convertForm.reason.trim();
      if (convertForm.notes.trim()) body.notes = convertForm.notes.trim();

      const json = await convertMutateJson<ConvertBlacklistResponse>(
        `/api/admin/support/tickets/${selected.id}/convert-blacklist`,
        { method: 'POST', body: JSON.stringify(body) }
      );

      addToast(
        json.kind === 'player'
          ? tx.convertSuccessPlayer
          : tx.convertSuccessEntity,
        'success'
      );
      const patch =
        json.kind === 'player'
          ? { converted_player_blacklist_id: json.entry.id }
          : { converted_entity_blacklist_id: json.entry.id };
      setSelected((prev) => (prev ? { ...prev, ...patch } : prev));
      setTickets((prev) =>
        prev.map((tk) => (tk.id === selected.id ? { ...tk, ...patch } : tk))
      );
      setConvertOpen(false);
    } catch (err) {
      if (err instanceof AdminFetchError && err.status === 409) {
        // Déjà converti pour ce kind (course avec un autre admin) : message
        // clair + refetch pour récupérer les converted_* à jour.
        addToast(tx.convertConflict, 'error');
        fetchTickets();
      } else {
        addToast((err as Error).message, 'error');
      }
    } finally {
      setConverting(false);
    }
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
                    {t.converted_player_blacklist_id && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-700/30 text-red-200 border border-red-500/40">
                        {tx.convertedPlayerBadge}
                      </span>
                    )}
                    {t.converted_entity_blacklist_id && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-700/30 text-purple-200 border border-purple-500/40">
                        {tx.convertedEntityBadge}
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
              {(selected.reported_target_type ||
                selected.reported_target_name ||
                selected.reported_battle_tag) && (
                <Field label={tx.targetLabel}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selected.reported_target_type && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                          selected.reported_target_type === 'player'
                            ? 'bg-indigo-600/20 text-indigo-200 border-indigo-500/40'
                            : selected.reported_target_type === 'team'
                              ? 'bg-sky-600/20 text-sky-200 border-sky-500/40'
                              : 'bg-purple-600/20 text-purple-200 border-purple-500/40'
                        }`}
                      >
                        {selected.reported_target_type === 'player'
                          ? tx.targetTypePlayer
                          : selected.reported_target_type === 'team'
                            ? tx.targetTypeTeam
                            : tx.targetTypeOrg}
                      </span>
                    )}
                    {selected.reported_target_name && (
                      <span className="text-white font-medium">
                        {selected.reported_target_name}
                      </span>
                    )}
                    {selected.reported_battle_tag && (
                      <span className="font-mono text-neutral-300 text-xs">
                        {selected.reported_battle_tag}
                      </span>
                    )}
                  </div>
                </Field>
              )}
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

            {/* Conversion signalement → blacklist (joueur ou entité) */}
            <div className="space-y-3 border-t border-neutral-700 pt-4">
              <div>
                <label className="block text-sm font-medium text-neutral-200">
                  {tx.convertHeading}
                </label>
                <p className="text-xs text-neutral-500 mt-1">
                  {tx.convertHelp}
                </p>
              </div>

              {(selected.converted_player_blacklist_id ||
                selected.converted_entity_blacklist_id) && (
                <div className="flex gap-2 flex-wrap">
                  {selected.converted_player_blacklist_id && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-700/30 text-red-200 border border-red-500/40">
                      {tx.convertedPlayerBadge}
                    </span>
                  )}
                  {selected.converted_entity_blacklist_id && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-700/30 text-purple-200 border border-purple-500/40">
                      {tx.convertedEntityBadge}
                    </span>
                  )}
                </div>
              )}

              {selected.converted_player_blacklist_id &&
              selected.converted_entity_blacklist_id ? (
                <p className="text-xs text-neutral-400">{tx.convertAllDone}</p>
              ) : !convertOpen ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setConvertOpen(true)}
                    className="px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-sm font-medium transition-colors"
                  >
                    {tx.convertOpenBtn}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-neutral-500 uppercase tracking-wide mb-1">
                      {tx.convertKindLabel}
                    </label>
                    <select
                      value={convertKind}
                      onChange={(e) =>
                        setConvertKind(e.target.value as ConvertKind)
                      }
                      className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
                    >
                      <option
                        value="player"
                        disabled={Boolean(
                          selected.converted_player_blacklist_id
                        )}
                      >
                        {tx.convertKindPlayer}
                      </option>
                      <option
                        value="team"
                        disabled={Boolean(
                          selected.converted_entity_blacklist_id
                        )}
                      >
                        {tx.convertKindTeam}
                      </option>
                      <option
                        value="org"
                        disabled={Boolean(
                          selected.converted_entity_blacklist_id
                        )}
                      >
                        {tx.convertKindOrg}
                      </option>
                    </select>
                  </div>

                  {convertKind === 'player' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <ConvertInput
                        label={tx.convertBattleTagLabel}
                        value={convertForm.battle_tag}
                        onChange={(v) =>
                          setConvertForm((f) => ({ ...f, battle_tag: v }))
                        }
                        placeholder={tx.convertBattleTagPlaceholder}
                      />
                      <ConvertInput
                        label={tx.convertDisplayNameLabel}
                        value={convertForm.display_name}
                        onChange={(v) =>
                          setConvertForm((f) => ({ ...f, display_name: v }))
                        }
                      />
                      <ConvertInput
                        label={tx.convertDiscordIdLabel}
                        value={convertForm.discord_user_id}
                        onChange={(v) =>
                          setConvertForm((f) => ({ ...f, discord_user_id: v }))
                        }
                        placeholder="123456789012345678"
                      />
                    </div>
                  ) : (
                    <ConvertInput
                      label={tx.convertNameLabel}
                      value={convertForm.name}
                      onChange={(v) =>
                        setConvertForm((f) => ({ ...f, name: v }))
                      }
                      placeholder={tx.convertNamePlaceholder}
                      maxLength={190}
                    />
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ConvertInput
                      label={tx.convertReasonLabel}
                      value={convertForm.reason}
                      onChange={(v) =>
                        setConvertForm((f) => ({ ...f, reason: v }))
                      }
                      maxLength={1000}
                    />
                    <ConvertInput
                      label={tx.convertNotesLabel}
                      value={convertForm.notes}
                      onChange={(v) =>
                        setConvertForm((f) => ({ ...f, notes: v }))
                      }
                      maxLength={2000}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConvertOpen(false)}
                      disabled={converting}
                      className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors disabled:opacity-50"
                    >
                      {tx.convertCancel}
                    </button>
                    <button
                      type="button"
                      onClick={convertToBlacklist}
                      disabled={converting || !convertValid}
                      className="px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {converting ? tx.convertSubmitting : tx.convertSubmit}
                    </button>
                  </div>
                </div>
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

function ConvertInput({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-500 uppercase tracking-wide mb-1">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      />
    </label>
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
