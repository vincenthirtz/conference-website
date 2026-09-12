// utils/social/feedMirror.ts
//
// Socle commun aux miroirs « un de nos comptes → un salon Discord ».
//
// Quatre sources aujourd'hui — Bluesky, YouTube, Instagram et TikTok — et
// elles partagent tout sauf la lecture du flux : même curseur, même sélection,
// même mise en forme, même salon. Ce qui diffère tient dans une fonction
// `fetch` par source.
//
// DEUX D'ENTRE ELLES SE LISENT SANS JETON (Bluesky, YouTube) et deux non
// (Instagram, TikTok, qui n'exposent aucun flux public). Cette asymétrie ne
// remonte pas jusqu'ici : le socle reçoit des `MirrorPost`, d'où qu'ils
// viennent.
//
// LE CURSEUR EST UNE DATE, PAS UN IDENTIFIANT. Si trois publications arrivent
// entre deux passages, il faut toutes les prendre, dans l'ordre — un « dernier
// id vu » ne le permettrait pas.
//
// UN CURSEUR PAR SOURCE. Les comptes ne publient pas au même rythme : un
// curseur commun ferait qu'une vidéo récente masque un post plus ancien mais
// pas encore recopié.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { social } from '@/config/socials';

/** Salon cible, commun aux sources. Vider la valeur désactive tous les miroirs. */
export const MIRROR_CHANNEL_KEY = 'bluesky_mirror_channel_id';

/** Clés `site_settings` du curseur, une par source. */
export const CURSOR_KEYS = {
  bluesky: 'bluesky_mirror_last_post_at',
  youtube: 'youtube_mirror_last_video_at',
  instagram: 'instagram_mirror_last_post_at',
  tiktok: 'tiktok_mirror_last_video_at',
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
  /**
   * Titre distinct du texte — YouTube seulement, où `text` porte déjà le titre
   * (c'est lui que le salon et le mur affichent depuis toujours). Absent
   * ailleurs : un post Bluesky ou une légende n'ont pas de titre.
   */
  title?: string | null;
  /**
   * Corps long quand la source en a un à part du titre — la description d'une
   * vidéo YouTube. Sert au champ `text` de l'event, pas au message ni au mur.
   */
  description?: string | null;
  /**
   * Vignette CHEZ LA SOURCE, telle qu'elle nous est servie — donc souvent
   * périssable : la couverture d'une vidéo TikTok expire au bout de 6 h, une
   * URL de média Instagram est signée. Elle n'est PAS destinée à être stockée
   * telle quelle ; `./socialFeed.ts` en fait une copie chez nous avant de
   * l'écrire en base. Le miroir Discord envoie cette COPIE ; l'originale ne lui
   * sert qu'en repli, et seulement là où elle est stable (cf.
   * `pickMirrorThumbnail`).
   */
  thumbnailUrl?: string | null;
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
  return (
    posts
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
      .slice(-max)
  );
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
/* Nettoyage des liens                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Paramètres de pistage connus, en minuscules. `utm_*` est traité à part,
 * par préfixe.
 *
 * TikTok est le cas qui a motivé cette liste : son `share_url` arrive avec
 * `?utm_campaign=tt4d_open_api&utm_source=<client>`, que Discord affichait tel
 * quel et que le mur du site stockait. Les autres sont les équivalents chez
 * Meta (`fbclid`, `igsh`), YouTube (`si`) et les liens de partage TikTok
 * copiés depuis l'app (`_r`, `_t`, `is_from_webapp`…).
 *
 * UNE LISTE, PAS UNE LISTE BLANCHE. Garder seulement « les paramètres utiles »
 * supposerait de les connaître pour chaque réseau ; oublier `v=` d'une URL
 * YouTube donnerait un lien vers la page d'accueil. Retirer ce qu'on sait être
 * du pistage ne peut rien casser.
 */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igsh',
  'igshid',
  'si',
  '_r',
  '_t',
  '_d',
  'is_from_webapp',
  'sender_device',
  'is_copy_url',
  'share_app_id',
  'share_link_id',
  'social_sharing',
]);

function isTrackingParam(rawKey: string): boolean {
  let key: string;
  try {
    key = decodeURIComponent(rawKey.replace(/\+/g, ' ')).toLowerCase();
  } catch {
    // Clé mal encodée : on ne sait pas ce que c'est, donc on n'y touche pas.
    return false;
  }
  return key.startsWith('utm_') || TRACKING_PARAMS.has(key);
}

/**
 * Retire d'une URL les paramètres de pistage, sans toucher au reste.
 *
 * TRAVAIL SUR LA CHAÎNE, PAS SUR `URLSearchParams`. Reconstruire la query avec
 * `URLSearchParams#toString()` réencoderait les paramètres conservés (espaces
 * en `+`, caractères réservés) : le lien changerait de forme sans raison, et
 * une URL déjà propre ne ressortirait pas identique. Ici, les paires gardées le
 * sont octet pour octet, et le fragment aussi.
 *
 * Une URL illisible, relative, ou sans query est rendue telle quelle.
 */
export function stripTrackingParams(url: string): string {
  try {
    new URL(url);
  } catch {
    return url;
  }
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  const queryAt = beforeHash.indexOf('?');
  if (queryAt === -1) return url;

  const base = beforeHash.slice(0, queryAt);
  const pairs = beforeHash.slice(queryAt + 1).split('&');
  const kept = pairs.filter((pair) => {
    if (!pair) return false;
    const key = pair.split('=', 1)[0];
    return !isTrackingParam(key);
  });
  if (kept.length === pairs.length) return url;
  return `${base}${kept.length ? `?${kept.join('&')}` : ''}${hash}`;
}

/* -------------------------------------------------------------------------- */
/* Payload structuré de `social.mirror`                                        */
/* -------------------------------------------------------------------------- */

/**
 * Longueur maximale du champ `text` de l'event.
 *
 * La description d'un embed Discord monte à 4 096 caractères, mais une carte
 * de miroir se lit d'un coup d'œil : au-delà, c'est un article, et le lien est
 * là pour ça. Seul YouTube (descriptions jusqu'à 5 000) atteint la borne ;
 * Bluesky plafonne à 300, et Instagram/TikTok sont déjà coupés à 700 à la
 * lecture.
 */
export const MIRROR_TEXT_MAX = 1500;

/**
 * Coupe un texte à `max` caractères AU PLUS, points de suspension compris, sur
 * une frontière de mot quand elle est proche.
 *
 * Même règle que `truncateCaption` d'Instagram (on ne recule jusqu'à l'espace
 * que s'il est dans les 20 % de la fin, sinon on perdrait un paragraphe), mais
 * la borne est stricte : c'est un contrat avec le bot, pas un ordre de
 * grandeur. Un emoji coupé en deux (paire de substitution) est retiré plutôt
 * qu'envoyé à moitié — Discord l'afficherait en losange.
 */
export function truncateText(input: string, max = MIRROR_TEXT_MAX): string {
  const text = input.trim();
  if (text.length <= max) return text;
  let cut = text.slice(0, max - 1);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  const lastSpace = cut.lastIndexOf(' ');
  const head = lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut;
  return `${head.trimEnd()}…`;
}

/**
 * Sources dont la vignette d'ORIGINE est stable : acceptable en repli quand la
 * copie chez nous n'existe pas encore. Une vignette YouTube se déduit de
 * l'identifiant et n'expire pas ; un thumb Bluesky est servi par leur CDN sans
 * signature. Instagram (URL signée) et TikTok (couverture valable six heures)
 * n'y figurent PAS : un embed Discord garde l'URL, et l'image mourrait dans le
 * salon quelques heures après le post.
 */
const STABLE_THUMBNAIL_SOURCES: ReadonlySet<MirrorSource> = new Set([
  'bluesky',
  'youtube',
]);

/**
 * La vignette à mettre dans l'event : la copie hébergée chez nous d'abord,
 * sinon l'originale quand elle est stable, sinon rien.
 */
export function pickMirrorThumbnail(
  source: MirrorSource,
  hosted: string | null | undefined,
  original: string | null | undefined
): string | null {
  if (hosted) return hosted;
  if (original && STABLE_THUMBNAIL_SOURCES.has(source)) return original;
  return null;
}

/** Le compte de l'association sur ce réseau, tel que le site l'affiche. */
export function mirrorAccount(
  source: MirrorSource
): { handle: string; url: string } | null {
  try {
    const account = social(source);
    return { handle: account.handle, url: account.href };
  } catch {
    // Source sans compte déclaré dans `config/socials.ts` : la carte s'en
    // passe, ce n'est pas une raison de ne pas miroiter.
    return null;
  }
}

export type SocialMirrorPayload = {
  source: MirrorSource;
  channelId: string;
  /** Ancien format (préfixe + texte + lien), pour un bot pas encore à jour. */
  content: string;
  url: string;
  postedAt: string;
  text: string;
  title: string | null;
  thumbnailUrl: string | null;
  account: { handle: string; url: string } | null;
};

/**
 * Le `data` de l'event `social.mirror`. Contrat : docs/BOT_API_CONTRACT.md.
 *
 * `content` reste l'ancien message, à l'identique sauf le lien nettoyé : un bot
 * qui ne connaît pas encore les champs structurés continue de poster ce qu'il
 * postait. `text` est le texte BRUT — sans préfixe, sans lien — pour qu'un bot
 * qui rend une carte ne répète pas l'URL déjà portée par le titre de l'embed.
 */
export function buildMirrorPayload(input: {
  source: MirrorSource;
  channelId: string;
  post: MirrorPost;
  prefix?: string;
  /** `thumbnail_url` de la ligne `social_feed_items`, si elle existe. */
  hostedThumbnailUrl?: string | null;
}): SocialMirrorPayload {
  const { source, channelId, post, prefix = '' } = input;
  const url = stripTrackingParams(post.url);
  const title = post.title?.trim() || null;
  return {
    source,
    channelId,
    content: buildMirrorMessage({ ...post, url }, prefix),
    url,
    postedAt: post.publishedAt,
    text: truncateText(post.description?.trim() || post.text || ''),
    title,
    thumbnailUrl: pickMirrorThumbnail(
      source,
      input.hostedThumbnailUrl,
      post.thumbnailUrl
    ),
    account: mirrorAccount(source),
  };
}

/* -------------------------------------------------------------------------- */
/* Réglages                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Lecture d'un réglage, en DISTINGUANT « absent » de « pas pu lire ».
 *
 * POURQUOI CETTE DISTINCTION EXISTE — incident du 2026-09-12. `readSetting`
 * renvoyait `null` dans les deux cas. `readCursor` prenait ce `null` pour un
 * premier passage et rendait `now − 24 h` : quatre lectures de curseur ont
 * expiré en 504 (03:01, 03:15, 06:01, 06:15) et le miroir a reposté quatre fois
 * dans le salon des publications de la veille, déjà envoyées. Une erreur de
 * lecture n'est pas une absence de valeur, et surtout elle n'autorise AUCUNE
 * conclusion sur ce qui a déjà été publié.
 */
export type SettingRead =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

export async function readSettingResult(
  tenantId: string,
  key: string
): Promise<SettingRead> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'supabase_admin_unavailable' };
  }
  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', key)
    .maybeSingle();
  if (error) {
    logger.warn('[feedMirror] lecture %s impossible: %s', key, error.message);
    return { ok: false, error: error.message };
  }
  const value = (data as { value?: string } | null)?.value ?? null;
  return { ok: true, value: value && value.trim() ? value.trim() : null };
}

/**
 * Confond volontairement l'erreur et l'absence, pour les réglages où les deux
 * mènent à la même décision SÛRE : pas de salon connu = on n'envoie rien.
 * NE PAS l'utiliser pour un curseur — cf. `readCursor`.
 */
export async function readSetting(
  tenantId: string,
  key: string
): Promise<string | null> {
  const res = await readSettingResult(tenantId, key);
  return res.ok ? res.value : null;
}

export async function readChannelId(tenantId: string): Promise<string | null> {
  return readSetting(tenantId, MIRROR_CHANNEL_KEY);
}

/**
 * Le curseur d'une source, ou `null` quand on n'a PAS PU le lire.
 *
 * `null` veut dire « je ne sais pas », et l'appelant doit alors ne rien émettre
 * de ce passage : quinze minutes de retard valent mieux qu'un doublon public.
 *
 * Une valeur ABSENTE (premier passage) ou ILLISIBLE (valeur corrompue) rend en
 * revanche la fenêtre de 24 h, comme avant : ces deux cas-là se réparent seuls
 * au premier passage réussi, qui réécrit un curseur valide — alors qu'un
 * `null` permanent condamnerait la source au silence.
 */
export async function readCursor(
  tenantId: string,
  source: MirrorSource
): Promise<Date | null> {
  const res = await readSettingResult(tenantId, CURSOR_KEYS[source]);
  if (!res.ok) return null;
  const parsed = res.value ? new Date(res.value) : null;
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

/* -------------------------------------------------------------------------- */
/* Garde d'idempotence                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Profondeur du garde. Large devant les 24 h que peut rejouer un curseur
 * absent, et assez courte pour que la lecture reste triviale : le salon reçoit
 * quelques publications par mois.
 */
export const MIRROR_GUARD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Borne dure sur les lignes examinées, au cas où le volume changerait. */
export const MIRROR_GUARD_MAX_ROWS = 500;

export type MirroredCheck =
  | { ok: true; already: boolean }
  | { ok: false; error: string };

/**
 * Cette publication a-t-elle DÉJÀ été émise vers Discord ?
 *
 * SECONDE LIGNE DE DÉFENSE, indépendante du curseur. Le curseur dit « quoi
 * envoyer » ; ce garde dit « ne renvoie pas ce qui est déjà parti ». Ainsi un
 * futur incident sur le curseur — quel qu'il soit — ne peut plus produire de
 * doublon dans le salon.
 *
 * ON INTERROGE L'OUTBOX, pas `social_feed_items` : l'outbox est le registre de
 * ce qui a RÉELLEMENT été émis, alors que le mur du site n'enregistre que trois
 * nouveautés par passage et par source — une publication émise peut n'y avoir
 * aucune ligne.
 *
 * COMPARAISON EN JAVASCRIPT, pas via un filtre PostgREST sur un chemin JSON
 * (`payload->data->>url`) : cette syntaxe imbriquée n'est pas exercée par le
 * mock des tests, qui la laisserait passer sans rien vérifier — et son échec en
 * production rendrait le miroir muet, exactement ce qu'on cherche à éviter.
 *
 * L'URL attendue est celle qui part vraiment, donc NETTOYÉE de ses paramètres
 * de pistage (cf. `stripTrackingParams`) : c'est sous cette forme que
 * `buildMirrorPayload` l'écrit dans l'event.
 */
export async function alreadyMirrored(
  tenantId: string,
  cleanUrl: string
): Promise<MirroredCheck> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'supabase_admin_unavailable' };
  }
  const since = new Date(Date.now() - MIRROR_GUARD_WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from('bot_event_outbox')
    .select('payload')
    .eq('tenant_id', tenantId)
    .eq('event_name', 'social.mirror')
    .gte('created_at', since)
    .limit(MIRROR_GUARD_MAX_ROWS);
  if (error) {
    logger.warn(
      '[feedMirror] garde d’idempotence illisible: %s',
      error.message
    );
    return { ok: false, error: error.message };
  }
  const already = (data ?? []).some((row) => {
    const payload = (row as { payload?: { data?: { url?: unknown } } }).payload;
    return payload?.data?.url === cleanUrl;
  });
  return { ok: true, already };
}
