// utils/tournament/liveHub.ts
//
// Bloc « Où en est le tournoi » de la landing /tournament/[id] : à partir des
// matchs du tournoi, décide ce qu'on montre — matchs en direct, prochains
// matchs, derniers résultats, avancement.
//
// La landing a été pensée pour AVANT le tournoi (inscriptions, format,
// récompenses). Une fois la compétition lancée, ce qu'une visiteuse cherche —
// qui joue ce soir, qui a gagné hier, qui est en tête — n'y figurait nulle part.
//
// Logique PURE : aucun accès base, `now` injecté (ISR : la page est
// régénérée toutes les 60 s, l'instant de rendu suffit).

export type HubTeam = {
  id: string;
  slug: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

export type HubMatch = {
  id: string;
  scheduled_at: string | null;
  status: string;
  is_bye: boolean | null;
  round_name: string | null;
  match_format: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  forfeit_team_id: string | null;
  stream_url: string | null;
  team1: HubTeam | null;
  team2: HubTeam | null;
};

export type LiveHub = {
  live: HubMatch[];
  upcoming: HubMatch[];
  recent: HubMatch[];
  /** Matchs au résultat acquis (joués, ou forfait avec vainqueur). */
  played: number;
  /** Matchs du tournoi hors byes et annulés. */
  total: number;
  /** Manche du prochain match (« J3 »), pour l'avancement. */
  nextRound: string | null;
};

const UPCOMING_STATUSES = new Set(['pending', 'scheduled', 'upcoming']);

/**
 * Marge après l'horaire prévu pendant laquelle un match non encore saisi reste
 * « à suivre » : un match de 21h dont le score arrive à 23h ne doit pas
 * disparaître de la page entre les deux.
 */
const UPCOMING_GRACE_MS = 3 * 60 * 60 * 1000;

function ts(iso: string | null): number {
  if (!iso) return Number.NaN;
  return new Date(iso).getTime();
}

/**
 * Un résultat qu'on peut afficher. Un forfait SANS vainqueur n'en est pas un :
 * c'est l'état d'un match dont le forfait a été annulé sans que son statut
 * soit remis à « à venir » — l'afficher « 0 - 0 » en résultat serait faux.
 */
export function hasResult(m: HubMatch): boolean {
  if (m.status === 'finished' || m.status === 'completed') return true;
  if (m.status === 'walkover') return Boolean(m.winner_team_id);
  return false;
}

export function buildLiveHub(
  matches: HubMatch[],
  now: Date,
  limits: { upcoming?: number; recent?: number } = {}
): LiveHub {
  const upcomingLimit = limits.upcoming ?? 3;
  const recentLimit = limits.recent ?? 4;
  const nowMs = now.getTime();

  const real = matches.filter((m) => !m.is_bye && m.status !== 'cancelled');

  const live = real
    .filter((m) => m.status === 'ongoing')
    .sort((a, b) => ts(a.scheduled_at) - ts(b.scheduled_at));

  const upcoming = real
    .filter((m) => {
      if (!UPCOMING_STATUSES.has(m.status)) return false;
      const at = ts(m.scheduled_at);
      // Sans horaire : pas « à suivre » — on ne saurait ni le placer ni le dater.
      return Number.isFinite(at) && at >= nowMs - UPCOMING_GRACE_MS;
    })
    .sort((a, b) => ts(a.scheduled_at) - ts(b.scheduled_at))
    .slice(0, upcomingLimit);

  const recentAll = real.filter(hasResult).sort((a, b) => {
    const d = ts(b.scheduled_at) - ts(a.scheduled_at);
    return Number.isNaN(d) ? 0 : d;
  });

  return {
    live,
    upcoming,
    recent: recentAll.slice(0, recentLimit),
    played: recentAll.length,
    total: real.length,
    nextRound: upcoming[0]?.round_name ?? live[0]?.round_name ?? null,
  };
}
