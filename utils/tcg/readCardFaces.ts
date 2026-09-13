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

/** Même bucket public que les logos d'équipe. */
const BUCKET = 'teams-images';

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
};

export type TeamFace = {
  teamId: string;
  name: string | null;
  shortName: string | null;
  slug: string | null;
  logoUrl: string | null;
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
      .select('user_id, display_name, avatar_url')
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
      .select('user_id, specialty')
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
  for (const row of (membersRes.data ?? []) as Array<{
    user_id: string | null;
    specialty: string | null;
  }>) {
    if (!row.user_id || !row.specialty) continue;
    if (!specialtyByUser.has(row.user_id)) {
      specialtyByUser.set(row.user_id, row.specialty);
    }
  }

  /** Le héros représentant cette joueuse, calculé par le réducteur partagé. */
  const heroFor = (userId: string) => {
    const prefs = prefsByUser.get(userId);
    const reco = recommendCardHero({
      picks: prefs?.picks,
      bans: prefs?.bans,
      specialty: specialtyByUser.get(userId) ?? null,
    });
    return {
      heroName: reco?.hero.name ?? null,
      heroSource: reco?.source ?? null,
    };
  };

  for (const row of (ratingsRes.data ?? []) as Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }>) {
    const photo = photoByUser.get(row.user_id) ?? null;
    faces.set(row.user_id, {
      userId: row.user_id,
      displayName: row.display_name,
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
    .select('id, name, short_name, slug, logo_url')
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
  }>) {
    faces.set(row.id, {
      teamId: row.id,
      name: row.name,
      shortName: row.short_name,
      slug: row.slug,
      logoUrl: row.logo_url,
    });
  }

  return faces;
}
