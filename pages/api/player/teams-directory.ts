// pages/api/player/teams-directory.ts
//
// Annuaire d'équipes CONNECTÉ (R4).
//
// Pourquoi une route dédiée plutôt que `/api/teams` : l'annuaire répond à une
// question que la liste publique ne sait pas poser — « qui puis-je affronter,
// maintenant, à mon niveau ? ». Il croise trois sources que le public n'a pas :
//   - la RECHERCHE de scrim vivante de chaque équipe (créneaux datés, R5) ;
//   - le rating d'équipe (team_ratings) pour situer le niveau ;
//   - le recrutement (is_joinable + effectif) pour les joueuses sans équipe.
//
// Il purge aussi les annonces périmées à la lecture (`expireStaleSearches`) :
// l'annuaire est précisément l'endroit où une dispo morte fait du dégât.
//
// Auth : session joueuse (Bearer). Pas de données sensibles — mais la
// disponibilité datée d'une équipe n'a pas à être exposée publiquement.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import {
  readNetworkTenantIds,
  readTenantLabels,
} from '@/utils/tenants/networkSharing';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import {
  expireStaleSearches,
  isSearchLive,
  overlappingSlots,
  type ScrimSearchRow,
} from '@/utils/teams/scrimSearch';
import {
  EMPTY_RELIABILITY,
  loadReliabilityMap,
  type TeamReliability,
} from '@/utils/teams/reliability';
import {
  resolveTeamSkillRating,
  type ResolvedTeamSkillRating,
} from '@/utils/overwatchRank';
import {
  computeOpponentMatch,
  type OpponentMatch,
} from '@/utils/teams/opponentMatch';
import {
  loadMyRhythmTimezone,
  loadTeamRhythmCores,
} from '@/utils/teams/teamRhythmStore';
import { overlappingRhythmSlots } from '@/utils/teams/teamRhythm';
import { MAX_TEAM_PLAYERS } from '@/utils/constants';
import { countPlayingMembers } from '@/utils/teams/roleKind';
import { logger } from '@/utils/logger';

/** Fenêtre sur laquelle « on les a déjà jouées » reste une information utile. */
const ENCOUNTER_WINDOW_DAYS = 90;

/**
 * Une équipe d'un AUTRE espace, vue depuis le mien (lot 4 : le réseau entre
 * espaces volontaires).
 *
 * Volontairement pauvre, et ce n'est pas une économie de code : la fiabilité,
 * le rating et l'historique de confrontations se mesurent sur les matchs joués
 * DANS un espace. Les transporter tels quels d'un espace à l'autre donnerait
 * des chiffres qui ont l'air comparables et ne le sont pas. On garde donc ce
 * qui se compare sans contexte : qui elle est, ce qu'elle cherche, quand.
 *
 * Pas de bouton « proposer un scrim » non plus : la proposition vit dans
 * l'espace de l'équipe, et une messagerie inter-espaces serait une autre
 * fonctionnalité. On donne le canal que les équipes utilisent déjà — leur
 * Discord — et le nom de l'espace d'où vient l'annonce.
 */
export type NetworkDirectoryTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  discord: string | null;
  skill_average: ResolvedTeamSkillRating | null;
  scrim_search: {
    slots: unknown[];
    format: string | null;
    note: string | null;
    expires_at: string | null;
    common_slots: unknown[];
  };
  /** D'où vient cette annonce. Sans ça, la ligne est inexplicable. */
  tenant: { name: string; slug: string | null };
};

/**
 * Les équipes des autres espaces volontaires qui cherchent un scrim.
 *
 * Ne jette jamais : une panne de lecture rend une liste vide, jamais une
 * erreur — l'annuaire de mon espace doit s'afficher même si le réseau tousse.
 */
async function loadNetworkTeams(
  tenantId: string,
  mySlots: unknown[]
): Promise<NetworkDirectoryTeam[]> {
  const networkIds = (await readNetworkTenantIds(tenantId, 'scrims')).filter(
    (id) => id !== tenantId
  );
  if (networkIds.length === 0) return [];

  const { data: searchRows, error: searchErr } = await supabaseAdmin
    .from('scrim_searches')
    .select('team_id, tenant_id, slots, format, note, status, expires_at')
    .in('tenant_id', networkIds)
    .eq('status', 'active');
  if (searchErr) {
    logger.error('[teams-directory] network searches error', searchErr);
    return [];
  }

  const searches = (
    (searchRows || []) as (ScrimSearchRow & {
      tenant_id: string;
    })[]
  ).filter((row) => isSearchLive(row));
  if (searches.length === 0) return [];

  const { data: teamRows, error: teamsErr } = await supabaseAdmin
    .from('teams')
    .select(
      'id, tenant_id, name, short_name, logo_url, country, discord, skill_rating, is_active, deleted_at, team_members(role, skill_rating)'
    )
    .in(
      'id',
      searches.map((s) => s.team_id)
    );
  if (teamsErr) {
    logger.error('[teams-directory] network teams error', teamsErr);
    return [];
  }

  const labels = await readTenantLabels(networkIds);
  const byTeam = new Map(searches.map((s) => [s.team_id, s]));

  const out: NetworkDirectoryTeam[] = [];
  for (const row of (teamRows || []) as Array<Record<string, unknown>>) {
    if (row.is_active === false || row.deleted_at) continue;
    const search = byTeam.get(row.id as string);
    if (!search) continue;
    const label = labels.get(row.tenant_id as string);
    out.push({
      id: row.id as string,
      name: (row.name as string) ?? '',
      short_name: (row.short_name as string | null) ?? null,
      logo_url: (row.logo_url as string | null) ?? null,
      country: (row.country as string | null) ?? null,
      discord: (row.discord as string | null) ?? null,
      skill_average: resolveTeamSkillRating(
        row.skill_rating as number | null | undefined,
        (row.team_members as {
          role?: string | null;
          skill_rating?: number | null;
        }[]) ?? []
      ),
      scrim_search: {
        slots: search.slots || [],
        format: search.format,
        note: search.note,
        expires_at: search.expires_at,
        common_slots: overlappingSlots(
          mySlots as never[],
          (search.slots || []) as never[]
        ),
      },
      tenant: {
        name: label?.name ?? '',
        slug: label?.slug ?? null,
      },
    });
  }

  // Les créneaux en commun d'abord : c'est la seule chose qui rende une équipe
  // lointaine réellement jouable cette semaine.
  out.sort((a, b) => {
    const d =
      b.scrim_search.common_slots.length - a.scrim_search.common_slots.length;
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  return out;
}

export type DirectoryTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  slug: string | null;
  country: string | null;
  member_count: number;
  is_joinable: boolean;
  is_full: boolean;
  /** Rating d'équipe dérivé des matchs (null si jamais noté). */
  rating: number | null;
  /**
   * Niveau moyen DÉCLARÉ (SR Overwatch). Sert au facteur « niveau » quand le
   * rating calculé manque — le cas de toute équipe qui vient d'arriver — et
   * s'affiche tel quel dans l'annuaire.
   */
  skill_average: ResolvedTeamSkillRating | null;
  /**
   * Fiabilité dérivée des propositions de scrim reçues (R10). Les taux sont
   * `null` sous le seuil d'échantillon : mieux vaut rien afficher qu'un
   * pourcentage calculé sur deux demandes.
   */
  reliability: TeamReliability;
  /** Recherche de scrim vivante, si l'équipe en a une. */
  scrim_search: {
    slots: string[];
    format: string | null;
    note: string | null;
    expires_at: string;
    /** Créneaux communs avec MA propre recherche — le signal le plus actionnable. */
    common_slots: string[];
  } | null;
  /**
   * Créneaux RÉCURRENTS en commun (rythmes d'équipe, N1). C'est le repli quand
   * aucune des deux équipes n'a d'annonce vivante — c'est-à-dire le cas normal.
   */
  common_rhythm_slots: string[];
  /** Affrontements (match ou scrim) sur les 90 derniers jours. */
  encounters_recent: number;
  /** Score de compatibilité expliqué (N4). Porte le tri de l'annuaire. */
  match: OpponentMatch;
};

/**
 * Nombre d'affrontements récents (match OU scrim) entre mon équipe et chaque
 * autre. Alimente le facteur de NOUVEAUTÉ du score : à niveau et disponibilité
 * égaux, mieux vaut proposer une équipe qu'on n'a pas jouée trois fois ce mois-ci.
 *
 * Ne throw jamais : sans cette donnée, le facteur retombe simplement sur 0
 * affrontement, ce qui est aussi le cas de très loin le plus fréquent.
 */
async function loadRecentEncounters(
  tenantId: string,
  myTeamId: string | null
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!myTeamId) return out;

  const since = new Date(
    Date.now() - ENCOUNTER_WINDOW_DAYS * 86_400_000
  ).toISOString();
  const involvesMe = `team1_id.eq.${myTeamId},team2_id.eq.${myTeamId}`;

  const bump = (rows: Array<Record<string, unknown>> | null | undefined) => {
    for (const row of rows || []) {
      const other =
        row.team1_id === myTeamId
          ? (row.team2_id as string | null)
          : (row.team1_id as string | null);
      if (!other) continue;
      out.set(other, (out.get(other) ?? 0) + 1);
    }
  };

  try {
    const [matchesRes, scrimsRes] = await Promise.all([
      supabaseAdmin
        .from('matches')
        .select('team1_id, team2_id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gte('scheduled_at', since)
        .or(involvesMe),
      supabaseAdmin
        .from('scrims')
        .select('team1_id, team2_id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gte('scheduled_date', since)
        .or(involvesMe),
    ]);
    bump(matchesRes.data as Array<Record<string, unknown>> | null);
    bump(scrimsRes.data as Array<Record<string, unknown>> | null);
  } catch (err) {
    logger.error('[teams-directory] encounters crash', err);
  }
  return out;
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'teams-directory')
  ) {
    return;
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  // Purge paresseuse des annonces périmées (pas de cron pour une règle aussi
  // simple, et c'est ici qu'une dispo morte induirait en erreur).
  await expireStaleSearches(tenantId);

  const access = await getManagedTeamForRequest(req, user.id, tenantId);
  const myTeamId = access?.teamId ?? null;

  const { data: teamRows, error: teamsErr } = await supabaseAdmin
    .from('teams')
    .select(
      // Rôles plutôt qu'un agrégat : l'encadrement ne consomme pas de place.
      'id, name, short_name, logo_url, slug, country, is_joinable, skill_rating, team_members(role, skill_rating)'
    )
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (teamsErr) {
    logger.error('[teams-directory] teams error', teamsErr);
    return res.status(500).json({ error: 'Lecture des équipes impossible.' });
  }

  const teams = (teamRows || []) as Array<Record<string, unknown>>;
  const teamIds = teams.map((t) => t.id as string);

  const memberCountByTeam = new Map<string, number>();
  const skillAverageByTeam = new Map<string, ResolvedTeamSkillRating>();
  for (const t of teams) {
    const roster = t.team_members as {
      role?: string | null;
      skill_rating?: number | null;
    }[];
    memberCountByTeam.set(t.id as string, countPlayingMembers(roster));
    // Le SR d'ensemble déclaré prime sur la moyenne des fiches : une équipe qui
    // annonce son niveau entre ainsi dans l'annuaire sans que chaque joueuse
    // ait eu à exposer le sien.
    const avg = resolveTeamSkillRating(
      t.skill_rating as number | null | undefined,
      roster
    );
    if (avg) skillAverageByTeam.set(t.id as string, avg);
  }

  // Fuseau de référence : celui que J'AI déclaré. Comparer des créneaux
  // récurrents entre fuseaux différents sans reprojection produirait des
  // recoupements fantômes.
  const referenceTimezone =
    (await loadMyRhythmTimezone(tenantId, user.id)) || 'Europe/Paris';

  const [searchesRes, ratingsRes, reliabilityMap, rhythmCores, encounters] =
    await Promise.all([
      supabaseAdmin
        .from('scrim_searches')
        .select('team_id, slots, format, note, status, expires_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'active'),
      supabaseAdmin
        .from('team_ratings')
        .select('team_id, rating')
        .eq('tenant_id', tenantId),
      loadReliabilityMap(tenantId, teamIds),
      loadTeamRhythmCores(tenantId, referenceTimezone, memberCountByTeam),
      loadRecentEncounters(tenantId, myTeamId),
    ]);

  const searchByTeam = new Map<string, ScrimSearchRow>();
  for (const row of (searchesRes.data || []) as ScrimSearchRow[]) {
    if (isSearchLive(row)) searchByTeam.set(row.team_id, row);
  }

  const ratingByTeam = new Map<string, number>();
  for (const row of (ratingsRes.data || []) as Array<{
    team_id: string;
    rating: number | null;
  }>) {
    if (typeof row.rating === 'number')
      ratingByTeam.set(row.team_id, row.rating);
  }

  // Mes propres créneaux : c'est ce qui permet d'afficher « 3 créneaux en
  // commun » plutôt qu'une simple pastille « cherche un scrim ».
  const mySlots = myTeamId ? (searchByTeam.get(myTeamId)?.slots ?? []) : [];
  const myRhythm = myTeamId ? (rhythmCores.get(myTeamId) ?? []) : [];
  const myRating = myTeamId ? (ratingByTeam.get(myTeamId) ?? null) : null;
  const mySkillAverage = myTeamId
    ? (skillAverageByTeam.get(myTeamId) ?? null)
    : null;

  const directory: DirectoryTeam[] = teams
    .filter((t) => (t.id as string) !== myTeamId)
    .map((t) => {
      const id = t.id as string;
      const memberCount = memberCountByTeam.get(id) ?? 0;
      const search = searchByTeam.get(id) ?? null;
      const reliability = reliabilityMap.get(id) ?? EMPTY_RELIABILITY;
      const commonSlots = search
        ? overlappingSlots(mySlots, search.slots || [])
        : [];
      const theirRhythm = rhythmCores.get(id) ?? [];
      const commonRhythm = overlappingRhythmSlots(myRhythm, theirRhythm);
      const encountersRecent = encounters.get(id) ?? 0;

      const match = computeOpponentMatch({
        commonSearchSlots: commonSlots.length,
        commonRhythmSlots: commonRhythm.length,
        // Sans déclaration des deux côtés, « 0 créneau commun » ne dit rien :
        // c'est un trou de données, pas une incompatibilité.
        slotsComparable:
          (mySlots.length > 0 || myRhythm.length > 0) &&
          ((search?.slots?.length ?? 0) > 0 || theirRhythm.length > 0),
        myRating,
        theirRating: ratingByTeam.get(id) ?? null,
        mySkillRating: mySkillAverage?.average ?? null,
        theirSkillRating: skillAverageByTeam.get(id)?.average ?? null,
        responseRate: reliability.responseRate,
        encountersRecent,
      });

      return {
        id,
        name: t.name as string,
        short_name: (t.short_name as string | null) ?? null,
        logo_url: (t.logo_url as string | null) ?? null,
        slug: (t.slug as string | null) ?? null,
        country: (t.country as string | null) ?? null,
        member_count: memberCount,
        is_joinable: Boolean(t.is_joinable),
        is_full: memberCount >= MAX_TEAM_PLAYERS,
        rating: ratingByTeam.get(id) ?? null,
        skill_average: skillAverageByTeam.get(id) ?? null,
        reliability,
        scrim_search: search
          ? {
              slots: search.slots || [],
              format: search.format,
              note: search.note,
              expires_at: search.expires_at,
              common_slots: commonSlots,
            }
          : null,
        common_rhythm_slots: commonRhythm,
        encounters_recent: encountersRecent,
        match,
      };
    });

  // Tri par SCORE de compatibilité (N4), plus par un proxy.
  //
  // Avant : créneaux communs → « cherche un scrim » → alphabétique. Le rating
  // et la fiabilité étaient affichés mais n'entraient pas dans l'ordre, si bien
  // qu'une équipe à 1200 et une à 1900 se retrouvaient côte à côte.
  //
  // Départages conservés derrière le score : une annonce vivante l'emporte à
  // score égal (c'est une intention datée, pas une habitude), puis l'ordre
  // alphabétique pour rester déterministe.
  directory.sort((a, b) => {
    if (a.match.score !== b.match.score) return b.match.score - a.match.score;
    const as = a.scrim_search ? 0 : 1;
    const bs = b.scrim_search ? 0 : 1;
    if (as !== bs) return as - bs;
    return a.name.localeCompare(b.name);
  });

  // Le réseau : les équipes des AUTRES espaces volontaires qui cherchent un
  // scrim en ce moment. Vide tant que mon espace n'a pas ouvert le sien — on ne
  // voit que si l'on donne (cf. utils/tenants/networkSharing.ts).
  const networkTeams = await loadNetworkTeams(tenantId, mySlots);

  res.setHeader('Cache-Control', 'private, max-age=15');
  return res.status(200).json({
    teams: directory,
    networkTeams,
    myTeamId,
    hasOwnSearch: mySlots.length > 0,
    // Mon propre niveau moyen : l'annuaire exclut ma team de la liste, donc
    // sans ça le client n'a rien à quoi comparer pour filtrer « à mon niveau ».
    mySkillAverage,
  });
});
