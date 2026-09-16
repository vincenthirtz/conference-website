// utils/marketing/platformProof.ts
//
// LA PREUVE CHIFFRÉE de `/organisateurs` : combien d'éditions, d'équipes, de
// joueuses et de matchs la plateforme fait réellement tourner.
//
// Pourquoi ce fichier existe : la page de tarifs présentait une grille de prix
// sans un seul chiffre prouvant que la plateforme sert vraiment à quelque
// chose — alors que la base en contient. Le concurrent analysé le 15/09 affiche
// ses compteurs en page d'accueil et gagne ce duel sans rien faire de mieux.
//
// DEUX RÈGLES TIENNENT TOUT LE FICHIER.
//
// 1. On lit, on ne gonfle pas. Chaque chiffre est un `count` sur une table, et
//    les requêtes sont écrites ici, visibles. Aucun multiplicateur, aucun
//    « +de », aucun cumul historique reconstitué à la main.
// 2. Un chiffre trop petit ne se maquille pas : il se TAIT. Chaque métrique a
//    un plancher de crédibilité (`PROOF_THRESHOLDS`) sous lequel elle n'est pas
//    rendue, et la section entière disparaît s'il reste moins de
//    `MIN_TILES_TO_RENDER` tuiles. « 9 matchs joués » sur une page qui vend de
//    l'organisation de compétitions prouve le contraire de ce qu'on veut dire ;
//    mieux vaut se taire et laisser parler le reste de la page. Le jour où
//    l'activité remplit ces seuils, la section réapparaît toute seule.
//
// La lecture (`readPlatformProof`) touche la base et n'est appelée que depuis
// `getStaticProps`. La sélection (`selectProofTiles`) est pure, donc testable
// sans base — c'est elle qui porte la règle du silence.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Les métriques exposées, dans l'ordre de lecture. */
export type ProofMetric =
  | 'editions'
  | 'teams'
  | 'players'
  | 'scheduledMatches'
  | 'playedMatches';

/** Chiffres bruts lus en base. `null` = lecture impossible (on se tait). */
export type PlatformProofCounts = Record<ProofMetric, number | null>;

/** Une tuile retenue pour l'affichage. */
export type ProofTile = { metric: ProofMetric; value: number };

/**
 * Planchers de crédibilité, par métrique.
 *
 * Ce ne sont pas des seuils esthétiques : ils répondent à « ce chiffre
 * convaincrait-il quelqu'un qui hésite à nous confier son circuit ? ». Une
 * seule édition publique suffit à prouver qu'une compétition est allée au
 * bout ; neuf matchs joués, non — d'où l'écart entre les deux.
 */
export const PROOF_THRESHOLDS: Record<ProofMetric, number> = {
  editions: 2,
  teams: 5,
  players: 20,
  scheduledMatches: 20,
  playedMatches: 20,
};

/**
 * En dessous de ce nombre de tuiles, la section ne s'affiche pas du tout.
 *
 * Deux chiffres isolés au milieu d'une bande vide se lisent comme un aveu.
 */
export const MIN_TILES_TO_RENDER = 3;

/**
 * Applique la règle du silence. Pure : c'est ici que se vérifie, en test,
 * qu'un chiffre sous son plancher ne sort jamais.
 */
export function selectProofTiles(counts: PlatformProofCounts): ProofTile[] {
  const order: ProofMetric[] = [
    'editions',
    'teams',
    'players',
    'scheduledMatches',
    'playedMatches',
  ];
  const tiles: ProofTile[] = [];
  for (const metric of order) {
    const value = counts[metric];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (value < PROOF_THRESHOLDS[metric]) continue;
    tiles.push({ metric, value });
  }
  return tiles.length >= MIN_TILES_TO_RENDER ? tiles : [];
}

/** Ce que la page reçoit : les tuiles déjà filtrées, et de quoi aller voir. */
export type PlatformProof = {
  tiles: ProofTile[];
  /**
   * L'édition en cours ou la plus récente, pour que le visiteur puisse ALLER
   * VOIR au lieu de nous croire. Un lien vers une compétition réelle vaut plus
   * que n'importe quel compteur : il est vérifiable en un clic.
   */
  showcase: { name: string; slug: string } | null;
};

const EMPTY: PlatformProof = { tiles: [], showcase: null };

/**
 * Lit les compteurs en base (serveur uniquement — `getStaticProps`).
 *
 * Toute erreur de lecture rend la preuve vide : une page de tarifs doit
 * s'afficher même si la base tousse, et une section manquante vaut mieux
 * qu'une page en erreur. `head: true` + `count: 'exact'` : on compte côté base,
 * on ne rapatrie aucune ligne.
 */
export async function readPlatformProof(): Promise<PlatformProof> {
  if (!supabaseAdmin) return EMPTY;

  try {
    const [editions, teams, players, scheduled, played, showcaseRes] =
      await Promise.all([
        supabaseAdmin
          .from('tournaments')
          .select('id', { count: 'exact', head: true })
          .eq('visibility', 'public')
          .in('status', ['completed', 'archived', 'published']),
        supabaseAdmin
          .from('teams')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq('is_active', true),
        supabaseAdmin
          .from('team_members')
          .select('id', { count: 'exact', head: true })
          .not('accepted_at', 'is', null),
        supabaseAdmin
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq('is_bye', false),
        supabaseAdmin
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq('is_bye', false)
          .eq('status', 'finished'),
        // La vitrine : une édition en cours bat une édition close, d'où le tri
        // par date de début et le choix de `published` en priorité.
        supabaseAdmin
          .from('tournaments')
          .select('name, slug, status, start_date')
          .eq('visibility', 'public')
          .in('status', ['published', 'completed'])
          .order('start_date', { ascending: false, nullsFirst: false })
          .limit(5),
      ]);

    const counts: PlatformProofCounts = {
      editions: editions.error ? null : (editions.count ?? null),
      teams: teams.error ? null : (teams.count ?? null),
      players: players.error ? null : (players.count ?? null),
      scheduledMatches: scheduled.error ? null : (scheduled.count ?? null),
      playedMatches: played.error ? null : (played.count ?? null),
    };

    const rows = (showcaseRes.error ? [] : (showcaseRes.data ?? [])) as {
      name: string | null;
      slug: string | null;
      status: string | null;
    }[];
    const pick =
      rows.find((r) => r.status === 'published' && r.slug) ??
      rows.find((r) => r.slug) ??
      null;

    return {
      tiles: selectProofTiles(counts),
      showcase:
        pick?.slug && pick.name ? { name: pick.name, slug: pick.slug } : null,
    };
  } catch (err) {
    logger.error('[platformProof] read error:', err);
    return EMPTY;
  }
}
