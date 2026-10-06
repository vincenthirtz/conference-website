// components/admin/moderation/SupportPanel.tsx
// Admin: list + manage support tickets (litiges, comportement, technique, autre).
// Rendered as the "Support" tab of the /admin/moderation hub.

import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import EntityHistoryButton from '@/components/admin/EntityHistoryButton';
import {
  formatDateFr,
  getCategoryLabels,
  getStatusLabels,
  severityTone,
  statusTone,
} from './supportLabels';
import SupportResolutionForm from './SupportResolutionForm';
import SupportTicketRow from './SupportTicketRow';
import EmptyState from '@/components/admin/EmptyState';
import Modal from '@/components/admin/Modal';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { AdminFetchError } from '@/hooks/useAdminFetch';
import {
  type ConvertBlacklistResponse,
  moderationPaths,
  type SupportTicket,
  type TicketStatus,
} from '@/features/admin/moderation/client';
import {
  useAssignSupportTicket,
  usePatchSupportTickets,
  useSupportTickets,
  useUpdateSupportTicket,
} from '@/features/admin/moderation/hooks/useSupportTickets';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminSupport from '@/lib/i18n/locales/admin-fr/adminSupport';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import AssignmentControl from '@/features/admin/_shared/queue/AssignmentControl';
import Chip from '@/features/admin/_shared/ui/Chip';
import StatTile from '@/features/admin/_shared/ui/StatTile';

type Status = TicketStatus;
// Kind UI du formulaire de conversion : 'player' → blacklist joueurs ;
// 'team' / 'org' → blacklist entités (kind API 'entity' + entity_type).
type ConvertKind = 'player' | 'team' | 'org';

type Ticket = SupportTicket;

// Aggregate counts computed server-side over the WHOLE filtered set (not just
// the current page) so the dashboard cards stay accurate beyond 50 tickets.
type TicketCounts = {
  total: number;
  open: number;
  high_severity: number;
  resolved: number;
};

const FILTER_KEYS = [
  'status',
  'severity',
  'category',
  'search',
  'sort',
  'assigned',
] as const;

const PAGE_SIZE = 50;

export default function SupportPanel() {
  const tx = useAdminT(nsAdminSupport);
  const categoryLabels = getCategoryLabels(tx);
  const statusLabels = getStatusLabels(tx);
  const { addToast } = useToast();
  const { filters, setFilters } = useUrlFilters(FILTER_KEYS);
  const { mutate: blacklistMutate, regenerate: regenerateBlacklistKey } =
    useIdempotentMutation({ autoRegenerateOnSuccess: false });
  // Conversion signalement → blacklist : une clé par intention, régénérée
  // après chaque 2xx (défaut) pour pouvoir enchaîner joueur puis entité.
  const { mutateJson: convertMutateJson } = useIdempotentMutation();

  const [offset, setOffset] = useState(0);
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
  const sort = filters.sort === 'oldest' ? 'oldest' : '';
  const assigned =
    filters.assigned === 'me' || filters.assigned === 'unassigned'
      ? filters.assigned
      : '';

  // Champ de recherche local (debounce → query param `search`).
  const [searchInput, setSearchInput] = useState(search);

  // Garde le champ local synchronisé si l'URL change (navigation, lien partagé).
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Debounce ~300ms : propage la saisie vers le query param `search`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: debounce piloté par la seule saisie utilisateur ; ajouter search/setFilters réinitialiserait le timer
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => {
      setFilters({ search: searchInput.trim() || null });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Tout changement de filtre/recherche repart de la première page.
  useEffect(() => {
    setOffset(0);
  }, [status, severity, category, search, sort, assigned]);

  // Requête par clé (filtres + offset) : le reset d'offset ci-dessus et le
  // changement de filtre produisent deux clés successives, et seule la clé
  // COURANTE s'affiche — l'ancien garde de séquence n'a plus lieu d'être.
  const ticketsQueryString = (() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (severity) params.set('severity', severity);
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    if (sort) params.set('sort', sort);
    if (assigned) params.set('assigned', assigned);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    return params.toString();
  })();
  const ticketsQuery = useSupportTickets(ticketsQueryString);
  const patchTickets = usePatchSupportTickets(ticketsQueryString);
  const tickets: Ticket[] = ticketsQuery.data?.tickets || [];
  const total =
    typeof ticketsQuery.data?.total === 'number'
      ? ticketsQuery.data.total
      : null;
  const rawCounts = ticketsQuery.data?.counts;
  const counts: TicketCounts | null =
    rawCounts && typeof rawCounts === 'object'
      ? {
          total: Number(rawCounts.total) || 0,
          open: Number(rawCounts.open) || 0,
          high_severity: Number(rawCounts.high_severity) || 0,
          resolved: Number(rawCounts.resolved) || 0,
        }
      : null;
  const loading = ticketsQuery.isFetching;
  const errorMsg = ticketsQuery.isError
    ? (ticketsQuery.error as Error).message
    : null;
  const fetchTickets = useCallback(
    () => ticketsQuery.refetch(),
    [ticketsQuery.refetch]
  );
  const updateTicket = useUpdateSupportTicket();
  const assignTicket = useAssignSupportTicket();
  // Migration d'assignation absente : ni filtre ni bouton.
  const assignmentOn = ticketsQuery.data?.assignment_available === true;

  async function assign(action: 'claim' | 'release') {
    if (!selected) return;
    try {
      const { assignment } = await assignTicket.mutateAsync({
        id: selected.id,
        action,
      });
      setSelected((prev) => (prev ? { ...prev, ...assignment } : prev));
      addToast(
        action === 'claim' ? tx.toastClaimed : tx.toastReleased,
        'success'
      );
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  }

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
        moderationPaths.convertTicket(selected.id),
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
      patchTickets((prev) =>
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
            const res = await blacklistMutate(moderationPaths.blacklist, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey,
              },
              body: JSON.stringify(body),
            });
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

  async function updateStatus(newStatus: Status, note: string, notify = false) {
    if (!selected) return;
    setUpdating(true);
    try {
      const body = { status: newStatus, resolution_note: note };
      const json = await updateTicket.mutateAsync({
        id: selected.id,
        body: notify ? { ...body, notify_reporter: true } : body,
      });
      const sent = json.notification?.email;
      addToast(
        sent === 'sent'
          ? tx.toastNotifySent
          : sent
            ? tx.toastNotifyNotSent
            : tx.ticketUpdated,
        sent && sent !== 'sent' ? 'error' : 'success'
      );
      // La fiche renvoyée ne porte pas l'assignation (lue avec la liste).
      setSelected((prev) => ({ ...prev, ...json.ticket }));
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
      <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4 mb-4 flex flex-wrap gap-3">
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
            className="w-full pl-10 pr-3 py-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
          />
        </div>

        <select
          className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm"
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
          className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm"
          value={severity}
          onChange={(e) => setFilters({ severity: e.target.value || null })}
        >
          <option value="">{tx.filterAllSeverity}</option>
          <option value="high">{tx.sevHigh}</option>
          <option value="medium">{tx.sevMedium}</option>
          <option value="low">{tx.sevLow}</option>
        </select>

        <select
          className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setFilters({ category: e.target.value || null })}
        >
          <option value="">{tx.filterAllCategory}</option>
          <option value="dispute">{tx.catFilterDispute}</option>
          <option value="behavior">{tx.catFilterBehavior}</option>
          <option value="technical">{tx.catFilterTechnical}</option>
          <option value="other">{tx.catFilterOther}</option>
        </select>

        <select
          className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm"
          value={sort}
          onChange={(e) => setFilters({ sort: e.target.value || null })}
        >
          <option value="">{tx.sortNewest}</option>
          <option value="oldest">{tx.sortOldest}</option>
        </select>

        {assignmentOn && (
          <select
            className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm"
            value={assigned}
            onChange={(e) => setFilters({ assigned: e.target.value || null })}
          >
            <option value="">{tx.filterAllAssignment}</option>
            <option value="me">{tx.filterAssignedMe}</option>
            <option value="unassigned">{tx.filterUnassigned}</option>
          </select>
        )}

        <AdminButton
          variant="ghost"
          size="sm"
          onClick={fetchTickets}
          className="ml-auto"
        >
          {tx.refresh}
        </AdminButton>
      </section>

      {errorMsg && (
        <div className="mb-4 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] text-[#ffc2c2] px-4 py-3 text-sm">
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
        <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] overflow-hidden">
          <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
            {tickets.map((t) => (
              <SupportTicketRow key={t.id} ticket={t} onOpen={openDetail} />
            ))}
          </div>
        </section>
      )}

      {/* Pagination */}
      {(tickets.length > 0 || offset > 0) && (
        <div className="flex justify-between items-center mt-6">
          <AdminButton
            variant="ghost"
            size="sm"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
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
          </AdminButton>

          <span className="text-neutral-400 text-sm">
            {tickets.length > 0 ? offset + 1 : 0} – {offset + tickets.length}
            {total !== null ? format(tx.paginationOf, { total }) : ''}
          </span>

          <AdminButton
            variant="ghost"
            size="sm"
            disabled={
              loading ||
              (total !== null && offset + PAGE_SIZE >= total) ||
              (total === null && tickets.length < PAGE_SIZE)
            }
            onClick={() => setOffset(offset + PAGE_SIZE)}
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
          </AdminButton>
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
                <Chip tone={severityTone(selected.severity)}>
                  {selected.severity.toUpperCase()}
                </Chip>
                <Chip tone={statusTone(selected.status)}>
                  {statusLabels[selected.status]}
                </Chip>
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
              {/* Lot A6 : « qui a touché à ce ticket, et quand » se lit sur le
                  ticket. Un signalement passe par plusieurs mains. */}
              <EntityHistoryButton
                entityType="support_ticket"
                entityId={selected.id}
                className="mt-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-3 py-1 text-xs font-medium text-[var(--t2,#c7bfca)] transition-colors hover:text-[var(--t1,#f4edf7)]"
              />
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
              {assignmentOn && (
                <Field label={tx.fieldAssignment}>
                  <AssignmentControl
                    assignedStaffId={selected.assigned_staff_id}
                    assignedTo={selected.assigned_to}
                    busy={assignTicket.isPending}
                    labels={{
                      claim: tx.assignClaim,
                      release: tx.assignRelease,
                      assignedTo: tx.assignedTo,
                      unknownStaff: tx.assignUnknownStaff,
                    }}
                    onClaim={() => assign('claim')}
                    onRelease={() => assign('release')}
                  />
                </Field>
              )}
              {(selected.reported_target_type ||
                selected.reported_target_name ||
                selected.reported_battle_tag) && (
                <Field label={tx.targetLabel}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selected.reported_target_type && (
                      <Chip tone="neutral">
                        {selected.reported_target_type === 'player'
                          ? tx.targetTypePlayer
                          : selected.reported_target_type === 'team'
                            ? tx.targetTypeTeam
                            : tx.targetTypeOrg}
                      </Chip>
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
                <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3 text-sm whitespace-pre-wrap leading-relaxed">
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
                  <AdminButton
                    variant="danger"
                    size="sm"
                    onClick={() => setConvertOpen(true)}
                  >
                    {tx.convertOpenBtn}
                  </AdminButton>
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
                      className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm"
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
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setConvertOpen(false)}
                      disabled={converting}
                    >
                      {tx.convertCancel}
                    </AdminButton>
                    <AdminButton
                      variant="danger"
                      size="sm"
                      onClick={convertToBlacklist}
                      disabled={converting || !convertValid}
                    >
                      {converting ? tx.convertSubmitting : tx.convertSubmit}
                    </AdminButton>
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
                      className="flex-1 px-3 py-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
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
                  className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
                />
              </div>

              <div className="flex justify-end">
                <AdminButton
                  variant="danger"
                  size="sm"
                  onClick={addToBlacklist}
                  disabled={
                    blacklisting ||
                    blacklistRows.every((r) => r.trim().length === 0)
                  }
                >
                  {blacklisting ? tx.blacklisting : tx.addToBlacklist}
                </AdminButton>
              </div>
            </div>

            <SupportResolutionForm
              key={selected.id}
              ticket={selected}
              note={resolutionNote}
              onNoteChange={setResolutionNote}
              updating={updating}
              onUpdate={(s, notify) => updateStatus(s, resolutionNote, notify)}
            />
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
  const tone = { red: 'err', amber: 'warn', emerald: 'ok' } as const;
  return (
    <StatTile
      label={label}
      value={value}
      tone={accent ? tone[accent] : 'neutral'}
    />
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
        className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
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
