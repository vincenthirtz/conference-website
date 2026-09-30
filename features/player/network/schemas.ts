// features/player/network/schemas.ts — réseau de la joueuse : découverte
// (carte, annuaire, fiche sociale), suivis, face-à-face, dossier d'adversaire,
// état d'onboarding réseau (lot P15). Zod seul : importé par les services, le
// registre OpenAPI (lib/apiContracts, chemin relatif) et le client.
//
// RÈGLE PRODUIT (verrouillée 2026-07-13) : la découverte est un opt-in
// GLOBAL, INVISIBLE PAR DÉFAUT, DERRIÈRE LE LOGIN. Aucune de ces formes n'est
// servie à une visiteuse anonyme ni indexée ; aucune route du réseau ne suit
// `?as=` (inspection staff) : elles sont toutes `subject: 'self'`.

import * as z from 'zod';
import type {
  DirectoryPlayer,
  PlayerTeam,
} from '@/utils/playerDiscoveryEnrich';
import type { ScoutingReport } from '@/utils/teams/scouting';
import type { TeamReliability } from '@/utils/teams/reliability';

export type { DirectoryPlayer, PlayerTeam };

/* ------------------------------------------------------------------ *
 * Découverte : carte de la joueuse
 * ------------------------------------------------------------------ */

/** Ancre de la carte de découverte sur /player/profile (checklist réseau). */
export const DISCOVERY_ANCHOR = 'decouverte';

/** Longueur maximale de l'accroche (même borne que `DiscoveryPutBody`). */
export const TAGLINE_MAX = 160;

/** Corps de PUT /api/player/discovery — patch partiel de la carte. */
export const DiscoveryPutBody = z.object({
  discoverable: z.boolean().optional(),
  displayName: z.string().max(80).nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  tagline: z.string().max(TAGLINE_MAX).nullable().optional(),
  showRatings: z.boolean().optional(),
  showTeams: z.boolean().optional(),
});
export type DiscoveryPutInput = z.infer<typeof DiscoveryPutBody>;

/**
 * Formulaire « accroche » : même borne que le corps partagé (`TAGLINE_MAX`),
 * le serveur ré-applique `DiscoveryPutBody`.
 */
export const TaglineForm = z.object({
  tagline: z.string().max(TAGLINE_MAX),
});

/** Carte de découverte exposée (GET et PUT rendent la même forme). */
export type DiscoveryCard = {
  discoverable: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  tagline: string | null;
  showRatings: boolean;
  showTeams: boolean;
  optedInAt: string | null;
};

/* ------------------------------------------------------------------ *
 * Annuaire et suivis
 * ------------------------------------------------------------------ */

/** Query de GET /api/player/discovery/search. */
export const DiscoverySearchQuery = z.object({
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type DiscoverySearchResponse = {
  players: DirectoryPlayer[];
  total: number;
  limit: number;
  offset: number;
};

/** Query de GET /api/player/follows. */
export const FollowsListQuery = z.object({
  type: z.enum(['following', 'followers']).default('following'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type FollowsListType = z.infer<typeof FollowsListQuery>['type'];

export type FollowsListResponse = DiscoverySearchResponse & {
  type: FollowsListType;
};

/** Corps de POST / DELETE /api/player/follows. */
export const FollowBody = z.object({
  followeeId: z.string().uuid(),
});
export type FollowInput = z.infer<typeof FollowBody>;

export type FollowResult = { following: boolean };

/* ------------------------------------------------------------------ *
 * Fiche sociale d'une joueuse (profil public, couche connectée)
 * ------------------------------------------------------------------ */

/** Query de GET /api/player/discovery/profile. */
export const DiscoveryProfileQuery = z.object({ userId: z.string().uuid() });

/**
 * ANTI-ÉNUMÉRATION : un compte invisible, inexistant ou un id malformé
 * rendent TOUS `{ discoverable: false }`.
 */
export type DiscoveryProfileState =
  | { discoverable: false }
  | {
      discoverable: true;
      isFollowing: boolean;
      followerCount: number;
      teams: PlayerTeam[];
    };

/* ------------------------------------------------------------------ *
 * Face-à-face cross-tenant
 * ------------------------------------------------------------------ */

/** Query de GET /api/player/discovery/head-to-head. */
export const HeadToHeadQuery = z.object({
  opponentId: z.string().uuid(),
});

/** Résultat d'une confrontation, du point de vue du côté « a » (soi). */
export type HeadToHeadOutcome = 'a' | 'b' | 'draw';

export type HeadToHeadEncounter = {
  matchId: string;
  tenantId: string | null;
  tournamentId: string | null;
  date: string | null;
  winner: HeadToHeadOutcome;
};

export type HeadToHeadResponse = {
  a: { userId: string };
  b: { userId: string };
  totals: { played: number; aWins: number; bWins: number; draws: number };
  recent: HeadToHeadEncounter[];
};

/* ------------------------------------------------------------------ *
 * Dossier d'adversaire (scouting)
 * ------------------------------------------------------------------ */

export type ScoutingNote = {
  subjectType: 'match' | 'scrim';
  subjectId: string;
  playedAt: string | null;
  vodUrl: string | null;
  notes: string | null;
};

export type ScoutingResponse = {
  myTeam: { id: string; name: string };
  target: {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    slug: string | null;
    country: string | null;
    rating: number | null;
    reliability: TeamReliability;
  };
  report: ScoutingReport;
  /** Noms des adversaires communs, pour rendre la section lisible. */
  teamNames: Record<string, string>;
  /** MES revues sur cette équipe (N2) — privées, donc consultables par moi. */
  myNotes: ScoutingNote[];
  /** Fuseau dans lequel les créneaux habituels sont exprimés. */
  timezone: string;
};

/* ------------------------------------------------------------------ *
 * Onboarding réseau
 * ------------------------------------------------------------------ */

export type NetworkStatus = {
  /** Compte Discord lié (table globale user_discord_links). */
  discordLinked: boolean;
  /** Membre d'une équipe (le BattleTag n'a de sens que dans ce cadre). */
  hasTeam: boolean;
  /** BattleTag renseigné sur la fiche de membre. */
  battleTagSet: boolean;
  /** BattleTag vérifié via Battle.net OAuth. */
  battleTagVerified: boolean;
  /** Profil de découverte activé (opt-in global, invisible par défaut). */
  discoverable: boolean;
  /** Nombre d'étapes non faites — 0 = rien à proposer. */
  missingCount: number;
};
