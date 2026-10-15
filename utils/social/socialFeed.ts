// utils/social/socialFeed.ts
//
// Le mur « nos réseaux » du site : persistance des publications lues par le
// miroir, et lecture publique.
//
// POURQUOI STOCKER, PLUTÔT QUE LIRE À L'AFFICHAGE. Deux des quatre sources
// (Instagram, TikTok) exigent un jeton qui n'a rien à faire dans un rendu
// public, et les quatre ont des quotas ou des limites de débit qu'une page vue
// par mille personnes ferait exploser. Le cron lit DÉJÀ ces flux toutes les
// quinze minutes pour le miroir Discord : on écrit ce qu'il a sous la main, et
// la page se sert en base. Zéro appel réseau supplémentaire.
//
// LES VIGNETTES SONT RECOPIÉES CHEZ NOUS, à l'insertion et une seule fois. Ce
// n'est pas de la prudence : la couverture d'une vidéo TikTok expire au bout de
// six heures (documenté), une URL de média Instagram est signée, un thumb
// Bluesky est servi par un CDN tiers. Stocker ces URLs donnerait un mur
// d'images mortes le lendemain — et `next/image` refuse de toute façon les
// hôtes absents de `remotePatterns`, en répondant 400 sans une ligne d'erreur.
//
// ON N'ÉCRIT QUE LES NOUVEAUTÉS. Une publication déjà en base n'est pas
// réécrite : sinon chaque passage du cron re-téléchargerait quatre-vingts
// vignettes pour rien. Corollaire assumé : une légende modifiée après coup sur
// le réseau ne bouge plus chez nous.
//
// INDÉPENDANT DU CURSEUR DISCORD. Le miroir n'envoie dans le salon que ce qui
// est postérieur à son curseur ; ici on enregistre TOUT ce que le flux a rendu.
// Les deux besoins diffèrent : Discord ne doit pas déverser l'historique d'un
// coup, alors que le mur du site serait vide pendant des semaines s'il
// n'accueillait que les nouveautés.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { rehostImage } from './rehostImage';
import {
  CURSOR_KEYS,
  stripTrackingParams,
  type MirrorPost,
  type MirrorSource,
} from './feedMirror';
import { createMirrorCache } from './mirrorCache';

/** Sous-dossier du bucket public, à côté de `news/`. */
const IMAGE_PREFIX = 'social';

/**
 * PUBLICATIONS DÉJÀ SUR LE MUR, par espace et par source, en mémoire.
 *
 * POURQUOI. Chaque passage demandait à la base « lesquelles de ces vingt
 * publications as-tu déjà ? » — une lecture par source et par espace, toutes
 * les quinze minutes (~310 par jour), pour une réponse qui ne change que
 * lorsqu'on publie. Ici on retient ce que la base a confirmé, plus ce qu'on
 * vient d'y écrire : un flux sans nouveauté ne coûte plus aucune requête.
 *
 * SIX HEURES, et pas trente minutes comme les réglages : l'ensemble ne fait que
 * GRANDIR (une ligne n'est jamais retirée par le dépôt, hors purge d'un espace
 * désactivé), donc il ne peut être faux que d'une façon — une ligne effacée à
 * la main resterait « connue », et ne serait réécrite qu'à l'échéance. Une
 * erreur de lecture, elle, n'est jamais retenue.
 */
export const KNOWN_FEED_IDS_TTL_MS = 6 * 60 * 60_000;
const knownFeedIds = createMirrorCache<ReadonlySet<string>>(
  KNOWN_FEED_IDS_TTL_MS
);
const knownKey = (tenantId: string, source: MirrorSource) =>
  `${tenantId}:${source}`;

/**
 * Nouveautés écrites par passage et par source.
 *
 * LE FREIN EST LA RECOPIE DES VIGNETTES, pas l'écriture en base : chaque
 * nouveauté vaut un téléchargement puis un envoi dans le bucket. Sans borne, le
 * TOUT PREMIER passage en verrait quatre-vingts d'un coup (vingt par source) et
 * dépasserait de loin le budget temps d'une fonction Netlify — le cron
 * échouerait, donc le miroir Discord avec lui.
 *
 * Trois par source et par passage suffisent : le flux rend les vingt dernières
 * publications à CHAQUE passage, donc ce qui déborde est repris un quart
 * d'heure plus tard. Le mur se remplit en une heure environ, une seule fois
 * dans la vie du site, et le régime de croisière est d'une nouveauté de temps
 * en temps.
 */
export const MAX_NEW_PER_RUN = 3;

export type SocialFeedItem = {
  id: string;
  source: MirrorSource;
  url: string;
  text: string;
  thumbnailUrl: string | null;
  publishedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Écriture — appelée par le cron                                              */
/* -------------------------------------------------------------------------- */

/**
 * Enregistre les publications d'une source qu'on n'a pas déjà.
 *
 * Ne lève JAMAIS : le mur du site est un bonus, et son échec ne doit pas
 * empêcher le miroir Discord de faire son travail. Renvoie le nombre de
 * nouveautés écrites, pour le rapport du cron.
 */
export async function persistFeedItems(
  tenantId: string,
  source: MirrorSource,
  posts: MirrorPost[]
): Promise<number> {
  if (!supabaseAdmin || posts.length === 0) return 0;

  const cacheKey = knownKey(tenantId, source);
  try {
    const ids = posts.map((p) => p.id);
    // Ne demande à la base que ce qu'on ne sait pas déjà : en régime de
    // croisière, rien — le flux rend les mêmes vingt publications.
    const remembered = knownFeedIds.peek(cacheKey);
    let known: ReadonlySet<string>;
    if (remembered) {
      const unknown = ids.filter((id) => !remembered.has(id));
      if (unknown.length === 0) return 0;
      const found = await existingIds(tenantId, source, unknown);
      known = new Set([...remembered, ...found]);
      if (found.length > 0) {
        knownFeedIds.update(cacheKey, (set) => new Set([...set, ...found]));
      }
    } else {
      const loaded = await knownFeedIds.load(cacheKey, async () => ({
        ok: true,
        value: new Set(await existingIds(tenantId, source, ids)),
      }));
      if (!loaded.ok) throw loaded.error;
      known = loaded.value;
    }

    const fresh = posts
      .filter((p) => !known.has(p.id))
      // Les plus RÉCENTES d'abord : si la borne coupe, elle doit couper dans
      // l'historique, pas dans l'actualité.
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      )
      .slice(0, MAX_NEW_PER_RUN);
    if (fresh.length === 0) return 0;

    const rows = [];
    for (const post of fresh) {
      rows.push({
        tenant_id: tenantId,
        source,
        external_id: post.id,
        // Sans `utm_*` & co : le `share_url` TikTok arrive pollué, et le mur
        // l'afficherait au survol et le copierait au partage.
        url: stripTrackingParams(post.url),
        text: post.text ?? '',
        thumbnail_url: await copyThumbnail(post.thumbnailUrl),
        published_at: post.publishedAt,
      });
    }

    // `upsert` et pas `insert` : deux passages du cron peuvent se chevaucher
    // (Netlify ne garantit pas l'exclusion), et une collision sur la clé unique
    // ferait échouer le lot entier alors qu'il n'y a rien à réparer.
    const { error: writeError } = await supabaseAdmin
      .from('social_feed_items')
      .upsert(rows, {
        onConflict: 'tenant_id,source,external_id',
        ignoreDuplicates: true,
      });
    if (writeError) throw writeError;

    // Écrites (ou déjà là : `ignoreDuplicates`) — connues désormais, sans
    // relecture au passage suivant.
    const written = rows.map((r) => r.external_id);
    knownFeedIds.update(cacheKey, (set) => new Set([...set, ...written]));
    return rows.length;
  } catch (err) {
    logger.error(
      '[socialFeed] enregistrement %s impossible: %s',
      source,
      err instanceof Error ? err.message : String(err)
    );
    return 0;
  }
}

/**
 * Parmi `ids`, ceux qui ont déjà une ligne sur le mur. Lève sur une erreur de
 * lecture : l'appelant ne doit ni la retenir, ni conclure « rien n'existe »
 * (il recopierait alors des vignettes déjà recopiées).
 */
async function existingIds(
  tenantId: string,
  source: MirrorSource,
  ids: string[]
): Promise<string[]> {
  if (!supabaseAdmin) throw new Error('supabase_admin_unavailable');
  const { data, error } = await supabaseAdmin
    .from('social_feed_items')
    .select('external_id')
    .eq('tenant_id', tenantId)
    .eq('source', source)
    .in('external_id', ids);
  if (error) throw error;
  return ((data ?? []) as Array<{ external_id: string }>).map(
    (r) => r.external_id
  );
}

/**
 * Copie la vignette chez nous. `null` si on n'y arrive pas.
 *
 * On préfère PAS D'IMAGE à une URL tierce : celle-ci expirerait, et
 * `next/image` la refuserait de toute façon. Une carte sans visuel reste
 * lisible ; une carte au visuel cassé, non.
 */
async function copyThumbnail(
  source: string | null | undefined
): Promise<string | null> {
  if (!source) return null;
  const result = await rehostImage(source, IMAGE_PREFIX);
  if (!result.rehosted) {
    logger.warn('[socialFeed] vignette non recopiée: %s', result.error);
    return null;
  }
  return result.url;
}

/* -------------------------------------------------------------------------- */
/* Lecture — appelée par le rendu public                                       */
/* -------------------------------------------------------------------------- */

function mapRow(row: Record<string, unknown>): SocialFeedItem {
  return {
    id: String(row.id),
    source: String(row.source) as MirrorSource,
    url: String(row.url),
    text: String(row.text ?? ''),
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    publishedAt: String(row.published_at),
  };
}

/**
 * LA DERNIÈRE PUBLICATION DE CHAQUE RÉSEAU, de la plus récente à la plus
 * ancienne.
 *
 * Une carte par compte, et pas les N plus récentes toutes sources confondues :
 * les réseaux ne publient pas au même rythme, et une chaîne prolifique
 * remplirait le mur à elle seule — quinze vidéos YouTube masquaient déjà les
 * trois autres comptes. Le mur sert à montrer QUE NOUS SOMMES LÀ, sur chacun
 * d'eux ; c'est une vitrine, pas un fil d'actualité.
 *
 * UNE REQUÊTE PAR SOURCE, et non une requête large qu'on dédoublonne ensuite.
 * Un compte qui publie deux fois par an tomberait hors de n'importe quelle
 * fenêtre récente, et disparaîtrait du mur alors qu'il a bien une dernière
 * publication à montrer. Chaque requête tape l'index `(tenant_id,
 * published_at DESC)` et ne rend qu'une ligne ; le tout ne s'exécute qu'à la
 * régénération de la page, pas à chaque visite.
 */
export async function loadSocialFeed(
  tenantId: string
): Promise<SocialFeedItem[]> {
  const client = supabaseAdmin;
  if (!client) return [];

  const sources = Object.keys(CURSOR_KEYS) as MirrorSource[];
  const latest = await Promise.all(
    sources.map(async (source) => {
      const { data, error } = await client
        .from('social_feed_items')
        .select('id, source, url, text, thumbnail_url, published_at')
        .eq('tenant_id', tenantId)
        .eq('source', source)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        // Une source illisible n'en condamne pas trois autres.
        logger.error(
          '[socialFeed] lecture %s impossible: %s',
          source,
          error.message
        );
        return null;
      }
      return data ? mapRow(data as Record<string, unknown>) : null;
    })
  );

  return latest
    .filter((item): item is SocialFeedItem => item !== null)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
}
