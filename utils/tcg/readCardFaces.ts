// utils/tcg/readCardFaces.ts
//
// La FACE d'une carte : ce qu'on affiche d'une joueuse ou d'une équipe.
//
// C'EST ICI QUE VIT LA GARANTIE DE CONSENTEMENT PROMISE AU LOT 2.
//   Une photo n'est servie QUE si elle est `approved` ET que l'accord n'a pas
//   été retiré. Le lecteur de l'espace joueuse, lui, montre à la joueuse sa
//   propre photo même `pending` ou `rejected` — c'est son écran. Ici, on parle
//   des cartes que D'AUTRES possèdent : le filtrage est donc strict, et c'est
//   ce module, pas l'appelant, qui en répond.
//
//   Corollaire voulu : `tcg_pack_cards` ne stocke aucune image. Une joueuse qui
//   retire son accord voit sa photo disparaître des cartes DÉJÀ distribuées,
//   parce que la face est relue ici à chaque affichage plutôt que figée au
//   tirage.
//
// REPLI SANS PHOTO, JAMAIS DE PORTRAIT INVENTÉ. Sans photo approuvée, la carte
// retombe sur l'avatar public de la joueuse (qu'elle a elle-même choisi), puis
// sur le HÉROS qui la représente, et à défaut sur rien du tout — l'appelant
// affiche alors un fond de marque. Le projet n'utilise aucune image générée.
//
// LE HÉROS EST UN NOM, PAS UNE IMAGE. Aucune illustration de personnage n'est
// sous licence ici, et le dépôt s'interdit l'imagerie générée : la face porte
// donc `heroName`, que l'appelant écrit en toutes lettres. `heroSource` dit s'il
// s'agit d'un CHOIX de la joueuse ou d'une simple déduction depuis son rôle —
// l'interface ne doit pas présenter les deux de la même façon.
//
// DEUX PORTÉES SE CROISENT ICI, et c'est voulu : les préférences de héros sont
// GLOBALES au compte (`player_hero_preferences`, clavée sur l'utilisateur seul,
// comme les liens Discord), tandis que la spécialité est propre à l'équipe donc
// au tenant (`team_members`). Une joueuse garde ses héros favoris en changeant
// de club ; son rôle, non.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { recommendCardHero } from '@/utils/heroes/recommendCardHero';
import { maskBattleTag } from '@/utils/battleTag';
import { TCG_BUCKET, tcgTeamImageUrl } from '@/utils/tcg/teamCardImage';
import { displayableArtistUrl } from '@/utils/tcg/fanart';
import { resolveLogoCredit, type LogoCredit } from '@/utils/teams/logoCredit';
import {
  figureRoleFromHeroRole,
  normalizeFigureColor,
  type FigureRole,
} from '@/utils/tcg/roleFigures';

/** Même bucket public que les logos d'équipe. */
const BUCKET = TCG_BUCKET;

export type PlayerFace = {
  userId: string;
  displayName: string | null;
  /** Photo TCG approuvée, sinon avatar public, sinon `null`. */
  imageUrl: string | null;
  /** Vrai quand l'image vient d'une photo TCG consentie et approuvée. */
  hasTcgPhoto: boolean;
  /**
   * Le héros qui représente la joueuse, à afficher quand `imageUrl` est nul.
   * `null` quand rien ne permet de le dire — on ne tire jamais au hasard.
   */
  heroName: string | null;
  /** `pick` = elle l'a choisi ; `role` = déduit de sa spécialité. */
  heroSource: 'pick' | 'role' | null;
  /**
   * La figurine voxel de son RÔLE (`utils/tcg/roleFigures.ts`), qui illustre
   * la carte quand il n'y a ni photo ni avatar. Déduite du même héros que
   * `heroName` — donc `null` exactement quand lui l'est : pas de rôle connu,
   * pas de figurine, jamais un rôle tiré au hasard.
   */
  figureRole: FigureRole | null;
  /**
   * Couleur de SON équipe (`teams.accent_color`, à défaut `secondary_color`),
   * portée par la figurine. `null` → le violet du logo.
   */
  teamColor: string | null;
};

export type TeamFace = {
  teamId: string;
  name: string | null;
  shortName: string | null;
  slug: string | null;
  logoUrl: string | null;
  /**
   * Illustration déposée par la capitaine (ou le staff) pour la carte TCG.
   * `null` = aucune, et la carte retombe sur `logoUrl`.
   *
   * Les deux champs restent DISTINCTS au lieu d'être fusionnés à la lecture :
   * le rendu n'est pas le même — une illustration remplit son cadre, un logo
   * doit rester contenu dans le sien. Écraser `logoUrl` ici ferait recadrer les
   * logos de toutes les équipes qui n'ont rien déposé.
   */
  cardImageUrl: string | null;
  /**
   * Crédit d'artiste du LOGO (`teams.logo_credit_*`), déjà nettoyé : `null`
   * sans nom, et `url` à `null` si le lien n'est pas `https://`.
   *
   * Exposé même quand `cardImageUrl` existe : c'est la CARTE qui décide de
   * l'afficher (seulement quand elle montre le logo), comme elle décide déjà
   * du cadrage. Le filtrer ici ferait dépendre le crédit d'un détail de rendu
   * que le lecteur n'a pas à connaître.
   */
  logoCredit: LogoCredit | null;
};

/**
 * Les faces des joueuses demandées.
 *
 * Ne lève jamais : une face illisible rend une entrée minimale plutôt que de
 * faire échouer l'affichage d'une collection entière.
 */
export async function readPlayerFaces(
  tenantId: string,
  userIds: readonly string[]
): Promise<Map<string, PlayerFace>> {
  const faces = new Map<string, PlayerFace>();
  if (!supabaseAdmin || userIds.length === 0) return faces;

  const ids = [...new Set(userIds)];

  const [ratingsRes, cardsRes, prefsRes, membersRes] = await Promise.all([
    supabaseAdmin
      .from('player_ratings')
      // `battle_tag` est lu pour SERVIR DE NOM quand `display_name` est absent
      // — cf. `nameOf` plus bas. C'est le repli que tout le reste du dépôt
      // applique déjà (classement, page match, carte OG…).
      .select('user_id, display_name, battle_tag, avatar_url')
      .eq('tenant_id', tenantId)
      .in('user_id', ids),
    // Le filtre de consentement, en une clause : approuvée ET non révoquée.
    supabaseAdmin
      .from('tcg_player_cards')
      .select('user_id, photo_path, photo_status, revoked_at')
      .eq('tenant_id', tenantId)
      .eq('photo_status', 'approved')
      .is('revoked_at', null)
      .in('user_id', ids),
    // SANS filtre de tenant : ces préférences appartiennent au compte, pas au
    // club. Cf. l'en-tête du module.
    supabaseAdmin
      .from('player_hero_preferences')
      .select('auth_user_id, picks, bans')
      .in('auth_user_id', ids),
    // La spécialité, elle, est propre à l'équipe : filtrée par tenant.
    supabaseAdmin
      .from('team_members')
      .select('user_id, specialty, team_id')
      .eq('tenant_id', tenantId)
      .in('user_id', ids),
  ]);

  if (ratingsRes.error) {
    logger.warn(
      '[tcg] faces joueuses illisibles: %s',
      ratingsRes.error.message
    );
  }
  if (cardsRes.error) {
    // Sans les photos, les cartes retombent sur les avatars : dégradé, pas
    // cassé. Surtout, on ne sert AUCUNE photo dans le doute.
    logger.warn('[tcg] photos illisibles: %s', cardsRes.error.message);
  }
  if (prefsRes.error) {
    // Sans préférences, la recommandation retombe sur le rôle, puis sur rien :
    // une carte sans héros vaut mieux qu'un héros faux.
    logger.warn('[tcg] héros favoris illisibles: %s', prefsRes.error.message);
  }
  if (membersRes.error) {
    logger.warn('[tcg] spécialités illisibles: %s', membersRes.error.message);
  }

  const photoByUser = new Map<string, string>();
  for (const row of (cardsRes.data ?? []) as Array<{
    user_id: string;
    photo_path: string | null;
  }>) {
    if (!row.photo_path) continue;
    photoByUser.set(
      row.user_id,
      supabaseAdmin.storage.from(BUCKET).getPublicUrl(row.photo_path).data
        .publicUrl
    );
  }

  const prefsByUser = new Map<string, { picks: string[]; bans: string[] }>();
  for (const row of (prefsRes.data ?? []) as Array<{
    auth_user_id: string;
    picks: string[] | null;
    bans: string[] | null;
  }>) {
    prefsByUser.set(row.auth_user_id, {
      picks: row.picks ?? [],
      bans: row.bans ?? [],
    });
  }

  // Une joueuse peut appartenir à plusieurs équipes du même tenant : on retient
  // la PREMIÈRE spécialité renseignée. Choisir entre deux rôles déclarés serait
  // arbitraire, et la préférence explicite prime de toute façon sur le rôle.
  const specialtyByUser = new Map<string, string>();
  // L'équipe dont la figurine porte la couleur : la PREMIÈRE rencontrée, même
  // règle que la spécialité — choisir entre deux clubs serait arbitraire.
  const teamByUser = new Map<string, string>();
  for (const row of (membersRes.data ?? []) as Array<{
    user_id: string | null;
    specialty: string | null;
    team_id: string | null;
  }>) {
    if (!row.user_id) continue;
    if (row.team_id && !teamByUser.has(row.user_id)) {
      teamByUser.set(row.user_id, row.team_id);
    }
    if (!row.specialty) continue;
    if (!specialtyByUser.has(row.user_id)) {
      specialtyByUser.set(row.user_id, row.specialty);
    }
  }

  // Couleurs d'équipe, en une lecture. Une panne rend le violet du logo : une
  // figurine dans la mauvaise couleur vaut mieux qu'une carte cassée.
  const colorByTeam = new Map<string, string>();
  const teamIds = [...new Set(teamByUser.values())];
  if (teamIds.length > 0) {
    const { data: teamRows, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, accent_color, secondary_color')
      .in('id', teamIds);
    if (teamErr) {
      logger.warn('[tcg] couleurs d’équipe illisibles: %s', teamErr.message);
    }
    for (const row of (teamRows ?? []) as Array<{
      id: string;
      accent_color: string | null;
      secondary_color: string | null;
    }>) {
      const color =
        normalizeFigureColor(row.accent_color) ??
        normalizeFigureColor(row.secondary_color);
      if (color) colorByTeam.set(row.id, color);
    }
  }

  /**
   * Le nom porté par la carte.
   *
   * WHY ce repli : une joueuse des éditions passées n'a PAS de compte auth,
   * donc jamais de `display_name` — son nom vit dans `battle_tag`, et le seed
   * qui crée ces lignes le dit en toutes lettres
   * (`database/seeds/edition_2025_match_participants.sql`). Ce module était le
   * seul du dépôt à ne pas appliquer le repli `display_name ?? battle_tag` que
   * font le classement, la page de match et la carte OG : ces joueuses
   * ressortaient donc sans nom, et l'interface les libellait « Sujet inconnu ».
   *
   * Le tag est MASQUÉ (« Akira#4422 » → « Akira ») : une carte s'affiche dans la
   * collection d'autres joueuses et sur une fiche publique, soit exactement les
   * surfaces où `utils/battleTag.ts` proscrit le discriminant numérique. Même
   * choix que la carte OG (`pages/api/og/player/[userId].tsx`).
   */
  const nameOf = (row: {
    display_name: string | null;
    battle_tag: string | null;
  }): string | null =>
    row.display_name ?? maskBattleTag(row.battle_tag) ?? null;

  /** Le héros représentant cette joueuse, calculé par le réducteur partagé. */
  const heroFor = (userId: string) => {
    const prefs = prefsByUser.get(userId);
    const reco = recommendCardHero({
      picks: prefs?.picks,
      bans: prefs?.bans,
      specialty: specialtyByUser.get(userId) ?? null,
    });
    const teamId = teamByUser.get(userId);
    return {
      heroName: reco?.hero.name ?? null,
      heroSource: reco?.source ?? null,
      figureRole: figureRoleFromHeroRole(reco?.hero.role),
      teamColor: teamId ? (colorByTeam.get(teamId) ?? null) : null,
    };
  };

  for (const row of (ratingsRes.data ?? []) as Array<{
    user_id: string;
    display_name: string | null;
    battle_tag: string | null;
    avatar_url: string | null;
  }>) {
    const photo = photoByUser.get(row.user_id) ?? null;
    faces.set(row.user_id, {
      userId: row.user_id,
      displayName: nameOf(row),
      imageUrl: photo ?? row.avatar_url ?? null,
      hasTcgPhoto: Boolean(photo),
      ...heroFor(row.user_id),
    });
  }

  // Une joueuse sans ligne de classement existe quand même (roster seul) : on
  // rend une face minimale plutôt que de la faire disparaître de la collection.
  // Le héros est calculé ICI AUSSI — l'oublier priverait de recommandation
  // précisément les joueuses les moins renseignées, donc celles qui en ont le
  // plus besoin.
  for (const id of ids) {
    if (!faces.has(id)) {
      const photo = photoByUser.get(id) ?? null;
      faces.set(id, {
        userId: id,
        displayName: null,
        imageUrl: photo,
        hasTcgPhoto: Boolean(photo),
        ...heroFor(id),
      });
    }
  }

  return faces;
}

/** Les faces des équipes demandées. Ne lève jamais. */
export async function readTeamFaces(
  tenantId: string,
  teamIds: readonly string[]
): Promise<Map<string, TeamFace>> {
  const faces = new Map<string, TeamFace>();
  if (!supabaseAdmin || teamIds.length === 0) return faces;

  const ids = [...new Set(teamIds)];

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select(
      'id, name, short_name, slug, logo_url, tcg_image_path, logo_credit_name, logo_credit_url'
    )
    .eq('tenant_id', tenantId)
    .in('id', ids);

  if (error) {
    logger.warn('[tcg] faces équipes illisibles: %s', error.message);
    return faces;
  }

  for (const row of (data ?? []) as Array<{
    id: string;
    name: string | null;
    short_name: string | null;
    slug: string | null;
    logo_url: string | null;
    tcg_image_path: string | null;
    logo_credit_name: string | null;
    logo_credit_url: string | null;
  }>) {
    faces.set(row.id, {
      teamId: row.id,
      name: row.name,
      shortName: row.short_name,
      slug: row.slug,
      logoUrl: row.logo_url,
      // Résolu ICI, comme la photo d'une joueuse : la collection, l'ouverture
      // de paquet et l'overview staff passent tous par ce lecteur, et aucun
      // n'a à savoir qu'un chemin de bucket existe.
      cardImageUrl: tcgTeamImageUrl(supabaseAdmin.storage, row.tcg_image_path),
      logoCredit: resolveLogoCredit(row.logo_credit_name, row.logo_credit_url),
    });
  }

  return faces;
}

/* ---------------------------------------------------------------------------
 * Fan arts
 * ------------------------------------------------------------------------- */

export type FanartFace = {
  fanartId: string;
  title: string | null;
  /** Le nom à CRÉDITER, tel que l'autrice l'a écrit. */
  artistName: string | null;
  artistUrl: string | null;
  imageUrl: string | null;
};

/**
 * Les faces des fan arts demandées.
 *
 * FILTRE DE PUBLICATION, ICI ET NULLE PART AILLEURS : seules les œuvres
 * `approved` rendent une image et un crédit. Une œuvre retirée (`revoked`) ou
 * refusée sort du lot — la carte déjà tirée reste dans la collection, mais
 * retombe sur une face neutre, exactement comme une photo de joueuse retirée.
 *
 * Ne lève jamais : une lecture en échec rend une Map vide, et les cartes
 * s'affichent sans image plutôt que de faire échouer l'écran.
 */
export async function readFanartFaces(
  tenantId: string,
  fanartIds: readonly string[]
): Promise<Map<string, FanartFace>> {
  const faces = new Map<string, FanartFace>();
  const ids = [...new Set(fanartIds.filter(Boolean))];
  if (ids.length === 0 || !supabaseAdmin) return faces;

  const { data, error } = await supabaseAdmin
    .from('tcg_fanart_cards')
    .select('id, title, artist_name, artist_url, image_path, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'approved')
    .in('id', ids);
  if (error) {
    logger.error('[tcg/faces] fan arts illisibles: %s', error.message);
    return faces;
  }

  for (const row of (data ?? []) as Array<{
    id: string;
    title: string | null;
    artist_name: string | null;
    artist_url: string | null;
    image_path: string | null;
  }>) {
    faces.set(row.id, {
      fanartId: row.id,
      title: row.title,
      artistName: row.artist_name,
      artistUrl: displayableArtistUrl(row.artist_url),
      imageUrl: row.image_path
        ? (supabaseAdmin.storage.from(BUCKET).getPublicUrl(row.image_path).data
            ?.publicUrl ?? null)
        : null,
    });
  }
  return faces;
}
