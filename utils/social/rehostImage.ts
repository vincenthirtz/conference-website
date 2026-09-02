// utils/social/rehostImage.ts
//
// Recopie chez nous l'image d'une actualité publiée depuis le panneau Réseaux.
//
// POURQUOI. Le champ image du panneau est une URL libre, et l'URL qu'on a sous
// la main quand on rédige est presque toujours celle d'une pièce jointe Discord
// (`media.discordapp.net/attachments/…?ex=…&is=…&hm=…`). Deux défauts, chacun
// suffisant :
//
//   1. Ces URLs sont SIGNÉES ET DATÉES. Le `ex=` est un horodatage d'expiration
//      — une petite journée. L'actualité de l'association a été publiée le
//      2 septembre avec une image morte le 3 à 14h25.
//   2. `next/image` n'accepte que les hôtes listés dans `remotePatterns`
//      (next.config.js). Un hôte absent ne casse pas le rendu : l'optimiseur
//      répond 400 et la vignette reste vide, sans une ligne d'erreur.
//
// Ajouter l'hôte à la liste blanche ne réglerait que le second, et pour une
// journée. On copie donc le fichier dans notre bucket au moment de publier :
// l'actualité ne dépend plus d'un serveur tiers ni d'une signature.
//
// Les URLs DÉJÀ chez nous (Supabase Storage) et les chemins relatifs sont
// laissés tels quels — rien à recopier.

import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Même bucket public que les logos d'équipe (cf. pages/api/admin/upload.ts). */
const BUCKET = 'teams-images';
const PREFIX = 'news';

/** 8 Mio : au-delà, ce n'est plus une image d'article. */
const MAX_BYTES = 8 * 1024 * 1024;

/** Ce que le bucket accepte, avec l'extension correspondante. */
const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export type RehostResult = {
  /** URL à stocker : la copie si elle a abouti, sinon l'originale. */
  url: string;
  /** Vrai si le fichier a bien été recopié chez nous. */
  rehosted: boolean;
  /** Renseigné quand la copie a échoué — l'appelant décide quoi en faire. */
  error: string | null;
};

/**
 * Vrai si l'URL pointe déjà chez nous (ou est relative) : rien à faire.
 *
 * On reconnaît le stockage Supabase par son chemin public, pas seulement par
 * l'hôte : un projet Supabase sert aussi d'autres choses.
 */
export function isOwnImageUrl(url: string): boolean {
  if (url.startsWith('/')) return true;
  try {
    const u = new URL(url);
    return (
      u.hostname.endsWith('.supabase.co') &&
      u.pathname.includes('/storage/v1/object/public/')
    );
  } catch {
    return false;
  }
}

/**
 * Télécharge `url` et la republie dans notre bucket. Ne lève jamais : en cas
 * d'échec, renvoie l'URL d'origine avec `rehosted: false` et le motif.
 */
export async function rehostImage(url: string): Promise<RehostResult> {
  if (!url) return { url, rehosted: false, error: null };
  if (isOwnImageUrl(url)) return { url, rehosted: true, error: null };
  if (!supabaseAdmin) {
    return { url, rehosted: false, error: 'Stockage indisponible.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, rehosted: false, error: "L'adresse de l'image est invalide." };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { url, rehosted: false, error: "L'image doit être en http(s)." };
  }

  let buffer: Buffer;
  let mimeType: string;
  try {
    // Une image morte ou un hôte lent ne doit pas retenir la publication des
    // autres destinations : on borne l'attente.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      return {
        url,
        rehosted: false,
        error: `L'image n'a pas pu être téléchargée (HTTP ${res.status}).`,
      };
    }
    mimeType = (res.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!EXT_BY_MIME[mimeType]) {
      return {
        url,
        rehosted: false,
        error: `Type d'image non pris en charge (${mimeType || 'inconnu'}).`,
      };
    }
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return {
      url,
      rehosted: false,
      error: `Téléchargement de l'image impossible : ${(e as Error).message}`,
    };
  }

  if (buffer.length === 0) {
    return { url, rehosted: false, error: "L'image téléchargée est vide." };
  }
  if (buffer.length > MAX_BYTES) {
    return {
      url,
      rehosted: false,
      error: `L'image dépasse ${Math.round(MAX_BYTES / 1024 / 1024)} Mo.`,
    };
  }

  // Le hash du CONTENU sert de nom : republier deux fois la même image ne
  // remplit pas le bucket de doublons.
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  const path = `${PREFIX}/${hash}${EXT_BY_MIME[mimeType]}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) {
    logger.error('[rehostImage] upload échoué: %s', uploadError.message);
    return {
      url,
      rehosted: false,
      error: `Copie de l'image impossible : ${uploadError.message}`,
    };
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, rehosted: true, error: null };
}
