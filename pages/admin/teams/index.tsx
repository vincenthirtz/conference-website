import { useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import EmptyState from '@/components/admin/EmptyState';
import { SkeletonListRow } from '@/components/admin/Skeleton';
import { useUrlFilters } from '@/utils/useUrlFilters';
import {
  escapePostgrestValue,
  sanitizeSearch,
} from '@/utils/apiHelpers';
import type { TeamRow } from '@/types/admin';

import { logger } from '../../../utils/logger';
type AdminTeamsProps = {
  staff: {
    id: string | null;
    role: string | null;
    display_name: string | null;
  };
  teams: TeamRow[];
  total: number | null;
  errorMsg: string | null;
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

const FILTER_KEYS = ['search', 'isActive', 'tournamentId', 'offset'] as const;
const LIMIT = 25;

function AdminTeamsListPage({
  teams,
  total,
  errorMsg: ssrError,
}: AdminTeamsProps) {
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const router = useRouter();
  const { filters, setFilter, setFilters } = useUrlFilters(FILTER_KEYS);

  const search = filters.search ?? '';
  const activeFilter = filters.isActive ?? '';
  const tournamentFilter = filters.tournamentId ?? '';
  const offset = Number(filters.offset) || 0;
  const loading = false;

  const [errorMsg, setErrorMsg] = useState<string | null>(ssrError);
  const [deleteTarget, setDeleteTarget] = useState<TeamRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Tournament dropdown is loaded lazily on first focus (saves 200-row query
  // on every page load when filters aren't used).
  const [tournamentOptions, setTournamentOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [tournamentsLoaded, setTournamentsLoaded] = useState(false);

  const loadTournaments = useCallback(async () => {
    if (tournamentsLoaded) return;
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
    } finally {
      setTournamentsLoaded(true);
    }
  }, [tournamentsLoaded]);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkAction, setBulkAction] = useState<string>('');
  const [assignTournamentId, setAssignTournamentId] = useState('');

  // Import modal (CSV + platform integrations)
  type ImportTab = 'csv' | 'toornament' | 'challonge' | 'startgg';
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ImportTab>('csv');
  const [csvText, setCsvText] = useState('');
  const [platformRef, setPlatformRef] = useState('');
  const [importTournamentId, setImportTournamentId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    skipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  // API keys config sub-modal
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [apiKeys, setApiKeys] = useState<{
    toornament: string;
    challonge: string;
    startgg: string;
  }>({ toornament: '', challonge: '', startgg: '' });
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [apiKeysSaving, setApiKeysSaving] = useState(false);
  const [revealedKey, setRevealedKey] = useState<keyof typeof apiKeys | null>(
    null
  );

  // Local search input (synced to URL on submit)
  const [searchInput, setSearchInput] = useState(search);

  const fetchTeams = useCallback(() => {
    router.replace(router.asPath, undefined, { scroll: false });
  }, [router]);

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
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
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

    // Confirmation pour les actions destructives ou lourdes en consequences
    if (bulkAction === 'delete') {
      const ok = await confirm({
        title: `Supprimer ${selected.size} equipe(s) ?`,
        subtitle:
          'Soft-delete : recuperable depuis la corbeille pendant 30 jours.',
        variant: 'danger',
        confirmLabel: 'Supprimer',
      });
      if (!ok) return;
    } else if (bulkAction === 'deactivate') {
      const ok = await confirm({
        title: `Desactiver ${selected.size} equipe(s) ?`,
        subtitle:
          'Elles ne pourront plus etre listees publiquement.',
        variant: 'warning',
        confirmLabel: 'Desactiver',
      });
      if (!ok) return;
    }

    setBulkProcessing(true);
    setErrorMsg(null);

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
      addToast(
        `${json.count} equipe(s) ${labels[bulkAction] || bulkAction}.`,
        'success'
      );
      setSelected(new Set());
      setBulkAction('');
      fetchTeams();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur');
    } finally {
      setBulkProcessing(false);
    }
  }

  // Import (CSV ou plateforme)
  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    setErrorMsg(null);

    try {
      let res: Response;
      if (activeTab === 'csv') {
        if (!csvText.trim()) {
          setImporting(false);
          return;
        }
        res = await fetch('/api/admin/teams/import-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            csv: csvText,
            tournamentId: importTournamentId || undefined,
          }),
        });
      } else {
        if (!platformRef.trim()) {
          setImporting(false);
          return;
        }
        res = await fetch('/api/admin/teams/import-platform', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: activeTab,
            sourceRef: platformRef,
            tournamentId: importTournamentId || undefined,
          }),
        });
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur import');
      }

      const json = await res.json();
      setImportResult(json);
      if (json.created > 0) fetchTeams();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur import');
    } finally {
      setImporting(false);
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

  // API keys config
  async function loadApiKeys() {
    setApiKeysLoading(true);
    try {
      const keys = [
        'toornament_api_key',
        'challonge_api_key',
        'startgg_api_key',
      ];
      const fetched = await Promise.all(
        keys.map((k) =>
          fetch(`/api/admin/site-settings/${k}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        )
      );
      setApiKeys({
        toornament: fetched[0]?.value ?? '',
        challonge: fetched[1]?.value ?? '',
        startgg: fetched[2]?.value ?? '',
      });
    } finally {
      setApiKeysLoading(false);
    }
  }

  async function saveApiKeys() {
    setApiKeysSaving(true);
    setErrorMsg(null);
    try {
      const entries: { key: string; value: string; description: string }[] = [
        {
          key: 'toornament_api_key',
          value: apiKeys.toornament,
          description:
            "Clé API Toornament Viewer (X-Api-Key) pour import d'équipes.",
        },
        {
          key: 'challonge_api_key',
          value: apiKeys.challonge,
          description: "Clé API Challonge v1 pour import d'équipes.",
        },
        {
          key: 'startgg_api_key',
          value: apiKeys.startgg,
          description: "Token start.gg (Bearer) pour import d'équipes.",
        },
      ];

      for (const entry of entries) {
        const res = await fetch('/api/admin/site-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || `Échec sauvegarde ${entry.key}`);
        }
      }
      addToast('Clés API enregistrées.', 'success');
      setShowApiKeysModal(false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur sauvegarde clés');
    } finally {
      setApiKeysSaving(false);
    }
  }

  return (
    <>
      {confirmDialog}
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
                  onClick={() => {
                    setShowImportModal(true);
                    setImportResult(null);
                    setCsvText('');
                    setPlatformRef('');
                  }}
                  className="px-4 py-2.5 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  Importer
                </button>
                <Link
                  href="/admin/teams/new"
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
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
              <span className="flex-1">{errorMsg}</span>
              <button
                type="button"
                onClick={() => fetchTeams()}
                className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
              >
                Réessayer
              </button>
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
                    setFilters({
                      isActive: e.target.value || null,
                      offset: null,
                    });
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
                  onFocus={loadTournaments}
                  onChange={(e) => {
                    setFilters({
                      tournamentId: e.target.value || null,
                      offset: null,
                    });
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

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-blue-900/30 border border-blue-500/30 rounded-xl px-4 py-3 flex-wrap">
              <span className="text-sm font-medium">
                {selected.size} equipe{selected.size > 1 ? 's' : ''}{' '}
                selectionnee{selected.size > 1 ? 's' : ''}
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
                  onFocus={loadTournaments}
                  onChange={(e) => setAssignTournamentId(e.target.value)}
                >
                  <option value="">Choisir un tournoi...</option>
                  {tournamentOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleBulkAction}
                disabled={
                  bulkProcessing ||
                  !bulkAction ||
                  (bulkAction === 'assign' && !assignTournamentId)
                }
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {bulkProcessing ? 'Traitement...' : 'Appliquer'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setBulkAction('');
                }}
                className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
              >
                Annuler
              </button>
            </div>
          )}

          {/* Teams List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonListRow key={i} />
                ))}
              </div>
            ) : teams.length === 0 ? (
              <EmptyState
                title="Aucune equipe trouvee"
                description="Aucune equipe ne correspond a tes filtres. Essaie d'elargir la recherche ou cree une nouvelle equipe."
              />
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
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 hover:bg-neutral-700/30 transition-colors group ${
                      selected.has(team.id) ? 'bg-blue-900/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
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
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border border-neutral-700"
                          />
                        ) : (
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                            <svg
                              className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-500"
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
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                        <div className="flex items-center gap-2 sm:gap-3 text-sm text-neutral-400 flex-wrap">
                          {team.slug && (
                            <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                              /{team.slug}
                            </span>
                          )}
                          {team.country && (
                            <>
                              <span>{team.country}</span>
                              <span className="hidden sm:inline">•</span>
                            </>
                          )}
                          <span>Créée le {formatDate(team.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 pl-7 sm:pl-0">
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
              onClick={() =>
                setFilter('offset', String(Math.max(0, offset - LIMIT)) || null)
              }
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
              <span className="font-semibold text-white">
                {deleteTarget.name}
              </span>{' '}
              ?
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
                <span className="flex-1">{errorMsg}</span>
                <button
                  type="button"
                  onClick={() => fetchTeams()}
                  className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
                >
                  Réessayer
                </button>
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
      {/* Import Modal (CSV + plateformes) */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Importer des équipes</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowApiKeysModal(true);
                    loadApiKeys();
                  }}
                  title="Configurer les clés API"
                  className="p-1.5 rounded-lg hover:bg-neutral-700 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="p-1.5 rounded-lg hover:bg-neutral-700 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
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
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-5 border-b border-neutral-700">
              {(
                [
                  ['csv', 'CSV'],
                  ['toornament', 'Toornament'],
                  ['challonge', 'Challonge'],
                  ['startgg', 'start.gg'],
                ] as [ImportTab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActiveTab(key);
                    setImportResult(null);
                  }}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === key
                      ? 'border-blue-500 text-white'
                      : 'border-transparent text-neutral-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* CSV tab */}
            {activeTab === 'csv' && (
              <>
                <p className="text-sm text-neutral-400 mb-4">
                  Format attendu :{' '}
                  <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                    name,short_name,country,joueurs
                  </code>
                  <br />
                  Les joueurs sont séparés par{' '}
                  <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                    ;
                  </code>{' '}
                  (battle_tags). La première ligne est l&apos;en-tête.
                </p>

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

                <div className="mb-4">
                  <label className="block text-sm text-neutral-400 mb-1">
                    Contenu CSV
                  </label>
                  <textarea
                    className="w-full h-40 px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                    placeholder={`name,short_name,country,joueurs\nTeam Alpha,TA,FR,Player1#1234;Player2#5678\nTeam Beta,TB,BE,Player3#9999`}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Platform tabs */}
            {activeTab !== 'csv' && (
              <>
                <p className="text-sm text-neutral-400 mb-4">
                  {activeTab === 'toornament' && (
                    <>
                      Colle l&apos;URL Toornament du tournoi ou son ID
                      numérique. Ex&nbsp;:{' '}
                      <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                        https://www.toornament.com/tournaments/12345/
                      </code>{' '}
                      ou{' '}
                      <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                        12345
                      </code>
                      .
                    </>
                  )}
                  {activeTab === 'challonge' && (
                    <>
                      Colle l&apos;URL Challonge ou le slug. Ex&nbsp;:{' '}
                      <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                        https://challonge.com/mon-tournoi
                      </code>{' '}
                      ou{' '}
                      <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                        mon-tournoi
                      </code>
                      .
                    </>
                  )}
                  {activeTab === 'startgg' && (
                    <>
                      Colle l&apos;URL d&apos;event start.gg ou son slug
                      complet. Ex&nbsp;:{' '}
                      <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                        https://www.start.gg/tournament/genesis-9/event/melee-singles
                      </code>
                      .
                    </>
                  )}
                  <br />
                  Une clé API doit être configurée (icône{' '}
                  <span className="inline-block">⚙️</span> en haut).
                </p>

                <div className="mb-4">
                  <label className="block text-sm text-neutral-400 mb-1">
                    URL ou identifiant
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder={
                      activeTab === 'toornament'
                        ? 'https://www.toornament.com/tournaments/...'
                        : activeTab === 'challonge'
                          ? 'https://challonge.com/...'
                          : 'https://www.start.gg/tournament/.../event/...'
                    }
                    value={platformRef}
                    onChange={(e) => setPlatformRef(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Tournoi cible (commun) */}
            <div className="mb-4">
              <label className="block text-sm text-neutral-400 mb-1">
                Inscrire au tournoi (optionnel)
              </label>
              <select
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
                value={importTournamentId}
                onFocus={loadTournaments}
                onChange={(e) => setImportTournamentId(e.target.value)}
              >
                <option value="">Aucun</option>
                {tournamentOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Result (commun) */}
            {importResult && (
              <div className="mb-4 rounded-xl bg-neutral-900/50 border border-neutral-700 p-4 text-sm">
                <div className="flex gap-4 mb-2">
                  <span className="text-emerald-400">
                    {importResult.created} créée(s)
                  </span>
                  {importResult.skipped > 0 && (
                    <span className="text-amber-400">
                      {importResult.skipped} doublon(s)
                    </span>
                  )}
                  {importResult.errors.length > 0 && (
                    <span className="text-red-400">
                      {importResult.errors.length} erreur(s)
                    </span>
                  )}
                </div>
                {importResult.errors.length > 0 && (
                  <ul className="text-xs text-red-300 space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>
                        {e.row > 0 ? `Ligne ${e.row}: ` : ''}
                        {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={
                  importing ||
                  (activeTab === 'csv' ? !csvText.trim() : !platformRef.trim())
                }
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {importing ? (
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

      {/* API keys config sub-modal */}
      {showApiKeysModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Clés API d&apos;import</h3>
              <button
                type="button"
                onClick={() => setShowApiKeysModal(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-700 transition-colors"
              >
                <svg
                  className="w-5 h-5"
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

            <p className="text-xs text-amber-300/80 mb-4">
              ⚠️ Ces clés sont stockées en clair dans{' '}
              <code className="bg-neutral-900 px-1 rounded">site_settings</code>
              . Utilise des tokens dédiés à l&apos;import et révoque-les côté
              plateforme si compromis.
            </p>

            {apiKeysLoading ? (
              <p className="text-sm text-neutral-400">Chargement...</p>
            ) : (
              <div className="space-y-4">
                {(['toornament', 'challonge', 'startgg'] as const).map((k) => {
                  const labels: Record<typeof k, string> = {
                    toornament: 'Toornament (X-Api-Key)',
                    challonge: 'Challonge (api_key)',
                    startgg: 'start.gg (Bearer token)',
                  };
                  const isRevealed = revealedKey === k;
                  return (
                    <div key={k}>
                      <label className="block text-sm text-neutral-400 mb-1">
                        {labels[k]}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type={isRevealed ? 'text' : 'password'}
                          className="flex-1 px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                          value={apiKeys[k]}
                          onChange={(e) =>
                            setApiKeys((prev) => ({
                              ...prev,
                              [k]: e.target.value,
                            }))
                          }
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() => setRevealedKey(isRevealed ? null : k)}
                          className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-xs font-medium transition-colors"
                        >
                          {isRevealed ? 'Masquer' : 'Voir'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowApiKeysModal(false)}
                disabled={apiKeysSaving}
                className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveApiKeys}
                disabled={apiKeysSaving || apiKeysLoading}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {apiKeysSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  'Enregistrer'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const getServerSideProps = withStaffPage('manager', async (ctx, staffCtx) => {
  const { query } = ctx;
  const search = sanitizeSearch(query.search);
  const isActive = typeof query.isActive === 'string' ? query.isActive : '';
  const tournamentId =
    typeof query.tournamentId === 'string' ? query.tournamentId : '';
  const offset = Math.max(0, Number(query.offset) || 0);

  if (!supabaseAdmin) {
    return { teams: [], total: null, errorMsg: 'Service indisponible' };
  }

  const { tenantId } = staffCtx;

  let q = supabaseAdmin
    .from('teams')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + LIMIT - 1);

  if (isActive === 'true') q = q.eq('is_active', true);
  if (isActive === 'false') q = q.eq('is_active', false);
  if (search) {
    const s = `%${escapePostgrestValue(search)}%`;
    q = q.or(`name.ilike.${s},slug.ilike.${s},short_name.ilike.${s}`);
  }
  if (tournamentId) {
    const { data: regs } = await supabaseAdmin
      .from('tournament_teams')
      .select('team_id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId);
    const teamIds = (regs || []).map((r) => r.team_id).filter(Boolean);
    if (teamIds.length === 0) {
      return { teams: [], total: 0, errorMsg: null };
    }
    q = q.in('id', teamIds);
  }

  const { data, error, count } = await q;

  if (error) {
    logger.error('admin teams SSR error:', error);
    return { teams: [], total: null, errorMsg: 'Erreur lors du chargement' };
  }

  return {
    teams: (data || []) as TeamRow[],
    total: typeof count === 'number' ? count : null,
    errorMsg: null,
  };
});

export default AdminTeamsListPage;
