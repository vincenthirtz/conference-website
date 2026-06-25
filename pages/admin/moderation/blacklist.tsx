// pages/admin/moderation/blacklist.tsx
// Admin: gestion de la blacklist joueurs du tenant courant.
//
// Endpoints:
//   GET    /api/admin/moderation/blacklist?search=&active=  → { items, total }
//   POST   /api/admin/moderation/blacklist                  → entrée créée
//   PATCH  /api/admin/moderation/blacklist/[id]             → { reason?, notes?, active? }
//   DELETE /api/admin/moderation/blacklist/[id]
//
// minRole 'manager' (miroir des routes API).

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { StaffProps } from '@/types/admin';
import { useUrlFilters } from '@/utils/useUrlFilters';

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

export const getServerSideProps = withStaffPage('manager');

function AdminBlacklistPage(_: StaffProps) {
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
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

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    if (searchFilter) params.set('search', searchFilter);
    if (activeFilter) params.set('active', activeFilter);
    try {
      const res = await fetch(
        `/api/admin/moderation/blacklist?${params.toString()}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      setEntries(json.items || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [searchFilter, activeFilter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  function submitSearch() {
    setFilters({ search: searchInput.trim() || null });
  }

  const hasIdentifier =
    form.battle_tag.trim().length > 0 ||
    form.display_name.trim().length > 0 ||
    form.discord_user_id.trim().length > 0;

  async function createEntry() {
    if (!hasIdentifier) {
      addToast(
        'Au moins un identifiant requis (BattleTag, pseudo ou ID Discord).',
        'error'
      );
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

      const res = await fetch('/api/admin/moderation/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      addToast('Entrée ajoutée à la blacklist.', 'success');
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
      const res = await fetch(`/api/admin/moderation/blacklist/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !entry.active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      addToast(
        entry.active ? 'Entrée désactivée.' : 'Entrée réactivée.',
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
      const res = await fetch(`/api/admin/moderation/blacklist/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: editReason.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      addToast('Entrée mise à jour.', 'success');
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
      'cette entrée';
    const ok = await confirm({
      title: 'Supprimer cette entrée ?',
      subtitle: `« ${label} » sera retiré définitivement de la blacklist.`,
      variant: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;

    setBusyId(entry.id);
    try {
      const res = await fetch(`/api/admin/moderation/blacklist/${entry.id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur');
      }
      addToast('Entrée supprimée.', 'success');
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
      <Head>
        <title>Admin – Blacklist joueurs</title>
      </Head>

      {dialog}

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">
              Blacklist joueurs
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Joueurs bannis pour ce tenant. Une entrée inactive est conservée
              pour l&apos;historique mais n&apos;est plus appliquée.
            </p>
          </div>

          {/* Formulaire d'ajout */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-neutral-200 mb-3">
              Ajouter une entrée
            </h2>
            <p className="text-xs text-neutral-500 mb-4">
              Au moins un identifiant requis : BattleTag, pseudo
              d&apos;affichage ou ID Discord.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <Input
                label="BattleTag"
                value={form.battle_tag}
                onChange={(v) => setForm((f) => ({ ...f, battle_tag: v }))}
                placeholder="Joueur#1234"
              />
              <Input
                label="Pseudo d'affichage"
                value={form.display_name}
                onChange={(v) => setForm((f) => ({ ...f, display_name: v }))}
                placeholder="Pseudo"
              />
              <Input
                label="ID Discord"
                value={form.discord_user_id}
                onChange={(v) => setForm((f) => ({ ...f, discord_user_id: v }))}
                placeholder="123456789012345678"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <Input
                label="Raison (optionnel)"
                value={form.reason}
                onChange={(v) => setForm((f) => ({ ...f, reason: v }))}
                placeholder="Comportement toxique, triche…"
              />
              <Input
                label="Notes internes (optionnel)"
                value={form.notes}
                onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
                placeholder="Contexte, références…"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={createEntry}
                disabled={creating || !hasIdentifier}
                className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {creating ? 'Ajout…' : 'Ajouter à la blacklist'}
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
                placeholder="Rechercher (BattleTag, pseudo, ID Discord)…"
                className="flex-1 px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                type="button"
                onClick={submitSearch}
                className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
              >
                Rechercher
              </button>
            </div>

            <select
              className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
              value={activeFilter}
              onChange={(e) => setFilters({ active: e.target.value || null })}
            >
              <option value="">Tous statuts</option>
              <option value="true">Actifs</option>
              <option value="false">Inactifs</option>
            </select>

            <button
              type="button"
              onClick={fetchEntries}
              className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
            >
              Rafraîchir
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
              Aucune entrée dans la blacklist.
            </div>
          ) : (
            <>
              {typeof total === 'number' && (
                <p className="text-xs text-neutral-500 mb-2">
                  {total} entrée{total > 1 ? 's' : ''}
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
                                {entry.active ? 'Actif' : 'Inactif'}
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
                                  Discord: {entry.discord_user_id}
                                </span>
                              )}
                            </div>

                            {isEditing ? (
                              <div className="mt-3 space-y-2">
                                <input
                                  type="text"
                                  value={editReason}
                                  onChange={(e) =>
                                    setEditReason(e.target.value)
                                  }
                                  placeholder="Raison"
                                  className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                                <textarea
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
                                  rows={2}
                                  placeholder="Notes internes"
                                  className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => saveEdit(entry)}
                                    disabled={savingEdit}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-medium transition-colors disabled:opacity-50"
                                  >
                                    {savingEdit
                                      ? 'Enregistrement…'
                                      : 'Enregistrer'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    disabled={savingEdit}
                                    className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-xs transition-colors disabled:opacity-50"
                                  >
                                    Annuler
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
                                    Banni par : {entry.banned_by}
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
                                Éditer
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
                                {entry.active ? 'Désactiver' : 'Réactiver'}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteEntry(entry)}
                                disabled={isBusy}
                                className="px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-xs font-medium transition-colors disabled:opacity-50"
                              >
                                Supprimer
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
        </div>
      </div>
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

export default AdminBlacklistPage;
