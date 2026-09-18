// utils/overlay/alertMedia.ts
//
// LES FICHIERS DE LA BOÎTE D'ALERTES : où ils vivent, et comment on décide
// lequel sert.
//
// La base ne garde que des CHEMINS, jamais des URLs complètes — le domaine de
// stockage peut changer, le chemin non. C'est ici, et seulement ici, qu'un
// chemin redevient une URL servable ; les deux routes (lecture publique et
// édition admin) passent par ce module pour ne pas répondre deux vérités
// différentes.
//
// Même bucket que l'habillage du TCG : il est déjà PUBLIC, ce qui est requis —
// la source OBS le télécharge sans session, comme n'importe quel navigateur.

import { supabaseAdmin } from '@/utils/supabase';

/** Bucket public, partagé avec les autres habillages d'overlay. */
export const ALERT_MEDIA_BUCKET = 'teams-images';
/** Préfixe propre à la boîte d'alertes, pour que le bucket reste lisible. */
export const ALERT_MEDIA_PREFIX = 'stream-alerts';

/** Nature de l'habillage : la source rend un `<img>` ou une `<video>`. */
export type AlertFrameKind = 'image' | 'video';

export function isAlertFrameKind(value: unknown): value is AlertFrameKind {
  return value === 'image' || value === 'video';
}

/** Un chemin de bucket redevient une URL servable. `null` reste `null`. */
export function alertMediaUrl(path: string | null | undefined): string | null {
  if (!path || !supabaseAdmin) return null;
  return (
    supabaseAdmin.storage.from(ALERT_MEDIA_BUCKET).getPublicUrl(path).data
      ?.publicUrl ?? null
  );
}

export type AlertMediaRow = {
  frame_path?: string | null;
  frame_kind?: string | null;
  sound_path?: string | null;
  sound_url?: string | null;
};

export type ResolvedAlertFrame = {
  /** `null` = l'habillage du CODE (le nœud), pas « aucun habillage ». */
  url: string | null;
  kind: AlertFrameKind | null;
};

/**
 * L'habillage à rendre.
 *
 * `null` NE VEUT PAS DIRE « RIEN » : il veut dire « celui du code », c'est-à-dire
 * l'animation du nœud, dont la bande de texte est mesurée au pixel. Retirer un
 * habillage déposé rétablit donc le nœud au lieu de laisser l'écran vide — et
 * c'est pour ça que le fichier par défaut reste dans le dépôt.
 *
 * Un chemin SANS nature exploitable est ignoré : la source ne saurait pas quoi
 * en faire, et un habillage à moitié configuré ne doit pas éteindre le défaut.
 */
export function resolveAlertFrame(
  row: AlertMediaRow | null | undefined
): ResolvedAlertFrame {
  if (!row) return { url: null, kind: null };
  const kind = isAlertFrameKind(row.frame_kind) ? row.frame_kind : null;
  const url = kind ? alertMediaUrl(row.frame_path) : null;
  return url ? { url, kind } : { url: null, kind: null };
}

/**
 * Le son à jouer.
 *
 * LE FICHIER DÉPOSÉ PRIME sur l'URL collée. Les deux existent parce qu'ils
 * répondent à deux besoins — le fichier qu'on a sous la main (le cas courant)
 * et un son déjà hébergé ailleurs — et l'ordre est celui-ci parce qu'un dépôt
 * est un geste plus récent et plus explicite qu'une URL laissée dans un champ.
 * Retirer le fichier fait retomber sur l'URL, si elle existe.
 *
 * `null` = muet, et c'est le défaut : une source qui se met à faire du bruit
 * toute seule dans une régie est un incident.
 */
export function resolveAlertSoundUrl(
  row: AlertMediaRow | null | undefined
): string | null {
  if (!row) return null;
  return alertMediaUrl(row.sound_path) ?? row.sound_url ?? null;
}

/** Chemin de dépôt : un par envoi, jamais réécrit (cf. `upsert: false`). */
export function alertMediaPath(
  tenantId: string,
  hash: string,
  ext: string
): string {
  return `${ALERT_MEDIA_PREFIX}/${tenantId}-${hash}${ext}`;
}
