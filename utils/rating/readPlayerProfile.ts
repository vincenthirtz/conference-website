// utils/rating/readPlayerProfile.ts
//
// Lecture partagée du profil public complet d'une joueuse : rating actuel +
// rang, courbe d'history, matches récents et head-to-head.
//
// Extrait depuis `pages/api/players/[userId]/profile.ts` afin d'être
// réutilisable côté ISR (`getStaticProps` de `pages/player/[userId].tsx`)
// SANS appel HTTP au build. Le handler API délègue désormais ici et renvoie
// exactement la même shape.
//
// Convention de retour : `null` = joueuse introuvable (aucune ligne
// `player_ratings`) → 404 côté handler / `notFound: true` côté page.

import { maskBattleTag } from '../battleTag';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { computeAchievements } from '@/utils/profile/achievements';
import type {
  PlayerProfileResponse,
  PlayerProfileCore,
  PlayerProfileHistoryPoint,
  PlayerProfileRecentMatch,
  PlayerProfileH2H,
  PlayerRatingRow,
  ProfileAchievements,
  ProfilePlacement,
  ProfileSeason,
} from '@/types/rating';

const RECENT_MATCHES_LIMIT = 20;
const H2H_TOP_LIMIT = 10;

/**
 * Tolérance de comparaison des ratings, en RELATIF.
 *
 * `player_ratings.rating` est un `double precision`, et PostgREST le sérialise
 * avec 15 chiffres significatifs : 1822.2603714784216 en base revient en JSON
 * « 1822.26037147842 ». Le nombre relu n'est donc PAS le double stocké, et un
 * `rating > <relu>` renvoyé à la base compte alors comme « au-dessus » des
 * joueuses qui ont exactement le même rating. Tout un groupe d'ex æquo
 * basculait du mauvais côté : la 1re du classement s'affichait 6e sur sa fiche.
 *
 * 1e-9 en relatif est ~1000× au-dessus de l'erreur de troncature et très en
 * dessous du moindre écart de rating réel : deux ratings dans cette bande sont
 * ex æquo, et c'est le tie-break `user_id` qui tranche — exactement comme dans
 * l'ordre SQL du classement.
 */
const RATING_EPSILON_RATIO = 1e-9;

function ratingBand(rating: number): { low: number; high: number } {
  const eps = Math.abs(rating) * RATING_EPSILON_RATIO;
  return { low: rating - eps, high: rating + eps };
}

type HistoryRow = {
  match_id: string;
  tournament_id: string | null;
  occurred_at: string;
  rating_before: number;
  rating_after: number;
  result: 'win' | 'loss' | 'draw';
  opponent_avg_rating: number | null;
};

type ParticipantRow = {
  match_id: string;
  team_id: string;
  user_id: string;
  battle_tag: string | null;
  is_substitute: boolean | null;
};

type MatchRow = {
  id: string;
  tournament_id: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  completed_at: string | null;
};

const EMPTY_ACHIEVEMENTS: ProfileAchievements = {
  badges: [],
  palmares: [],
  seasons: [],
};

/**
 * Agrège palmarès (final_rankings des tournois du joueur) + saisons
 * (league_standings des équipes du joueur, leagues publiques non-draft) puis
 * délègue au réducteur pur `computeAchievements`.
 *
 * Best-effort : toute erreur DB est loggée et renvoie un bloc vide plutôt que
 * de faire échouer tout le profil.
 *
 * @param myParts participations (non-sub) du joueur — chaque paire
 *   (tournament_id via matches, team_id) fournit le scope palmarès + saisons.
 */
async function readAchievements(
  tenantId: string,
  stats: {
    peakRating: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
  },
  results: { result: 'win' | 'loss' | 'draw'; occurredAt: string }[],
  playerPairs: Array<{ tournamentId: string; teamId: string }>,
  teamIds: string[]
): Promise<ProfileAchievements> {
  try {
    // --- Palmarès : final_rankings des tournois où le joueur a une équipe ---
    const tournamentIds = [...new Set(playerPairs.map((p) => p.tournamentId))];
    const pairKey = (t: string, team: string) => `${t}::${team}`;
    const wantedPairs = new Set(
      playerPairs.map((p) => pairKey(p.tournamentId, p.teamId))
    );

    let placements: ProfilePlacement[] = [];
    if (tournamentIds.length > 0) {
      const { data: frRows, error: frErr } = await supabaseAdmin
        .from('final_rankings')
        .select('tournament_id, team_id, rank')
        .eq('tenant_id', tenantId)
        .in('tournament_id', tournamentIds);
      if (frErr) throw frErr;
      const rankings = (
        (frRows || []) as Array<{
          tournament_id: string;
          team_id: string;
          rank: number;
        }>
      ).filter((r) => wantedPairs.has(pairKey(r.tournament_id, r.team_id)));

      const rankedTournamentIds = [
        ...new Set(rankings.map((r) => r.tournament_id)),
      ];
      const rankedTeamIds = [...new Set(rankings.map((r) => r.team_id))];

      const tournamentMeta = new Map<
        string,
        {
          name: string | null;
          slug: string | null;
          start_date: string | null;
          end_date: string | null;
        }
      >();
      if (rankedTournamentIds.length > 0) {
        const { data: tRows, error: tErr } = await supabaseAdmin
          .from('tournaments')
          .select('id, name, slug, start_date, end_date')
          .eq('tenant_id', tenantId)
          .in('id', rankedTournamentIds);
        if (tErr) throw tErr;
        for (const t of (tRows || []) as Array<{
          id: string;
          name: string | null;
          slug: string | null;
          start_date: string | null;
          end_date: string | null;
        }>) {
          tournamentMeta.set(t.id, {
            name: t.name ?? null,
            slug: t.slug ?? null,
            start_date: t.start_date ?? null,
            end_date: t.end_date ?? null,
          });
        }
      }

      const teamNames = new Map<string, string | null>();
      if (rankedTeamIds.length > 0) {
        const { data: teamRows, error: teamErr } = await supabaseAdmin
          .from('teams')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .in('id', rankedTeamIds);
        if (teamErr) throw teamErr;
        for (const t of (teamRows || []) as Array<{
          id: string;
          name: string | null;
        }>) {
          teamNames.set(t.id, t.name ?? null);
        }
      }

      placements = rankings.map((r) => {
        const meta = tournamentMeta.get(r.tournament_id);
        return {
          tournamentId: r.tournament_id,
          tournamentName: meta?.name ?? null,
          tournamentSlug: meta?.slug ?? null,
          teamId: r.team_id,
          teamName: teamNames.get(r.team_id) ?? null,
          rank: r.rank,
          date: meta?.start_date ?? meta?.end_date ?? null,
        };
      });
    }

    // --- Saisons : league_standings des équipes du joueur, leagues publiques ---
    let seasons: ProfileSeason[] = [];
    if (teamIds.length > 0) {
      const { data: lsRows, error: lsErr } = await supabaseAdmin
        .from('league_standings')
        .select('league_id, team_id, rank, points')
        .eq('tenant_id', tenantId)
        .in('team_id', teamIds);
      if (lsErr) throw lsErr;
      const standings = (lsRows || []) as Array<{
        league_id: string;
        team_id: string;
        rank: number | null;
        points: number | null;
      }>;

      const leagueIds = [...new Set(standings.map((s) => s.league_id))];
      const leagueMeta = new Map<
        string,
        { name: string | null; slug: string | null }
      >();
      if (leagueIds.length > 0) {
        const { data: lRows, error: lErr } = await supabaseAdmin
          .from('leagues')
          .select('id, name, slug, is_public, status')
          .eq('tenant_id', tenantId)
          .in('id', leagueIds);
        if (lErr) throw lErr;
        for (const l of (lRows || []) as Array<{
          id: string;
          name: string | null;
          slug: string | null;
          is_public: boolean | null;
          status: string | null;
        }>) {
          // Profil public : uniquement les leagues publiées.
          if (l.is_public === true && l.status !== 'draft') {
            leagueMeta.set(l.id, {
              name: l.name ?? null,
              slug: l.slug ?? null,
            });
          }
        }
      }

      const teamNames = new Map<string, string | null>();
      const seasonTeamIds = [
        ...new Set(
          standings
            .filter((s) => leagueMeta.has(s.league_id))
            .map((s) => s.team_id)
        ),
      ];
      if (seasonTeamIds.length > 0) {
        const { data: teamRows, error: teamErr } = await supabaseAdmin
          .from('teams')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .in('id', seasonTeamIds);
        if (teamErr) throw teamErr;
        for (const t of (teamRows || []) as Array<{
          id: string;
          name: string | null;
        }>) {
          teamNames.set(t.id, t.name ?? null);
        }
      }

      seasons = standings
        .filter((s) => leagueMeta.has(s.league_id))
        .map((s) => {
          const meta = leagueMeta.get(s.league_id)!;
          return {
            leagueId: s.league_id,
            leagueName: meta.name,
            leagueSlug: meta.slug,
            teamId: s.team_id,
            teamName: teamNames.get(s.team_id) ?? null,
            rank: s.rank ?? null,
            points: Number.isFinite(s.points) ? (s.points as number) : 0,
          };
        });
    }

    return computeAchievements({ placements, stats, results, seasons });
  } catch (err) {
    logger.error('[readPlayerProfile] achievements aggregation error', err);
    return EMPTY_ACHIEVEMENTS;
  }
}

/**
 * Chaîne Twitch d'une joueuse, pour le profil PUBLIC.
 *
 * DEUX SOURCES, ET UN ORDRE. Une joueuse déclare la sienne sur son compte
 * (`user_metadata.twitch`, self-service) ; sa capitaine ou une manager peut
 * aussi la renseigner sur la fiche de roster (`team_members.twitch`). La
 * déclaration de la joueuse GAGNE : c'est son compte, et si les deux
 * divergent, celle qui a raison sur sa propre chaîne est elle.
 *
 * La fiche de roster sert de repli, pour le cas qui a motivé la demande — la
 * joueuse n'a rien saisi, la capitaine remplit à sa place, et la chaîne
 * apparaît quand même.
 *
 * BEST-EFFORT : un profil public ne doit pas tomber parce que le lookup d'un
 * lien secondaire a échoué. En cas d'erreur on renvoie `null`, le bouton
 * n'apparaît pas, le reste de la page vit sa vie.
 */
async function readPlayerTwitch(
  userId: string,
  tenantId: string
): Promise<string | null> {
  try {
    const { data: authUser } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    const declared = authUser?.user?.user_metadata?.twitch;
    if (typeof declared === 'string' && declared.trim()) {
      return declared.trim();
    }
  } catch (err) {
    logger.error('[readPlayerProfile] twitch metadata read error', err);
  }

  try {
    const { data: rows } = await supabaseAdmin
      .from('team_members')
      .select('twitch')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .not('twitch', 'is', null)
      .limit(1);
    const fromRoster = (rows ?? [])[0]?.twitch;
    if (typeof fromRoster === 'string' && fromRoster.trim()) {
      return fromRoster.trim();
    }
  } catch (err) {
    logger.error('[readPlayerProfile] twitch roster read error', err);
  }

  return null;
}

/**
 * Fiche d'une joueuse SANS ligne `player_ratings` : sur un roster, mais aucun
 * match classé à son actif.
 *
 * POURQUOI ELLE EXISTE. Le profil public 404ait dans ce cas — et c'était la
 * situation de 61 joueuses sur 69. Or la page publique d'équipe, les feuilles
 * de match et l'annuaire lient TOUS les membres d'un roster : une visiteuse qui
 * cliquait sur une joueuse tombait neuf fois sur dix sur une page introuvable,
 * pour quelqu'un qui est bel et bien inscrite. Le classement n'est qu'une
 * PARTIE de la fiche ; son absence ne doit pas emporter le reste — nom, avatar,
 * chaîne Twitch, pronoms.
 *
 * L'IDENTITÉ VIENT DU ROSTER, pas de `player_ratings` qui n'existe pas. Être
 * sur un roster du tenant est aussi ce qui fait qu'une fiche est légitime :
 * sans ça, on renvoie `null` et le 404 est mérité — un UUID au hasard ne doit
 * pas fabriquer une page.
 *
 * TOUT LE RESTE EST VIDE, ET C'EST EXACT : historique, matchs récents,
 * confrontations et palmarès se déduisent de matchs qu'elle n'a pas joués.
 */
async function readUnratedPlayerProfile(
  userId: string,
  tenantId: string
): Promise<PlayerProfileResponse | null> {
  const { data: rows, error } = await supabaseAdmin
    .from('team_members')
    .select('user_id, display_name, battle_tag, avatar_url, created_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    logger.error('[readPlayerProfile] roster identity read error', error);
    throw new Error('Failed to load player');
  }
  const member = (rows ?? [])[0] as
    | {
        display_name?: string | null;
        battle_tag?: string | null;
        avatar_url?: string | null;
      }
    | undefined;
  if (!member) return null;

  const twitch = await readPlayerTwitch(userId, tenantId);

  return {
    player: {
      userId,
      displayName: member.display_name ?? null,
      // Profil PUBLIC : jamais l'identifiant numérique (cf. utils/battleTag.ts).
      battleTag: maskBattleTag(member.battle_tag ?? null),
      avatarUrl: member.avatar_url ?? null,
      twitch,
      unrated: true,
      // Zéros de remplissage, JAMAIS à afficher : `unrated` est ce qui compte.
      rating: 0,
      rd: 0,
      volatility: 0,
      peakRating: 0,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      rank: null,
    },
    history: [],
    recentMatches: [],
    h2h: [],
    achievements: EMPTY_ACHIEVEMENTS,
  };
}

/**
 * Lit le profil public d'une joueuse pour un tenant donné.
 *
 * @returns la réponse `PlayerProfileResponse` ou `null` si la joueuse n'a
 *   aucune ligne `player_ratings` (= introuvable).
 * @throws en cas d'erreur DB non récupérable (le handler / getStaticProps
 *   décide comment la traiter).
 */
export async function readPlayerProfile(
  userId: string,
  tenantId: string
): Promise<PlayerProfileResponse | null> {
  // 1) player_ratings du joueur → null si absent.
  const { data: prRow, error: prErr } = await supabaseAdmin
    .from('player_ratings')
    .select(
      'user_id, rating, rd, volatility, peak_rating, games_played, wins, losses, display_name, battle_tag, avatar_url'
    )
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (prErr) {
    logger.error('[readPlayerProfile] player_ratings read error', prErr);
    throw new Error('Failed to load player');
  }
  // Pas de ligne de classement : la fiche existe quand même si la joueuse est
  // sur un roster. Voir readUnratedPlayerProfile — c'était le cas de la
  // très grande majorité des joueuses, et leur profil public 404ait.
  if (!prRow) {
    return readUnratedPlayerProfile(userId, tenantId);
  }
  const pr = prRow as Pick<
    PlayerRatingRow,
    | 'user_id'
    | 'rating'
    | 'rd'
    | 'volatility'
    | 'peak_rating'
    | 'games_played'
    | 'wins'
    | 'losses'
    | 'display_name'
    | 'battle_tag'
    | 'avatar_url'
  >;

  // 2) Rank par COUNT (aucun transfert de lignes) — fidèle à l'ordre du
  //    classement (rating desc, tie-break user_id asc), scopé aux joueurs
  //    notés (games_played > 0).
  //
  //    Joueur NOTÉ (games_played > 0) :
  //      rank = 1 + #{ rating > pr.rating } + #{ rating = pr.rating ∧ uid < pr.uid }
  //    Joueur NON noté (games_played = 0) : comme avant, il est exclu du
  //      classement → rang = (nb de notés) + 1 (position juste après le dernier).
  //
  //    Les bornes passent par `ratingBand` et non par la valeur brute : voir
  //    le commentaire de cette fonction — un `>` / `=` sur le nombre relu
  //    faisait basculer TOUT un groupe d'ex æquo du mauvais côté.
  let rank: number;
  if (pr.games_played > 0) {
    const band = ratingBand(pr.rating);
    const { count: higherCount, error: higherErr } = await supabaseAdmin
      .from('player_ratings')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gt('games_played', 0)
      .gt('rating', band.high);
    if (higherErr) {
      logger.error('[readPlayerProfile] rank higher-count error', higherErr);
      throw new Error('Failed to load player');
    }
    const { count: tieCount, error: tieErr } = await supabaseAdmin
      .from('player_ratings')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gt('games_played', 0)
      .gte('rating', band.low)
      .lte('rating', band.high)
      .lt('user_id', pr.user_id);
    if (tieErr) {
      logger.error('[readPlayerProfile] rank tie-count error', tieErr);
      throw new Error('Failed to load player');
    }
    rank = 1 + (higherCount ?? 0) + (tieCount ?? 0);
  } else {
    const { count: ratedCount, error: ratedErr } = await supabaseAdmin
      .from('player_ratings')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gt('games_played', 0);
    if (ratedErr) {
      logger.error('[readPlayerProfile] rank rated-count error', ratedErr);
      throw new Error('Failed to load player');
    }
    rank = (ratedCount ?? 0) + 1;
  }

  const twitch = await readPlayerTwitch(userId, tenantId);

  const player: PlayerProfileCore = {
    userId: pr.user_id,
    displayName: pr.display_name ?? null,
    // Profil PUBLIC : jamais l'identifiant numérique (cf. utils/battleTag.ts).
    battleTag: maskBattleTag(pr.battle_tag ?? null),
    avatarUrl: pr.avatar_url ?? null,
    twitch,
    unrated: false,
    rating: pr.rating,
    rd: pr.rd,
    volatility: pr.volatility,
    peakRating: pr.peak_rating,
    gamesPlayed: pr.games_played,
    wins: pr.wins,
    losses: pr.losses,
    rank,
  };

  // 3) History (courbe), chrono ASC.
  const { data: histRows } = await supabaseAdmin
    .from('player_rating_history')
    .select(
      'match_id, tournament_id, occurred_at, rating_before, rating_after, result, opponent_avg_rating'
    )
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  const historyRaw = (histRows || []) as HistoryRow[];
  historyRaw.sort((a, b) =>
    (a.occurred_at || '') < (b.occurred_at || '')
      ? -1
      : (a.occurred_at || '') > (b.occurred_at || '')
        ? 1
        : 0
  );
  const history: PlayerProfileHistoryPoint[] = historyRaw.map((h) => ({
    matchId: h.match_id,
    tournamentId: h.tournament_id,
    occurredAt: h.occurred_at,
    ratingBefore: h.rating_before,
    ratingAfter: h.rating_after,
    result: h.result,
    opponentAvgRating: h.opponent_avg_rating,
  }));

  // 4) Participations du joueur (non-sub) → base des recentMatches + H2H.
  const { data: myParts } = await supabaseAdmin
    .from('match_participants')
    .select('match_id, team_id, user_id, battle_tag, is_substitute')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  const myPartsRows = ((myParts || []) as ParticipantRow[]).filter(
    (p) => !p.is_substitute
  );
  const myMatchIds = [...new Set(myPartsRows.map((p) => p.match_id))];
  const myTeamByMatch = new Map<string, string>();
  for (const p of myPartsRows) myTeamByMatch.set(p.match_id, p.team_id);

  // 5) Charger les matches concernés + tous les participants de ces matches.
  const matchById = new Map<string, MatchRow>();
  const partsByMatch = new Map<string, ParticipantRow[]>();
  if (myMatchIds.length > 0) {
    const { data: matchRows } = await supabaseAdmin
      .from('matches')
      .select(
        'id, tournament_id, team1_id, team2_id, winner_team_id, completed_at'
      )
      .eq('tenant_id', tenantId)
      .in('id', myMatchIds);
    for (const m of (matchRows || []) as MatchRow[]) matchById.set(m.id, m);

    const { data: allParts } = await supabaseAdmin
      .from('match_participants')
      .select('match_id, team_id, user_id, battle_tag, is_substitute')
      .eq('tenant_id', tenantId)
      .in('match_id', myMatchIds);
    for (const p of (allParts || []) as ParticipantRow[]) {
      const arr = partsByMatch.get(p.match_id) ?? [];
      arr.push(p);
      partsByMatch.set(p.match_id, arr);
    }
  }

  // 6) recentMatches (desc, ~20) + opponent team name.
  const recentSource = myMatchIds
    .map((id) => matchById.get(id))
    .filter((m): m is MatchRow => !!m)
    .sort((a, b) =>
      (b.completed_at || '') < (a.completed_at || '')
        ? -1
        : (b.completed_at || '') > (a.completed_at || '')
          ? 1
          : 0
    )
    .slice(0, RECENT_MATCHES_LIMIT);

  const opponentTeamIds = new Set<string>();
  for (const m of recentSource) {
    const myTeam = myTeamByMatch.get(m.id);
    const opponentTeamId = myTeam === m.team1_id ? m.team2_id : m.team1_id;
    if (opponentTeamId) opponentTeamIds.add(opponentTeamId);
  }
  const teamNames = new Map<string, string>();
  if (opponentTeamIds.size > 0) {
    const { data: teamRows } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', [...opponentTeamIds]);
    for (const t of (teamRows || []) as Array<{ id: string; name: string }>) {
      teamNames.set(t.id, t.name);
    }
  }

  const recentMatches: PlayerProfileRecentMatch[] = recentSource.map((m) => {
    const myTeam = myTeamByMatch.get(m.id) ?? null;
    const opponentTeamId = myTeam === m.team1_id ? m.team2_id : m.team1_id;
    let result: 'win' | 'loss' | 'draw' = 'draw';
    if (m.winner_team_id) {
      result = m.winner_team_id === myTeam ? 'win' : 'loss';
    }
    return {
      matchId: m.id,
      tournamentId: m.tournament_id,
      occurredAt: m.completed_at ?? '',
      result,
      opponentTeamId: opponentTeamId ?? null,
      opponentTeamName: opponentTeamId
        ? (teamNames.get(opponentTeamId) ?? null)
        : null,
    };
  });

  // 7) H2H : agrège par opponent user_id sur toutes les participations.
  type H2HAgg = {
    wins: number;
    losses: number;
    games: number;
    displayName: string | null;
    battleTag: string | null;
  };
  const h2hAgg = new Map<string, H2HAgg>();
  for (const matchId of myMatchIds) {
    const match = matchById.get(matchId);
    if (!match || !match.winner_team_id) continue;
    const myTeam = myTeamByMatch.get(matchId);
    if (!myTeam) continue;
    const won = match.winner_team_id === myTeam;
    const parts = partsByMatch.get(matchId) ?? [];
    for (const p of parts) {
      if (p.is_substitute) continue;
      if (p.team_id === myTeam) continue; // même camp
      if (p.user_id === userId) continue;
      const e =
        h2hAgg.get(p.user_id) ??
        ({
          wins: 0,
          losses: 0,
          games: 0,
          displayName: null,
          battleTag: maskBattleTag(p.battle_tag ?? null),
        } as H2HAgg);
      e.games += 1;
      if (won) e.wins += 1;
      else e.losses += 1;
      if (!e.battleTag && p.battle_tag)
        e.battleTag = maskBattleTag(p.battle_tag);
      h2hAgg.set(p.user_id, e);
    }
  }

  // Best-effort display_name pour les adversaires : via player_ratings.
  const oppUserIds = [...h2hAgg.keys()];
  if (oppUserIds.length > 0) {
    const { data: oppRatings } = await supabaseAdmin
      .from('player_ratings')
      .select('user_id, display_name, battle_tag')
      .eq('tenant_id', tenantId)
      .in('user_id', oppUserIds);
    for (const r of (oppRatings || []) as Array<{
      user_id: string;
      display_name: string | null;
      battle_tag: string | null;
    }>) {
      const e = h2hAgg.get(r.user_id);
      if (e) {
        if (r.display_name) e.displayName = r.display_name;
        if (!e.battleTag && r.battle_tag)
          e.battleTag = maskBattleTag(r.battle_tag);
      }
    }
  }

  const h2h: PlayerProfileH2H[] = [...h2hAgg.entries()]
    .map(([opponentUserId, e]) => ({
      opponentUserId,
      opponentDisplayName: e.displayName,
      opponentBattleTag: e.battleTag,
      wins: e.wins,
      losses: e.losses,
      games: e.games,
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, H2H_TOP_LIMIT);

  // 8) Achievements (badges / palmarès / saisons). Best-effort : n'échoue
  //    jamais le profil complet.
  //    - playerPairs = paires distinctes (tournament_id, team_id) dérivées des
  //      matches du joueur (tournament_id via `matches`, team_id via la team du
  //      joueur sur ce match).
  //    - teamIds = équipes distinctes du joueur (base des saisons de league).
  const playerPairsSet = new Set<string>();
  const playerPairs: Array<{ tournamentId: string; teamId: string }> = [];
  for (const matchId of myMatchIds) {
    const match = matchById.get(matchId);
    const teamId = myTeamByMatch.get(matchId);
    if (!match || !match.tournament_id || !teamId) continue;
    const key = `${match.tournament_id}::${teamId}`;
    if (playerPairsSet.has(key)) continue;
    playerPairsSet.add(key);
    playerPairs.push({ tournamentId: match.tournament_id, teamId });
  }
  const teamIds = [...new Set(myPartsRows.map((p) => p.team_id))];

  const results = history.map((h) => ({
    result: h.result,
    occurredAt: h.occurredAt,
  }));

  const achievements = await readAchievements(
    tenantId,
    {
      peakRating: pr.peak_rating,
      gamesPlayed: pr.games_played,
      wins: pr.wins,
      losses: pr.losses,
    },
    results,
    playerPairs,
    teamIds
  );

  return {
    player,
    history,
    recentMatches,
    h2h,
    achievements,
  };
}
