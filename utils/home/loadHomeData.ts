// utils/home/loadHomeData.ts
//
// Chargement des données de la page d'accueil, extrait de `pages/index.tsx`
// pour être partagé entre la home live (`/`) et la refonte en preview
// (`/home-preview`). Le contrat de sortie (`HomeData`) est STRICTEMENT identique
// à ce que `getStaticProps` de la home produisait auparavant — l'extraction ne
// doit rien changer au rendu de la home existante.
//
// Rappel S5d : `getStaticProps` n'a pas accès à la requête, donc on est forcés
// sur `DEFAULT_TENANT_ID` (passé en argument par l'appelant).

import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { type HomeNewsItem } from '@/components/News/HomeNewsSection';
import { type UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import { type HomePartner } from '@/components/Home/HomeSponsors';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveNewsImage, type NewsTeamEmbed } from '@/utils/news/newsImage';
import { logger } from '@/utils/logger';
import { loadSocialFeed, type SocialFeedItem } from '@/utils/social/socialFeed';
import {
  loadNextMatchdays,
  type HomeMatchday,
} from '@/utils/home/loadNextMatchday';
import { getWallClockParts, SITE_TIMEZONE } from '@/utils/timezone';
import { readPublicStandings } from '@/utils/stages/publicStandings';
import { fetchTwitchClips } from '@/utils/twitch';

// Marge de troncature du `content` des news de la home. HomeNewsSection ne rend
// qu'un excerpt d'au plus ~220 caractères ; on garde une marge confortable.
const HOME_NEWS_CONTENT_MAX = 300;

/** La chaîne de la Cup — même login que `components/Home/useTwitchLive`. */
const TWITCH_CHANNEL = 'womens_cup';

export type HomeData = {
  news: HomeNewsItem[];
  /** Dernières publications de nos comptes réseaux — cf. `utils/social/socialFeed`. */
  socialFeed: SocialFeedItem[];
  upcomingTournament: UpcomingTournament | null;
  partners: HomePartner[];
  /** Équipes engagées dans l'édition en cours — cf. `loadContendingTeams`. */
  teams: HomeTeam[];
  /**
   * Les deux prochaines journées de matchs — cf. `loadNextMatchdays`. Vide
   * quand rien n'est programmé : la carte du rendez-vous retombe alors sur les
   * équipes engagées. La seconde journée répond à « et après ? », sans quoi il
   * faut ouvrir le calendrier.
   */
  matchdays: HomeMatchday[];
  /**
   * Le classement de la phase à points en cours, tel que la page Classement
   * l'affiche (même calcul, départages compris). Vide tant qu'aucun match n'a
   * été joué : un tableau de zéros n'apprend rien.
   */
  standings: HomeStandingRow[];
  /**
   * Les clips les plus vus de la chaîne sur le mois écoulé. Vide quand la
   * chaîne n'en a pas, ou quand Twitch est injoignable : le bloc disparaît.
   */
  clips: HomeClip[];
  countdownTarget: string | null;
  // Vrai quand le chargement du contenu dynamique (news / annonces) a échoué
  // côté serveur. Permet d'afficher un avis d'erreur distinct d'un site
  // simplement vide, sans masquer le hero statique.
  loadError: boolean;
};

/** Un clip Twitch, réduit à ce que l'accueil affiche. */
export type HomeClip = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  viewCount: number;
  duration: number;
};

/** Une ligne de classement, réduite à ce que l'accueil affiche. */
export type HomeStandingRow = {
  rank: number;
  teamId: string;
  name: string;
  shortName: string | null;
  slug: string | null;
  logoUrl: string | null;
  played: number;
  wins: number;
  losses: number;
  points: number;
  /** Différence de maps, déjà calculée : l'accueil ne recompte pas. */
  diff: number;
};

/** Une équipe telle que la bande d'accueil en a besoin, et rien de plus. */
export type HomeTeam = {
  id: string;
  name: string;
  shortName: string | null;
  slug: string | null;
  logoUrl: string | null;
};

/**
 * Les équipes ENGAGÉES dans le tournoi en cours.
 *
 * Pas « toutes les équipes actives » : la bande d'accueil annonce « elles
 * participent à la seconde édition ». Y faire figurer une équipe inscrite nulle
 * part rendrait la phrase fausse, et la fausserait silencieusement — c'est le
 * genre d'erreur qu'on ne voit qu'en la lisant depuis l'extérieur.
 *
 * Sans tournoi en cours, la liste est vide et la bande ne s'affiche pas : mieux
 * vaut rien qu'un alignement de logos sans raison d'être là.
 */
export async function loadContendingTeams(
  tenantId: string,
  tournamentId: string | null
): Promise<HomeTeam[]> {
  if (!supabaseAdmin || !tournamentId) return [];

  const { data, error } = await supabaseAdmin
    .from('tournament_teams')
    .select(
      'teams!inner(id, name, short_name, slug, logo_url, is_active, deleted_at)'
    )
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId);

  if (error) {
    logger.error('[loadHomeData] contending teams error', error);
    return [];
  }

  const teams: HomeTeam[] = [];
  for (const row of (data ?? []) as unknown as Array<{
    // PostgREST type l'embed en TABLEAU alors qu'une relation to-one renvoie un
    // objet. On accepte les deux plutôt que de parier sur la forme.
    teams?: Record<string, unknown> | Record<string, unknown>[] | null;
  }>) {
    const t = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    // Une équipe désactivée ou supprimée reste inscrite en base : elle ne doit
    // pas pour autant s'afficher en page d'accueil.
    if (!t || !t.is_active || t.deleted_at) continue;
    teams.push({
      id: t.id as string,
      name: t.name as string,
      shortName: (t.short_name as string | null) ?? null,
      slug: (t.slug as string | null) ?? null,
      logoUrl: (t.logo_url as string | null) ?? null,
    });
  }

  // Ordre alphabétique : le seul qui ne suggère pas un classement. Trier par
  // date d'inscription ferait lire un podium là où il n'y en a pas.
  teams.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return teams;
}

/**
 * Le jour CALENDAIRE (YYYY-MM-DD, heure de Paris) d'une borne de tournoi.
 *
 * `start_date` / `end_date` sont des colonnes `date` : « 2026-09-18 » désigne
 * une journée, pas un instant. La passer à `new Date()` en fait minuit UTC,
 * soit 2 h du matin à Paris — c'est exactement ce qui faisait disparaître le
 * tournoi de la home au milieu de la nuit du coup d'envoi.
 */
function tournamentDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (iso) return iso[1];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return getWallClockParts(parsed, SITE_TIMEZONE).date;
}

type FeaturableTournament = {
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

/**
 * Le tournoi que la home met en avant, parmi ceux lus en base.
 *
 * LA RÈGLE : ce qui se joue, sinon le prochain à se jouer — et un tournoi
 * reste « à venir » TANT QU'IL N'EST PAS FINI, pas seulement tant qu'il n'a
 * pas commencé.
 *
 * POURQUOI. Le test était `start_date >= maintenant`. Le 18 septembre 2026 à
 * 2 h du matin, le tournoi qui commençait LE JOUR MÊME est sorti de la home :
 * plus de carte « L'événement », et avec elle plus de bande des affiches du
 * soir ni des équipes engagées — le jour de tous les jours où on venait les
 * lire. Le statut `running` n'est posé qu'à la main par le staff ; la home ne
 * peut pas dépendre de ce geste pour annoncer un tournoi qui se joue.
 *
 * PURE, `now` INJECTÉ : la home est rendue en ISR, et cette décision doit être
 * testable sans attendre la bonne date.
 */
export function pickFeaturedTournament<T extends FeaturableTournament>(
  rows: T[],
  now: Date
): T | null {
  const running = rows.find((t) => t.status === 'running');
  if (running) return running;

  const today = getWallClockParts(now, SITE_TIMEZONE).date;
  const upcoming = rows.find((t) => {
    if (t.status !== 'published') return false;
    const start = tournamentDay(t.start_date);
    if (!start) return false;
    // Sans date de fin, l'événement tient sur sa journée de départ.
    const last = tournamentDay(t.end_date) ?? start;
    return last >= today;
  });
  return upcoming ?? null;
}

// S5d: tenant id du build courant. `getStaticProps` n'a pas d'accès à la
// requête, donc on est forcés sur DEFAULT_TENANT_ID. TODO(S7) — quand on
// passera multi-tenant, ces pages basculeront en SSR (ou ISR par tenant).
export async function loadUpcomingTournament(
  tenantId: string
): Promise<UpcomingTournament | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select(
      'id, name, slug, short_name, status, format, start_date, end_date, max_teams'
    )
    .eq('tenant_id', tenantId)
    .in('status', ['running', 'published'])
    .order('start_date', { ascending: true, nullsFirst: false });
  if (error || !data?.length) return null;

  const picked = pickFeaturedTournament(data, new Date());
  if (!picked) return null;

  const { count } = await supabaseAdmin
    .from('tournament_teams')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('tournament_id', picked.id);

  return {
    id: picked.id,
    name: picked.name,
    slug: picked.slug,
    shortName: picked.short_name,
    status: picked.status,
    startDate: picked.start_date,
    endDate: picked.end_date,
    format: picked.format,
    maxTeams: picked.max_teams,
    teamCount: typeof count === 'number' ? count : 0,
  };
}

/**
 * Le filtre des catégories affichées, en GARDE DE TYPE.
 *
 * Il était écrit en trois comparaisons dans un `.filter()`, sur des lignes
 * typées `any` : TypeScript ne voyait donc pas que `category` en ressortait
 * restreinte, et rien ne reliait cette liste à celle de `HomePartner`. Une
 * catégorie ajoutée au type sans être ajoutée ici disparaîtrait de la home
 * sans un mot ; désormais la compilation le dit.
 */
function isShownPartner(
  row: PartnerRow
): row is PartnerRow & { category: HomePartner['category'] } {
  return (
    row.category === 'super' ||
    row.category === 'major' ||
    row.category === 'cultural'
  );
}

/** Recopie du `.select()` de `loadPartners`. */
type PartnerRow = {
  id: string;
  name: string;
  /** NOT NULL en base ; la garde ci-dessus restreint aux catégories affichées. */
  category: string;
  logo_url: string | null;
  website_url: string | null;
  display_order: number | null;
};

/**
 * Recopie du `.select()` des actualités de la home.
 *
 * `news_comments(count)` est un agrégat PostgREST : il arrive en TABLEAU d'un
 * élément, d'où le `?.[0]?.count` plus bas. `teams` est l'embed du logo, et
 * `NewsTeamEmbed` en accepte déjà les deux formes.
 */
type HomeNewsRow = {
  id: string;
  title: string;
  slug: string;
  tag: string | null;
  excerpt: string | null;
  content: string | null;
  image_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
  news_comments?: { count: number }[] | null;
  teams?: NewsTeamEmbed | null;
};

export async function loadPartners(): Promise<HomePartner[]> {
  // `partners` n'est pas une table tenant-scopée (global / cross-tenant) —
  // on ne filtre pas par tenant_id ici (rappel S5d).
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from('partners')
    .select('id, name, category, logo_url, website_url, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return (data as PartnerRow[]).filter(isShownPartner).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    logoUrl: row.logo_url ?? null,
    websiteUrl: row.website_url ?? null,
  }));
}

export async function loadCountdownSetting(): Promise<string | null> {
  // `site_settings` est scopé par tenant depuis le lot A8 ; la home publique
  // lit le tenant par défaut (elle n'a pas encore de préfixe tenant).
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('key', 'homepage_event_date')
    .maybeSingle();
  const fromSetting = (data?.value ?? '').trim();
  return fromSetting || null;
}

/**
 * Charge l'ensemble des données de la home. Sortie byte-identique à
 * l'ancien `getStaticProps` de `pages/index.tsx`.
 */
export async function loadHomeData(tenantId: string): Promise<HomeData> {
  let news: HomeNewsItem[] = [];
  let socialFeed: SocialFeedItem[] = [];
  let upcomingTournament: UpcomingTournament | null = null;
  let partners: HomePartner[] = [];
  let teams: HomeTeam[] = [];
  let matchdays: HomeMatchday[] = [];
  let standings: HomeStandingRow[] = [];
  let clips: HomeClip[] = [];
  let countdownTarget: string | null = null;
  // Client absent = on n'a pas pu charger le contenu : on le signale plutôt
  // que d'afficher une home faussement vide.
  let loadError = !supabaseAdmin;

  if (supabaseAdmin) {
    const nowISO = new Date().toISOString();

    const [newsRes, upcoming, partnersList, countdownSetting, feed] =
      await Promise.all([
        supabaseAdmin
          .from('news')
          .select(
            'id, title, slug, tag, excerpt, content, image_url, published_at, created_at, updated_at, news_comments(count), teams(logo_url)'
          )
          .eq('tenant_id', tenantId)
          .eq('status', 'published')
          .or(`published_at.lte.${nowISO},published_at.is.null`)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(30),
        loadUpcomingTournament(tenantId),
        loadPartners(),
        loadCountdownSetting(),
        // Le mur des réseaux ne conditionne rien : s'il est vide, la section
        // ne s'affiche pas et le reste de la home est intact. Il n'entre donc
        // PAS dans `loadError`.
        loadSocialFeed(tenantId),
      ]);

    socialFeed = feed;
    upcomingTournament = upcoming;
    partners = partnersList;
    countdownTarget = countdownSetting ?? upcomingTournament?.startDate ?? null;
    // Après le tournoi : la liste des engagées en dépend, elle ne peut pas
    // partir dans le même Promise.all.
    teams = await loadContendingTeams(tenantId, upcomingTournament?.id ?? null);
    // Puis les affiches de la prochaine journée, qui se servent des équipes
    // qu'on vient de charger (nom court, slug) plutôt que d'aller les relire.
    // Comme le mur des réseaux, un calendrier vide n'est pas une panne : il
    // n'entre PAS dans `loadError`, la carte retombe sur les engagées.
    matchdays = await loadNextMatchdays(
      tenantId,
      upcomingTournament?.id ?? null,
      teams
    );

    // Les clips du moment. Appel TIERS : jamais bloquant, jamais compté comme
    // panne du site — sans Twitch, le bloc n'existe simplement pas.
    try {
      clips = (
        await fetchTwitchClips(TWITCH_CHANNEL, { limit: 4, days: 30 })
      ).map((c) => ({
        id: c.id,
        title: c.title,
        url: c.url,
        thumbnailUrl: c.thumbnailUrl,
        viewCount: c.viewCount,
        duration: c.duration,
      }));
    } catch (error) {
      logger.error('[loadHomeData] clips error', error);
    }

    // Le classement de la saison en cours. Même source que l'onglet Classement
    // (confrontation directe et départages du staff compris) : deux calculs
    // finiraient par se contredire, et c'est le classement qu'on conteste.
    if (upcomingTournament?.id) {
      try {
        const tables = await readPublicStandings(
          tenantId,
          upcomingTournament.id
        );
        const rows = tables[0]?.rows ?? [];
        standings = rows.some((r) => r.played > 0)
          ? rows.map((r) => ({
              rank: r.rank,
              teamId: r.teamId,
              name: r.teamName,
              shortName: r.shortName,
              slug: r.slug,
              logoUrl: r.logoUrl,
              played: r.played,
              wins: r.wins,
              losses: r.losses,
              points: r.points,
              diff: r.mapsWon - r.mapsLost,
            }))
          : [];
      } catch (error) {
        // Un classement illisible n'est pas une panne de la home.
        logger.error('[loadHomeData] standings error', error);
      }
    }

    // Une erreur sur la requête de contenu signale une panne, à distinguer
    // d'un contenu légitimement vide.
    if (newsRes.error) {
      loadError = true;
    }

    if (!newsRes.error && newsRes.data) {
      news = (newsRes.data as HomeNewsRow[]).map((row) => {
        const image = resolveNewsImage(row.image_url, row.teams);
        return {
          id: row.id,
          title: row.title,
          slug: row.slug,
          tag: row.tag || 'general',
          excerpt: row.excerpt,
          // La home n'affiche qu'un excerpt tronqué (jusqu'à ~220 caractères via
          // HomeNewsSection.getExcerpt). Sérialiser le `content` complet de 30
          // news gonflait inutilement __NEXT_DATA__ sur la page la plus vue : on
          // tronque côté serveur, avec une marge > à la fenêtre d'excerpt.
          content:
            typeof row.content === 'string'
              ? row.content.slice(0, HOME_NEWS_CONTENT_MAX)
              : row.content,
          // L'article DÉSIGNE son équipe (news.team_id) au lieu d'avoir copié
          // son logo à la publication : un logo posé après coup remonte enfin.
          imageUrl: image.url,
          imageFitContain: image.fitContain,
          publishedAt: row.published_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          commentsCount: row.news_comments?.[0]?.count ?? 0,
        };
      });
    }
  }

  return {
    news,
    socialFeed,
    upcomingTournament,
    partners,
    teams,
    matchdays,
    standings,
    clips,
    countdownTarget,
    loadError,
  };
}

/**
 * Cash-prize affichable d'un tournoi (base garantie + collecté), en euros.
 * Preview-only : la home live n'affiche pas encore le cash-prize. Renvoie null
 * si pas de cagnotte, montant nul, ou client absent.
 */
export async function loadTournamentPrizeCents(
  tournamentId: string
): Promise<number | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('tournament_prize_pools')
    .select('base_amount_cents, raised_amount_cents, currency')
    .eq('tournament_id', tournamentId)
    .maybeSingle();
  if (error || !data) return null;
  const base =
    typeof data.base_amount_cents === 'number' ? data.base_amount_cents : 0;
  const raised =
    typeof data.raised_amount_cents === 'number' ? data.raised_amount_cents : 0;
  const total = base + raised;
  return total > 0 ? total : null;
}
