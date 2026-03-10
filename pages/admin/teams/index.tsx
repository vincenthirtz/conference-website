import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';
import { useUrlFilters } from '@/utils/useUrlFilters';
import type { StaffProps, TeamRow } from '@/types/admin';

type TeamsApiResponse = {
  teams: TeamRow[];
  total: number | null;
};

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

export const getServerSideProps = withStaffPage('manager');

const FILTER_KEYS = ['search', 'isActive', 'tournamentId', 'offset'] as const;
const LIMIT = 25;

function AdminTeamsListPage({ staff }: StaffProps) {
  const { filters, setFilter, setFilters } = useUrlFilters(FILTER_KEYS);

  const search = filters.search ?? '';
  const activeFilter = filters.isActive ?? '';
  const tournamentFilter = filters.tournamentId ?? '';
  const offset = Number(filters.offset) || 0;

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tournamentOptions, setTournamentOptions] = useState<
    { id: string; name: string }[]
  >([]);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<string>('');
  const [assignTournamentId, setAssignTournamentId] = useState('');

  // CSV import modal
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvTournamentId, setCsvTournamentId] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{
    created: number;
    skipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  // Local search input (synced to URL on submit)
  const [searchInput, setSearchInput] = useState(search);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(LIMIT));
      params.set('offset', String(offset));
      params.set('includeTotal', '1');
      if (search.trim()) params.set('search', search.trim());
      if (activeFilter) params.set('isActive', activeFilter);
      if (tournamentFilter) params.set('tournamentId', tournamentFilter);

      const res = await fetch(`/api/admin/teams?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les équipes');
      }

      const json: TeamsApiResponse = await res.json();
      setTeams(json.teams || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [offset, search, activeFilter, tournamentFilter]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  useEffect(() => {
    async function loadTournaments() {
      try {
        const res = await fetch('/api/admin/tournaments?limit=200');
        if (res.ok) {
          const json = await res.json();
          setTournamentOptions(
            (json.tournaments || []).map((t: any) => ({
              id: t.id,
              name: t.name,
            }))
          );
        }
      } catch {
        // ignore
      }
    }
    loadTournaments();
  }, []);

  async function handleDelete(team: TeamRow) {
    if (!team?.id) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/teams/${team.id}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Échec de la suppression');
      }
      setDeleteTarget(null);
      fetchTeams();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setDeleting(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFilters({ search: searchInput.trim() || null, offset: null });
  }

  // Bulk selection helpers
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === teams.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(teams.map((t) => t.id)));
    }
  }

  async function handleBulkAction() {
    if (selected.size === 0 || !bulkAction) return;
    setBulkProcessing(true);
    setErrorMsg(null);
    setBulkMsg(null);

    try {
      const body: any = {
        action: bulkAction,
        teamIds: Array.from(selected),
      };
      if (bulkAction === 'assign' && assignTournamentId) {
        body.tournamentId = assignTournamentId;
      }

      const res = await fetch('/api/admin/teams/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur');
      }

      const json = await res.json();
      const labels: Record<string, string> = {
        delete: 'supprimee(s)',
        activate: 'activee(s)',
        deactivate: 'desactivee(s)',
        assign: 'assignee(s)',
      };
      setBulkMsg(`${json.count} equipe(s) ${labels[bulkAction] || bulkAction}.`);
      setSelected(new Set());
      setBulkAction('');
      fetchTeams();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur');
    } finally {
      setBulkProcessing(false);
    }
  }

  // CSV import
  async function handleCsvImport() {
    if (!csvText.trim()) return;
    setCsvImporting(true);
    setCsvResult(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/teams/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv: csvText,
          tournamentId: csvTournamentId || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur import');
      }

      const json = await res.json();
      setCsvResult(json);
      if (json.created > 0) fetchTeams();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur import');
    } finally {
      setCsvImporting(false);
    }
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) || '');
    };
    reader.readAsText(file);
  }

  return (
    <>
      <Head>
        <title>Admin – Équipes</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Équipes
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total !== null
                    ? `${total} équipe${total > 1 ? 's' : ''} enregistrée${total > 1 ? 's' : ''}`
                    : 'Chargement...'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCsvModal(true); setCsvResult(null); setCsvText(''); }}
                  className="px-4 py-2.5 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import CSV
                </button>
                <Link
                  href="/admin/teams/new"
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Nouvelle equipe
                </Link>
              </div>
            </div>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {errorMsg}
            </div>
          )}

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <form
              onSubmit={handleSearchSubmit}
              className="flex gap-4 flex-wrap items-end"
            >
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Recherche
                </label>
                <div className="relative">
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
                    placeholder="Nom ou slug..."
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="min-w-[140px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Statut
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={activeFilter}
                  onChange={(e) => {
                    setFilters({ isActive: e.target.value || null, offset: null });
                  }}
                >
                  <option value="">Toutes</option>
                  <option value="true">Actives</option>
                  <option value="false">Inactives</option>
                </select>
              </div>

              <div className="min-w-[180px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Tournoi
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={tournamentFilter}
                  onChange={(e) => {
                    setFilters({ tournamentId: e.target.value || null, offset: null });
                  }}
                >
                  <option value="">Tous les tournois</option>
                  {tournamentOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                Rechercher
              </button>
            </form>
          </section>

          {/* Bulk success message */}
          {bulkMsg && (
            <div className="mb-6 rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {bulkMsg}
            </div>
          )}

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="mb-4 flex items-center gap-3 bg-blue-900/30 border border-blue-500/30 rounded-xl px-4 py-3 flex-wrap">
              <span className="text-sm font-medium">
                {selected.size} equipe{selected.size > 1 ? 's' : ''} selectionnee{selected.size > 1 ? 's' : ''}
              </span>
              <div className="flex-1" />
              <select
                className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
                value={bulkAction}
                onChange={(e) => setBulkAction(e.target.value)}
              >
                <option value="">Action...</option>
                <option value="activate">Activer</option>
                <option value="deactivate">Desactiver</option>
                <option value="delete">Supprimer (soft)</option>
                <option value="assign">Assigner a un tournoi</option>
              </select>
              {bulkAction === 'assign' && (
                <select
                  className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
                  value={assignTournamentId}
                  onChange={(e) => setAssignTournamentId(e.target.value)}
                >
                  <option value="">Choisir un tournoi...</option>
                  {tournamentOptions.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleBulkAction}
                disabled={bulkProcessing || !bulkAction || (bulkAction === 'assign' && !assignTournamentId)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {bulkProcessing ? 'Traitement...' : 'Appliquer'}
              </button>
              <button
                type="button"
                onClick={() => { setSelected(new Set()); setBulkAction(''); }}
                className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
              >
                Annuler
              </button>
            </div>
          )}

          {/* Teams List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-20 text-neutral-400">
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-neutral-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Aucune équipe trouvée
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {/* Select all header */}
                <div className="px-4 py-3 bg-neutral-800/80 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.size === teams.length && teams.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-900"
                  />
                  <span className="text-xs text-neutral-400 uppercase tracking-wide font-medium">
                    Tout selectionner
                  </span>
                </div>

                {teams.map((team) => (
                  <div
                    key={team.id}
                    className={`flex items-center gap-4 p-4 hover:bg-neutral-700/30 transition-colors group ${
                      selected.has(team.id) ? 'bg-blue-900/10' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selected.has(team.id)}
                      onChange={() => toggleSelect(team.id)}
                      className="w-4 h-4 rounded border-neutral-600 bg-neutral-900 flex-shrink-0"
                    />

                    {/* Logo */}
                    <div className="flex-shrink-0">
                      {team.logo_url ? (
                        <Image
                          src={team.logo_url}
                          alt={team.name}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-xl object-cover border border-neutral-700"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                          <svg
                            className="w-6 h-6 text-neutral-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white truncate">
                          {team.name}
                        </h3>
                        {team.short_name && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-700 text-neutral-300">
                            {team.short_name}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            team.is_active
                              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-neutral-600/20 text-neutral-400 border border-neutral-500/30'
                          }`}
                        >
                          {team.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-neutral-400">
                        {team.slug && (
                          <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                            /{team.slug}
                          </span>
                        )}
                        {team.country && (
                          <>
                            <span>{team.country}</span>
                            <span>•</span>
                          </>
                        )}
                        <span>Créée le {formatDate(team.created_at)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link
                        href={`/admin/teams/${team.id}/edit`}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-1.5"
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        Éditer
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(team)}
                        className="p-2 rounded-lg hover:bg-red-900/50 text-red-400 transition-colors"
                        title="Supprimer"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setFilter('offset', String(Math.max(0, offset - LIMIT)) || null)}
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
              Précédent
            </button>

            <span className="text-neutral-400 text-sm">
              {offset + 1} – {offset + teams.length}
              {total ? ` sur ${total}` : ''}
            </span>

            <button
              type="button"
              disabled={loading || (total !== null && offset + LIMIT >= total)}
              onClick={() => setFilter('offset', String(offset + LIMIT))}
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Suivant
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
        </div>
      </div>

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  Supprimer l&apos;équipe ?
                </h3>
                <p className="text-sm text-neutral-400">
                  Cette action est irréversible
                </p>
              </div>
            </div>

            <p className="text-sm text-neutral-300 mb-4 bg-neutral-900/50 rounded-xl p-3">
              Cela désactive l&apos;équipe (suppression soft). Continuer pour{' '}
              <span className="font-semibold text-white">{deleteTarget.name}</span> ?
            </p>

            {errorMsg && (
              <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-red-400 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                {errorMsg}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
                disabled={deleting}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteTarget)}
                disabled={deleting}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
                  deleting
                    ? 'bg-red-800 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Suppression...
                  </>
                ) : (
                  'Supprimer'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Import CSV d&apos;equipes</h3>
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="p-1 rounded-lg hover:bg-neutral-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-neutral-400 mb-4">
              Format attendu : <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">name,short_name,country,players</code>
              <br />
              Les joueurs sont separes par <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">;</code> (battle_tags).
              La premiere ligne est l&apos;en-tete.
            </p>

            {/* File input */}
            <div className="mb-4">
              <label className="block text-sm text-neutral-400 mb-1">
                Fichier CSV (ou coller ci-dessous)
              </label>
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleCsvFile}
                className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-neutral-700 file:text-white hover:file:bg-neutral-600 file:cursor-pointer"
              />
            </div>

            {/* Textarea */}
            <div className="mb-4">
              <label className="block text-sm text-neutral-400 mb-1">
                Contenu CSV
              </label>
              <textarea
                className="w-full h-40 px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                placeholder={`name,short_name,country,players\nTeam Alpha,TA,FR,Player1#1234;Player2#5678\nTeam Beta,TB,BE,Player3#9999`}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </div>

            {/* Optional tournament */}
            <div className="mb-4">
              <label className="block text-sm text-neutral-400 mb-1">
                Inscrire au tournoi (optionnel)
              </label>
              <select
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
                value={csvTournamentId}
                onChange={(e) => setCsvTournamentId(e.target.value)}
              >
                <option value="">Aucun</option>
                {tournamentOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Result */}
            {csvResult && (
              <div className="mb-4 rounded-xl bg-neutral-900/50 border border-neutral-700 p-4 text-sm">
                <div className="flex gap-4 mb-2">
                  <span className="text-emerald-400">{csvResult.created} creee(s)</span>
                  {csvResult.skipped > 0 && (
                    <span className="text-amber-400">{csvResult.skipped} doublon(s)</span>
                  )}
                  {csvResult.errors.length > 0 && (
                    <span className="text-red-400">{csvResult.errors.length} erreur(s)</span>
                  )}
                </div>
                {csvResult.errors.length > 0 && (
                  <ul className="text-xs text-red-300 space-y-1 max-h-32 overflow-y-auto">
                    {csvResult.errors.map((e, i) => (
                      <li key={i}>Ligne {e.row}: {e.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleCsvImport}
                disabled={csvImporting || !csvText.trim()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {csvImporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Import en cours...
                  </>
                ) : (
                  'Importer'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AdminTeamsListPage;
