// pages/admin/stages/[stageId]/groups.tsx
// Admin page for managing group/pool assignments in group or round_robin stages.
// Supports drag & drop between groups + auto-distribution.

import { useEffect, useState, useCallback, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import type { StaffProps } from '@/types/admin';

type TeamInfo = {
  teamId: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  seed: number | null;
};

type GroupsApiResponse = {
  stageId: string;
  groups: Record<string, TeamInfo[]>;
  unassigned: TeamInfo[];
};

export const getServerSideProps = withStaffPage('manager');

function GroupLabel({ groupKey }: { groupKey: string }) {
  const colors = [
    'bg-blue-500/20 text-blue-300 border-blue-500/30',
    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'bg-purple-500/20 text-purple-300 border-purple-500/30',
    'bg-pink-500/20 text-pink-300 border-pink-500/30',
    'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    'bg-red-500/20 text-red-300 border-red-500/30',
    'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  ];
  const idx = groupKey.charCodeAt(0) % colors.length;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${colors[idx]}`}>
      Poule {groupKey}
    </span>
  );
}

function AdminStageGroupsPage({ staff }: StaffProps) {
  const router = useRouter();
  const { stageId } = router.query;
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [stageName, setStageName] = useState('');
  const [tournamentId, setTournamentId] = useState('');
  const [tournamentName, setTournamentName] = useState('');

  const [groups, setGroups] = useState<Record<string, TeamInfo[]>>({});
  const [unassigned, setUnassigned] = useState<TeamInfo[]>([]);

  // Auto-distribute
  const [numGroups, setNumGroups] = useState(2);
  const [distMethod, setDistMethod] = useState<'snake' | 'random'>('snake');
  const [distributing, setDistributing] = useState(false);

  // Drag state
  const [dragTeam, setDragTeam] = useState<TeamInfo | null>(null);
  const [dragSource, setDragSource] = useState<string | null>(null); // group key or '__unassigned'

  const fetchGroups = useCallback(async () => {
    if (!stageId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/groups`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors du chargement des groupes');
      }
      const json: GroupsApiResponse = await res.json();
      setGroups(json.groups);
      setUnassigned(json.unassigned);

      // Fetch stage info
      const stageRes = await fetch(`/api/admin/stages/${stageId}`);
      if (stageRes.ok) {
        const stageJson = await stageRes.json();
        setStageName(stageJson.stage?.name || '');
        setTournamentId(stageJson.stage?.tournament_id || '');
        if (stageJson.stage?.tournament_id) {
          const tRes = await fetch(`/api/admin/tournament/${stageJson.stage.tournament_id}`);
          if (tRes.ok) {
            const tJson = await tRes.json();
            setTournamentName(tJson.tournament?.name || '');
          }
        }
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [stageId]);

  useEffect(() => {
    if (stageId) fetchGroups();
  }, [stageId, fetchGroups]);

  // Drag handlers
  function handleDragStart(team: TeamInfo, source: string) {
    setDragTeam(team);
    setDragSource(source);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(targetGroup: string) {
    if (!dragTeam || !dragSource) return;
    if (dragSource === targetGroup) {
      setDragTeam(null);
      setDragSource(null);
      return;
    }

    // Remove from source
    if (dragSource === '__unassigned') {
      setUnassigned((prev) => prev.filter((t) => t.teamId !== dragTeam.teamId));
    } else {
      setGroups((prev) => ({
        ...prev,
        [dragSource]: (prev[dragSource] || []).filter((t) => t.teamId !== dragTeam.teamId),
      }));
    }

    // Add to target
    if (targetGroup === '__unassigned') {
      setUnassigned((prev) => [...prev, dragTeam]);
    } else {
      setGroups((prev) => ({
        ...prev,
        [targetGroup]: [...(prev[targetGroup] || []), dragTeam],
      }));
    }

    setDragTeam(null);
    setDragSource(null);
  }

  function handleDragEnd() {
    setDragTeam(null);
    setDragSource(null);
  }

  // Add a new empty group
  function addGroup() {
    const existingKeys = Object.keys(groups).sort();
    // Find next letter
    let nextKey = 'A';
    for (let i = 0; i < 26; i++) {
      const key = String.fromCharCode(65 + i);
      if (!existingKeys.includes(key)) {
        nextKey = key;
        break;
      }
    }
    setGroups((prev) => ({ ...prev, [nextKey]: [] }));
  }

  // Remove empty group
  function removeGroup(groupKey: string) {
    const teams = groups[groupKey] || [];
    setUnassigned((prev) => [...prev, ...teams]);
    setGroups((prev) => {
      const next = { ...prev };
      delete next[groupKey];
      return next;
    });
  }

  // Save assignments
  async function handleSave() {
    if (!stageId) return;
    setSaving(true);
    setErrorMsg(null);

    try {
      const assignments: Array<{ teamId: string; groupKey: string | null }> = [];

      for (const [groupKey, teams] of Object.entries(groups)) {
        for (const team of teams) {
          assignments.push({ teamId: team.teamId, groupKey });
        }
      }
      for (const team of unassigned) {
        assignments.push({ teamId: team.teamId, groupKey: null });
      }

      const res = await fetch(`/api/admin/stages/${stageId}/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la sauvegarde');
      }

      addToast('Groupes sauvegardés avec succès', 'success');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setSaving(false);
    }
  }

  // Auto-distribute
  async function handleAutoDistribute() {
    if (!stageId) return;
    setDistributing(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numGroups, method: distMethod }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la distribution');
      }

      const json = await res.json();
      setGroups(json.groups);
      setUnassigned(json.unassigned || []);
      addToast(`Equipes distribuées en ${numGroups} poule(s)`, 'success');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setDistributing(false);
    }
  }

  const groupKeys = Object.keys(groups).sort();
  const totalTeams = groupKeys.reduce((sum, k) => sum + groups[k].length, 0) + unassigned.length;

  return (
    <>
      <Head>
        <title>Admin – Poules {stageName ? `: ${stageName}` : ''}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push(stageId ? `/admin/stages/${stageId}` : '/admin/tournaments')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Retour à la phase
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Gestion des Poules
                </h1>
                {stageName && (
                  <p className="text-sm text-neutral-400 mt-1">
                    Phase : <span className="text-white">{stageName}</span>
                    {tournamentName && (
                      <>
                        {' '}— Tournoi :{' '}
                        <Link
                          href={`/admin/tournament/${tournamentId}`}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {tournamentName}
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-400">
                  {totalTeams} equipe(s) — {groupKeys.length} poule(s)
                </span>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sauvegarde...
                    </>
                  ) : (
                    'Sauvegarder'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {errorMsg}
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {!loading && (
            <div className="space-y-6">
              {/* Auto-distribute toolbar */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  Distribution automatique
                </h2>

                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Nombre de poules</label>
                    <input
                      type="number"
                      min={2}
                      max={16}
                      value={numGroups}
                      onChange={(e) => setNumGroups(parseInt(e.target.value, 10) || 2)}
                      className="w-24 px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Methode</label>
                    <select
                      value={distMethod}
                      onChange={(e) => setDistMethod(e.target.value as 'snake' | 'random')}
                      className="px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="snake">Snake (par seed)</option>
                      <option value="random">Aleatoire</option>
                    </select>
                  </div>

                  <button
                    onClick={handleAutoDistribute}
                    disabled={distributing || totalTeams === 0}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {distributing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Distribution...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        Distribuer
                      </>
                    )}
                  </button>

                  <button
                    onClick={addGroup}
                    className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Ajouter une poule
                  </button>
                </div>

                <p className="text-xs text-neutral-500 mt-3">
                  Glissez-déposez les equipes entre les poules. Cliquez &laquo; Sauvegarder &raquo; pour enregistrer.
                </p>
              </section>

              {/* Groups grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {groupKeys.map((gk) => (
                  <section
                    key={gk}
                    className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4"
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(gk)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <GroupLabel groupKey={gk} />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-500">
                          {groups[gk].length} equipe(s)
                        </span>
                        {groups[gk].length === 0 && (
                          <button
                            onClick={() => removeGroup(gk)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                            title="Supprimer cette poule"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 min-h-[60px]">
                      {groups[gk].length === 0 && (
                        <div className="text-xs text-neutral-600 italic text-center py-4 border-2 border-dashed border-neutral-700 rounded-xl">
                          Deposez des equipes ici
                        </div>
                      )}
                      {groups[gk].map((team) => (
                        <div
                          key={team.teamId}
                          draggable
                          onDragStart={() => handleDragStart(team, gk)}
                          onDragEnd={handleDragEnd}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-neutral-900/60 hover:bg-neutral-700/60 cursor-grab active:cursor-grabbing transition-colors border border-transparent hover:border-neutral-600"
                        >
                          {team.logoUrl ? (
                            <Image
                              src={team.logoUrl}
                              alt=""
                              width={24}
                              height={24}
                              className="rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-400">
                              {(team.shortName || team.name || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm font-medium truncate flex-1">
                            {team.name || team.teamId.slice(0, 8)}
                          </span>
                          {team.seed !== null && (
                            <span className="text-xs text-neutral-500 font-mono">
                              #{team.seed}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}

                {/* Unassigned pool */}
                <section
                  className="bg-neutral-900/50 backdrop-blur border-2 border-dashed border-neutral-700/50 rounded-2xl p-4"
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop('__unassigned')}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-neutral-700/50 text-neutral-400 border-neutral-600/50">
                      Non assignees
                    </span>
                    <span className="text-xs text-neutral-500">
                      {unassigned.length} equipe(s)
                    </span>
                  </div>

                  <div className="space-y-1 min-h-[60px]">
                    {unassigned.length === 0 && groupKeys.length > 0 && (
                      <div className="text-xs text-neutral-600 italic text-center py-4">
                        Toutes les equipes sont assignees
                      </div>
                    )}
                    {unassigned.length === 0 && groupKeys.length === 0 && (
                      <div className="text-xs text-neutral-600 italic text-center py-4">
                        Aucune equipe dans cette phase
                      </div>
                    )}
                    {unassigned.map((team) => (
                      <div
                        key={team.teamId}
                        draggable
                        onDragStart={() => handleDragStart(team, '__unassigned')}
                        onDragEnd={handleDragEnd}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-neutral-800/60 hover:bg-neutral-700/60 cursor-grab active:cursor-grabbing transition-colors border border-transparent hover:border-neutral-600"
                      >
                        {team.logoUrl ? (
                          <Image
                            src={team.logoUrl}
                            alt=""
                            width={24}
                            height={24}
                            className="rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-400">
                            {(team.shortName || team.name || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-medium truncate flex-1">
                          {team.name || team.teamId.slice(0, 8)}
                        </span>
                        {team.seed !== null && (
                          <span className="text-xs text-neutral-500 font-mono">
                            #{team.seed}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminStageGroupsPage;
