// pages/admin/tournament/[id]/bracket-builder.tsx
// Planning visuel du tournoi — vue schedule par journée

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';

type ViewMode = 'planning' | 'list' | 'bracket';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type MatchStatus = 'pending' | 'ongoing' | 'finished' | 'cancelled';

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type ScheduleMatch = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  round_number: number | null;
  round_name: string | null;
  position_in_round: number | null;
  status: MatchStatus;
  match_format: string | null;
  best_of: number | null;
  scheduled_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1?: TeamMini | null;
  team2?: TeamMini | null;
  winner_team_id: string | null;
  notes: string | null;
  next_match_win_id?: string | null;
  next_match_lose_id?: string | null;
  column_index?: number | null;
  row_index?: number | null;
};

type ApiResponse = {
  tournament: { id: string; name: string; slug: string | null } | null;
  matches: ScheduleMatch[];
};

export const getServerSideProps = withStaffPage('manager');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Parse "Seed 7 vs Seed 1 — Plaid SPC" → { seed1, seed2, venue } */
function parseNotes(notes: string | null) {
  if (!notes) return null;
  const m = notes.match(
    /Seed\s*(\d+)\s*vs\s*Seed\s*(\d+)\s*(?:—|–|-)\s*(.+)/i
  );
  if (m) return { seed1: m[1], seed2: m[2], venue: m[3].trim() };
  if (notes.toLowerCase().includes('disponible'))
    return { seed1: null, seed2: null, venue: 'Plaid SPC' };
  return null;
}

const STATUS_CONFIG: Record<
  MatchStatus,
  { label: string; dot: string; bg: string }
> = {
  pending: {
    label: 'A venir',
    dot: 'bg-amber-400',
    bg: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
  },
  ongoing: {
    label: 'En cours',
    dot: 'bg-green-400 animate-pulse',
    bg: 'bg-green-400/10 text-green-300 border-green-400/20',
  },
  finished: {
    label: 'Terminé',
    dot: 'bg-neutral-500',
    bg: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  },
  cancelled: {
    label: 'Annulé',
    dot: 'bg-red-500',
    bg: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
};

function formatDateHeader(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function localInputToIso(value: string): string {
  if (!value) return '';
  try {
    return new Date(value).toISOString();
  } catch {
    return '';
  }
}

type DragPayload = { matchId: string; slot: 1 | 2 };

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
      const res = await fetch(
        `/api/admin/tournament/${id}/matches?layout=bracket&limit=512&includeGraph=1`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les matchs');
      }
      const json: ApiResponse = await res.json();
      setTournament(json.tournament);
      setMatches(json.matches || []);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  /** Group matches by date (YYYY-MM-DD) */
  const matchDays = useMemo(() => {
    if (!matches.length) return [];
    const groups = new Map<
      string,
      { dateKey: string; label: string; roundName: string | null; matches: ScheduleMatch[] }
    >();
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
  const bracketRounds = useMemo(() => {
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

    // Detect if this is a Swiss/round-robin (many rounds with equal match counts) vs elimination bracket
    const isElimination = bracketRounds.length > 1 &&
      bracketRounds[0].matches.length > bracketRounds[bracketRounds.length - 1].matches.length;
    const roundCount = bracketRounds.length;
    // For elimination: scale to fit. For Swiss: use a grid layout.
    const colWidthPx = isElimination ? 160 : 140;
    const totalBracketWidth = roundCount * (colWidthPx + 8);
    // A4 landscape usable ~1020px, portrait ~720px
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
  /* Bracket section */
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
  /* Grid layout for Swiss/many rounds */
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
          {errorMsg && (
            <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="mt-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300">
              {infoMsg}
            </div>
          )}
        </div>

        {/* ---- Content ---- */}
        <div ref={printRef} className={`${viewMode === 'bracket' ? 'max-w-full' : 'max-w-6xl'} mx-auto px-4 sm:px-6 py-8`}>
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
            </div>
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

/* ------------------------------------------------------------------ */
/*  Match Card                                                         */
/* ------------------------------------------------------------------ */

type MatchCardProps = {
  match: ScheduleMatch;
  editingDateId: string | null;
  onEditDate: (id: string | null) => void;
  onScheduleChange: (id: string, value: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, p: DragPayload) => void;
  onDragOverSlot: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropOnSlot: (e: React.DragEvent<HTMLDivElement>, id: string, slot: 1 | 2) => void;
  onClearSlot: (id: string, slot: 1 | 2) => void;
};

function MatchCard({
  match,
  editingDateId,
  onEditDate,
  onScheduleChange,
  onDragStart,
  onDragOverSlot,
  onDropOnSlot,
  onClearSlot,
}: MatchCardProps) {
  const info = parseNotes(match.notes);
  const statusCfg = STATUS_CONFIG[match.status];
  const isEditing = editingDateId === match.id;
  const isTBD = info && info.seed1 === null;

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 hover:border-purple-500/30 ${
        isTBD
          ? 'bg-gradient-to-br from-purple-950/40 to-indigo-950/40 border-purple-500/20'
          : 'bg-[#12121a] border-white/[0.06]'
      }`}
    >
      {/* Top bar: time + status + format */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          {match.scheduled_at && (
            <button
              type="button"
              onClick={() => onEditDate(isEditing ? null : match.id)}
              className="text-sm font-bold tabular-nums text-white/90 hover:text-purple-300 transition-colors"
              title="Modifier l'horaire"
            >
              {formatTime(match.scheduled_at)}
            </button>
          )}
          {match.match_format && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-white/5 text-neutral-400 border border-white/5">
              {match.match_format}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusCfg.bg}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Inline date editor */}
      {isEditing && (
        <div className="px-4 pb-2">
          <input
            type="datetime-local"
            autoFocus
            defaultValue={isoToLocalInput(match.scheduled_at)}
            onBlur={(e) =>
              onScheduleChange(match.id, localInputToIso(e.target.value))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                onScheduleChange(
                  match.id,
                  localInputToIso((e.target as HTMLInputElement).value)
                );
              if (e.key === 'Escape') onEditDate(null);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />
        </div>
      )}

      {/* Teams / seeds */}
      <div className="px-4 pb-3">
        <div className="flex flex-col gap-1.5">
          <SeedSlot
            match={match}
            slot={1}
            seed={info?.seed1 ?? null}
            team={match.team1}
            teamId={match.team1_id}
            isWinner={!!match.winner_team_id && match.winner_team_id === match.team1_id}
            isTBD={!!isTBD}
            onDragStart={onDragStart}
            onDragOverSlot={onDragOverSlot}
            onDropOnSlot={onDropOnSlot}
            onClear={() => onClearSlot(match.id, 1)}
          />

          {/* VS divider */}
          <div className="flex items-center gap-2 px-1">
            <div className="flex-1 h-px bg-white/[0.04]" />
            <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
              vs
            </span>
            <div className="flex-1 h-px bg-white/[0.04]" />
          </div>

          <SeedSlot
            match={match}
            slot={2}
            seed={info?.seed2 ?? null}
            team={match.team2}
            teamId={match.team2_id}
            isWinner={!!match.winner_team_id && match.winner_team_id === match.team2_id}
            isTBD={!!isTBD}
            onDragStart={onDragStart}
            onDragOverSlot={onDragOverSlot}
            onDropOnSlot={onDropOnSlot}
            onClear={() => onClearSlot(match.id, 2)}
          />
        </div>

        {/* Venue */}
        {info?.venue && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-neutral-500">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="opacity-50">
              <path
                d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6c0 3.5 4.5 8.5 4.5 8.5s4.5-5 4.5-8.5c0-2.5-2-4.5-4.5-4.5z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            {info.venue}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Seed / Team Slot                                                   */
/* ------------------------------------------------------------------ */

type SeedSlotProps = {
  match: ScheduleMatch;
  slot: 1 | 2;
  seed: string | null;
  team: TeamMini | null | undefined;
  teamId: string | null;
  isWinner: boolean;
  isTBD: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, p: DragPayload) => void;
  onDragOverSlot: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropOnSlot: (e: React.DragEvent<HTMLDivElement>, id: string, slot: 1 | 2) => void;
  onClear: () => void;
};

function SeedSlot({
  match,
  slot,
  seed,
  team,
  teamId,
  isWinner,
  isTBD,
  onDragStart,
  onDragOverSlot,
  onDropOnSlot,
  onClear,
}: SeedSlotProps) {
  const hasTeam = !!(team || teamId);

  // Seed number color palette
  const seedColors: Record<string, string> = {
    '1': 'from-amber-500 to-orange-600',
    '2': 'from-sky-500 to-blue-600',
    '3': 'from-emerald-500 to-green-600',
    '4': 'from-rose-500 to-pink-600',
    '5': 'from-violet-500 to-purple-600',
    '6': 'from-cyan-400 to-teal-600',
    '7': 'from-fuchsia-500 to-pink-600',
    '8': 'from-lime-500 to-emerald-600',
  };

  const gradientClass = seed ? seedColors[seed] || 'from-neutral-500 to-neutral-600' : '';

  return (
    <div
      className={`relative flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
        hasTeam
          ? 'bg-white/[0.03] hover:bg-white/[0.06]'
          : isTBD
            ? 'bg-purple-500/5 border border-dashed border-purple-500/20'
            : 'bg-white/[0.02] border border-dashed border-white/[0.06]'
      } ${isWinner ? 'ring-1 ring-emerald-500/30' : ''}`}
      onDragOver={onDragOverSlot}
      onDrop={(e) => onDropOnSlot(e, match.id, slot)}
    >
      <div
        className="flex items-center gap-3 flex-1 cursor-move"
        draggable={hasTeam}
        onDragStart={(e) => hasTeam && onDragStart(e, { matchId: match.id, slot })}
      >
        {/* Seed badge */}
        {seed && (
          <div
            className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradientClass} flex items-center justify-center text-sm font-extrabold text-white shadow-lg`}
          >
            {seed}
          </div>
        )}

        {/* TBD badge */}
        {!seed && isTBD && (
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-[10px] font-bold text-purple-300">
            ?
          </div>
        )}

        {/* Empty badge */}
        {!seed && !isTBD && (
          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-neutral-600">
            —
          </div>
        )}

        {/* Team info or seed label */}
        <div className="flex flex-col min-w-0">
          {team ? (
            <div className="flex items-center gap-2">
              {team.logo_url && (
                <Image
                  src={team.logo_url}
                  alt={team.name}
                  width={20}
                  height={20}
                  className="w-5 h-5 rounded object-cover"
                />
              )}
              <span
                className={`text-sm font-semibold truncate ${
                  isWinner ? 'text-emerald-300' : 'text-white'
                }`}
              >
                {team.name}
              </span>
            </div>
          ) : isTBD ? (
            <span className="text-sm font-medium text-purple-300/50 italic">
              Disponible
            </span>
          ) : seed ? (
            <span className="text-sm font-semibold text-white/70">
              Seed {seed}
            </span>
          ) : (
            <span className="text-xs text-neutral-600 italic">
              Slot vide
            </span>
          )}
          {teamId && !team && (
            <span className="text-[10px] text-neutral-500 font-mono truncate">
              {teamId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>

      {/* Winner indicator */}
      {isWinner && (
        <div className="text-emerald-400 text-xs font-bold">W</div>
      )}

      {/* Clear button */}
      {hasTeam && (
        <button
          type="button"
          onClick={onClear}
          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all p-0.5"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8m0-8L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  List View                                                          */
/* ------------------------------------------------------------------ */

type MatchListViewProps = {
  matches: ScheduleMatch[];
  matchDays: { dateKey: string; label: string; roundName: string | null; matches: ScheduleMatch[] }[];
};

function MatchListView({ matchDays }: MatchListViewProps) {
  function teamDisplay(m: ScheduleMatch, slot: 1 | 2) {
    const team = slot === 1 ? m.team1 : m.team2;
    const teamId = slot === 1 ? m.team1_id : m.team2_id;
    const isWinner = !!m.winner_team_id && m.winner_team_id === teamId;
    const info = parseNotes(m.notes);
    const seed = slot === 1 ? info?.seed1 : info?.seed2;

    return (
      <div className={`flex items-center gap-2 ${isWinner ? 'text-emerald-300 font-semibold' : ''}`}>
        {team?.logo_url && (
          <Image src={team.logo_url} alt={team.name} width={18} height={18} className="w-[18px] h-[18px] rounded object-cover" />
        )}
        <span>{team?.name ?? (seed ? `Seed ${seed}` : 'TBD')}</span>
        {isWinner && <span className="text-[10px] text-emerald-500 font-bold">W</span>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {matchDays.map((day) => (
        <section key={day.dateKey}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-1 h-6 rounded-full bg-gradient-to-b from-purple-400 to-purple-600" />
            <h2 className="text-base font-bold capitalize">{day.label}</h2>
            {day.roundName && (
              <span className="text-xs text-purple-300/60 uppercase tracking-wider font-medium">
                {day.roundName}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Heure</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Équipe 1</th>
                  <th className="text-center px-2 py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">vs</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Équipe 2</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Format</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Round</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Statut</th>
                </tr>
              </thead>
              <tbody>
                {day.matches.map((m) => {
                  const statusCfg = STATUS_CONFIG[m.status];
                  return (
                    <tr key={m.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                      <td className="px-3 py-2.5 tabular-nums font-medium text-white/80">
                        {m.scheduled_at ? formatTime(m.scheduled_at) : '—'}
                      </td>
                      <td className="px-3 py-2.5">{teamDisplay(m, 1)}</td>
                      <td className="px-2 py-2.5 text-center text-[10px] text-neutral-600 font-bold">vs</td>
                      <td className="px-3 py-2.5">{teamDisplay(m, 2)}</td>
                      <td className="px-3 py-2.5">
                        {m.match_format ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-white/5 text-neutral-400 border border-white/5">
                            {m.match_format}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-neutral-400">
                        {m.round_name ?? (m.round_number ? `R${m.round_number}` : '—')}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusCfg.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bracket Tree View                                                  */
/* ------------------------------------------------------------------ */

type BracketRound = {
  roundNumber: number;
  roundName: string;
  matches: ScheduleMatch[];
};

type BracketTreeViewProps = {
  rounds: BracketRound[];
};

const CARD_H = 82;
const CARD_W = 220;
const GAP_BASE = 16;
const CONNECTOR_W = 48;
const HEADER_H = 48;

const SEED_COLORS: Record<string, string> = {
  '1': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  '2': 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  '3': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  '4': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  '5': 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  '6': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  '7': 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  '8': 'bg-lime-500/20 text-lime-300 border-lime-500/30',
};

function bracketTeamLabel(m: ScheduleMatch, slot: 1 | 2) {
  const team = slot === 1 ? m.team1 : m.team2;
  const info = parseNotes(m.notes);
  const seed = (slot === 1 ? info?.seed1 : info?.seed2) ?? null;
  if (team) return { name: team.short_name ?? team.name, logo: team.logo_url, hasSeed: !!seed, seed };
  if (seed) return { name: `Seed ${seed}`, logo: null, hasSeed: true, seed };
  return { name: 'TBD', logo: null, hasSeed: false, seed: null };
}

function BracketTreeView({ rounds }: BracketTreeViewProps) {
  if (!rounds.length) return null;

  // Detect format: elimination has decreasing match counts, Swiss has equal counts
  const isElimination = rounds.length > 1 &&
    rounds[0].matches.length > rounds[rounds.length - 1].matches.length;

  if (!isElimination) {
    return <SwissBracketView rounds={rounds} />;
  }

  return <EliminationBracketView rounds={rounds} />;
}

/* ---- Swiss / Round-Robin grid view ---- */

function SwissBracketView({ rounds }: { rounds: BracketRound[] }) {
  const maxMatchesPerRound = Math.max(...rounds.map((r) => r.matches.length));

  return (
    <div className="space-y-6">
      {/* Horizontal scrollable timeline */}
      <div className="overflow-x-auto pb-4">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${Math.min(rounds.length, 5)}, minmax(200px, 1fr))`,
            minWidth: rounds.length > 5 ? `${rounds.length * 212}px` : undefined,
          }}
        >
          {rounds.map((round, roundIdx) => {
            const isFinale = roundIdx === rounds.length - 1 && round.matches.length <= 2 &&
              round.roundName.toLowerCase().includes('final');

            return (
              <div key={round.roundNumber} className="flex flex-col">
                {/* Round header */}
                <div className={`mb-3 px-3 py-2 rounded-lg border text-center ${
                  isFinale
                    ? 'bg-amber-500/10 border-amber-500/20'
                    : 'bg-purple-500/5 border-purple-500/15'
                }`}>
                  <div className={`text-[11px] font-bold uppercase tracking-wider ${
                    isFinale ? 'text-amber-300' : 'text-purple-300'
                  }`}>
                    {isFinale && <span className="mr-1">&#9733;</span>}
                    {round.roundName}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {round.matches.length} match{round.matches.length > 1 ? 's' : ''}
                  </div>
                </div>

                {/* Match cards */}
                <div className="flex flex-col gap-2">
                  {round.matches.map((m, mIdx) => (
                    <BracketMatchCard
                      key={m.id}
                      match={m}
                      matchIndex={mIdx}
                      isFinale={isFinale}
                      maxMatchesPerRound={maxMatchesPerRound}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- Elimination bracket (tree) view ---- */

function EliminationBracketView({ rounds }: { rounds: BracketRound[] }) {
  const isFinalRound = (idx: number) => idx === rounds.length - 1 && rounds[idx].matches.length === 1;

  // Compute Y positions: Round 0 evenly spaced, Round N centered between feeder pairs
  const yPositions: number[][] = [];
  for (let r = 0; r < rounds.length; r++) {
    const count = rounds[r].matches.length;
    if (r === 0) {
      const ys: number[] = [];
      for (let i = 0; i < count; i++) ys.push(i * (CARD_H + GAP_BASE));
      yPositions.push(ys);
    } else {
      const prevYs = yPositions[r - 1];
      const ys: number[] = [];
      for (let i = 0; i < count; i++) {
        const top = prevYs[i * 2] ?? prevYs[prevYs.length - 1] ?? 0;
        const bot = prevYs[i * 2 + 1] ?? top;
        ys.push((top + bot) / 2);
      }
      yPositions.push(ys);
    }
  }

  const allYs = yPositions.flat();
  const totalH = (allYs.length > 0 ? Math.max(...allYs) : 0) + CARD_H + GAP_BASE;

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-w-max" style={{ gap: 0 }}>
        {rounds.map((round, roundIdx) => {
          const ys = yPositions[roundIdx];
          const prevYs = roundIdx > 0 ? yPositions[roundIdx - 1] : null;
          const showConnectors = roundIdx > 0 && prevYs;
          const isFinale = isFinalRound(roundIdx);

          return (
            <div key={round.roundNumber} className="flex-shrink-0" style={{ display: 'flex' }}>
              {/* SVG connectors */}
              {showConnectors && (
                <svg width={CONNECTOR_W} height={totalH + HEADER_H} className="flex-shrink-0">
                  {ys.map((y, i) => {
                    const topIdx = i * 2;
                    const botIdx = i * 2 + 1;
                    const topY = (prevYs![topIdx] ?? prevYs![prevYs!.length - 1] ?? 0) + HEADER_H + CARD_H / 2;
                    const botY = (prevYs![botIdx] ?? topY - HEADER_H) + HEADER_H + CARD_H / 2;
                    const midY = y + HEADER_H + CARD_H / 2;
                    const hasTwo = prevYs![botIdx] !== undefined;

                    if (!hasTwo) {
                      return (
                        <line key={i} x1={0} y1={topY} x2={CONNECTOR_W} y2={midY}
                          stroke="rgba(139,92,246,0.25)" strokeWidth={1.5} />
                      );
                    }

                    return (
                      <g key={i}>
                        <line x1={0} y1={topY} x2={CONNECTOR_W / 2} y2={topY}
                          stroke="rgba(139,92,246,0.25)" strokeWidth={1.5} />
                        <line x1={0} y1={botY} x2={CONNECTOR_W / 2} y2={botY}
                          stroke="rgba(139,92,246,0.25)" strokeWidth={1.5} />
                        <line x1={CONNECTOR_W / 2} y1={topY} x2={CONNECTOR_W / 2} y2={botY}
                          stroke="rgba(139,92,246,0.25)" strokeWidth={1.5} />
                        <line x1={CONNECTOR_W / 2} y1={midY} x2={CONNECTOR_W} y2={midY}
                          stroke="rgba(139,92,246,0.3)" strokeWidth={1.5} />
                        <circle cx={CONNECTOR_W / 2} cy={topY} r={2} fill="rgba(139,92,246,0.4)" />
                        <circle cx={CONNECTOR_W / 2} cy={botY} r={2} fill="rgba(139,92,246,0.4)" />
                        <circle cx={CONNECTOR_W / 2} cy={midY} r={2.5} fill="rgba(139,92,246,0.5)" />
                      </g>
                    );
                  })}
                </svg>
              )}

              {/* Round column */}
              <div className="flex-shrink-0 relative" style={{ width: CARD_W }}>
                <div className="flex items-center justify-center gap-2" style={{ height: HEADER_H }}>
                  <div className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider whitespace-nowrap border ${
                    isFinale
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                      : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                  }`}>
                    {isFinale && <span className="mr-1">&#9733;</span>}
                    {round.roundName}
                  </div>
                </div>

                <div className="relative" style={{ height: totalH }}>
                  {round.matches.map((m, mIdx) => (
                    <div
                      key={m.id}
                      className="absolute left-0 right-0"
                      style={{ top: ys[mIdx], height: CARD_H }}
                    >
                      <BracketMatchCard
                        match={m}
                        matchIndex={mIdx}
                        isFinale={isFinale}
                        fixedHeight
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Shared match card for bracket views ---- */

function BracketMatchCard({
  match: m,
  matchIndex: mIdx,
  isFinale,
  fixedHeight,
}: {
  match: ScheduleMatch;
  matchIndex: number;
  isFinale: boolean;
  fixedHeight?: boolean;
  maxMatchesPerRound?: number;
}) {
  const statusCfg = STATUS_CONFIG[m.status];
  const t1 = bracketTeamLabel(m, 1);
  const t2 = bracketTeamLabel(m, 2);
  const w1 = !!m.winner_team_id && m.winner_team_id === m.team1_id;
  const w2 = !!m.winner_team_id && m.winner_team_id === m.team2_id;
  const posLabel = m.position_in_round ?? mIdx + 1;

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${fixedHeight ? 'h-full' : ''} ${
      isFinale
        ? 'bg-gradient-to-br from-amber-950/30 via-[#12121a] to-purple-950/30 border-amber-500/20 shadow-xl shadow-amber-500/5'
        : m.status === 'finished'
          ? 'bg-[#12121a] border-white/[0.08]'
          : 'bg-[#12121a] border-white/[0.06] hover:border-purple-500/20'
    }`}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-white/[0.05]" style={{ height: 26 }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-neutral-600 font-mono">#{posLabel}</span>
          {m.scheduled_at && (
            <span className="text-[10px] tabular-nums text-neutral-400 font-medium">
              {formatTime(m.scheduled_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {m.match_format && (
            <span className="text-[9px] font-semibold uppercase text-neutral-500 bg-white/5 px-1 rounded">
              {m.match_format}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[9px] font-medium border ${statusCfg.bg}`}>
            <span className={`w-1 h-1 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Team rows */}
      <BracketTeamRow t={t1} isWinner={w1} />
      <div className="h-px bg-white/[0.04]" />
      <BracketTeamRow t={t2} isWinner={w2} />
    </div>
  );
}

function BracketTeamRow({
  t,
  isWinner,
}: {
  t: { name: string; logo: string | null; hasSeed: boolean; seed: string | null };
  isWinner: boolean;
}) {
  const rowH = (CARD_H - 26) / 2;
  return (
    <div
      className={`flex items-center gap-2 px-2.5 ${isWinner ? 'bg-emerald-500/[0.07]' : ''}`}
      style={{ height: rowH }}
    >
      {t.seed && (
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-extrabold border ${
          SEED_COLORS[t.seed] ?? 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30'
        }`}>
          {t.seed}
        </span>
      )}
      {t.logo && (
        <Image src={t.logo} alt="" width={16} height={16} className="w-4 h-4 rounded object-cover flex-shrink-0" />
      )}
      <span className={`text-xs truncate flex-1 ${
        isWinner ? 'text-emerald-300 font-semibold' : t.name === 'TBD' ? 'text-neutral-600 italic' : 'text-white/80'
      }`}>
        {t.hasSeed && t.seed ? t.name.replace(/^Seed \d+$/, '') || t.name : t.name}
      </span>
      {isWinner && (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-emerald-400">
          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

export default AdminBracketBuilderPage;
