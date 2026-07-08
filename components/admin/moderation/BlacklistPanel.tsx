// components/admin/moderation/BlacklistPanel.tsx
// Admin: gestion de la blacklist joueurs du tenant courant.
// Rendered as the "Blacklist" tab of the /admin/moderation hub.
//
// Endpoints:
//   GET    /api/admin/moderation/blacklist?search=&active=  → { items, total }
//   POST   /api/admin/moderation/blacklist                  → entrée créée
//   PATCH  /api/admin/moderation/blacklist/[id]             → { reason?, notes?, active? }
//   DELETE /api/admin/moderation/blacklist/[id]
//
// minRole 'manager' (miroir des routes API).

import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type BlacklistEntry = {
  id: string;
  battle_tag: string | null;
  display_name: string | null;
  discord_user_id: string | null;
  reason: string | null;
  notes: string | null;
  banned_by: string | null;
  active: boolean;
  created_at: string;
};

type AlertStrength = 'strong' | 'soft';
type AlertSource = 'bot_scan' | 'bot_member_add' | 'registration';

type BlacklistAlert = {
  id: string;
  createdAt: string;
  discordUserId: string;
  battleTag: string | null;
  displayName: string | null;
  matchedOn: string;
  strength: string;
  source: string;
  context: string | null;
  reason: string | null;
  blacklistEntryId: string | null;
};

const ALERTS_PAGE_SIZE = 50;

type Dict = ReturnType<typeof useAdminT<'adminModerationBlacklist'>>;

function sourceLabel(source: string, tx: Dict): string {
  const map: Record<AlertSource, string> = {
    bot_scan: tx.sourceBotScan,
    bot_member_add: tx.sourceBotMemberAdd,
    registration: tx.sourceRegistration,
  };
  return map[source as AlertSource] ?? source;
}

const FILTER_KEYS = ['search', 'active'] as const;

function formatDateFr(value: string): string {
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

export default function BlacklistPanel() {
  const tx = useAdminT('adminModerationBlacklist');
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson: createMutateJson } = useIdempotentMutation();
  const { filters, setFilters } = useUrlFilters(FILTER_KEYS);

  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Recherche : input local débrancé du filtre URL pour éviter un refetch à
  // chaque frappe (on synchronise au submit / Entrée).
  const searchFilter = filters.search ?? '';
  const activeFilter = filters.active ?? '';
  const [searchInput, setSearchInput] = useState(searchFilter);

  useEffect(() => {
    setSearchInput(searchFilter);
  }, [searchFilter]);

  // Formulaire d'ajout.
  const [form, setForm] = useState({
    battle_tag: '',
    display_name: '',
    discord_user_id: '',
    reason: '',
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  // Édition inline (raison / notes) de la ligne sélectionnée.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReason, setEditReason] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Lignes en cours de mutation (toggle / delete) pour désactiver les boutons.
  const [busyId, setBusyId] = useState<string | null>(null);

  // Historique des détections (alertes blacklist).
  const [alerts, setAlerts] = useState<BlacklistAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsLoadingMore, setAlertsLoadingMore] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [alertsCursor, setAlertsCursor] = useState<string | null>(null);
  const [alertStrength, setAlertStrength] = useState<'' | AlertStrength>('');
  const [alertSource, setAlertSource] = useState<'' | AlertSource>('');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    if (searchFilter) params.set('search', searchFilter);
    if (activeFilter) params.set('active', activeFilter);
    try {
      const json = await adminFetchJson<{
        items?: BlacklistEntry[];
        total?: number;
      }>(`/api/admin/moderation/blacklist?${params.toString()}`);
      setEntries(json.items || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [searchFilter, activeFilter, adminFetchJson]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const fetchAlerts = useCallback(
    async (cursor: string | null) => {
      const isMore = cursor !== null;
      if (isMore) setAlertsLoadingMore(true);
      else setAlertsLoading(true);
      setAlertsError(null);

      const params = new URLSearchParams();
      params.set('limit', String(ALERTS_PAGE_SIZE));
      if (cursor) params.set('before', cursor);
      if (alertStrength) params.set('strength', alertStrength);
      if (alertSource) params.set('source', alertSource);

      try {
        const json = await adminFetchJson<{
          alerts?: BlacklistAlert[];
          nextCursor?: string | null;
        }>(`/api/admin/moderation/blacklist/alerts?${params.toString()}`);
        const page: BlacklistAlert[] = json.alerts || [];
        setAlerts((prev) => (isMore ? [...prev, ...page] : page));
        setAlertsCursor(json.nextCursor ?? null);
      } catch (err) {
        setAlertsError((err as Error).message);
      } finally {
        if (isMore) setAlertsLoadingMore(false);
        else setAlertsLoading(false);
      }
    },
    [alertStrength, alertSource, adminFetchJson]
  );

  // Recharge depuis le début quand un filtre d'alerte change.
  useEffect(() => {
    fetchAlerts(null);
  }, [fetchAlerts]);

  function submitSearch() {
    setFilters({ search: searchInput.trim() || null });
  }

  const hasIdentifier =
    form.battle_tag.trim().length > 0 ||
    form.display_name.trim().length > 0 ||
    form.discord_user_id.trim().length > 0;

  async function createEntry() {
    if (!hasIdentifier) {
      addToast(tx.errorIdentifierRequired, 'error');
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {};
      if (form.battle_tag.trim()) body.battle_tag = form.battle_tag.trim();
      if (form.display_name.trim())
        body.display_name = form.display_name.trim();
      if (form.discord_user_id.trim())
        body.discord_user_id = form.discord_user_id.trim();
      if (form.reason.trim()) body.reason = form.reason.trim();
      if (form.notes.trim()) body.notes = form.notes.trim();

      await createMutateJson('/api/admin/moderation/blacklist', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      addToast(tx.entryAdded, 'success');
      setForm({
        battle_tag: '',
        display_name: '',
        discord_user_id: '',
        reason: '',
        notes: '',
      });
      await fetchEntries();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(entry: BlacklistEntry) {
    setBusyId(entry.id);
    try {
      await adminFetchJson(`/api/admin/moderation/blacklist/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !entry.active }),
      });
      addToast(
        entry.active ? tx.entryDeactivated : tx.entryReactivated,
        'success'
      );
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id ? { ...e, active: !entry.active } : e
        )
      );
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(entry: BlacklistEntry) {
    setEditingId(entry.id);
    setEditReason(entry.reason ?? '');
    setEditNotes(entry.notes ?? '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditReason('');
    setEditNotes('');
  }

  async function saveEdit(entry: BlacklistEntry) {
    setSavingEdit(true);
    try {
      const json = await adminFetchJson<{
        reason?: string | null;
        notes?: string | null;
      }>(`/api/admin/moderation/blacklist/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          reason: editReason.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });
      addToast(tx.entryUpdated, 'success');
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                reason: json.reason ?? null,
                notes: json.notes ?? null,
              }
            : e
        )
      );
      cancelEdit();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteEntry(entry: BlacklistEntry) {
    const label =
      entry.battle_tag ||
      entry.display_name ||
      entry.discord_user_id ||
      tx.deleteFallbackLabel;
    const ok = await confirm({
      title: tx.confirmDeleteTitle,
      subtitle: format(tx.confirmDeleteSubtitle, { label }),
      variant: 'danger',
      confirmLabel: tx.confirmDeleteLabel,
    });
    if (!ok) return;

    setBusyId(entry.id);
    try {
      await adminFetchJson(`/api/admin/moderation/blacklist/${entry.id}`, {
        method: 'DELETE',
      });
      addToast(tx.entryDeleted, 'success');
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      setTotal((t) => (typeof t === 'number' ? Math.max(0, t - 1) : t));
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {dialog}

      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{tx.heading}</h1>
        <p className="text-sm text-neutral-400 mt-1">{tx.subtitle}</p>
      </div>

      {/* Formulaire d'ajout */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-neutral-200 mb-3">
          {tx.addHeading}
        </h2>
        <p className="text-xs text-neutral-500 mb-4">{tx.addHelp}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <Input
            label={tx.battleTagLabel}
            value={form.battle_tag}
            onChange={(v) => setForm((f) => ({ ...f, battle_tag: v }))}
            placeholder={tx.playerTagPlaceholder}
          />
          <Input
            label={tx.displayNameLabel}
            value={form.display_name}
            onChange={(v) => setForm((f) => ({ ...f, display_name: v }))}
            placeholder={tx.displayNamePlaceholder}
          />
          <Input
            label={tx.discordIdLabel}
            value={form.discord_user_id}
            onChange={(v) => setForm((f) => ({ ...f, discord_user_id: v }))}
            placeholder="123456789012345678"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Input
            label={tx.reasonLabel}
            value={form.reason}
            onChange={(v) => setForm((f) => ({ ...f, reason: v }))}
            placeholder={tx.reasonPlaceholder}
          />
          <Input
            label={tx.notesLabel}
            value={form.notes}
            onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            placeholder={tx.notesPlaceholder}
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={createEntry}
            disabled={creating || !hasIdentifier}
            className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {creating ? tx.adding : tx.addToBlacklist}
          </button>
        </div>
      </section>

      {/* Filtres */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSearch();
            }}
            placeholder={tx.searchPlaceholder}
            className="flex-1 px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            type="button"
            onClick={submitSearch}
            className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
          >
            {tx.searchBtn}
          </button>
        </div>

        <select
          className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
          value={activeFilter}
          onChange={(e) => setFilters({ active: e.target.value || null })}
        >
          <option value="">{tx.filterAllStatus}</option>
          <option value="true">{tx.filterActive}</option>
          <option value="false">{tx.filterInactive}</option>
        </select>

        <button
          type="button"
          onClick={fetchEntries}
          className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
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
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 text-neutral-500 text-sm">
          {tx.emptyEntries}
        </div>
      ) : (
        <>
          {typeof total === 'number' && (
            <p className="text-xs text-neutral-500 mb-2">
              {format(total > 1 ? tx.entriesCount_other : tx.entriesCount_one, {
                total,
              })}
            </p>
          )}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            <div className="divide-y divide-neutral-700/50">
              {entries.map((entry) => {
                const isEditing = editingId === entry.id;
                const isBusy = busyId === entry.id;
                return (
                  <div key={entry.id} className="px-4 py-3">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-3">
                      {/* Identifiants */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                              entry.active
                                ? 'bg-red-600/20 text-red-200 border-red-500/40'
                                : 'bg-neutral-600/20 text-neutral-300 border-neutral-500/40'
                            }`}
                          >
                            {entry.active ? tx.statusActive : tx.statusInactive}
                          </span>
                          <span className="text-xs text-neutral-500">
                            {formatDateFr(entry.created_at)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                          {entry.battle_tag && (
                            <span className="font-mono text-white">
                              {entry.battle_tag}
                            </span>
                          )}
                          {entry.display_name && (
                            <span className="text-neutral-200">
                              {entry.display_name}
                            </span>
                          )}
                          {entry.discord_user_id && (
                            <span className="font-mono text-indigo-300 text-xs self-center">
                              {format(tx.discordLine, {
                                id: entry.discord_user_id,
                              })}
                            </span>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="mt-3 space-y-2">
                            <input
                              type="text"
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              placeholder={tx.editReasonPlaceholder}
                              className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                            <textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              rows={2}
                              placeholder={tx.editNotesPlaceholder}
                              className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => saveEdit(entry)}
                                disabled={savingEdit}
                                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-medium transition-colors disabled:opacity-50"
                              >
                                {savingEdit ? tx.savingEdit : tx.saveEdit}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={savingEdit}
                                className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-xs transition-colors disabled:opacity-50"
                              >
                                {tx.cancel}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {entry.reason && (
                              <p className="text-sm text-neutral-300 mt-1">
                                {entry.reason}
                              </p>
                            )}
                            {entry.notes && (
                              <p className="text-xs text-neutral-500 mt-0.5 italic">
                                {entry.notes}
                              </p>
                            )}
                            {entry.banned_by && (
                              <p className="text-xs text-neutral-600 mt-1 font-mono">
                                {format(tx.bannedBy, {
                                  who: entry.banned_by,
                                })}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Actions */}
                      {!isEditing && (
                        <div className="flex flex-wrap gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            disabled={isBusy}
                            className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-xs transition-colors disabled:opacity-50"
                          >
                            {tx.edit}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(entry)}
                            disabled={isBusy}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                              entry.active
                                ? 'bg-amber-700 hover:bg-amber-600'
                                : 'bg-emerald-700 hover:bg-emerald-600'
                            }`}
                          >
                            {entry.active ? tx.deactivate : tx.reactivate}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEntry(entry)}
                            disabled={isBusy}
                            className="px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {tx.delete}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* Historique des détections */}
      <div className="mt-12 mb-6">
        <h2 className="text-2xl font-bold tracking-tight">
          {tx.historyHeading}
        </h2>
        <p className="text-sm text-neutral-400 mt-1">{tx.historySubtitle}</p>
      </div>

      {/* Filtres alertes */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">{tx.forceLabel}</span>
          <select
            className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
            value={alertStrength}
            onChange={(e) =>
              setAlertStrength(e.target.value as '' | AlertStrength)
            }
          >
            <option value="">{tx.forceAll}</option>
            <option value="strong">{tx.forceStrong}</option>
            <option value="soft">{tx.forceSoft}</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">{tx.sourceFilterLabel}</span>
          <select
            className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
            value={alertSource}
            onChange={(e) => setAlertSource(e.target.value as '' | AlertSource)}
          >
            <option value="">{tx.sourceAll}</option>
            <option value="bot_scan">{tx.sourceBotScan}</option>
            <option value="bot_member_add">{tx.sourceBotMemberAdd}</option>
            <option value="registration">{tx.sourceRegistration}</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => fetchAlerts(null)}
          className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
        >
          {tx.refresh}
        </button>
      </section>

      {alertsError && (
        <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
          {alertsError}
        </div>
      )}

      {alertsLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-20 text-neutral-500 text-sm">
          {tx.emptyAlerts}
        </div>
      ) : (
        <>
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            <div className="divide-y divide-neutral-700/50">
              {alerts.map((alert) => (
                <div key={alert.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                        alert.strength === 'strong'
                          ? 'bg-red-600/20 text-red-200 border-red-500/40'
                          : 'bg-amber-600/20 text-amber-200 border-amber-500/40'
                      }`}
                    >
                      {alert.strength === 'strong'
                        ? tx.alertStrong
                        : alert.strength === 'soft'
                          ? tx.alertSoft
                          : alert.strength}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-indigo-600/20 text-indigo-200 border-indigo-500/40">
                      {sourceLabel(alert.source, tx)}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {formatDateFr(alert.createdAt)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                    {alert.battleTag && (
                      <span className="font-mono text-white">
                        {alert.battleTag}
                      </span>
                    )}
                    {alert.displayName && (
                      <span className="text-neutral-200">
                        {alert.displayName}
                      </span>
                    )}
                    <span className="font-mono text-indigo-300 text-xs self-center">
                      {format(tx.discordLine, { id: alert.discordUserId })}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-400 mt-1">
                    {tx.criterionLabel}{' '}
                    <span className="text-neutral-200">{alert.matchedOn}</span>
                  </p>

                  {alert.context && (
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {format(tx.contextLine, { context: alert.context })}
                    </p>
                  )}
                  {alert.reason && (
                    <p className="text-sm text-neutral-300 mt-1">
                      {alert.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {alertsCursor && (
            <div className="flex justify-center mt-4">
              <button
                type="button"
                onClick={() => fetchAlerts(alertsCursor)}
                disabled={alertsLoadingMore}
                className="px-4 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {alertsLoadingMore ? tx.loadingMore : tx.loadMore}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
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
        className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      />
    </label>
  );
}
