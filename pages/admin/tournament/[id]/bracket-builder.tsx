// pages/admin/tournament/[id]/bracket-builder.tsx
// Planning visuel du tournoi — vue schedule par journée

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { formatDateHeader } from '@/utils/dateFormatters';
import { STATUS_CONFIG } from '@/utils/statusConfig';
import AlertBanner from '@/components/admin/AlertBanner';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import {
  MatchCard,
  MatchListView,
  BracketTreeView,
  parseNotes,
} from '@/components/admin/bracket';
import type {
  ScheduleMatch,
  TournamentTeam,
  TeamMini,
  DragPayload,
  BracketRound,
  MatchDay,
} from '@/components/admin/bracket';

type ViewMode = 'planning' | 'list' | 'bracket';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type ApiResponse = {
  tournament: { id: string; name: string; slug: string | null } | null;
  matches: ScheduleMatch[];
};

export const getServerSideProps = withStaffPage('manager');

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

function AdminBracketBuilderPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [tournament, setTournament] = useState<ApiResponse['tournament']>(null);
  const [matches, setMatches] = useState<ScheduleMatch[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('planning');
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeam[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchData() {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    setDirty(false);
    try {
      const [matchRes, teamsRes] = await Promise.all([
        fetch(`/api/admin/tournament/${id}/matches?layout=bracket&limit=512&includeGraph=1`),
        fetch(`/api/admin/tournament/${id}/teams`),
      ]);
      if (!matchRes.ok) {
        const json = await matchRes.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les matchs');
      }
      const json: ApiResponse = await matchRes.json();
      setTournament(json.tournament);
      setMatches(json.matches || []);

      if (teamsRes.ok) {
        const teamsJson = await teamsRes.json();
        setTournamentTeams(teamsJson.teams || []);
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  /** Teams already placed in a match slot — exclude from picker */
  const assignedTeamIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matches) {
      if (m.team1_id) ids.add(m.team1_id);
      if (m.team2_id) ids.add(m.team2_id);
    }
    return ids;
  }, [matches]);

  /** Available teams for assignment (not yet placed in a slot) */
  const availableTeams = useMemo(
    () => tournamentTeams.filter((t) => !assignedTeamIds.has(t.team_id)),
    [tournamentTeams, assignedTeamIds]
  );

  function assignTeamToSlot(matchId: string, slot: 1 | 2, team: TournamentTeam) {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;
        const teamMini: TeamMini = {
          id: team.team.id,
          name: team.team.name,
          short_name: null,
          logo_url: team.team.logo_url,
        };
        if (slot === 1) return { ...m, team1_id: team.team_id, team1: teamMini };
        return { ...m, team2_id: team.team_id, team2: teamMini };
      })
    );
    setDirty(true);
  }

  /** Group matches by date (YYYY-MM-DD) */
  const matchDays: MatchDay[] = useMemo(() => {
    if (!matches.length) return [];
    const groups = new Map<string, MatchDay>();
    const sorted = [...matches].sort(
      (a, b) =>
        new Date(a.scheduled_at || '').getTime() -
        new Date(b.scheduled_at || '').getTime()
    );
    for (const m of sorted) {
      const dateKey = m.scheduled_at
        ? m.scheduled_at.slice(0, 10)
        : 'no-date';
      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          dateKey,
          label: m.scheduled_at ? formatDateHeader(m.scheduled_at) : 'Sans date',
          roundName: m.round_name,
          matches: [],
        });
      }
      groups.get(dateKey)!.matches.push(m);
    }
    return Array.from(groups.values());
  }, [matches]);

  const totalMatches = matches.length;
  const finishedCount = matches.filter((m) => m.status === 'finished').length;

  /** Build bracket rounds from matches for tree view */
  const bracketRounds: BracketRound[] = useMemo(() => {
    if (!matches.length) return [];
    const roundMap = new Map<number, ScheduleMatch[]>();
    for (const m of matches) {
      const r = m.round_number ?? 0;
      if (!roundMap.has(r)) roundMap.set(r, []);
      roundMap.get(r)!.push(m);
    }
    return Array.from(roundMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([roundNum, roundMatches]) => ({
        roundNumber: roundNum,
        roundName:
          roundMatches[0]?.round_name ??
          (roundMatches.length === 1 ? 'Finale' : `Round ${roundNum}`),
        matches: roundMatches.sort(
          (a, b) => (a.position_in_round ?? 0) - (b.position_in_round ?? 0)
        ),
      }));
  }, [matches]);

  /** Export PDF via print */
  const handleExportPDF = useCallback(() => {
    const teamName = (m: ScheduleMatch, slot: 1 | 2) => {
      const t = slot === 1 ? m.team1 : m.team2;
      if (t) return t.name;
      const info = parseNotes(m.notes);
      if (info?.seed1) return `Seed ${slot === 1 ? info.seed1 : info.seed2}`;
      return 'TBD';
    };

    const isElimination = bracketRounds.length > 1 &&
      bracketRounds[0].matches.length > bracketRounds[bracketRounds.length - 1].matches.length;
    const roundCount = bracketRounds.length;
    const colWidthPx = isElimination ? 160 : 140;
    const totalBracketWidth = roundCount * (colWidthPx + 8);
    const pageWidth = roundCount > 6 ? 1020 : 720;
    const scaleFactor = Math.min(1, pageWidth / totalBracketWidth);

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>${tournament?.name ?? 'Tournoi'} — Planning des matchs</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1a1a1a; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 20px; }
  h2 { font-size: 15px; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #7c3aed; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
  th { background: #f3f0ff; text-align: left; padding: 6px 10px; font-weight: 600; border: 1px solid #ddd; }
  td { padding: 6px 10px; border: 1px solid #ddd; }
  tr:nth-child(even) { background: #fafafa; }
  .status { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 600; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .status-ongoing { background: #d1fae5; color: #065f46; }
  .status-finished { background: #e5e7eb; color: #374151; }
  .status-cancelled { background: #fee2e2; color: #991b1b; }
  .winner { font-weight: 700; }
  .bracket-section { page-break-inside: avoid; margin-bottom: 24px; }
  .bracket-scaler {
    transform: scale(${scaleFactor});
    transform-origin: top left;
    ${scaleFactor < 1 ? `width: ${100 / scaleFactor}%; height: auto; margin-bottom: -${Math.round((1 - scaleFactor) * 100)}px;` : ''}
  }
  .bracket-container { display: flex; gap: 0; align-items: stretch; }
  .bracket-round { display: flex; flex-direction: column; justify-content: space-around; min-width: ${colWidthPx}px; padding: 0 4px; }
  .bracket-round-title { text-align: center; font-weight: 700; font-size: 10px; color: #7c3aed; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px; white-space: nowrap; }
  .bracket-match { border: 1px solid #ddd; border-radius: 5px; margin: 3px 0; overflow: hidden; }
  .bracket-team { padding: 3px 6px; font-size: 10px; display: flex; justify-content: space-between; border-bottom: 1px solid #eee; }
  .bracket-team:last-child { border-bottom: none; }
  .bracket-team.winner { background: #f0fdf4; font-weight: 700; }
  .bracket-time { font-size: 8px; color: #999; text-align: center; padding: 2px; background: #f9fafb; }
  .bracket-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(${colWidthPx}px, 1fr)); gap: 12px; margin: 16px 0; }
  .bracket-grid-round { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; background: #fafafa; }
  .bracket-grid-round .bracket-round-title { margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
  .meta { font-size: 10px; color: #999; text-align: right; margin-top: 24px; }
  @media print {
    body { padding: 12px; }
    h1 { font-size: 16px; }
    ${roundCount > 6 ? '@page { size: landscape; }' : ''}
    .bracket-section { page-break-after: always; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<h1>${tournament?.name ?? 'Tournoi'} — Planning des matchs</h1>
<p class="subtitle">Export du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${totalMatches} matchs · ${roundCount} journées</p>

${bracketRounds.length > 1 ? `
<div class="bracket-section">
<h2>Vue Bracket</h2>
${isElimination ? `
<div class="bracket-scaler">
<div class="bracket-container">
${bracketRounds.map((r) => `
  <div class="bracket-round">
    <div class="bracket-round-title">${r.roundName}</div>
    ${r.matches.map((m) => `
      <div class="bracket-match">
        <div class="bracket-time">${m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
        <div class="bracket-team${m.winner_team_id === m.team1_id && m.winner_team_id ? ' winner' : ''}">${teamName(m, 1)}</div>
        <div class="bracket-team${m.winner_team_id === m.team2_id && m.winner_team_id ? ' winner' : ''}">${teamName(m, 2)}</div>
      </div>
    `).join('')}
  </div>
`).join('')}
</div>
</div>` : `
<div class="bracket-grid">
${bracketRounds.map((r) => `
  <div class="bracket-grid-round">
    <div class="bracket-round-title">${r.roundName}</div>
    ${r.matches.map((m) => `
      <div class="bracket-match">
        <div class="bracket-time">${m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
        <div class="bracket-team${m.winner_team_id === m.team1_id && m.winner_team_id ? ' winner' : ''}">${teamName(m, 1)}</div>
        <div class="bracket-team${m.winner_team_id === m.team2_id && m.winner_team_id ? ' winner' : ''}">${teamName(m, 2)}</div>
      </div>
    `).join('')}
  </div>
`).join('')}
</div>`}
</div>` : ''}

<h2>Liste des matchs</h2>
${matchDays.map((day) => `
<h2>${day.label}${day.roundName ? ` — ${day.roundName}` : ''}</h2>
<table>
<thead><tr><th>Heure</th><th>Équipe 1</th><th>Équipe 2</th><th>Format</th><th>Statut</th></tr></thead>
<tbody>
${day.matches.map((m) => `<tr>
  <td>${m.scheduled_at ? new Date(m.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
  <td class="${m.winner_team_id === m.team1_id && m.winner_team_id ? 'winner' : ''}">${teamName(m, 1)}</td>
  <td class="${m.winner_team_id === m.team2_id && m.winner_team_id ? 'winner' : ''}">${teamName(m, 2)}</td>
  <td>${m.match_format?.toUpperCase() ?? '—'}</td>
  <td><span class="status status-${m.status}">${STATUS_CONFIG[m.status].label}</span></td>
</tr>`).join('')}
</tbody>
</table>`).join('')}

<p class="meta">${totalMatches} matchs · ${finishedCount} terminés</p>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.onload = () => {
      setTimeout(() => w.print(), 300);
    };
  }, [matches, matchDays, bracketRounds, tournament, totalMatches, finishedCount]);

  /* ---- Mutations ---- */

  function updateScheduledAt(matchId: string, value: string) {
    setMatches((prev) =>
      prev.map((m) =>
        m.id !== matchId ? m : { ...m, scheduled_at: value || null }
      )
    );
    setDirty(true);
    setEditingDateId(null);
  }

  function onDragStart(e: React.DragEvent<HTMLDivElement>, payload: DragPayload) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
  }

  function onDragOverSlot(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDropOnSlot(
    e: React.DragEvent<HTMLDivElement>,
    targetMatchId: string,
    targetSlot: 1 | 2
  ) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const { matchId: srcId, slot: srcSlot } = payload;
    if (srcId === targetMatchId && srcSlot === targetSlot) return;
    setMatches((prev) => {
      const copy = prev.map((m) => ({ ...m }));
      const src = copy.find((m) => m.id === srcId);
      const tgt = copy.find((m) => m.id === targetMatchId);
      if (!src || !tgt) return prev;
      const sId = srcSlot === 1 ? src.team1_id : src.team2_id;
      const sObj = srcSlot === 1 ? src.team1 || null : src.team2 || null;
      const tId = targetSlot === 1 ? tgt.team1_id : tgt.team2_id;
      const tObj = targetSlot === 1 ? tgt.team1 || null : tgt.team2 || null;
      if (srcSlot === 1) { src.team1_id = tId; src.team1 = tObj; }
      else { src.team2_id = tId; src.team2 = tObj; }
      if (targetSlot === 1) { tgt.team1_id = sId; tgt.team1 = sObj; }
      else { tgt.team2_id = sId; tgt.team2 = sObj; }
      return copy;
    });
    setDirty(true);
  }

  function clearSlot(matchId: string, slot: 1 | 2) {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;
        const c = { ...m };
        if (slot === 1) { c.team1_id = null; c.team1 = null; }
        else { c.team2_id = null; c.team2 = null; }
        return c;
      })
    );
    setDirty(true);
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const res = await fetch(`/api/admin/tournament/${id}/bracket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          matches: matches.map((m) => ({
            id: m.id,
            team1_id: m.team1_id,
            team2_id: m.team2_id,
            scheduled_at: m.scheduled_at,
          })),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de l\u2019enregistrement');
      }
      await res.json();
      setInfoMsg('Planning enregistré.');
      setDirty(false);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Head>
        <title>
          {tournament ? `${tournament.name} — Planning` : 'Planning tournoi'}
        </title>
      </Head>

      <div className="min-h-screen bg-[#0a0a0f] text-white">
        {/* ---- Hero header ---- */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-transparent to-indigo-900/30" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDYwIEwgNjAgMCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IGZpbGw9InVybCgjZykiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiLz48L3N2Zz4=')] opacity-50" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-8">
            <button
              type="button"
              onClick={() => router.push(`/admin/tournament/${id}`)}
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-purple-300/70 hover:text-purple-200 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-70">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Retour au tournoi
            </button>

            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-purple-100 to-purple-300 bg-clip-text text-transparent">
                  Planning des matchs
                </h1>
                {tournament && (
                  <p className="mt-2 text-purple-200/60 text-sm font-medium">
                    {tournament.name}
                    {tournament.slug && (
                      <span className="ml-2 font-mono text-xs bg-white/5 border border-white/10 px-2 py-0.5 rounded">
                        {tournament.slug}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Stats pills */}
              {!loading && matches.length > 0 && (
                <div className="flex gap-2">
                  <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium">
                    <span className="text-purple-300">{totalMatches}</span>{' '}
                    <span className="text-neutral-400">matchs</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium">
                    <span className="text-purple-300">{matchDays.length}</span>{' '}
                    <span className="text-neutral-400">journées</span>
                  </div>
                  {finishedCount > 0 && (
                    <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium">
                      <span className="text-emerald-300">{finishedCount}</span>{' '}
                      <span className="text-emerald-400/60">terminés</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ---- Toolbar ---- */}
        <div className="sticky top-0 z-30 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
            {/* View mode toggle */}
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {([
                { key: 'planning' as ViewMode, label: 'Planning', icon: 'M3 3h4v4H3zm6 0h4v4H9zm-6 6h4v4H3zm6 0h4v4H9z' },
                { key: 'list' as ViewMode, label: 'Liste', icon: 'M3 4h10M3 8h10M3 12h10' },
                { key: 'bracket' as ViewMode, label: 'Arbre', icon: 'M2 3v4h4M10 3v4h4M5 7v2h6M8 9v4' },
              ]).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setViewMode(v.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === v.key
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d={v.icon} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {v.label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-white/10" />

            <button
              type="button"
              onClick={fetchData}
              disabled={loading || saving}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              {loading ? 'Chargement...' : 'Recharger'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                saving || !dirty
                  ? 'bg-purple-900/30 text-purple-300/40 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20'
              }`}
            >
              {saving ? 'Enregistrement...' : dirty ? 'Enregistrer' : 'Sauvegardé'}
            </button>
            {dirty && (
              <span className="text-[11px] text-amber-400/70">
                Modifications non sauvegardées
              </span>
            )}

            <div className="flex-1" />

            {/* PDF Export */}
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={loading || matches.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 14h8a1 1 0 001-1V5.5L9.5 2H5a1 1 0 00-1 1v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 10h5M5.5 8L7 10l-1.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Exporter PDF
            </button>
          </div>
        </div>

        {/* ---- Messages ---- */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <AlertBanner message={errorMsg} variant="error" className="mt-4" />
          <AlertBanner message={infoMsg} variant="success" className="mt-4" />
        </div>

        {/* ---- Content ---- */}
        <div ref={printRef} className={`${viewMode === 'bracket' ? 'max-w-full' : 'max-w-6xl'} mx-auto px-4 sm:px-6 py-8`}>
          {loading && (
            <LoadingSpinner className="py-20" />
          )}

          {!loading && matches.length === 0 && (
            <div className="text-center py-20">
              <div className="text-4xl mb-3 opacity-30">&#9917;</div>
              <p className="text-neutral-400">
                Aucun match trouvé pour ce tournoi.
              </p>
              <Link
                href={`/admin/tournament/${id}/bracket`}
                className="mt-4 inline-block text-sm text-purple-400 hover:text-purple-300 underline underline-offset-2"
              >
                Créer un bracket
              </Link>
            </div>
          )}

          {/* ===== PLANNING VIEW (original) ===== */}
          {!loading && matchDays.length > 0 && viewMode === 'planning' && (
            <div className="space-y-8">
              {matchDays.map((day) => (
                <section key={day.dateKey}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-1 h-8 rounded-full bg-gradient-to-b from-purple-400 to-purple-600" />
                      <div>
                        <h2 className="text-lg font-bold capitalize">
                          {day.label}
                        </h2>
                        {day.roundName && (
                          <span className="text-xs font-medium text-purple-300/60 uppercase tracking-wider">
                            {day.roundName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                    <span className="text-xs text-neutral-500 font-medium">
                      {day.matches.length} match{day.matches.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {day.matches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        editingDateId={editingDateId}
                        onEditDate={setEditingDateId}
                        onScheduleChange={updateScheduledAt}
                        onDragStart={onDragStart}
                        onDragOverSlot={onDragOverSlot}
                        onDropOnSlot={onDropOnSlot}
                        onClearSlot={clearSlot}
                        availableTeams={availableTeams}
                        onAssignTeam={assignTeamToSlot}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* ===== LIST VIEW ===== */}
          {!loading && matches.length > 0 && viewMode === 'list' && (
            <MatchListView
              matches={matches}
              matchDays={matchDays}
            />
          )}

          {/* ===== BRACKET TREE VIEW ===== */}
          {!loading && matches.length > 0 && viewMode === 'bracket' && (
            <BracketTreeView
              rounds={bracketRounds}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default AdminBracketBuilderPage;
