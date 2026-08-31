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

import { type HomeNewsItem } from '@/components/News/HomeNewsSection';
import { type Announcement } from '@/components/Ads/AnnouncementsTicker';
import { type UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import { type HomePartner } from '@/components/Home/HomeSponsors';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveNewsImage } from '@/utils/news/newsImage';
import { logger } from '@/utils/logger';

// Marge de troncature du `content` des news de la home. HomeNewsSection ne rend
// qu'un excerpt d'au plus ~220 caractères ; on garde une marge confortable.
const HOME_NEWS_CONTENT_MAX = 300;

export type HomeData = {
  news: HomeNewsItem[];
  announcements: Announcement[];
  upcomingTournament: UpcomingTournament | null;
  partners: HomePartner[];
  /** Équipes engagées dans l'édition en cours — cf. `loadContendingTeams`. */
  teams: HomeTeam[];
  countdownTarget: string | null;
  // Vrai quand le chargement du contenu dynamique (news / annonces) a échoué
  // côté serveur. Permet d'afficher un avis d'erreur distinct d'un site
  // simplement vide, sans masquer le hero statique.
  loadError: boolean;
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

export function sanitizeAnnouncementUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol)) return url;
    return null;
  } catch {
    return null;
  }
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

  const now = Date.now();
  const running = data.find((t) => t.status === 'running');
  const upcoming = data.find((t) => {
    if (t.status !== 'published' || !t.start_date) return false;
    return new Date(t.start_date).getTime() >= now;
  });
  const picked = running || upcoming;
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
  return data
    .filter(
      (row: any) =>
        row.category === 'super' ||
        row.category === 'major' ||
        row.category === 'cultural'
    )
    .map((row: any) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      logoUrl: row.logo_url ?? null,
      websiteUrl: row.website_url ?? null,
    }));
}

export async function loadCountdownSetting(): Promise<string | null> {
  // `site_settings` est une table globale (NOT tenant-scoped).
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('value')
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
  let announcements: Announcement[] = [];
  let upcomingTournament: UpcomingTournament | null = null;
  let partners: HomePartner[] = [];
  let teams: HomeTeam[] = [];
  let countdownTarget: string | null = null;
  // Client absent = on n'a pas pu charger le contenu : on le signale plutôt
  // que d'afficher une home faussement vide.
  let loadError = !supabaseAdmin;

  if (supabaseAdmin) {
    const nowISO = new Date().toISOString();

    const [
      newsRes,
      announcementsRes,
      upcoming,
      partnersList,
      countdownSetting,
    ] = await Promise.all([
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
      supabaseAdmin
        .from('announcements')
        .select('id, title, message, cta_label, cta_url, priority, created_at')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('priority', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(6),
      loadUpcomingTournament(tenantId),
      loadPartners(),
      loadCountdownSetting(),
    ]);

    upcomingTournament = upcoming;
    partners = partnersList;
    countdownTarget = countdownSetting ?? upcomingTournament?.startDate ?? null;
    // Après le tournoi : la liste des engagées en dépend, elle ne peut pas
    // partir dans le même Promise.all.
    teams = await loadContendingTeams(tenantId, upcomingTournament?.id ?? null);

    // Une erreur sur les requêtes de contenu (news / annonces) signale une
    // panne, à distinguer d'un contenu légitimement vide.
    if (newsRes.error || announcementsRes.error) {
      loadError = true;
    }

    if (!newsRes.error && newsRes.data) {
      news = newsRes.data.map((row: any) => {
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
          imageIsTeamLogo: image.fromTeamLogo,
          publishedAt: row.published_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          commentsCount: row.news_comments?.[0]?.count ?? 0,
        };
      });
    }

    if (!announcementsRes.error && announcementsRes.data) {
      announcements = announcementsRes.data.map((row: any) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        ctaLabel: row.cta_label,
        ctaUrl: sanitizeAnnouncementUrl(row.cta_url),
      }));
    }
  }

  return {
    news,
    announcements,
    upcomingTournament,
    partners,
    teams,
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
