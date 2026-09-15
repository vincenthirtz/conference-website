// utils/tcg/readCollectionSets.ts
//
// Lit ce qu'il faut pour DÉFINIR les séries d'un espace, puis les construit
// par le réducteur pur `buildCollectionSets`.
//
// UNE ERREUR N'EST PAS UNE LISTE VIDE. Toute lecture en échec rend `ok: false`
// et AUCUNE série : une série calculée sur une lecture partielle peut paraître
// complète (un roster lu à moitié compte moins de joueuses), et la récompense
// qu'on verserait dessus ne se reprend pas. Même discipline que le palmarès
// (`grantPlacementRewards.readStarters`).
//
// L'EFFECTIF D'UNE ÉDITION, SELON QU'ELLE EST FINIE OU NON.
//   - tournoi `completed` → `match_participants` du tournoi : qui a RÉELLEMENT
//     joué pour l'équipe, figé à la fin de chaque match. C'est la définition du
//     palmarès d'une joueuse ; le roster courant, lui, compterait une recrue
//     arrivée après l'édition et oublierait une joueuse partie.
//   - tournoi `published` / `running` → `team_members` de l'équipe, hors
//     encadrement (coach, manager). Avant le début, aucune feuille de match
//     n'existe (vérifié pour la Cup 2026 : zéro ligne avant son lancement) ; un
//     roster lu sur les feuilles serait vide.
//   Conséquence assumée : quand une édition passe à `completed`, un roster peut
//   changer de contenu. Une récompense déjà versée reste acquise (la clé ne
//   dépend pas du contenu), une série pas encore complète suit le nouvel
//   effectif.
//
// Les tournois retenus sont les VISIBLES (`published`, `running`, `completed`,
// le filtre de `/api/tournaments`) : un brouillon ou un tournoi archivé ne doit
// pas faire apparaître son nom dans la collection de quelqu'un, ni dans un DM.

import { supabaseAdmin } from '@/utils/supabase';
import { isNonPlayingTeamRole } from '@/utils/teams/roleKind';
import { OVERWATCH_RECIPES } from '@/config/maps/overwatch';
import { MAP_POOL_SLUGS } from './readMapFaces';
import { readDrawPool } from './readDrawPool';
import {
  buildCollectionSets,
  MAX_SET_TOURNAMENTS,
  type CollectionSetDefinition,
  type CollectionSetSources,
} from './collectionSets';

/** Statuts d'un tournoi visible du public — ceux de `/api/tournaments`. */
export const VISIBLE_TOURNAMENT_STATUSES = [
  'published',
  'running',
  'completed',
] as const;

const PAGE_SIZE = 1000;
/** Plafond de pages par lecture : 20 000 lignes, bien au-delà du réel. */
const MAX_PAGES = 20;
/** Identifiants par filtre `in.(…)`, loin de la longueur d'URL refusée. */
const IN_CHUNK = 100;

export type ReadSetsResult =
  | { ok: true; sets: CollectionSetDefinition[] }
  | { ok: false; error: string };

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Lit toutes les pages d'une requête ordonnée. `null` = échec ou plafond
 * atteint : dans les deux cas, on ne sait pas ce qui manque.
 */
async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return null;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  return null;
}

/** `readAllPages` sur des lots d'identifiants. `null` dès qu'un lot échoue. */
async function readByChunks<T>(
  ids: readonly string[],
  page: (
    chunk: string[],
    from: number,
    to: number
  ) => PromiseLike<PageResult<T>>
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const batch = await readAllPages<T>((from, to) => page(chunk, from, to));
    if (batch === null) return null;
    rows.push(...batch);
  }
  return rows;
}

/** Les séries de l'espace. Ne lève jamais. */
export async function readCollectionSets(
  tenantId: string
): Promise<ReadSetsResult> {
  const db = supabaseAdmin;
  if (!db) return { ok: false, error: 'supabaseAdmin absent' };

  try {
    const [pool, tournamentsRes] = await Promise.all([
      readDrawPool(tenantId),
      db
        .from('tournaments')
        .select('id, name, status')
        .eq('tenant_id', tenantId)
        .in('status', [...VISIBLE_TOURNAMENT_STATUSES])
        .order('start_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(MAX_SET_TOURNAMENTS),
    ]);
    if (!pool.ok) return { ok: false, error: pool.error };
    if (tournamentsRes.error) {
      return { ok: false, error: tournamentsRes.error.message };
    }

    const tournaments = (tournamentsRes.data ?? []) as Array<{
      id: string;
      name: string | null;
      status: string;
    }>;

    // Le registre des maps est le vivier : on ne garde que les recettes dont
    // le slug est tirable, pour qu'aucune série de map ne puisse diverger du
    // tirage si les deux listes venaient à se séparer.
    const drawableMaps = new Set(MAP_POOL_SLUGS);
    const maps = OVERWATCH_RECIPES.filter((r) => drawableMaps.has(r.slug)).map(
      (r) => ({ slug: r.slug, name: r.name, layout: r.layout ?? null })
    );

    const base: Omit<CollectionSetSources, 'tournaments'> = {
      maps,
      drawablePlayerIds: new Set(pool.value.playerIds),
      drawableTeamIds: new Set(pool.value.teamIds),
    };

    if (tournaments.length === 0) {
      return {
        ok: true,
        sets: buildCollectionSets({ ...base, tournaments: [] }),
      };
    }

    // 1) Les phases, puis les équipes engagées (la définition du cadeau
    //    d'accueil). Une phase supprimée ne compte plus.
    const tournamentIds = tournaments.map((t) => t.id);
    const stages = await readByChunks<{ id: string; tournament_id: string }>(
      tournamentIds,
      (chunk, from, to) =>
        db
          .from('tournament_stages')
          .select('id, tournament_id')
          .eq('tenant_id', tenantId)
          .in('tournament_id', chunk)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to)
    );
    if (stages === null) return { ok: false, error: 'phases illisibles' };

    const tournamentOfStage = new Map(
      stages.map((s) => [s.id, s.tournament_id])
    );
    const stageTeams = await readByChunks<{
      stage_id: string;
      team_id: string;
    }>(
      stages.map((s) => s.id),
      (chunk, from, to) =>
        db
          .from('stage_teams')
          .select('stage_id, team_id')
          .eq('tenant_id', tenantId)
          .in('stage_id', chunk)
          .order('stage_id', { ascending: true })
          .order('team_id', { ascending: true })
          .range(from, to)
    );
    if (stageTeams === null) {
      return { ok: false, error: 'équipes engagées illisibles' };
    }

    const teamsByTournament = new Map<string, Set<string>>();
    for (const row of stageTeams) {
      const tournamentId = tournamentOfStage.get(row.stage_id);
      if (!tournamentId || !row.team_id) continue;
      const set = teamsByTournament.get(tournamentId) ?? new Set<string>();
      set.add(row.team_id);
      teamsByTournament.set(tournamentId, set);
    }
    const allTeamIds = [
      ...new Set([...teamsByTournament.values()].flatMap((s) => [...s])),
    ];

    // 2) Les noms d'équipes (publics) et les effectifs.
    const completedIds = tournaments
      .filter((t) => t.status === 'completed')
      .map((t) => t.id);

    const [teamRows, memberRows, participantRows] = await Promise.all([
      readByChunks<{ id: string; name: string | null }>(
        allTeamIds,
        (chunk, from, to) =>
          db
            .from('teams')
            .select('id, name')
            .eq('tenant_id', tenantId)
            .in('id', chunk)
            .order('id', { ascending: true })
            .range(from, to)
      ),
      readByChunks<{
        id: string;
        team_id: string;
        user_id: string | null;
        role: string | null;
      }>(allTeamIds, (chunk, from, to) =>
        db
          .from('team_members')
          .select('id, team_id, user_id, role')
          .eq('tenant_id', tenantId)
          .in('team_id', chunk)
          .not('user_id', 'is', null)
          .order('id', { ascending: true })
          .range(from, to)
      ),
      readByChunks<{
        id: string;
        tournament_id: string;
        team_id: string | null;
        user_id: string | null;
      }>(completedIds, (chunk, from, to) =>
        db
          .from('match_participants')
          .select('id, tournament_id, team_id, user_id')
          .eq('tenant_id', tenantId)
          .in('tournament_id', chunk)
          .not('user_id', 'is', null)
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ]);
    if (teamRows === null || memberRows === null || participantRows === null) {
      return { ok: false, error: 'équipes ou effectifs illisibles' };
    }

    const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

    const currentRoster = new Map<string, string[]>();
    for (const m of memberRows) {
      if (!m.user_id || isNonPlayingTeamRole(m.role)) continue;
      const list = currentRoster.get(m.team_id) ?? [];
      list.push(m.user_id);
      currentRoster.set(m.team_id, list);
    }

    const playedRoster = new Map<string, string[]>();
    for (const p of participantRows) {
      if (!p.user_id || !p.team_id) continue;
      const key = `${p.tournament_id}:${p.team_id}`;
      const list = playedRoster.get(key) ?? [];
      list.push(p.user_id);
      playedRoster.set(key, list);
    }

    const sources: CollectionSetSources = {
      ...base,
      tournaments: tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        teams: [...(teamsByTournament.get(t.id) ?? [])].map((teamId) => ({
          id: teamId,
          name: teamName.get(teamId) ?? null,
          rosterUserIds:
            t.status === 'completed'
              ? (playedRoster.get(`${t.id}:${teamId}`) ?? [])
              : (currentRoster.get(teamId) ?? []),
        })),
      })),
    };

    return { ok: true, sets: buildCollectionSets(sources) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
