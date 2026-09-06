// components/admin/moderation/EntityBlacklistPanel.tsx
// Admin: gestion de la blacklist d'entités (équipes / structures-assos) du
// tenant courant. Rendered as the « Équipes & structures » sub-tab of the
// Blacklist tab in the /admin/moderation hub (miroir de BlacklistPanel.tsx).
//
// Endpoints:
//   GET    /api/admin/moderation/entity-blacklist?limit=&offset=&search=&active=&entity_type=
//          → { items, total }
//   POST   /api/admin/moderation/entity-blacklist
//          → { entity_type (requis), name (requis), reason?, notes? }
//   PATCH  /api/admin/moderation/entity-blacklist/[id]
//          → { name?, entity_type?, reason?, notes?, active? }
//   DELETE /api/admin/moderation/entity-blacklist/[id]
//
// Produit : la blacklist ALERTE (jamais ne bloque) à la création d'équipe —
// nom exact = alerte forte, inclusion de nom = alerte faible ; les alertes
// tombent dans le salon staff Discord.

import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useUrlFilters } from '@/utils/useUrlFilters';
import AdminPagination from '@/components/admin/AdminPagination';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminModerationEntityBlacklist from '@/lib/i18n/locales/admin-fr/adminModerationEntityBlacklist';

type EntityType = 'team' | 'org';

type EntityBlacklistEntry = {
  id: string;
  tenant_id: string;
  entity_type: EntityType;
  name: string;
  reason: string | null;
  notes: string | null;
  banned_by: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const PAGE_SIZE = 50;

// Clés préfixées « e » pour ne pas entrer en collision avec les filtres URL du
// panel joueurs (search/active) — les deux panels vivent sous le même ?tab=.
const FILTER_KEYS = ['esearch', 'eactive', 'etype'] as const;

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

export default function EntityBlacklistPanel() {
  const tx = useAdminT(nsAdminModerationEntityBlacklist);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson: createMutateJson } = useIdempotentMutation();
  const { filters, setFilters } = useUrlFilters(FILTER_KEYS);

  // Recherche : input local débranché du filtre URL pour éviter un refetch à
  // chaque frappe (on synchronise au submit / Entrée).
  const searchFilter = filters.esearch ?? '';
  const activeFilter = filters.eactive ?? '';
  const typeFilter = filters.etype ?? '';
  const [searchInput, setSearchInput] = useState(searchFilter);

  useEffect(() => {
    setSearchInput(searchFilter);
  }, [searchFilter]);

  // Entrées : filtres serveur `search`/`active`/`entity_type` réactifs (portés
  // par l'URL). Le contrat renvoie toujours { items, total } → includeTotal
  // désactivé, le `total` du hook est lu directement dans le payload.
  const {
    data: entries,
    total,
    loading,
    error: errorMsg,
    refresh: fetchEntries,
    mutate: mutateEntries,
    offset,
    nextPage,
    prevPage,
    resetOffset,
    hasMore,
  } = useAdminResource<
    EntityBlacklistEntry,
    { items?: EntityBlacklistEntry[]; total?: number | null }
  >('/api/admin/moderation/entity-blacklist', {
    limit: PAGE_SIZE,
    includeTotal: false,
    params: {
      search: searchFilter,
      active: activeFilter,
      entity_type: typeFilter,
    },
    select: (res) => res.items || [],
  });

  // Formulaire d'ajout.
  const [form, setForm] = useState({
    entity_type: 'team' as EntityType,
    name: '',
    reason: '',
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  // Édition inline de la ligne sélectionnée.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<EntityType>('team');
  const [editName, setEditName] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Lignes en cours de mutation (toggle / delete) pour désactiver les boutons.
  const [busyId, setBusyId] = useState<string | null>(null);

  function submitSearch() {
    setFilters({ esearch: searchInput.trim() || null });
    resetOffset();
  }

  const canCreate = form.name.trim().length > 0;

  async function createEntry() {
    if (!canCreate) {
      addToast(tx.errorNameRequired, 'error');
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        entity_type: form.entity_type,
        name: form.name.trim(),
      };
      if (form.reason.trim()) body.reason = form.reason.trim();
      if (form.notes.trim()) body.notes = form.notes.trim();

      await createMutateJson('/api/admin/moderation/entity-blacklist', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      addToast(tx.entryAdded, 'success');
      setForm({
        entity_type: form.entity_type,
        name: '',
        reason: '',
        notes: '',
      });
      fetchEntries();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(entry: EntityBlacklistEntry) {
    setBusyId(entry.id);
    try {
      await adminFetchJson(
        `/api/admin/moderation/entity-blacklist/${entry.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ active: !entry.active }),
        }
      );
      addToast(
        entry.active ? tx.entryDeactivated : tx.entryReactivated,
        'success'
      );
      mutateEntries((prev) =>
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

  function startEdit(entry: EntityBlacklistEntry) {
    setEditingId(entry.id);
    setEditType(entry.entity_type);
    setEditName(entry.name);
    setEditReason(entry.reason ?? '');
    setEditNotes(entry.notes ?? '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditReason('');
    setEditNotes('');
  }

  async function saveEdit(entry: EntityBlacklistEntry) {
    if (!editName.trim()) {
      addToast(tx.errorNameRequired, 'error');
      return;
    }
    setSavingEdit(true);
    try {
      const json = await adminFetchJson<{
        entity_type?: EntityType;
        name?: string;
        reason?: string | null;
        notes?: string | null;
      }>(`/api/admin/moderation/entity-blacklist/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          entity_type: editType,
          name: editName.trim(),
          reason: editReason.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });
      addToast(tx.entryUpdated, 'success');
      mutateEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                entity_type: json.entity_type ?? editType,
                name: json.name ?? editName.trim(),
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

  async function deleteEntry(entry: EntityBlacklistEntry) {
    const ok = await confirm({
      title: tx.confirmDeleteTitle,
      subtitle: format(tx.confirmDeleteSubtitle, { label: entry.name }),
      variant: 'danger',
      confirmLabel: tx.confirmDeleteLabel,
    });
    if (!ok) return;

    setBusyId(entry.id);
    try {
      // Le DELETE répond 204 sans body : adminFetchJson tolère le body vide
      // (échec de res.json() → payload null, pas de throw sur 2xx).
      await adminFetchJson(
        `/api/admin/moderation/entity-blacklist/${entry.id}`,
        { method: 'DELETE' }
      );
      addToast(tx.entryDeleted, 'success');
      // UI optimiste + refetch pour resservir la page (pagination + total).
      mutateEntries((prev) => prev.filter((e) => e.id !== entry.id));
      fetchEntries();
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
        <p className="text-xs text-neutral-500 mt-2">{tx.alertHelp}</p>
      </div>

      {/* Formulaire d'ajout */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-neutral-200 mb-3">
          {tx.addHeading}
        </h2>
        <p className="text-xs text-neutral-500 mb-4">{tx.addHelp}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <label className="block">
            <span className="block text-xs text-neutral-500 uppercase tracking-wide mb-1">
              {tx.typeLabel}
            </span>
            <select
              value={form.entity_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  entity_type: e.target.value as EntityType,
                }))
              }
              className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="team">{tx.typeTeam}</option>
              <option value="org">{tx.typeOrg}</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <Input
              label={tx.nameLabel}
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder={tx.namePlaceholder}
              maxLength={190}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Input
            label={tx.reasonLabel}
            value={form.reason}
            onChange={(v) => setForm((f) => ({ ...f, reason: v }))}
            placeholder={tx.reasonPlaceholder}
            maxLength={1000}
          />
          <Input
            label={tx.notesLabel}
            value={form.notes}
            onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            placeholder={tx.notesPlaceholder}
            maxLength={2000}
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={createEntry}
            disabled={creating || !canCreate}
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
          value={typeFilter}
          onChange={(e) => {
            setFilters({ etype: e.target.value || null });
            resetOffset();
          }}
        >
          <option value="">{tx.filterAllTypes}</option>
          <option value="team">{tx.filterTeams}</option>
          <option value="org">{tx.filterOrgs}</option>
        </select>

        <select
          className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
          value={activeFilter}
          onChange={(e) => {
            setFilters({ eactive: e.target.value || null });
            resetOffset();
          }}
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                              entry.entity_type === 'team'
                                ? 'bg-sky-600/20 text-sky-200 border-sky-500/40'
                                : 'bg-purple-600/20 text-purple-200 border-purple-500/40'
                            }`}
                          >
                            {entry.entity_type === 'team'
                              ? tx.typeTeam
                              : tx.typeOrg}
                          </span>
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

                        {!isEditing && (
                          <div className="text-sm font-medium text-white">
                            {entry.name}
                          </div>
                        )}

                        {isEditing ? (
                          <div className="mt-3 space-y-2">
                            <div className="flex flex-col sm:flex-row gap-2">
                              <select
                                value={editType}
                                onChange={(e) =>
                                  setEditType(e.target.value as EntityType)
                                }
                                className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              >
                                <option value="team">{tx.typeTeam}</option>
                                <option value="org">{tx.typeOrg}</option>
                              </select>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                maxLength={190}
                                placeholder={tx.editNamePlaceholder}
                                className="flex-1 px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              />
                            </div>
                            <input
                              type="text"
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              maxLength={1000}
                              placeholder={tx.editReasonPlaceholder}
                              className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                            <textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              rows={2}
                              maxLength={2000}
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
                                {format(tx.bannedBy, { who: entry.banned_by })}
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

          {/* Pagination */}
          <AdminPagination
            offset={offset}
            count={entries.length}
            total={total}
            hasMore={hasMore}
            loading={loading}
            onPrev={prevPage}
            onNext={nextPage}
            labels={{ prev: tx.pagePrev, next: tx.pageNext, info: tx.pageInfo }}
          />
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
