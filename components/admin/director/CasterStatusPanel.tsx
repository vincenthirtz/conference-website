// components/admin/director/CasterStatusPanel.tsx
// Feature: Run-of-show — Lot 3.
// Colonne "Casters" de la page Director.
//
// Pour Lot 3, on n'affiche que les donnees disponibles :
//   - cast_assignments lies aux matches referencees par les segments du run
//   - acked_at (briefing acquitte ou non)
//
// Le statut "online cockpit" sera reel au Lot 4 quand l'auth caster + la
// presence cockpit seront en place. Pour l'instant on affiche "non connecte"
// partout (sans data fake). TODO Lot 4 : brancher la presence cockpit
// (probablement via une table caster_sessions ou un signal realtime).
//
// Les assignments sont chargees une fois au mount (et a chaque changement de
// la liste des match_ids), pas en realtime — un ack est rare et le polling
// du Director (toutes les ~30s via interval ou refetch on focus) suffit.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import type { EventSegment } from '@/types/events';

type AssignmentRow = {
  id: string;
  match_id: string;
  cast_member_id: string;
  briefing_at: string | null;
  briefing_reminder_sent_at: string | null;
  cast_member?: {
    id: string;
    name: string;
    auth_user_id: string | null;
    image_url: string | null;
  } | null;
  // Pas dans le select admin mais sera renvoye si on adapte l'endpoint. On
  // garde optional pour ne pas casser le typage si l'API change.
  acked_at?: string | null;
};

type Props = {
  segments: EventSegment[];
};

function formatTime(d: string | null | undefined) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function CasterStatusPanel({ segments }: Props) {
  const { adminFetchJson } = useAdminFetch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // assignments: keyed by assignment id (unique). Une meme cast_member_id peut
  // apparaitre sur plusieurs match → on affiche une ligne par assignment.
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);

  const matchIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of segments) {
      if (s.type === 'match' && s.match_id) set.add(s.match_id);
    }
    return Array.from(set);
  }, [segments]);

  const fetchAssignments = useCallback(async () => {
    if (matchIds.length === 0) {
      setAssignments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // L'endpoint d'admin est par match (pas de "list all" cross-match). On
      // fait un fan-out parallele. Bornes : si on a 100 segments tous distincts,
      // c'est 100 fetchs — mais en pratique un run a < 20 matches.
      const results = await Promise.all(
        matchIds.map(async (mid) => {
          try {
            const json = await adminFetchJson<{ assignments: AssignmentRow[] }>(
              `/api/admin/matches/${mid}/cast-assignments`
            );
            return json.assignments ?? [];
          } catch {
            return [];
          }
        })
      );
      const flat = results.flat();
      setAssignments(flat);
    } catch (err) {
      setError((err as Error)?.message ?? 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, matchIds]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/30 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-200">Casters</h3>
        <button
          type="button"
          onClick={fetchAssignments}
          className="text-xs text-neutral-400 hover:text-white"
          title="Rafraichir"
        >
          ↻
        </button>
      </div>
      <p className="text-[11px] text-neutral-500 mb-3">
        Etat de presence reel disponible au Lot 4 (cockpit caster). Pour
        l&apos;instant, seul l&apos;ack du briefing est affiche.
      </p>

      {loading ? (
        <div className="py-6">
          <LoadingSpinner size="sm" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-900/30 border border-red-500/40 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      ) : matchIds.length === 0 ? (
        <p className="text-xs text-neutral-500">
          Aucun segment de type match dans ce run.
        </p>
      ) : assignments.length === 0 ? (
        <p className="text-xs text-neutral-500">
          Aucun caster assigne aux matches du run.
        </p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => {
            // L'endpoint admin /api/admin/matches/[matchId]/cast-assignments
            // ne renvoie pas acked_at aujourd'hui (cf. Lot 2). On affiche donc
            // brief time uniquement. Un Lot ulterieur (4 ou correctif API)
            // exposera acked_at ici.
            const ackedKnown = typeof a.acked_at !== 'undefined';
            const acked = ackedKnown && !!a.acked_at;
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-lg bg-neutral-900/40 border border-neutral-700/60 p-2.5"
              >
                <div className="w-8 h-8 rounded-full bg-neutral-700/60 flex items-center justify-center text-xs font-bold text-neutral-200 flex-shrink-0">
                  {a.cast_member?.name?.slice(0, 2).toUpperCase() ?? '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {a.cast_member?.name ?? 'Caster inconnu'}
                  </div>
                  <div className="text-[11px] text-neutral-400 flex flex-wrap gap-x-3">
                    <span>brief : {formatTime(a.briefing_at)}</span>
                    {ackedKnown && (
                      <span>
                        ack :{' '}
                        {acked ? (
                          <span className="text-emerald-300">
                            {formatTime(a.acked_at)}
                          </span>
                        ) : (
                          <span className="text-neutral-500">en attente</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {ackedKnown ? (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        acked
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-neutral-700/50 border-neutral-600/40 text-neutral-300'
                      }`}
                    >
                      {acked ? 'Ack' : 'No ack'}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-neutral-700/50 border-neutral-600/40 text-neutral-500">
                      Ack indispo
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-neutral-700/50 border-neutral-600/40 text-neutral-500">
                    Non connecte
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
