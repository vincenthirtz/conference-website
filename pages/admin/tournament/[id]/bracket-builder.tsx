// pages/admin/tournament/[id]/bracket-builder.tsx
// Planning visuel du tournoi — vue schedule par journée

import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';

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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
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

          {!loading && matchDays.length > 0 && (
            <div className="space-y-8">
              {matchDays.map((day) => (
                <section key={day.dateKey}>
                  {/* Date header */}
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

                  {/* Match cards */}
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

export default AdminBracketBuilderPage;
