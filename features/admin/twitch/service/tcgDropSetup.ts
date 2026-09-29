// features/admin/twitch/service/tcgDropSetup.ts — METTRE LE DROP TCG EN
// SERVICE, en un geste (POST /twitch/tcg-drop/setup).
//
// L'ENCHAÎNEMENT EST IDEMPOTENT, ET C'EST TOUT L'INTÉRÊT : on relit d'abord NOS
// récompenses (`only_manageable_rewards=true`) ; si celle du drop existe déjà,
// on la reprend au lieu d'en poser une seconde, visible des spectatrices.
//
// ⚠️ Une récompense créée À LA MAIN dans la console Twitch appartient à la
// chaîne, pas à notre `client_id` : Helix refuse de la lister, de la modifier
// et de marquer ses échanges. Ce que ce service crée nous appartient.
//
// LE COÛT EN POINTS DE CHAÎNE N'EST PAS LE BARÈME TCG : `TWITCH_DROP_COINS`
// est ce qu'on DONNE ; le coût ci-dessous est ce que la spectatrice DÉPENSE.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  getValidBroadcasterToken,
  hasScope,
  helixFetch,
} from '@/utils/twitchBroadcaster';
import type { Audited } from '../../_shared/audited';
import { findPublishedAssociationCard } from '../repository';
import { TcgDropSetupSchema } from '../schemas';
import { fail, legacyDb, readJson } from './common';

/**
 * Le titre sert de CLÉ DE REPRISE : c'est à lui qu'on reconnaît notre
 * récompense au second passage. Le changer sans migrer en créerait une
 * deuxième — d'où le fait qu'il ne soit pas réglable depuis le corps.
 */
export const TCG_DROP_REWARD_TITLE = 'Carte à collectionner';

/** Défaut prudent, réglable : une valeur basse se corrige, un cadeau non. */
const DEFAULT_COST = 1000;

/** Plafond Helix sur le titre d'une récompense. */
const TWITCH_TITLE_MAX = 45;

/**
 * Titre de la récompense mise en avant : il porte le nom de la carte, et sert
 * de clé de reprise comme celui du drop. Changer de carte = autre titre =
 * autre récompense, ce qui est voulu.
 */
export function featuredRewardTitle(cardTitle: string): string {
  return `${TCG_DROP_REWARD_TITLE} — ${cardTitle}`
    .slice(0, TWITCH_TITLE_MAX)
    .trim();
}

type RewardRow = { id?: string; title?: string };

export type TcgDropSetupResult = {
  rewardId: string;
  reused: boolean;
  cost: number;
  featuredFanartId: string | null;
};

export async function setupTcgDrop(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<Audited<TcgDropSetupResult>> {
  const parsed = TcgDropSetupSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw fail(400, 'Coût invalide.', 'invalid_body');
  }
  const cost = parsed.data.cost ?? DEFAULT_COST;
  const featuredFanartId = parsed.data.featuredFanartId ?? null;

  // La carte garantie doit exister, être PUBLIÉE et appartenir à l'espace.
  let rewardTitle = TCG_DROP_REWARD_TITLE;
  let cardTitle: string | null = null;
  if (featuredFanartId) {
    const card = await findPublishedAssociationCard(
      ctx.db,
      ctx.tenantId,
      featuredFanartId
    );
    cardTitle = card?.title ?? null;
    if (!cardTitle) {
      throw fail(404, 'Carte introuvable ou non publiée.', 'card_not_found');
    }
    rewardTitle = featuredRewardTitle(cardTitle);
  }

  const token = await getValidBroadcasterToken(legacyDb(ctx), ctx.tenantId);
  if (!token) {
    throw fail(409, 'Aucune chaîne Twitch connectée.', 'not_connected');
  }
  // Les DEUX droits, vérifiés avant d'écrire quoi que ce soit.
  if (
    !hasScope(token.scope, 'channel:manage:redemptions') ||
    !hasScope(token.scope, 'channel:read:redemptions')
  ) {
    throw fail(
      409,
      'La chaîne doit être reconnectée pour accorder la gestion des points de chaîne.',
      'missing_scope'
    );
  }

  const base = `/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(
    token.broadcasterId
  )}`;

  // 1) REPRISE AVANT CRÉATION.
  let rewardId: string | null = null;
  try {
    const list = await helixFetch(
      token.accessToken,
      `${base}&only_manageable_rewards=true`
    );
    if (list.ok) {
      const json = await readJson<{ data?: RewardRow[] }>(list);
      rewardId =
        (json?.data ?? []).find((r) => r.title === rewardTitle)?.id ?? null;
    }
    // Une lecture en échec n'interrompt PAS : Twitch refuse lui-même deux
    // récompenses de même titre (400).
  } catch (err) {
    ctx.logger.warn(
      '[tcg-drop/setup] liste des récompenses illisible: %s',
      err instanceof Error ? err.message : String(err)
    );
  }

  const reused = rewardId !== null;

  // 2) La création, seulement si nécessaire.
  if (!rewardId) {
    let refused: string | null = null;
    try {
      const upstream = await helixFetch(token.accessToken, base, {
        method: 'POST',
        body: JSON.stringify({
          title: rewardTitle,
          cost,
          prompt: cardTitle
            ? `Un paquet du TCG avec la carte « ${cardTitle} » garantie. Ton compte Twitch doit être relié à ton espace joueuse.`
            : 'Échange tes points contre une carte du TCG. Ton compte Twitch doit être relié à ton espace joueuse.',
          is_enabled: true,
          // Pas de saisie : on identifie la spectatrice par son compte Twitch.
          is_user_input_required: false,
          // Un échange en file d'attente ne nous parvient jamais.
          should_redemptions_skip_request_queue: true,
        }),
      });
      const json = await readJson<{ data?: RewardRow[]; message?: string }>(
        upstream
      );
      if (!upstream.ok) {
        ctx.logger.error(
          '[tcg-drop/setup] création refusée par Twitch: %d %s',
          upstream.status,
          json?.message ?? ''
        );
        refused = json?.message ?? 'Twitch a refusé la création.';
      } else {
        rewardId = json?.data?.[0]?.id ?? null;
      }
    } catch (err) {
      ctx.logger.error(
        '[tcg-drop/setup] création impossible: %s',
        err instanceof Error ? err.message : String(err)
      );
      throw fail(502, 'Twitch injoignable.', 'reward_create_failed');
    }
    if (refused !== null) throw fail(502, refused, 'reward_create_failed');
  }

  if (!rewardId) {
    throw fail(
      502,
      'Twitch n’a pas rendu d’identifiant de récompense.',
      'reward_create_failed'
    );
  }

  // 3) L'abonnement reste la route `eventsub/tcg-drop` — c'est elle qui
  //    persiste `tcg_reward_id`.
  return {
    result: { rewardId, reused, cost, featuredFanartId },
    audit: {
      entity_type: 'tenant',
      entity_id: ctx.tenantId,
      payload: { tcgDropReward: rewardId, reused, cost, featuredFanartId },
    },
  };
}
