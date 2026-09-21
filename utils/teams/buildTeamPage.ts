// utils/teams/buildTeamPage.ts
//
// Le chargement de la fiche publique d'équipe, sorti de
// `pages/team/[slug]/index.tsx`.
//
// POURQUOI LE SORTIR. La page faisait 2 054 lignes, dont 450 de
// `getStaticProps` : une dizaine de requêtes, trois sources de tournois à
// fusionner, deux passes de résolution d'adversaires. Rien de tout cela n'est
// du rendu, et tout cela était illisible au milieu du JSX. C'est le même
// découpage que `utils/dashboard/buildTournamentDashboard.ts`, pour la même
// raison.
//
// CE QUE LE DÉPLACEMENT A RÉVÉLÉ, et c'est l'essentiel : les treize `any` du
// fichier vivaient TOUS ici. Les remplacer par la forme réelle des lignes a
// mis au jour un défaut silencieux — les tournois arrivent par des embeds
// PostgREST (`tournament:tournaments (...)`), et un embed se rend en OBJET ou
// en TABLEAU selon ce que PostgREST juge unique. Le code lisait
// `r.tournament.id` sans se poser la question : sur la variante tableau,
// `id` valait `undefined`, le tournoi était quand même poussé dans la liste,
// et la fiche affichait une entrée sans lien. `oneRelation` dénoue les deux
// formes — il existait déjà pour ça.
//
// SERVEUR UNIQUEMENT : ce module touche `supabaseAdmin`. La page ne l'importe
// que depuis `getStaticProps`, que Next retire du bundle client ; les types,
// eux, passent par `import type` et n'existent plus après compilation.

import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import {
  loadTeamReliability,
  type TeamReliability,
} from '@/utils/teams/reliability';
import { maskBattleTag } from '@/utils/battleTag';
import {
  resolveTeamSkillRating,
  type ResolvedTeamSkillRating,
} from '@/utils/overwatchRank';
import {
  resolveMissingDisplayNames,
  withFallbackDisplayName,
} from '@/utils/teams/memberDisplayName';
import type { Achievement, Sponsor } from '@/utils/markdown/teamPublicMarkdown';
import { readTeamRarity } from '@/utils/tcg/readTeamRarity';
import { tcgTeamImageUrl } from '@/utils/tcg/teamCardImage';
import type { TcgRarity } from '@/utils/tcg/rarity';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import {
  buildTeamSeo,
  teamRedirectDestination,
} from '@/components/Team/teamPageSeo';
import { logger } from '@/utils/logger';

export type Team = {
  id: string;
  slug?: string | null;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  /**
   * Crédit d'artiste du logo. Arrive avec le `select('*')` du chargeur : pas de
   * lecture en plus. Nettoyé au rendu par `resolveLogoCredit` (https seul).
   */
  logo_credit_name?: string | null;
  logo_credit_url?: string | null;
  /** Chemin (pas URL) de l'illustration de la carte TCG. Résolu en prop. */
  tcg_image_path?: string | null;
  banner_url?: string | null;
  country?: string | null;
  description?: string | null;
  bio?: string | null;
  public_content?: string | null;
  accent_color?: string | null;
  secondary_color?: string | null;
  banner_overlay?: string | null;
  banner_focal?: string | null;
  twitter?: string | null;
  discord?: string | null;
  website?: string | null;
  youtube?: string | null;
  twitch?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  achievements?: Achievement[] | null;
  sponsors?: Sponsor[] | null;
  embed_provider?: string | null;
  embed_id?: string | null;
  pinned_announcement?: string | null;
  pinned_announcement_until?: string | null;
  is_active?: boolean;
  captain_id?: string | null;
  /** Niveau d'ensemble DÉCLARÉ par l'équipe — prime sur la moyenne des fiches. */
  skill_rating?: number | null;
  created_at: string;
};

export type TeamMember = {
  id: string;
  user_id: string;
  role: string;
  battle_tag?: string | null;
  is_captain?: boolean;
  is_substitute?: boolean;
  display_name?: string | null;
  specialty?: string | null;
  /** SR Overwatch déclaré par l'équipe (0-5000), `null` si non renseigné. */
  skill_rating?: number | null;
  avatar_url?: string | null;
  pronouns?: string | null;
  tagline?: string | null;
  twitter?: string | null;
  twitch?: string | null;
  created_at: string;
};

export type Tournament = {
  id: string;
  name: string;
  slug?: string | null;
  game?: string | null;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  logo_url?: string | null;
};

export type MatchStats = {
  total: number;
  wins: number;
  losses: number;
  draws: number;
};

export type RecentMatch = {
  id: string;
  scheduled_at: string | null;
  status: string;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  round_name?: string | null;
  opponent: {
    id: string;
    name: string;
    short_name?: string | null;
    logo_url?: string | null;
  } | null;
  tournament: {
    id: string;
    name: string;
  } | null;
  isTeam1: boolean;
};

/** Un scrim joué / programmé, vu depuis cette équipe (R9). */
export type ScrimHistoryEntry = {
  id: string;
  name: string | null;
  scheduledDate: string | null;
  opponentName: string | null;
};

export type TeamPageProps = {
  team: Team;
  /**
   * URL publique de l'illustration de carte TCG, `null` si l'équipe n'en a pas
   * déposé — la carte prend alors son logo. Résolue côté serveur : le chemin de
   * bucket ne franchit pas la frontière du rendu.
   */
  tcgImageUrl: string | null;
  members: TeamMember[];
  tournaments: Tournament[];
  matchStats: MatchStats;
  recentMatches: RecentMatch[];
  embedHost: string;
  announcementActive: boolean;
  /**
   * Profil RÉSEAU (R9) : ce que la fiche ne disait pas — avec qui cette équipe
   * a joué hors tournoi, et si elle répond quand on la sollicite.
   */
  scrimHistory: ScrimHistoryEntry[];
  reliability: TeamReliability;
  /**
   * Niveau moyen DÉCLARÉ de l'équipe. `null` tant qu'aucune joueuse n'a
   * renseigné le sien.
   */
  skillAverage: ResolvedTeamSkillRating | null;
  /**
   * Rareté de la carte TCG de cette équipe, dérivée de son palmarès et de son
   * classement (`utils/tcg/readTeamRarity.ts`).
   *
   * Les cartes d'équipe se tirent dans les paquets depuis leur création, mais
   * n'apparaissaient NULLE PART publiquement : la fiche d'équipe est leur place,
   * comme la fiche joueuse l'est pour les cartes de joueuses.
   */
  tcgRarity: TcgRarity;
  /** SEO par-entité, lu par `_app.tsx` → DefaultSeo (seule source des meta). */
  seo: SeoProps;
};

/**
 * Les trois issues possibles, explicitement.
 *
 * Rendre une union plutôt qu'un `TeamPageProps | null` évite que l'appelant
 * confonde « équipe absente » et « URL à rediriger » : les deux rendaient
 * `null` avant, et seule la position dans le code les distinguait.
 */
export type TeamPageResult =
  | { kind: 'notFound' }
  | { kind: 'redirect'; destination: string }
  | { kind: 'ok'; props: TeamPageProps };

/** Recopie du `.select()` des membres : une colonne retirée casse la compilation. */
type TeamMemberRow = {
  id: string;
  user_id: string;
  role: string;
  battle_tag: string | null;
  // NOT NULL en base — vérifié dans `information_schema`, pas supposé. La
  // déclarer nullable « par prudence » aurait forcé des `??` qui ressemblent à
  // des cas réels alors qu'ils sont morts.
  is_substitute: boolean;
  display_name: string | null;
  specialty: string | null;
  skill_rating: number | null;
  avatar_url: string | null;
  pronouns: string | null;
  tagline: string | null;
  twitter: string | null;
  twitch: string | null;
  created_at: string;
};

/** Les trois chemins par lesquels une équipe est rattachée à un tournoi. */
type RegistrationRow = { tournament: Relation<Tournament> };
type TournamentTeamRow = { tournament: Relation<Tournament> };
type StageTeamRow = {
  stage: Relation<{ tournament: Relation<Tournament> }>;
};

type MatchStatsRow = {
  id: string;
  status: string;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

type RecentMatchRow = MatchStatsRow & {
  scheduled_at: string | null;
  round_name: string | null;
  tournament_id: string | null;
};

type OpponentRow = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type TournamentLiteRow = { id: string; name: string };

type ScrimRow = {
  id: string;
  name: string | null;
  scheduled_date: string | null;
  team1_id: string | null;
  team2_id: string | null;
  status: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrouve l'équipe par slug, puis par id, nom et nom court.
 *
 * L'ordre compte : le slug est l'URL canonique, les autres ne servent qu'à ne
 * pas casser les liens déjà partagés — et déclenchent une redirection 308 plus
 * haut dans `buildTeamPage`.
 */
async function findTeam(tenantId: string, slug: string): Promise<Team | null> {
  const attempts: Array<() => PromiseLike<{ data: unknown }>> = [
    () =>
      supabaseAdmin
        .from('teams')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('slug', slug)
        .maybeSingle(),
  ];
  if (UUID_RE.test(slug)) {
    attempts.push(() =>
      supabaseAdmin
        .from('teams')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', slug)
        .maybeSingle()
    );
  }
  attempts.push(
    () =>
      supabaseAdmin
        .from('teams')
        .select('*')
        .eq('tenant_id', tenantId)
        .ilike('name', slug)
        .maybeSingle(),
    () =>
      supabaseAdmin
        .from('teams')
        .select('*')
        .eq('tenant_id', tenantId)
        .ilike('short_name', slug)
        .maybeSingle()
  );

  for (const attempt of attempts) {
    const { data } = await attempt();
    if (data) return data as Team;
  }
  return null;
}

/**
 * Fusionne les tournois des trois sources, sans doublon et dans l'ordre
 * d'apparition.
 *
 * `oneRelation` est ici la correction de fond : chaque `tournament` est un
 * embed PostgREST, donc potentiellement un tableau. Le code d'origine lisait
 * `r.tournament.id` — sur la variante tableau, l'identifiant sortait
 * `undefined` et un tournoi fantôme rejoignait la liste.
 */
function mergeTournaments(
  registrations: RegistrationRow[],
  tournamentTeams: TournamentTeamRow[],
  stageTeams: StageTeamRow[]
): Tournament[] {
  const out: Tournament[] = [];
  const seen = new Set<string>();

  const push = (t: Tournament | null) => {
    if (!t?.id || seen.has(t.id)) return;
    seen.add(t.id);
    out.push(t);
  };

  for (const r of registrations) push(oneRelation(r.tournament));
  for (const tt of tournamentTeams) push(oneRelation(tt.tournament));
  for (const st of stageTeams) {
    const stage = oneRelation(st.stage);
    push(stage ? oneRelation(stage.tournament) : null);
  }
  return out;
}

/**
 * Bilan victoires / défaites / nuls.
 *
 * `winner_team_id` fait foi quand il est posé ; la comparaison de scores n'est
 * qu'un repli pour les matchs anciens qui ne le portaient pas.
 */
function computeMatchStats(rows: MatchStatsRow[], teamId: string): MatchStats {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const m of rows) {
    if (m.winner_team_id) {
      if (m.winner_team_id === teamId) wins++;
      else losses++;
      continue;
    }
    const isTeam1 = m.team1_id === teamId;
    const ourScore = isTeam1 ? m.team1_score : m.team2_score;
    const theirScore = isTeam1 ? m.team2_score : m.team1_score;
    if (ourScore === null || theirScore === null) continue;
    if (ourScore > theirScore) wins++;
    else if (ourScore < theirScore) losses++;
    else draws++;
  }

  return { total: rows.length, wins, losses, draws };
}

/** Hôte passé au `parent` de l'iframe Twitch, dérivé de l'URL publique. */
function resolveEmbedHost(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return 'localhost';
  try {
    return new URL(siteUrl).hostname || 'localhost';
  } catch {
    return 'localhost';
  }
}

/**
 * Historique de scrims vu depuis cette équipe, adversaires résolus.
 *
 * Deux passes volontairement : la liste des scrims d'abord, les noms
 * d'adversaires ensuite, en UNE requête groupée plutôt qu'une par ligne.
 */
async function loadScrimHistory(
  tenantId: string,
  teamId: string
): Promise<ScrimHistoryEntry[]> {
  const { data } = await supabaseAdmin
    .from('scrims')
    .select('id, name, scheduled_date, team1_id, team2_id, status')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .neq('status', 'draft')
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .limit(5);

  const rows = (data || []) as ScrimRow[];
  const otherOf = (row: ScrimRow) =>
    row.team1_id === teamId ? row.team2_id : row.team1_id;

  const opponentIds = new Set(
    rows.map(otherOf).filter((id): id is string => !!id)
  );

  const names = new Map<string, string>();
  if (opponentIds.size > 0) {
    const { data: oppRows } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .in('id', Array.from(opponentIds));
    for (const o of (oppRows || []) as TournamentLiteRow[]) {
      names.set(o.id, o.name);
    }
  }

  return rows.map((row) => {
    const otherId = otherOf(row);
    return {
      id: row.id,
      name: row.name ?? null,
      scheduledDate: row.scheduled_date ?? null,
      opponentName: otherId ? (names.get(otherId) ?? null) : null,
    };
  });
}

/**
 * Tout ce que la fiche publique d'une équipe affiche, pour un slug donné.
 *
 * Rend une union : introuvable, à rediriger, ou les props complètes. La page
 * se contente de la traduire en réponse Next.
 */
export async function buildTeamPage(slug: string): Promise<TeamPageResult> {
  // S5d : ISR mono-espace (TODO(S7) — SSR/ISR par espace).
  const tenantId = DEFAULT_TENANT_ID;

  const team = await findTeam(tenantId, slug);
  if (!team) return { kind: 'notFound' };
  if (team.is_active === false) return { kind: 'notFound' };

  // Une seule URL par équipe : UUID, nom ou short_name redirigent (308) vers
  // le slug (l'id pour une équipe sans slug). Sinon deux URL servaient la même
  // fiche, et DefaultSeo déclarait canonique le chemin demandé.
  const redirectTo = teamRedirectDestination(slug, team);
  if (redirectTo) return { kind: 'redirect', destination: redirectTo };

  const teamId = team.id;

  // Requêtes indépendantes : une seule vague, pour que la (re)génération ISR
  // reste rapide.
  const [
    membersResult,
    registrationsResult,
    tournamentTeamsResult,
    stageTeamsResult,
    allMatchesResult,
    recentMatchesResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('team_members')
      .select(
        'id, user_id, role, battle_tag, is_substitute, display_name, specialty, skill_rating, avatar_url, pronouns, tagline, twitter, twitch, created_at'
      )
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: true }),

    // NB : `tournament_registrations` n'est pas dans la liste des tables
    // tenant-scopées en S2 (legacy). On reste sur l'unique filtre par team_id,
    // lui-même scopé par la résolution d'équipe ci-dessus.
    supabaseAdmin
      .from('tournament_registrations')
      .select(
        `tournament:tournaments (
           id, name, slug, game, status, start_date, end_date, logo_url
         )`
      )
      .eq('team_id', teamId),

    supabaseAdmin
      .from('tournament_teams')
      .select(
        `tournament:tournaments (
           id, name, slug, game, status, start_date, end_date, logo_url
         )`
      )
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId),

    supabaseAdmin
      .from('stage_teams')
      .select(
        `stage:tournament_stages (
           tournament:tournaments (
             id, name, slug, game, status, start_date, end_date, logo_url
           )
         )`
      )
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId),

    supabaseAdmin
      .from('matches')
      .select(
        'id, status, team1_id, team2_id, team1_score, team2_score, winner_team_id'
      )
      .eq('tenant_id', tenantId)
      .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
      .in('status', ['finished', 'completed', 'done']),

    // Colonnes explicites (au lieu de `*`) : 10 lignes × table matches large →
    // on ne récupère que ce que le mapping RecentMatch consomme réellement.
    supabaseAdmin
      .from('matches')
      .select(
        'id, scheduled_at, status, team1_id, team2_id, team1_score, team2_score, winner_team_id, round_name, tournament_id'
      )
      .eq('tenant_id', tenantId)
      .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .limit(10),
  ]);

  if (membersResult.error) {
    logger.error('Error fetching team members:', membersResult.error);
  }
  if (recentMatchesResult.error) {
    logger.error('Error fetching recent matches:', recentMatchesResult.error);
  }

  const rawMembers = (membersResult.data || []) as TeamMemberRow[];

  // Le pseudo vit sur le compte : `team_members.display_name` est une surcharge
  // par équipe, presque toujours nulle. Sans ce repli, l'encadrement (pas de
  // BattleTag obligatoire) n'a aucune identité à afficher.
  const memberNames = await resolveMissingDisplayNames(rawMembers);

  // Le SR est PUBLIC, par joueuse comme en moyenne : c'est une annonce de
  // niveau, pas une donnée d'identité — tout l'intérêt est qu'une équipe qui
  // cherche un scrim puisse la lire sans demander. Le BattleTag, lui, reste
  // masqué juste en dessous : les deux ne relèvent pas de la même chose.
  // Le SR d'ensemble DÉCLARÉ par l'équipe prime sur la moyenne des fiches :
  // une équipe peut annoncer son niveau sans exiger de chacune qu'elle expose
  // le sien. L'affichage dit laquelle des deux sources il montre.
  const skillAverage = resolveTeamSkillRating(team.skill_rating, rawMembers);

  const members: TeamMember[] = rawMembers
    .map((m) => ({
      ...m,
      // Anonymat public : on masque l'ID numérique du BattleTag (après le « # »).
      battle_tag: maskBattleTag(m.battle_tag ?? null),
      display_name: withFallbackDisplayName(m, memberNames),
      is_captain: team.captain_id === m.user_id,
    }))
    // Capitaine en tête. Tri STABLE : `sort` l'est depuis ES2019, donc l'ordre
    // par `created_at` de la requête est conservé à l'intérieur de chaque groupe.
    .sort((a, b) => Number(b.is_captain) - Number(a.is_captain));

  const tournaments = mergeTournaments(
    (registrationsResult.data || []) as RegistrationRow[],
    (tournamentTeamsResult.data || []) as TournamentTeamRow[],
    (stageTeamsResult.data || []) as StageTeamRow[]
  );

  const matchStats = computeMatchStats(
    (allMatchesResult.data || []) as MatchStatsRow[],
    teamId
  );

  const recentMatchRows = (recentMatchesResult.data || []) as RecentMatchRow[];

  // Adversaires et tournois des 10 derniers matchs, résolus en deux requêtes
  // groupées plutôt qu'une par ligne.
  const opponentIds = new Set<string>();
  const tournamentIds = new Set<string>();
  for (const m of recentMatchRows) {
    if (m.team1_id && m.team1_id !== teamId) opponentIds.add(m.team1_id);
    if (m.team2_id && m.team2_id !== teamId) opponentIds.add(m.team2_id);
    if (m.tournament_id) tournamentIds.add(m.tournament_id);
  }

  const [opponentTeams, tournamentData] = await Promise.all([
    opponentIds.size > 0
      ? supabaseAdmin
          .from('teams')
          .select('id, name, short_name, logo_url')
          .eq('tenant_id', tenantId)
          .in('id', Array.from(opponentIds))
          .then(({ data }) => (data || []) as OpponentRow[])
      : Promise.resolve<OpponentRow[]>([]),
    tournamentIds.size > 0
      ? supabaseAdmin
          .from('tournaments')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .in('id', Array.from(tournamentIds))
          .then(({ data }) => (data || []) as TournamentLiteRow[])
      : Promise.resolve<TournamentLiteRow[]>([]),
  ]);

  const teamsMap = new Map(opponentTeams.map((t) => [t.id, t]));
  const tournamentsMap = new Map(tournamentData.map((t) => [t.id, t]));

  const recentMatches: RecentMatch[] = recentMatchRows.map((m) => {
    const isTeam1 = m.team1_id === teamId;
    const opponentId = isTeam1 ? m.team2_id : m.team1_id;
    return {
      id: m.id,
      scheduled_at: m.scheduled_at,
      status: m.status,
      team1_score: m.team1_score,
      team2_score: m.team2_score,
      winner_team_id: m.winner_team_id,
      round_name: m.round_name,
      opponent: (opponentId ? teamsMap.get(opponentId) : null) ?? null,
      tournament:
        (m.tournament_id ? tournamentsMap.get(m.tournament_id) : null) ?? null,
      isTeam1,
    };
  });

  // Calculé à la génération, pas au rendu : `Date.now()` est interdit pendant
  // le rendu (règles react-hooks). L'ISR garde le drapeau frais dans sa fenêtre.
  const announcementActive =
    !!team.pinned_announcement &&
    (!team.pinned_announcement_until ||
      new Date(team.pinned_announcement_until).getTime() > Date.now());

  // Profil réseau (R9) : historique de scrims + fiabilité. Ces deux signaux
  // bougent lentement — l'ISR (60 s) suffit, pas besoin de charger côté client.
  const scrimHistory = await loadScrimHistory(tenantId, teamId);
  const reliability = await loadTeamReliability(tenantId, teamId);

  // Rareté de la carte TCG. Lecture PARTAGÉE avec l'ouverture de paquet : une
  // équipe ne doit pas avoir une rareté ici et une autre dans les paquets.
  // `readTeamRarity` ne lève jamais — une rareté illisible ne doit pas faire
  // échouer le rendu d'une page publique.
  //
  // Pas de revalidation à la demande, contrairement à la photo d'une joueuse :
  // l'ISR est déjà à 60 s ici, et une rareté qui met une minute à bouger
  // n'engage personne. Une PHOTO retirée, si.
  const tcgRarity = await readTeamRarity(tenantId, teamId);

  return {
    kind: 'ok',
    props: {
      team,
      // Même raisonnement que la rareté ci-dessus : l'ISR à 60 s suffit. Une
      // illustration que l'équipe vient de changer n'engage qu'elle-même, à la
      // différence d'une photo de joueuse retirée, qui exige l'immédiat.
      tcgImageUrl: tcgTeamImageUrl(supabaseAdmin.storage, team.tcg_image_path),
      members,
      tournaments,
      matchStats,
      recentMatches,
      embedHost: resolveEmbedHost(),
      announcementActive,
      scrimHistory,
      reliability,
      skillAverage,
      tcgRarity,
      seo: buildTeamSeo(team),
    },
  };
}
