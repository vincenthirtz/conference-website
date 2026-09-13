// utils/tcg/overlayTheme.ts
//
// LECTURE de l'habillage de la source navigateur OBS du TCG.
//
// CE MODULE TOUCHE LA BASE ; sa moitié pure — types, défauts, validation — vit
// dans `overlayThemeShape.ts`. La scission n'est PAS cosmétique : la page de
// l'overlay et l'éditeur admin ont besoin du défaut et des bornes côté
// NAVIGATEUR, et les importer d'ici entraînerait `supabaseAdmin` dans le bundle
// client — ~490 ko de polyfills Node, sans erreur ni avertissement. Le dépôt
// s'est déjà fait prendre ainsi.
//
// CE MODULE N'EST PAS `overlayFeed.ts`, ET C'EST DÉLIBÉRÉ. Celui-là est la
// frontière de confidentialité du produit : tout ce qui en sort peut finir à
// l'écran d'un direct, puis dans un VOD, puis dans un clip, et il est écrit
// pour n'en laisser sortir qu'un pseudo Twitch. L'habillage ne contient aucune
// donnée personnelle — c'est de la charte graphique — mais le faire transiter
// par ce module diluerait sa raison d'être et rendrait plus difficile de
// vérifier, plus tard, qu'aucun nom ne fuit. Deux chemins, deux responsabilités.
//
// `NULL` EN BASE VEUT DIRE « GARDE LE DÉFAUT », PAS « VIDE ». Un espace qui n'a
// jamais ouvert l'éditeur n'a aucune ligne et doit obtenir exactement l'overlay
// d'avant cette fonctionnalité. La table n'enregistre que les ÉCARTS voulus.
//
// NE LÈVE JAMAIS À LA LECTURE. Un overlay tourne pendant un direct : une base
// qui tousse doit produire l'habillage par défaut, pas une source en erreur.
// Même règle que `readTcgOverlayFeed`, pour la même raison.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  DEFAULT_OVERLAY_THEME,
  OVERLAY_POSITIONS,
  type OverlayPosition,
  type OverlayTheme,
} from './overlayThemeShape';

/** Bucket et préfixe : les mêmes que les photos de carte. */
export const OVERLAY_MEDIA_BUCKET = 'teams-images';
export const OVERLAY_MEDIA_PREFIX = 'tcg/overlay';

type ThemeRow = {
  accent_color: string | null;
  media_path: string | null;
  media_kind: string | null;
  drop_line: string | null;
  win_line: string | null;
  position: string | null;
};

function publicUrl(path: string | null): string | null {
  if (!path || !supabaseAdmin) return null;
  return (
    supabaseAdmin.storage.from(OVERLAY_MEDIA_BUCKET).getPublicUrl(path).data
      ?.publicUrl ?? null
  );
}

/**
 * Recompose un thème complet depuis une ligne partielle.
 *
 * Chaque champ absent retombe sur le défaut INDIVIDUELLEMENT : régler la seule
 * couleur ne doit pas emporter la position avec elle.
 */
function fromRow(row: ThemeRow | null): OverlayTheme {
  if (!row) return DEFAULT_OVERLAY_THEME;

  const kind =
    row.media_kind === 'image' || row.media_kind === 'video'
      ? row.media_kind
      : null;
  const url = publicUrl(row.media_path);

  return {
    accentColor: row.accent_color ?? DEFAULT_OVERLAY_THEME.accentColor,
    // Les deux vont ensemble : un chemin sans nature, ou l'inverse, ne sait pas
    // se rendre. On préfère ne rien afficher qu'un élément vide en direct.
    mediaUrl: kind && url ? url : null,
    mediaKind: kind && url ? kind : null,
    dropLine: row.drop_line ?? null,
    winLine: row.win_line ?? null,
    position: (OVERLAY_POSITIONS as readonly string[]).includes(
      row.position ?? ''
    )
      ? (row.position as OverlayPosition)
      : DEFAULT_OVERLAY_THEME.position,
  };
}

/**
 * L'habillage d'un espace, toujours complet.
 *
 * Ne lève jamais : une lecture en échec rend le thème par défaut. Un overlay
 * sans habillage personnalisé vaut infiniment mieux qu'un overlay en panne au
 * milieu d'un direct.
 */
export async function readOverlayTheme(
  tenantId: string
): Promise<OverlayTheme> {
  if (!supabaseAdmin || !tenantId) return DEFAULT_OVERLAY_THEME;

  try {
    const { data, error } = await supabaseAdmin
      .from('tcg_overlay_themes')
      .select(
        'accent_color, media_path, media_kind, drop_line, win_line, position'
      )
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      // Une erreur de LECTURE n'est pas une absence de thème : on le dit dans
      // le journal plutôt que de laisser croire que l'espace n'a rien réglé.
      logger.error('[tcg/overlayTheme] lecture impossible: %s', error.message);
      return DEFAULT_OVERLAY_THEME;
    }

    return fromRow((data as ThemeRow | null) ?? null);
  } catch (err) {
    logger.error('[tcg/overlayTheme] lecture impossible', err);
    return DEFAULT_OVERLAY_THEME;
  }
}

/** Le chemin de média actuellement enregistré, pour pouvoir le supprimer. */
export async function readOverlayMediaPath(
  tenantId: string
): Promise<string | null> {
  if (!supabaseAdmin || !tenantId) return null;
  const { data } = await supabaseAdmin
    .from('tcg_overlay_themes')
    .select('media_path')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return (data as { media_path?: string | null } | null)?.media_path ?? null;
}
