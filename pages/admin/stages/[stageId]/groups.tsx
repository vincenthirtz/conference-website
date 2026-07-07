// pages/admin/stages/[stageId]/groups.tsx
// Admin page for managing group/pool assignments in group or round_robin stages.
// Supports drag & drop between groups + auto-distribution.

import { useEffect, useState, useCallback, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
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
  const t = useAdminT('adminStageGroups');
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
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${colors[idx]}`}
    >
      {format(t.groupLabel, { key: groupKey })}
    </span>
  );
}

function AdminStageGroupsPage({ staff }: StaffProps) {
  const t = useAdminT('adminStageGroups');
  const router = useRouter();
  const { stageId } = router.query;
  const { addToast } = useToast();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { mutate: mutateIdempotent } = useIdempotentMutation();

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

  // Match generation
  const [genRounds, setGenRounds] = useState(1);
  const [genMatchFormat, setGenMatchFormat] = useState('bo3');
  const [generating, setGenerating] = useState(false);

  // Per-group standings
  type GroupStanding = {
    teamId: string;
    teamName: string | null;
    rank: number;
    wins: number;
    losses: number;
    draws: number;
    score: number;
  };
  const [perGroupStandings, setPerGroupStandings] = useState<
    Record<string, GroupStanding[]>
  >({});

  const fetchGroups = useCallback(async () => {
    if (!stageId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const json = await adminFetchJson<GroupsApiResponse>(
        `/api/admin/stages/${stageId}/groups`
      );
      setGroups(json.groups);
      setUnassigned(json.unassigned);

      // Fetch stage info
      const stageRes = await adminFetch(`/api/admin/stages/${stageId}`);
      if (stageRes.ok) {
        const stageJson = await stageRes.json();
        setStageName(stageJson.stage?.name || '');
        setTournamentId(stageJson.stage?.tournament_id || '');
        if (stageJson.stage?.tournament_id) {
          const tRes = await adminFetch(
            `/api/admin/tournament/${stageJson.stage.tournament_id}`
          );
          if (tRes.ok) {
            const tJson = await tRes.json();
            setTournamentName(tJson.tournament?.name || '');
          }
        }
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setLoading(false);
    }
  }, [stageId, adminFetch, adminFetchJson, t.errUnexpected]);

  useEffect(() => {
    if (stageId) fetchGroups();
  }, [stageId, fetchGroups]);

  const fetchStandings = useCallback(async () => {
    if (!stageId) return;
    try {
      const res = await adminFetch(`/api/admin/stages/${stageId}/standings`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.grouped?.groups) {
        setPerGroupStandings(json.grouped.groups);
      }
    } catch {
      // best-effort, no toast
    }
  }, [stageId, adminFetch]);

  useEffect(() => {
    if (stageId) fetchStandings();
  }, [stageId, fetchStandings]);

  async function handleGenerateMatches() {
    if (!stageId) return;
    if (
      !confirm(
        format(t.confirmGenerate, {
          rounds: genRounds,
          format: genMatchFormat,
        })
      )
    )
      return;
    setGenerating(true);
    setErrorMsg(null);
    try {
      const res = await mutateIdempotent(
        `/api/admin/stages/${stageId}/generate-group-matches`,
        {
          method: 'POST',
          body: JSON.stringify({
            rounds: genRounds,
            matchFormat: genMatchFormat,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t.errGenerate);
      addToast(
        format(t.toastGenerated, {
          count: json.createdMatchIds?.length ?? 0,
          groupCount: json.groupCount ?? 0,
        }),
        'success'
      );
      await fetchStandings();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errGenerate);
    } finally {
      setGenerating(false);
    }
  }

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
        [dragSource]: (prev[dragSource] || []).filter(
          (t) => t.teamId !== dragTeam.teamId
        ),
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
      const assignments: Array<{ teamId: string; groupKey: string | null }> =
        [];

      for (const [groupKey, teams] of Object.entries(groups)) {
        for (const team of teams) {
          assignments.push({ teamId: team.teamId, groupKey });
        }
      }
      for (const team of unassigned) {
        assignments.push({ teamId: team.teamId, groupKey: null });
      }

      await adminFetchJson(`/api/admin/stages/${stageId}/groups`, {
        method: 'PUT',
        body: JSON.stringify({ assignments }),
      });

      addToast(t.toastSaved, 'success');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
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
      const json = await adminFetchJson<GroupsApiResponse>(
        `/api/admin/stages/${stageId}/groups`,
        {
          method: 'POST',
          body: JSON.stringify({ numGroups, method: distMethod }),
        }
      );
      setGroups(json.groups);
      setUnassigned(json.unassigned || []);
      addToast(format(t.toastDistributed, { count: numGroups }), 'success');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setDistributing(false);
    }
  }

  const groupKeys = Object.keys(groups).sort();
  const totalTeams =
    groupKeys.reduce((sum, k) => sum + groups[k].length, 0) + unassigned.length;

  return (
    <>
      <Head>
        <title>
          {stageName
            ? format(t.pageTitleWithStage, { name: stageName })
            : t.pageTitle}
        </title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() =>
                router.push(
                  stageId ? `/admin/stages/${stageId}` : '/admin/tournaments'
                )
              }
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
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
              {t.back}
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                {stageName && (
                  <p className="text-sm text-neutral-400 mt-1">
                    {t.phaseLabel}{' '}
                    <span className="text-white">{stageName}</span>
                    {tournamentName && (
                      <>
                        {' '}
                        {t.tournamentLabel}{' '}
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
                  {format(t.teamsGroupsSummary, {
                    teams: totalTeams,
                    groups: groupKeys.length,
                  })}
                </span>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t.saving}
                    </>
                  ) : (
                    t.save
                  )}
                </button>
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
                  <svg
                    className="w-5 h-5 text-neutral-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                    />
                  </svg>
                  {t.autoDistributeTitle}
                </h2>

                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">
                      {t.numGroupsLabel}
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={16}
                      value={numGroups}
                      onChange={(e) =>
                        setNumGroups(parseInt(e.target.value, 10) || 2)
                      }
                      className="w-24 px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">
                      {t.methodLabel}
                    </label>
                    <select
                      value={distMethod}
                      onChange={(e) =>
                        setDistMethod(e.target.value as 'snake' | 'random')
                      }
                      className="px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="snake">{t.methodSnake}</option>
                      <option value="random">{t.methodRandom}</option>
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
                        {t.distributing}
                      </>
                    ) : (
                      <>
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
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                          />
                        </svg>
                        {t.distribute}
                      </>
                    )}
                  </button>

                  <button
                    onClick={addGroup}
                    className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors flex items-center gap-2"
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
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                    {t.addGroup}
                  </button>
                </div>

                <p className="text-xs text-neutral-500 mt-3">{t.dndHelp}</p>
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
                          {format(t.groupTeamCount, {
                            count: groups[gk].length,
                          })}
                        </span>
                        {groups[gk].length === 0 && (
                          <button
                            onClick={() => removeGroup(gk)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                            title={t.removeGroupTitle}
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
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 min-h-[60px]">
                      {groups[gk].length === 0 && (
                        <div className="text-xs text-neutral-600 italic text-center py-4 border-2 border-dashed border-neutral-700 rounded-xl">
                          {t.dropTeamsHere}
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
                              {(team.shortName ||
                                team.name ||
                                '?')[0].toUpperCase()}
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
                      {t.unassignedLabel}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {format(t.groupTeamCount, { count: unassigned.length })}
                    </span>
                  </div>

                  <div className="space-y-1 min-h-[60px]">
                    {unassigned.length === 0 && groupKeys.length > 0 && (
                      <div className="text-xs text-neutral-600 italic text-center py-4">
                        {t.allAssigned}
                      </div>
                    )}
                    {unassigned.length === 0 && groupKeys.length === 0 && (
                      <div className="text-xs text-neutral-600 italic text-center py-4">
                        {t.noTeamsInPhase}
                      </div>
                    )}
                    {unassigned.map((team) => (
                      <div
                        key={team.teamId}
                        draggable
                        onDragStart={() =>
                          handleDragStart(team, '__unassigned')
                        }
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
                            {(team.shortName ||
                              team.name ||
                              '?')[0].toUpperCase()}
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

              {/* Générer les matchs round-robin */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-1">
                  {t.genMatchesTitle}
                </h2>
                <p className="text-xs text-neutral-400 mb-4">
                  {t.genMatchesHelp}
                </p>

                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">
                      {t.roundsLabel}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={genRounds}
                      onChange={(e) =>
                        setGenRounds(
                          Math.max(1, Math.min(4, Number(e.target.value) || 1))
                        )
                      }
                      className="w-32 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">
                      {t.matchFormatLabel}
                    </label>
                    <select
                      value={genMatchFormat}
                      onChange={(e) => setGenMatchFormat(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
                    >
                      <option value="bo1">Bo1</option>
                      <option value="bo3">Bo3</option>
                      <option value="bo5">Bo5</option>
                    </select>
                  </div>
                  <button
                    onClick={handleGenerateMatches}
                    disabled={generating || groupKeys.length === 0}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {generating ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t.generating}
                      </>
                    ) : (
                      t.generate
                    )}
                  </button>
                </div>
              </section>

              {/* Standings par poule (lecture seule) */}
              {Object.keys(perGroupStandings).length > 0 && (
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">
                      {t.standingsTitle}
                    </h2>
                    <button
                      onClick={fetchStandings}
                      className="text-xs text-neutral-400 hover:text-white"
                    >
                      {t.refresh}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Object.keys(perGroupStandings)
                      .sort()
                      .map((gk) => (
                        <div
                          key={gk}
                          className="bg-neutral-900/50 border border-neutral-700/50 rounded-xl p-3"
                        >
                          <div className="mb-2">
                            <GroupLabel groupKey={gk} />
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-neutral-500 text-left">
                                <th className="pb-1 font-normal">#</th>
                                <th className="pb-1 font-normal">{t.thTeam}</th>
                                <th className="pb-1 font-normal text-center">
                                  {t.thWins}
                                </th>
                                <th className="pb-1 font-normal text-center">
                                  {t.thLosses}
                                </th>
                                <th className="pb-1 font-normal text-center">
                                  {t.thDraws}
                                </th>
                                <th className="pb-1 font-normal text-right">
                                  {t.thPoints}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {perGroupStandings[gk].map((s) => (
                                <tr
                                  key={s.teamId}
                                  className="border-t border-neutral-800"
                                >
                                  <td className="py-1 text-neutral-400 font-mono">
                                    {s.rank}
                                  </td>
                                  <td className="py-1 truncate max-w-[140px]">
                                    {s.teamName || s.teamId.slice(0, 6)}
                                  </td>
                                  <td className="py-1 text-center text-emerald-300">
                                    {s.wins}
                                  </td>
                                  <td className="py-1 text-center text-red-300">
                                    {s.losses}
                                  </td>
                                  <td className="py-1 text-center text-neutral-400">
                                    {s.draws}
                                  </td>
                                  <td className="py-1 text-right font-semibold">
                                    {s.score}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminStageGroupsPage;
