// utils/teams/scrimBroadcast.ts — demande de scrim GROUPÉE : une équipe
// propose ses créneaux à plusieurs équipes d'un coup, et annonce son niveau.
//
// UNE DEMANDE PAR ÉQUIPE CIBLE. Chaque destinataire reçoit une demande de
// scrim ordinaire (`demandes`, type `scrim`) : négociation, contre-proposition,
// MP du bot et e-mail restent ceux d'une demande simple. Ce qui les relie est
// `payload.broadcast.id` — et la règle « PREMIÈRE QUI ACCEPTE » : dès qu'une
// des demandes du groupe est acceptée, les autres encore en attente sont
// annulées (utils/teams/scrimRequestActions.ts).
//
// NIVEAU ANNONCÉ. `payload.announced_sr` : le SR que l'équipe annonce (échelle
// Overwatch 0–5000, cf. utils/overwatchRank.ts), affiché aux destinataires.
// Il sert aussi de référence à l'audience « à mon niveau » (±1 palier).
//
// Pur et sans dépendance serveur : testé seul (tests/unit/scrimBroadcast.test.ts).

import {
  OVERWATCH_TIERS,
  formatSkillRating,
  isValidSkillRating,
  overwatchTierFromSkillRating,
} from '@/utils/overwatchRank';

export const SCRIM_BROADCAST_AUDIENCES = ['all', 'level', 'searching'] as const;
export type ScrimBroadcastAudience = (typeof SCRIM_BROADCAST_AUDIENCES)[number];

/** Plafond de destinataires d'un envoi : au-delà, c'est du spam. */
export const SCRIM_BROADCAST_MAX_TARGETS = 40;

/** Écart de paliers toléré par l'audience « à mon niveau ». */
export const SCRIM_BROADCAST_LEVEL_SPAN = 1;

export type BroadcastCandidate = {
  id: string;
  name: string;
  /** SR résolu de l'équipe (déclaré, sinon moyenne du roster), ou null. */
  skillRating: number | null;
  /** L'équipe a une recherche de scrim en cours. */
  searching: boolean;
};

export type BroadcastPayload = {
  id: string;
  audience: ScrimBroadcastAudience;
  target_count: number;
};

/** Rang du palier d'un SR (bronze = 0 … grandmaster = 7), ou null. */
export function tierIndex(sr: number | null | undefined): number | null {
  const key = overwatchTierFromSkillRating(sr ?? null);
  if (!key) return null;
  return OVERWATCH_TIERS.findIndex((t) => t.key === key);
}

/**
 * Destinataires d'un envoi groupé, triés du plus pertinent au moins
 * pertinent : équipes qui cherchent un scrim d'abord, puis SR le plus proche,
 * puis nom. Jamais l'équipe elle-même. Plafonné à SCRIM_BROADCAST_MAX_TARGETS.
 *
 * `level` sans SR de référence ne retient personne : « à mon niveau » n'a pas
 * de sens si l'on ne sait pas quel est ce niveau.
 */
export function selectBroadcastTargets(
  candidates: readonly BroadcastCandidate[],
  opts: {
    myTeamId: string;
    audience: ScrimBroadcastAudience;
    referenceSr: number | null;
  }
): BroadcastCandidate[] {
  const ref = isValidSkillRating(opts.referenceSr) ? opts.referenceSr : null;
  const refTier = tierIndex(ref);

  const kept = candidates.filter((c) => {
    if (c.id === opts.myTeamId) return false;
    if (opts.audience === 'searching') return c.searching;
    if (opts.audience === 'level') {
      const tier = tierIndex(c.skillRating);
      return (
        refTier !== null &&
        tier !== null &&
        Math.abs(tier - refTier) <= SCRIM_BROADCAST_LEVEL_SPAN
      );
    }
    return true;
  });

  const distance = (c: BroadcastCandidate) =>
    ref !== null && c.skillRating !== null
      ? Math.abs(c.skillRating - ref)
      : Number.POSITIVE_INFINITY;

  return kept
    .sort(
      (a, b) =>
        Number(b.searching) - Number(a.searching) ||
        distance(a) - distance(b) ||
        a.name.localeCompare(b.name, 'fr')
    )
    .slice(0, SCRIM_BROADCAST_MAX_TARGETS);
}

/** Groupe d'une demande (`payload.broadcast`), ou null pour une demande simple. */
export function broadcastOf(
  payload: Record<string, unknown> | null | undefined
): BroadcastPayload | null {
  const b = payload?.broadcast as Partial<BroadcastPayload> | undefined;
  if (!b || typeof b.id !== 'string' || !b.id) return null;
  return {
    id: b.id,
    audience: (SCRIM_BROADCAST_AUDIENCES as readonly string[]).includes(
      b.audience as string
    )
      ? (b.audience as ScrimBroadcastAudience)
      : 'all',
    target_count: typeof b.target_count === 'number' ? b.target_count : 0,
  };
}

/** SR annoncé d'une demande (`payload.announced_sr`), ou null. */
export function announcedSrOf(
  payload: Record<string, unknown> | null | undefined
): number | null {
  const sr = payload?.announced_sr;
  return isValidSkillRating(sr) ? sr : null;
}

/**
 * Ligne lisible du niveau annoncé, pour l'e-mail, le MP et la carte :
 * « SR annoncé : 3k5 ». Le palier est laissé à l'affichage (libellé traduit).
 */
export function announcedSrLabel(sr: number | null): string | null {
  return sr === null ? null : `SR annoncé : ${formatSkillRating(sr)}`;
}
