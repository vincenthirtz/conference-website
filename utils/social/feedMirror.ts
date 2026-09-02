// utils/social/feedMirror.ts
//
// Socle commun aux miroirs « un de nos comptes → un salon Discord ».
//
// Deux sources aujourd'hui — Bluesky et YouTube — et elles partagent tout sauf
// la lecture du flux : même curseur, même sélection, même mise en forme, même
// salon. Ce qui diffère tient dans une fonction `fetch` par source.
//
// LE CURSEUR EST UNE DATE, PAS UN IDENTIFIANT. Si trois publications arrivent
// entre deux passages, il faut toutes les prendre, dans l'ordre — un « dernier
// id vu » ne le permettrait pas.
//
// UN CURSEUR PAR SOURCE. Bluesky et YouTube ne publient pas au même rythme :
// un curseur commun ferait qu'une vidéo récente masque un post plus ancien mais
// pas encore recopié.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Salon cible, commun aux sources. Vider la valeur désactive tous les miroirs. */
export const MIRROR_CHANNEL_KEY = 'bluesky_mirror_channel_id';

/** Clés `site_settings` du curseur, une par source. */
export const CURSOR_KEYS = {
  bluesky: 'bluesky_mirror_last_post_at',
  youtube: 'youtube_mirror_last_video_at',
} as const;

export type MirrorSource = keyof typeof CURSOR_KEYS;

/**
 * Au tout premier passage, il n'y a pas de curseur. On ne recopie alors que ce
 * qui est récent : sans cette borne, activer un miroir déverserait tout
 * l'historique du compte dans le salon d'un coup. La chaîne YouTube compte déjà
 * une quinzaine de vidéos — ce n'est pas une précaution théorique.
 */
export const FIRST_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Filet de sécurité : un passage ne poste jamais plus que ça, par source. */
export const MAX_PER_RUN = 5;

export type MirrorPost = {
  /** Identifiant chez la source, pour les journaux. */
  id: string;
  /** Lien public — c'est lui qu'on met dans Discord. */
  url: string;
  /** Texte du post, ou titre de la vidéo. */
  text: string;
  publishedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Sélection                                                                   */
/* -------------------------------------------------------------------------- */

/** Les publications strictement postérieures au curseur, de la plus ancienne à la plus récente. */
export function selectNew(
  posts: MirrorPost[],
  since: Date,
  max = MAX_PER_RUN
): MirrorPost[] {
  return posts
    .filter((p) => {
      const at = new Date(p.publishedAt).getTime();
      return Number.isFinite(at) && at > since.getTime();
    })
    // Les deux flux rendent le plus récent en premier ; un salon se lit dans
    // l'autre sens.
    .sort(
      (a, b) =>
        new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
    )
    // En cas de rattrapage, on garde les plus RÉCENTES : mieux vaut
    // l'actualité que le début d'un historique.
    .slice(-max);
}

/**
 * Le message posté dans Discord.
 *
 * Le lien est en dernier et sur sa propre ligne : Discord en tire un aperçu
 * (titre, extrait, vignette) sous le message. Joindre l'image nous-mêmes ferait
 * doublon avec cet aperçu.
 */
export function buildMirrorMessage(post: MirrorPost, prefix = ''): string {
  const text = post.text.trim();
  const head = prefix ? `${prefix} ${text}`.trim() : text;
  return head ? `${head}\n\n${post.url}` : post.url;
}

/* -------------------------------------------------------------------------- */
/* Réglages                                                                    */
/* -------------------------------------------------------------------------- */

export async function readSetting(
  tenantId: string,
  key: string
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', key)
    .maybeSingle();
  if (error) {
    logger.warn('[feedMirror] lecture %s impossible: %s', key, error.message);
    return null;
  }
  const value = (data as { value?: string } | null)?.value ?? null;
  return value && value.trim() ? value.trim() : null;
}

export async function readChannelId(tenantId: string): Promise<string | null> {
  return readSetting(tenantId, MIRROR_CHANNEL_KEY);
}

export async function readCursor(
  tenantId: string,
  source: MirrorSource
): Promise<Date> {
  const raw = await readSetting(tenantId, CURSOR_KEYS[source]);
  const parsed = raw ? new Date(raw) : null;
  if (parsed && Number.isFinite(parsed.getTime())) return parsed;
  return new Date(Date.now() - FIRST_RUN_WINDOW_MS);
}

export async function writeCursor(
  tenantId: string,
  source: MirrorSource,
  at: string
): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from('site_settings').upsert(
    {
      tenant_id: tenantId,
      key: CURSOR_KEYS[source],
      value: at,
      description: `Horodatage de la dernière publication ${source} recopiée dans Discord. Reculer cette valeur rejoue ce qui est postérieur.`,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,key' }
  );
  if (error) throw error;
}
