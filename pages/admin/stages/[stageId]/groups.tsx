// pages/admin/stages/[stageId]/groups.tsx
// Admin page for managing group/pool assignments in group or round_robin stages.
// Supports drag & drop between groups + auto-distribution.

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import StageTabsNav from '@/components/admin/stages/StageTabsNav';
import type { StaffProps, StageType } from '@/types/admin';
import nsAdminStageGroups from '@/lib/i18n/locales/admin-fr/adminStageGroups';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  DraggableTeamRow,
  GroupLabel,
  GroupStandingsTable,
} from '@/features/admin/stages/ui/GroupsBoard';
import {
  CARD,
  CARD_TITLE,
  ERROR_BOX,
  INPUT,
  MUTED,
  SPINNER,
  STRONG,
} from '@/features/admin/stages/ui/rubanClasses';

const SMALL_LABEL = 'mb-1 block text-xs text-[var(--t3,#a39ba6)]';
const DROP_ZONE =
  'rounded-[var(--r-ctrl,4px)] border-[var(--line2,rgba(194,196,201,.2))] py-4 text-center text-xs italic text-[var(--t4,#807984)]';

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

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function AdminStageGroupsPage(_props: StaffProps) {
  const t = useAdminT(nsAdminStageGroups);
  const router = useRouter();
  const { stageId } = router.query;
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { mutate: mutateIdempotent } = useIdempotentMutation();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [stageName, setStageName] = useState('');
  const [stageType, setStageType] = useState<StageType | null>(null);
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
        setStageType(stageJson.stage?.stage_type ?? null);
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
    const ok = await confirm({
      title: format(t.confirmGenerate, {
        rounds: genRounds,
        format: genMatchFormat,
      }),
      variant: 'warning',
    });
    if (!ok) return;
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
      {dialog}
      <Head>
        <title>
          {stageName
            ? format(t.pageTitleWithStage, { name: stageName })
            : t.pageTitle}
        </title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <StageTabsNav
          stageId={String(stageId ?? '')}
          active="groups"
          stageType={stageType}
          tournamentId={tournamentId || undefined}
          tournamentName={tournamentName || undefined}
        />
        <AdminPageHeader
          title={t.heading}
          subtitle={
            stageName && (
              <>
                {t.phaseLabel} <span className={STRONG}>{stageName}</span>
                {tournamentName && (
                  <>
                    {' '}
                    {t.tournamentLabel}{' '}
                    <Link
                      href={`/admin/tournament/${tournamentId}`}
                      className="text-[var(--or-200,#eec4ff)] hover:underline"
                    >
                      {tournamentName}
                    </Link>
                  </>
                )}
              </>
            )
          }
          actions={
            <>
              <span className={`self-center font-mono text-sm ${MUTED}`}>
                {format(t.teamsGroupsSummary, {
                  teams: totalTeams,
                  groups: groupKeys.length,
                })}
              </span>
              <AdminButton
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t.saving : t.save}
              </AdminButton>
            </>
          }
        />

        {errorMsg && <div className={`mb-6 ${ERROR_BOX}`}>{errorMsg}</div>}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className={SPINNER} />
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            {/* Auto-distribute toolbar */}
            <section className={CARD}>
              <h2 className={`${CARD_TITLE} mb-4`}>{t.autoDistributeTitle}</h2>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className={SMALL_LABEL}>{t.numGroupsLabel}</label>
                  <input
                    type="number"
                    min={2}
                    max={16}
                    value={numGroups}
                    onChange={(e) =>
                      setNumGroups(parseInt(e.target.value, 10) || 2)
                    }
                    className={`${INPUT} !w-24`}
                  />
                </div>
                <div>
                  <label className={SMALL_LABEL}>{t.methodLabel}</label>
                  <select
                    value={distMethod}
                    onChange={(e) =>
                      setDistMethod(e.target.value as 'snake' | 'random')
                    }
                    className={`${INPUT} !w-auto`}
                  >
                    <option value="snake">{t.methodSnake}</option>
                    <option value="random">{t.methodRandom}</option>
                  </select>
                </div>
                <AdminButton
                  variant="secondary"
                  size="sm"
                  onClick={handleAutoDistribute}
                  disabled={distributing || totalTeams === 0}
                >
                  {distributing ? t.distributing : t.distribute}
                </AdminButton>
                <AdminButton size="sm" onClick={addGroup}>
                  {t.addGroup}
                </AdminButton>
              </div>
              <p className={`mt-3 text-xs ${MUTED}`}>{t.dndHelp}</p>
            </section>

            {/* Groups grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groupKeys.map((gk) => (
                <section
                  key={gk}
                  className={`${CARD} !p-4`}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(gk)}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <GroupLabel groupKey={gk} />
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-xs ${MUTED}`}>
                        {format(t.groupTeamCount, {
                          count: groups[gk].length,
                        })}
                      </span>
                      {groups[gk].length === 0 && (
                        <AdminButton
                          variant="danger"
                          size="xs"
                          onClick={() => removeGroup(gk)}
                          title={t.removeGroupTitle}
                          aria-label={t.removeGroupTitle}
                        >
                          ✕
                        </AdminButton>
                      )}
                    </div>
                  </div>
                  <div className="min-h-[60px] space-y-1">
                    {groups[gk].length === 0 && (
                      <div className={`${DROP_ZONE} border-2 border-dashed`}>
                        {t.dropTeamsHere}
                      </div>
                    )}
                    {groups[gk].map((team) => (
                      <DraggableTeamRow
                        key={team.teamId}
                        team={team}
                        onDragStart={() => handleDragStart(team, gk)}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {/* Unassigned pool */}
              <section
                className={`${CARD} !border-dashed !p-4`}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop('__unassigned')}
              >
                <div className="mb-3 flex items-center justify-between">
                  <Chip tone="neutral">{t.unassignedLabel}</Chip>
                  <span className={`font-mono text-xs ${MUTED}`}>
                    {format(t.groupTeamCount, { count: unassigned.length })}
                  </span>
                </div>
                <div className="min-h-[60px] space-y-1">
                  {unassigned.length === 0 && groupKeys.length > 0 && (
                    <div className={DROP_ZONE}>{t.allAssigned}</div>
                  )}
                  {unassigned.length === 0 && groupKeys.length === 0 && (
                    <div className={DROP_ZONE}>{t.noTeamsInPhase}</div>
                  )}
                  {unassigned.map((team) => (
                    <DraggableTeamRow
                      key={team.teamId}
                      team={team}
                      onDragStart={() => handleDragStart(team, '__unassigned')}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              </section>
            </div>

            {/* Générer les matchs round-robin */}
            <section className={CARD}>
              <h2 className={`${CARD_TITLE} mb-1`}>{t.genMatchesTitle}</h2>
              <p className={`mb-4 text-xs ${MUTED}`}>{t.genMatchesHelp}</p>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className={SMALL_LABEL}>{t.roundsLabel}</label>
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
                    className={`${INPUT} !w-32`}
                  />
                </div>
                <div>
                  <label className={SMALL_LABEL}>{t.matchFormatLabel}</label>
                  <select
                    value={genMatchFormat}
                    onChange={(e) => setGenMatchFormat(e.target.value)}
                    className={`${INPUT} !w-auto`}
                  >
                    <option value="bo1">Bo1</option>
                    <option value="bo3">Bo3</option>
                    <option value="bo5">Bo5</option>
                  </select>
                </div>
                <AdminButton
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateMatches}
                  disabled={generating || groupKeys.length === 0}
                >
                  {generating ? t.generating : t.generate}
                </AdminButton>
              </div>
            </section>

            {/* Standings par poule (lecture seule) */}
            {Object.keys(perGroupStandings).length > 0 && (
              <section className={CARD}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className={CARD_TITLE}>{t.standingsTitle}</h2>
                  <AdminButton size="xs" onClick={fetchStandings}>
                    {t.refresh}
                  </AdminButton>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Object.keys(perGroupStandings)
                    .sort()
                    .map((gk) => (
                      <GroupStandingsTable
                        key={gk}
                        groupKey={gk}
                        rows={perGroupStandings[gk]}
                        t={t}
                      />
                    ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default AdminStageGroupsPage;
