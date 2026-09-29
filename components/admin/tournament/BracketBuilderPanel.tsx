// components/admin/tournament/BracketBuilderPanel.tsx
// Tournament "builder" panel (visual schedule / drag-and-drop planning, PDF
// export). Extracted from the former /admin/tournament/[id]/bracket-builder
// page; now the `builder` sub-tab of the merged bracket route. Client-only:
// reads the tournament id from the router and fetches its own data (no gssp,
// no <Head>, no page wrapper, no TournamentTabsNav — the host route provides
// those).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { tournamentUrls } from '@/features/admin/tournaments/client';
import { useTournamentRead } from '@/features/admin/tournaments/hooks/useTournamentRead';
import { useTournamentTeams } from '@/features/admin/tournaments/hooks/useTournamentTeams';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
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
import nsAdminTournamentBracketBuilder from '@/lib/i18n/locales/admin-fr/adminTournamentBracketBuilder';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  rubanEyebrowSnug,
  rubanFaint,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';

type ViewMode = 'planning' | 'list' | 'bracket';

const NO_TEAMS: TournamentTeam[] = [];

type ApiResponse = {
  tournament: { id: string; name: string; slug: string | null } | null;
  matches: ScheduleMatch[];
};

/* ------------------------------------------------------------------ */
/*  Main Panel                                                         */
/* ------------------------------------------------------------------ */

export default function BracketBuilderPanel() {
  const router = useRouter();
  const { id } = router.query;
  const t = useAdminT(nsAdminTournamentBracketBuilder);

  const tid = String(id ?? '');
  const [saving, setSaving] = useState(false);
  const [actionError, setErrorMsg] = useState<string | null>(null);
  const { addToast } = useToast();
  const { adminFetch } = useAdminFetch();
  // `includeTeams=1` : sans lui, la réponse ne porte que `team1_id` /
  // `team2_id`, et chaque carte s'affichait SANS NOM D'ÉQUIPE — trente cartes
  // vides sur un tournoi dont les trente matchs sont pourtant appariés.
  const matchesQuery = useTournamentRead<ApiResponse>(
    tid,
    'builder',
    (i) => tournamentUrls.matches(i, { includeTeams: 1, limit: 512 }),
    { rehydrate: true }
  );
  const teamsQuery = useTournamentTeams<TournamentTeam>(tid);
  const loading = matchesQuery.isFetching;
  const errorMsg =
    actionError ??
    (matchesQuery.error ? matchesQuery.error.message || t.errorLoad : null);
  const tournament = matchesQuery.data?.tournament ?? null;
  const tournamentTeams = teamsQuery.data ?? NO_TEAMS;
  // Grille éditée localement (glisser-déposer) : chaque lecture la remplace
  // et remet « modifié » à zéro — comme avant.
  const [matches, setMatches] = useState<ScheduleMatch[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('planning');
  const printRef = useRef<HTMLDivElement>(null);

  const serverMatches = matchesQuery.data;
  useEffect(() => {
    if (!serverMatches) return;
    setMatches(serverMatches.matches || []);
    setDirty(false);
  }, [serverMatches]);

  const { refetch: refetchMatches } = matchesQuery;
  const { refetch: refetchTeams } = teamsQuery;
  const fetchData = useCallback(() => {
    setErrorMsg(null);
    void refetchMatches();
    void refetchTeams();
  }, [refetchMatches, refetchTeams]);

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

  function assignTeamToSlot(
    matchId: string,
    slot: 1 | 2,
    team: TournamentTeam
  ) {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;
        const teamMini: TeamMini = {
          id: team.team.id,
          name: team.team.name,
          short_name: null,
          logo_url: team.team.logo_url,
        };
        if (slot === 1)
          return { ...m, team1_id: team.team_id, team1: teamMini };
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
      const dateKey = m.scheduled_at ? m.scheduled_at.slice(0, 10) : 'no-date';
      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          dateKey,
          label: m.scheduled_at ? formatDateHeader(m.scheduled_at) : t.noDate,
          roundName: m.round_name,
          matches: [],
        });
      }
      groups.get(dateKey)!.matches.push(m);
    }
    return Array.from(groups.values());
  }, [matches, t]);

  const totalMatches = matches.length;
  const finishedCount = matches.filter((m) => m.status === 'finished').length;

  /** Detect if this is a double elimination bracket */
  const isDoubleElim = useMemo(
    () => matches.some((m) => m.bracket_side === 'lb'),
    [matches]
  );

  /** Build bracket rounds from matches for tree view */
  const bracketRounds: BracketRound[] = useMemo(() => {
    if (!matches.length) return [];
    // For double elim, only show WB + GF in main tree
    const filtered = isDoubleElim
      ? matches.filter(
          (m) => m.bracket_side === 'wb' || m.bracket_side === 'final'
        )
      : matches;
    const roundMap = new Map<number, ScheduleMatch[]>();
    for (const m of filtered) {
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
          (roundMatches.length === 1
            ? t.roundFinal
            : format(t.roundLabel, { n: roundNum })),
        matches: roundMatches.sort(
          (a, b) => (a.position_in_round ?? 0) - (b.position_in_round ?? 0)
        ),
      }));
  }, [matches, isDoubleElim, t]);

  /** Build loser bracket rounds (for double elim) */
  const loserBracketRounds: BracketRound[] = useMemo(() => {
    if (!isDoubleElim || !matches.length) return [];
    const lbMatches = matches.filter((m) => m.bracket_side === 'lb');
    const roundMap = new Map<number, ScheduleMatch[]>();
    for (const m of lbMatches) {
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
          format(t.lbRoundLabel, { n: roundNum }),
        matches: roundMatches.sort(
          (a, b) => (a.position_in_round ?? 0) - (b.position_in_round ?? 0)
        ),
      }));
  }, [matches, isDoubleElim, t]);

  /** Export PDF via print */
  const handleExportPDF = useCallback(() => {
    const teamName = (m: ScheduleMatch, slot: 1 | 2) => {
      const tm = slot === 1 ? m.team1 : m.team2;
      if (tm) return tm.name;
      const info = parseNotes(m.notes);
      if (info?.seed1)
        return format(t.seedLabel, { n: slot === 1 ? info.seed1 : info.seed2 });
      return t.tbd;
    };

    const isElimination =
      bracketRounds.length > 1 &&
      bracketRounds[0].matches.length >
        bracketRounds[bracketRounds.length - 1].matches.length;
    const roundCount = bracketRounds.length;
    const colWidthPx = isElimination ? 160 : 140;
    const totalBracketWidth = roundCount * (colWidthPx + 8);
    const pageWidth = roundCount > 6 ? 1020 : 720;
    const scaleFactor = Math.min(1, pageWidth / totalBracketWidth);

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>${format(t.pdfTitle, { name: tournament?.name ?? t.defaultTournamentName })}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1a1a1a; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 20px; }
  h2 { font-size: 15px; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #b24be0; }
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
  .bracket-round-title { text-align: center; font-weight: 700; font-size: 10px; color: #6d1a9c; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px; white-space: nowrap; }
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
<h1>${format(t.pdfTitle, { name: tournament?.name ?? t.defaultTournamentName })}</h1>
<p class="subtitle">${format(t.pdfSubtitle, { date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), matches: totalMatches, days: roundCount })}</p>

${
  bracketRounds.length > 1
    ? `
<div class="bracket-section">
<h2>${t.pdfBracketView}</h2>
${
  isElimination
    ? `
<div class="bracket-scaler">
<div class="bracket-container">
${bracketRounds
  .map(
    (r) => `
  <div class="bracket-round">
    <div class="bracket-round-title">${r.roundName}</div>
    ${r.matches
      .map(
        (m) => `
      <div class="bracket-match">
        <div class="bracket-time">${m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
        <div class="bracket-team${m.winner_team_id === m.team1_id && m.winner_team_id ? ' winner' : ''}">${teamName(m, 1)}</div>
        <div class="bracket-team${m.winner_team_id === m.team2_id && m.winner_team_id ? ' winner' : ''}">${teamName(m, 2)}</div>
      </div>
    `
      )
      .join('')}
  </div>
`
  )
  .join('')}
</div>
</div>`
    : `
<div class="bracket-grid">
${bracketRounds
  .map(
    (r) => `
  <div class="bracket-grid-round">
    <div class="bracket-round-title">${r.roundName}</div>
    ${r.matches
      .map(
        (m) => `
      <div class="bracket-match">
        <div class="bracket-time">${m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
        <div class="bracket-team${m.winner_team_id === m.team1_id && m.winner_team_id ? ' winner' : ''}">${teamName(m, 1)}</div>
        <div class="bracket-team${m.winner_team_id === m.team2_id && m.winner_team_id ? ' winner' : ''}">${teamName(m, 2)}</div>
      </div>
    `
      )
      .join('')}
  </div>
`
  )
  .join('')}
</div>`
}
</div>`
    : ''
}

<h2>${t.pdfMatchList}</h2>
${matchDays
  .map(
    (day) => `
<h2>${day.label}${day.roundName ? ` — ${day.roundName}` : ''}</h2>
<table>
<thead><tr><th scope="col">${t.pdfColTime}</th><th scope="col">${t.pdfColTeam1}</th><th scope="col">${t.pdfColTeam2}</th><th scope="col">${t.pdfColFormat}</th><th scope="col">${t.pdfColStatus}</th></tr></thead>
<tbody>
${day.matches
  .map(
    (m) => `<tr>
  <td>${m.scheduled_at ? new Date(m.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
  <td class="${m.winner_team_id === m.team1_id && m.winner_team_id ? 'winner' : ''}">${teamName(m, 1)}</td>
  <td class="${m.winner_team_id === m.team2_id && m.winner_team_id ? 'winner' : ''}">${teamName(m, 2)}</td>
  <td>${m.match_format?.toUpperCase() ?? '—'}</td>
  <td><span class="status status-${m.status}">${STATUS_CONFIG[m.status].label}</span></td>
</tr>`
  )
  .join('')}
</tbody>
</table>`
  )
  .join('')}

<p class="meta">${format(t.pdfFooter, { matches: totalMatches, finished: finishedCount })}</p>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.onload = () => {
      setTimeout(() => w.print(), 300);
    };
  }, [matchDays, bracketRounds, tournament, totalMatches, finishedCount, t]);

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

  function onDragStart(
    e: React.DragEvent<HTMLDivElement>,
    payload: DragPayload
  ) {
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
      if (srcSlot === 1) {
        src.team1_id = tId;
        src.team1 = tObj;
      } else {
        src.team2_id = tId;
        src.team2 = tObj;
      }
      if (targetSlot === 1) {
        tgt.team1_id = sId;
        tgt.team1 = sObj;
      } else {
        tgt.team2_id = sId;
        tgt.team2 = sObj;
      }
      return copy;
    });
    setDirty(true);
  }

  function clearSlot(matchId: string, slot: 1 | 2) {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;
        const c = { ...m };
        if (slot === 1) {
          c.team1_id = null;
          c.team1 = null;
        } else {
          c.team2_id = null;
          c.team2 = null;
        }
        return c;
      })
    );
    setDirty(true);
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch(tournamentUrls.bracket(tid), {
        method: 'POST',
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
        throw new Error(json.error || t.errorSave);
      }
      await res.json();
      addToast(t.toastSaved, 'success');
      setDirty(false);
      fetchData();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorUnknown);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* ---- Hero header ---- */}
      <div>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl text-[var(--t1,#f4edf7)] sm:text-4xl">
                {t.heading}
              </h1>
              {tournament && (
                <p className={`mt-2 text-sm font-medium ${rubanMuted}`}>
                  {tournament.name}
                  {tournament.slug && (
                    <span className="ml-2 rounded-[3px] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-xs">
                      {tournament.slug}
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Stats pills */}
            {!loading && matches.length > 0 && (
              <div className="flex gap-2">
                <Chip>
                  {totalMatches} {t.statMatches}
                </Chip>
                <Chip>
                  {matchDays.length} {t.statDays}
                </Chip>
                {finishedCount > 0 && (
                  <Chip tone="ok">
                    {finishedCount} {t.statFinished}
                  </Chip>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Toolbar ---- */}
      <div className="sticky top-0 z-30 border-b border-[var(--line,rgba(194,196,201,.12))] bg-[var(--canvas,#07030a)]/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
          {/* View mode toggle */}
          <div className="flex overflow-hidden rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))]">
            {[
              {
                key: 'planning' as ViewMode,
                label: t.viewPlanning,
                icon: 'M3 3h4v4H3zm6 0h4v4H9zm-6 6h4v4H3zm6 0h4v4H9z',
              },
              {
                key: 'list' as ViewMode,
                label: t.viewList,
                icon: 'M3 4h10M3 8h10M3 12h10',
              },
              {
                key: 'bracket' as ViewMode,
                label: t.viewBracket,
                icon: 'M2 3v4h4M10 3v4h4M5 7v2h6M8 9v4',
              },
            ].map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setViewMode(v.key)}
                className={`flex h-[30px] items-center gap-1.5 px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.06em] transition-colors ${
                  viewMode === v.key
                    ? 'bg-[rgba(180,103,209,.14)] text-[var(--or-200,#eec4ff)] shadow-[inset_0_-2px_0_var(--or,#b467d1)]'
                    : 'text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d={v.icon}
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {v.label}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-[var(--line2,rgba(194,196,201,.2))]" />

          <AdminButton
            size="xs"
            onClick={fetchData}
            disabled={loading || saving}
          >
            {loading ? t.loading : t.reload}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="xs"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? t.saving : dirty ? t.save : t.saved}
          </AdminButton>
          {dirty && <Chip tone="warn">{t.unsavedChanges}</Chip>}

          <div className="flex-1" />

          {/* PDF Export */}
          <AdminButton
            size="xs"
            onClick={handleExportPDF}
            disabled={loading || matches.length === 0}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 14h8a1 1 0 001-1V5.5L9.5 2H5a1 1 0 00-1 1v2"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 2v4h4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 10h5M5.5 8L7 10l-1.5 2"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t.exportPdf}
          </AdminButton>
        </div>
      </div>

      {/* ---- Messages ---- */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <AlertBanner message={errorMsg} variant="error" className="mt-4" />
      </div>

      {/* ---- Content ---- */}
      <div
        ref={printRef}
        className={`${viewMode === 'bracket' ? 'max-w-full' : 'max-w-6xl'} mx-auto px-4 sm:px-6 py-8`}
      >
        {loading && <LoadingSpinner className="py-20" />}

        {!loading && matches.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl mb-3 opacity-30">&#9917;</div>
            <p className={rubanMuted}>{t.emptyMatches}</p>
            <Link
              href={`/admin/tournament/${id}/bracket?tab=view`}
              className="mt-4 inline-block text-sm text-[var(--or-300,#dea3f6)] underline underline-offset-2 hover:text-[var(--or-200,#eec4ff)]"
            >
              {t.createBracket}
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
                    <div className="h-8 w-1 rounded-[2px] bg-[var(--or,#b467d1)]" />
                    <div>
                      <h2 className="text-lg font-bold capitalize">
                        {day.label}
                      </h2>
                      {day.roundName && (
                        <span className={rubanEyebrowSnug}>
                          {day.roundName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-px flex-1 bg-[var(--line,rgba(194,196,201,.12))]" />
                  <span className={`text-xs font-medium ${rubanFaint}`}>
                    {format(
                      day.matches.length === 1
                        ? t.dayMatchCount_one
                        : t.dayMatchCount_other,
                      { count: day.matches.length }
                    )}
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
          <MatchListView matches={matches} matchDays={matchDays} />
        )}

        {/* ===== BRACKET TREE VIEW ===== */}
        {!loading && matches.length > 0 && viewMode === 'bracket' && (
          <>
            {isDoubleElim && (
              <h3 className={`mb-2 ${rubanEyebrowSnug}`}>{t.winnersBracket}</h3>
            )}
            <BracketTreeView rounds={bracketRounds} onScoreSaved={fetchData} />

            {isDoubleElim && loserBracketRounds.length > 0 && (
              <>
                <div className="mt-8 mb-2 border-t border-[var(--line,rgba(194,196,201,.12))] pt-6">
                  <h3 className={rubanEyebrowSnug}>{t.losersBracket}</h3>
                </div>
                <BracketTreeView
                  rounds={loserBracketRounds}
                  onScoreSaved={fetchData}
                />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
