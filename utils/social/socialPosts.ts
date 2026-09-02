// utils/social/socialPosts.ts
//
// Cœur du post multi-cibles : un texte rédigé une fois, publié sur plusieurs
// destinations, chacune pouvant surcharger le texte et l'image.
//
// Trois cibles :
//   - `site_news`        → une actualité sur owwomenscup.fr (table `news`)
//   - `discord_announce` → un message dans notre salon d'annonces, via le bot
//   - `instagram`        → un post sur @womenscup_asso (cf. ./instagram.ts)
//
// Les deux premières ne dépendent de personne. Instagram exige un compte
// connecté par OAuth, et REFUSE un post sans image — d'où `requiresImage` dans
// le catalogue, qui fait échouer la validation à l'APERÇU plutôt qu'en pleine
// publication, une fois le site et Discord déjà servis.
//
// LE SENS DU FLUX S'INVERSE ICI. Jusqu'à présent, le pont site ↔ Discord allait
// dans l'autre sens : `services/discord-bot/news-forwarder.js` surveille le
// salon d'annonces et transforme chaque message en actualité, avec un titre
// deviné à partir de la première ligne. L'admin devient la source ; l'ingestion
// reste en place, c'est le chemin rapide depuis un téléphone.
//
// PAS DE DOUBLON, ET VOICI POURQUOI. `forwardMessage` ignore les messages dont
// l'auteur est le bot lui-même. Poster via le bot ne déclenche donc aucune
// ré-ingestion. Le piège serait de passer par un webhook Discord « parce que
// c'est plus simple » : un webhook a un autre identifiant d'auteur, la garde ne
// s'applique plus, et chaque annonce créerait une seconde actualité. La cible
// Discord passe par l'event bot, jamais par un webhook.

import slugify from 'slugify';
import { supabaseAdmin } from '@/utils/supabase';
import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '@/utils/logger';
import {
  NEWS_TITLE_MAX,
  SOCIAL_PLATFORMS,
  platformTextLength,
  socialPlatform,
  type SocialPlatformKey,
} from './platforms';
import { publishPost as publishBlueskyPost } from './bluesky';
import { getIntegrationSecret } from '@/utils/integrationSecrets';
import { loadAccount, markAccount, publishImage } from './instagram';
import { renderForFlavour, stripMarkdown } from './markdown';
import { appendHashtags, normalizeHashtags } from './hashtags';
import { rehostImage } from './rehostImage';

/* -------------------------------------------------------------------------- */
/* 1. Résolution du contenu — pur, testable                                    */
/* -------------------------------------------------------------------------- */

export type SocialPostBase = {
  text: string;
  imageUrl?: string | null;
};

export type SocialTargetInput = {
  platform: SocialPlatformKey;
  /** null / absent = hérite du texte de base. */
  textOverride?: string | null;
  imageOverride?: string | null;
  titleOverride?: string | null;
  /** Tags propres à cette destination ; ignorés par celles qui n'en portent pas. */
  hashtags?: string[] | null;
};

export type ResolvedTarget = {
  platform: SocialPlatformKey;
  label: string;
  text: string;
  imageUrl: string | null;
  /** Renseigné pour les seules cibles qui veulent un titre (le site). */
  title: string | null;
  /** Tags retenus, forme canonique — ce qui sera stocké et resuggéré. */
  hashtags: string[];
  /** Message d'erreur bloquant, ou null si la cible est publiable. */
  error: string | null;
};

/**
 * Titre d'une actualité déduit du texte : sa première ligne non vide, débarrassée
 * du markdown de tête et bornée.
 *
 * C'est la même heuristique que celle du forwarder Discord — volontairement,
 * pour que l'actualité créée depuis l'admin ressemble à celles déjà en ligne.
 * Mais ici elle n'est qu'un DÉFAUT : le panneau propose un vrai champ titre, et
 * c'est tout l'intérêt d'écrire depuis l'admin plutôt que depuis Discord.
 */
export function deriveNewsTitle(text: string): string {
  const firstLine =
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? '';

  // Le titre est du TEXTE, jamais du Markdown : il part dans <h1>, dans la
  // balise <title>, dans l'OpenGraph et dans le flux RSS, où aucune de ces
  // surfaces ne rend `**gras**` autrement qu'avec ses étoiles.
  const title = stripMarkdown(firstLine);

  if (title.length <= NEWS_TITLE_MAX) return title;
  return `${title.slice(0, NEWS_TITLE_MAX - 1).trimEnd()}…`;
}

/**
 * Applique la surcharge d'une cible sur le contenu de base et valide le
 * résultat contre les contraintes de la plateforme.
 *
 * Une surcharge ABSENTE (null / undefined) hérite ; une surcharge vide est un
 * choix explicite, et devient une erreur de validation plutôt qu'un retour
 * silencieux au texte de base — un post parti vide est pire qu'un post refusé.
 */
export function resolveTarget(
  base: SocialPostBase,
  target: SocialTargetInput
): ResolvedTarget {
  const platform = socialPlatform(target.platform);
  if (!platform) {
    return {
      platform: target.platform,
      label: target.platform,
      text: '',
      imageUrl: null,
      title: null,
      hashtags: [],
      error: `Destination inconnue : ${target.platform}`,
    };
  }

  const source =
    target.textOverride === null || target.textOverride === undefined
      ? base.text
      : target.textOverride;

  // Le texte est SAISI en Markdown et RENDU dans le dialecte de la destination
  // avant toute validation. Valider la source donnerait un compteur qui ment :
  // `**gras**` fait quatre caractères de plus que ce qu'Instagram recevra, et
  // un texte refusé à 2 205 caractères en passerait 2 197 une fois nettoyé.
  // Les tags sont ajoutés AVANT la mesure : trois tags valent une quarantaine
  // de caractères, et sur les 300 graphèmes de Bluesky ils décident du passage.
  const hashtags = platform.supportsHashtags
    ? normalizeHashtags(target.hashtags ?? [])
    : [];
  const trimmed = appendHashtags(
    renderForFlavour(source, platform.flavour),
    hashtags
  );

  const imageUrl =
    target.imageOverride === null || target.imageOverride === undefined
      ? (base.imageUrl ?? null)
      : target.imageOverride || null;

  const title = platform.needsTitle
    ? target.titleOverride?.trim() || deriveNewsTitle(trimmed)
    : null;

  const length = platformTextLength(trimmed, platform);

  let error: string | null = null;
  if (!trimmed) {
    error = `${platform.label} : le texte est vide.`;
  } else if (platform.textLimit && length > platform.textLimit) {
    error =
      `${platform.label} : ${length} caractères pour un maximum de ` +
      `${platform.textLimit}, soit ${length - platform.textLimit} de trop.`;
  } else if (platform.needsTitle && !title) {
    error = `${platform.label} : impossible de déduire un titre, renseignez-le.`;
  } else if (imageUrl && !platform.supportsImage) {
    error = `${platform.label} : cette destination n'accepte pas d'image.`;
  } else if (platform.requiresImage && !imageUrl) {
    error =
      `${platform.label} : une image est obligatoire — ` +
      `cette destination ne publie pas de texte seul.`;
  }

  return {
    platform: platform.key,
    label: platform.label,
    text: trimmed,
    imageUrl,
    title,
    hashtags,
    error,
  };
}

/** Rend toutes les cibles demandées, dans l'ordre du catalogue. */
export function resolveTargets(
  base: SocialPostBase,
  targets: SocialTargetInput[]
): ResolvedTarget[] {
  const order = new Map(SOCIAL_PLATFORMS.map((p, i) => [p.key, i]));
  return targets
    .map((t) => resolveTarget(base, t))
    .sort((a, b) => (order.get(a.platform) ?? 99) - (order.get(b.platform) ?? 99));
}

/**
 * Statut agrégé d'un post à partir de ses cibles. `partial` existe parce que
 * « Discord passé, site en échec » n'est ni un succès ni un échec : c'est l'état
 * dont on rejoue une seule ligne.
 */
export function aggregateStatus(
  statuses: Array<'sent' | 'failed' | 'pending' | 'skipped'>
): 'done' | 'partial' | 'failed' {
  const sent = statuses.filter((s) => s === 'sent').length;
  const failed = statuses.filter((s) => s === 'failed').length;
  if (failed === 0) return 'done';
  if (sent === 0) return 'failed';
  return 'partial';
}

/* -------------------------------------------------------------------------- */
/* 2. Publication — I/O                                                        */
/* -------------------------------------------------------------------------- */

export type PublishOutcome = {
  platform: SocialPlatformKey;
  label: string;
  status: 'sent' | 'failed';
  externalId: string | null;
  permalink: string | null;
  error: string | null;
};

/**
 * Slug d'actualité libre pour ce tenant.
 *
 * `news` porte un UNIQUE (tenant_id, slug), et ni la route d'ingestion ni la
 * route admin ne dédoublonnent : deux annonces intitulées « J7 décalé » font
 * échouer la seconde sur une 500 opaque. Ici on suffixe, parce qu'un composeur
 * de posts produit précisément des titres qui se répètent d'une journée à
 * l'autre.
 */
/** Nombre de suffixes tentés avant de retomber sur un slug horodaté. */
const SLUG_SUFFIX_TRIES = 20;

export async function uniqueNewsSlug(
  tenantId: string,
  title: string
): Promise<string> {
  const base = slugify(title, { lower: true, strict: true }) || 'actualite';
  if (!supabaseAdmin) return base;

  // Jeu de candidats EXACT plutôt qu'un `LIKE 'base%'` : le préfixe ramènerait
  // aussi les slugs qui commencent par le même mot sans être des variantes
  // (« j7 » attraperait « j7-bouge-vraiment »), et il grossit avec l'archive.
  const candidates = [
    base,
    ...Array.from({ length: SLUG_SUFFIX_TRIES }, (_, i) => `${base}-${i + 2}`),
  ];

  const { data, error } = await supabaseAdmin
    .from('news')
    .select('slug')
    .eq('tenant_id', tenantId)
    .in('slug', candidates);

  if (error) {
    logger.warn('[socialPosts] lecture des slugs échouée: %s', error.message);
    return base;
  }

  const taken = new Set((data ?? []).map((r) => (r as { slug: string }).slug));
  const free = candidates.find((c) => !taken.has(c));
  // Improbable, mais un slug horodaté vaut mieux qu'une insertion en échec sur
  // l'UNIQUE (tenant_id, slug), qui remonterait en 500 opaque.
  return free ?? `${base}-${Date.now()}`;
}

async function publishSiteNews(
  target: ResolvedTarget,
  ctx: { tenantId: string; staffId: string | null }
): Promise<PublishOutcome> {
  const out: PublishOutcome = {
    platform: target.platform,
    label: target.label,
    status: 'failed',
    externalId: null,
    permalink: null,
    error: null,
  };
  if (!supabaseAdmin) {
    out.error = 'Service base de données indisponible.';
    return out;
  }

  const title = target.title ?? deriveNewsTitle(target.text);
  const slug = await uniqueNewsSlug(ctx.tenantId, title);

  // L'image est RECOPIÉE chez nous avant d'être liée. Une actualité vit des
  // mois ; l'URL qu'on colle vient presque toujours d'une pièce jointe Discord,
  // signée et expirée sous 24 h. On refuse de publier plutôt que de créer un
  // article dont on sait que la vignette sera vide demain (cf. rehostImage).
  let imageUrl = target.imageUrl;
  if (imageUrl) {
    const hosted = await rehostImage(imageUrl);
    if (!hosted.rehosted) {
      out.error = hosted.error ?? "L'image n'a pas pu être récupérée.";
      return out;
    }
    imageUrl = hosted.url;
  }

  // Le corps garde le texte ENTIER, titre compris s'il en vient : retirer la
  // première ligne parce qu'elle a servi de titre ampute l'actualité quand le
  // titre a été saisi à la main.
  const { data, error } = await supabaseAdmin
    .from('news')
    .insert({
      tenant_id: ctx.tenantId,
      title,
      slug,
      tag: 'announcements',
      excerpt: null,
      content: target.text,
      image_url: imageUrl,
      status: 'published',
      published_at: new Date().toISOString(),
      author_id: ctx.staffId,
    })
    .select('id, slug')
    .single();

  if (error) {
    out.error = error.message;
    return out;
  }

  out.status = 'sent';
  out.externalId = (data as { id: string }).id;
  out.permalink = `/news/${(data as { slug: string }).slug}`;

  void emitBotEvent(
    'news.published',
    {
      newsId: out.externalId,
      slug: (data as { slug: string }).slug,
      title,
      tag: 'announcements',
      excerpt: null,
      imageUrl,
      publishedAt: new Date().toISOString(),
      // Le handler `news.published` du bot est un stub qui journalise. S'il
      // devient un jour un miroir Discord, ce drapeau lui dit de se taire : le
      // message a déjà été posté par la cible `discord_announce` de ce post.
      source: 'social_post',
    },
    ctx.tenantId
  ).catch((e) =>
    logger.error('[socialPosts] emit news.published error: %s', e)
  );

  return out;
}

async function publishDiscordAnnounce(
  target: ResolvedTarget,
  ctx: { tenantId: string; postId: string | null }
): Promise<PublishOutcome> {
  const out: PublishOutcome = {
    platform: target.platform,
    label: target.label,
    status: 'failed',
    externalId: null,
    permalink: null,
    error: null,
  };

  try {
    const emitted = await emitBotEvent(
      'social.post',
      {
        postId: ctx.postId,
        platform: target.platform,
        content: target.text,
        imageUrl: target.imageUrl,
      },
      ctx.tenantId
    );

    // `delivered: false` n'est PAS un échec : l'event est persisté dans
    // l'outbox et le bot le rattrapera au prochain poll. Le dispatch bot est
    // idempotent par eventId, donc ce rattrapage ne poste pas deux fois — c'est
    // cette garantie-là qui tient lieu d'`external_id` pour Discord, puisque
    // l'id du message n'est connu que du bot. Seul un refus AVANT persistance
    // est une vraie erreur.
    if (!emitted.delivered && emitted.error === 'missing_tenant_id') {
      out.error = emitted.error;
      return out;
    }
    out.status = 'sent';
    return out;
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
    return out;
  }
}

async function publishInstagram(
  target: ResolvedTarget,
  ctx: { tenantId: string }
): Promise<PublishOutcome> {
  const out: PublishOutcome = {
    platform: target.platform,
    label: target.label,
    status: 'failed',
    externalId: null,
    permalink: null,
    error: null,
  };

  const account = await loadAccount(ctx.tenantId, 'instagram');
  if (!account?.accessToken || !account.externalAccountId) {
    out.error =
      'Compte Instagram non connecté. Connectez-le depuis Communication › Réseaux.';
    return out;
  }
  if (account.expiresAt && account.expiresAt.getTime() < Date.now()) {
    // Passé l'échéance, le rafraîchissement lui-même est refusé : seule une
    // ré-autorisation manuelle rétablit le service. Autant le dire ici plutôt
    // que de laisser Meta répondre « jeton invalide ».
    out.error =
      'Le jeton Instagram a expiré. Reconnectez le compte depuis Communication › Réseaux.';
    await markAccount(ctx.tenantId, { status: 'expired' });
    return out;
  }
  if (!target.imageUrl) {
    out.error = 'Instagram exige une image.';
    return out;
  }

  try {
    const published = await publishImage({
      igUserId: account.externalAccountId,
      accessToken: account.accessToken,
      imageUrl: target.imageUrl,
      caption: target.text,
    });
    out.status = 'sent';
    out.externalId = published.mediaId;
    out.permalink = published.permalink;
    return out;
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
    await markAccount(ctx.tenantId, { last_error: out.error });
    return out;
  }
}

async function publishBluesky(
  target: ResolvedTarget,
  ctx: { tenantId: string }
): Promise<PublishOutcome> {
  const out: PublishOutcome = {
    platform: target.platform,
    label: target.label,
    status: 'failed',
    externalId: null,
    permalink: null,
    error: null,
  };

  const [handle, appPassword] = await Promise.all([
    getIntegrationSecret(ctx.tenantId, 'bluesky_handle'),
    getIntegrationSecret(ctx.tenantId, 'bluesky_app_password'),
  ]);
  if (!handle || !appPassword) {
    out.error =
      'Compte Bluesky non configuré. Renseignez-le depuis Communication › Réseaux.';
    return out;
  }

  try {
    const published = await publishBlueskyPost({
      handle,
      appPassword,
      text: target.text,
      imageUrl: target.imageUrl,
    });
    out.status = 'sent';
    out.externalId = published.uri;
    out.permalink = published.permalink;
    return out;
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
    return out;
  }
}

/**
 * Publie chaque cible et renvoie un résultat PAR CIBLE.
 *
 * Une cible en échec n'interrompt jamais les suivantes : le site qui refuse un
 * slug ne doit pas empêcher l'annonce Discord de partir. C'est exactement l'état
 * `partial`, et c'est celui qu'on veut pouvoir rejouer ligne à ligne.
 */
export async function publishTargets(
  targets: ResolvedTarget[],
  ctx: { tenantId: string; staffId: string | null; postId: string | null }
): Promise<PublishOutcome[]> {
  const outcomes: PublishOutcome[] = [];

  for (const target of targets) {
    if (target.error) {
      outcomes.push({
        platform: target.platform,
        label: target.label,
        status: 'failed',
        externalId: null,
        permalink: null,
        error: target.error,
      });
      continue;
    }

    switch (target.platform) {
      case 'site_news':
        outcomes.push(await publishSiteNews(target, ctx));
        break;
      case 'discord_announce':
        outcomes.push(await publishDiscordAnnounce(target, ctx));
        break;
      case 'bluesky':
        outcomes.push(await publishBluesky(target, ctx));
        break;
      case 'instagram':
        outcomes.push(await publishInstagram(target, ctx));
        break;
      default:
        outcomes.push({
          platform: target.platform,
          label: target.label,
          status: 'failed',
          externalId: null,
          permalink: null,
          error: `Aucun publieur pour ${target.platform}.`,
        });
    }
  }

  return outcomes;
}

/** Les chemins à revalider quand une actualité vient d'être publiée. */
export function newsRevalidatePaths(permalink: string | null): string[] {
  const paths = ['/', '/actualites'];
  if (permalink) paths.push(permalink);
  return paths;
}
