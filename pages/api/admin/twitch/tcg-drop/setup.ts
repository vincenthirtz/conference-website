// /api/admin/twitch/tcg-drop/setup
//
// METTRE LE DROP TCG EN SERVICE, en un geste.
//
// POURQUOI CETTE ROUTE EXISTE. Toute la chaîne était livrée — la récompense se
// crée (`channel-points/rewards`), l'abonnement EventSub se pose
// (`eventsub/tcg-drop`), le webhook est signé et testé, l'écran de santé lit
// l'état. Mais RIEN ne reliait les deux écritures : le `POST` de l'abonnement
// n'avait aucune interface, et la seule façon d'en arriver là était de créer
// une récompense à la main puis d'appeler une API sans écran. Résultat mesuré
// le 2026-09-27 : la chaîne connectée, dix-huit comptes rattachés, et **zéro
// crédit versé** depuis toujours.
//
// L'ENCHAÎNEMENT EST IDEMPOTENT, ET C'EST TOUT L'INTÉRÊT. Enchaîner les deux
// appels depuis le navigateur laisserait, au premier échec du second, une
// récompense orpheline sur la chaîne — et le clic suivant en créerait une
// SECONDE, visible des spectatrices, sans que rien ne le signale. On relit donc
// d'abord NOS récompenses : si celle du drop existe déjà, on la reprend.
//
// ⚠️ `only_manageable_rewards` — LA RAISON POUR LAQUELLE IL NE FAUT PAS LA
// CRÉER À LA MAIN. Une récompense créée dans la console Twitch appartient à la
// chaîne, pas à notre `client_id` : Helix refuse alors de la lister, de la
// modifier et de marquer ses échanges comme honorés. La chaîne de drop
// paraîtrait montée et resterait à moitié inerte. Ce que cette route crée nous
// appartient — c'est la seule forme utilisable.
//
// LE COÛT EN POINTS DE CHAÎNE N'EST PAS LE BARÈME TCG. `TWITCH_DROP_COINS` est
// ce qu'on DONNE (des pièces) ; le coût ci-dessous est ce que la spectatrice
// DÉPENSE (des points de chaîne, monnaie de Twitch). Les deux n'ont aucun
// rapport, et les confondre donnerait une récompense à 12 points.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  getValidBroadcasterToken,
  hasScope,
  helixFetch,
} from '@/utils/twitchBroadcaster';
import { logger } from '@/utils/logger';

/**
 * Le titre sert de CLÉ DE REPRISE : c'est à lui qu'on reconnaît notre
 * récompense au second passage. Le changer sans migrer en créerait une
 * deuxième — d'où le fait qu'il ne soit pas réglable depuis le corps.
 */
export const TCG_DROP_REWARD_TITLE = 'Carte à collectionner';

/** Défaut prudent, réglable : une valeur basse se corrige, un cadeau non. */
const DEFAULT_COST = 1000;

const BodySchema = z.object({
  cost: z.number().int().min(1).max(1_000_000).optional(),
  /**
   * Récompense « MISE EN AVANT » : son paquet garantit cette carte (fan art ou
   * « L'association », publiée). Absent = le drop ordinaire.
   */
  featuredFanartId: z.string().uuid().optional(),
});

/** Plafond Helix sur le titre d'une récompense. */
const TWITCH_TITLE_MAX = 45;

/**
 * Titre de la récompense mise en avant : il porte le nom de la carte, et sert
 * de clé de reprise comme celui du drop. Changer de carte = autre titre =
 * autre récompense, ce qui est voulu (l'ancienne se retire côté Twitch).
 */
export function featuredRewardTitle(cardTitle: string): string {
  return `${TCG_DROP_REWARD_TITLE} — ${cardTitle}`
    .slice(0, TWITCH_TITLE_MAX)
    .trim();
}

type RewardRow = { id?: string; title?: string };

export default withStaffRoute(handler, { permission: 'manage_broadcast' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (
    applyRateLimit(req, res, { max: 5, windowMs: 60_000 }, 'tcg-drop-setup')
  ) {
    return;
  }

  const parsed = BodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Coût invalide.', code: 'invalid_body' });
  }
  const cost = parsed.data.cost ?? DEFAULT_COST;
  const featuredFanartId = parsed.data.featuredFanartId ?? null;

  // La carte garantie doit exister, être PUBLIÉE et appartenir à l'espace :
  // une récompense qui promet une carte introuvable ferait payer 10 000 points
  // pour un paquet ordinaire.
  let rewardTitle = TCG_DROP_REWARD_TITLE;
  let cardTitle: string | null = null;
  if (featuredFanartId) {
    const { data: card } = await supabaseAdmin!
      .from('tcg_fanart_cards')
      .select('title')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', featuredFanartId)
      // « L'association » seulement : l'œuvre d'une autrice n'est pas mise aux
      // enchères de points (même règle que la liste de l'écran).
      .eq('category', 'association')
      .eq('status', 'approved')
      .maybeSingle();
    cardTitle = (card as { title?: string } | null)?.title ?? null;
    if (!cardTitle) {
      return res.status(404).json({
        error: 'Carte introuvable ou non publiée.',
        code: 'card_not_found',
      });
    }
    rewardTitle = featuredRewardTitle(cardTitle);
  }

  const token = await getValidBroadcasterToken(supabaseAdmin!, ctx.tenantId);
  if (!token) {
    return res.status(409).json({
      error: 'Aucune chaîne Twitch connectée.',
      code: 'not_connected',
    });
  }
  // Les DEUX droits, vérifiés avant d'écrire quoi que ce soit : créer la
  // récompense, et laisser Twitch nous notifier de ses échanges. Sans le
  // second, la récompense existerait et ne déclencherait jamais rien.
  if (
    !hasScope(token.scope, 'channel:manage:redemptions') ||
    !hasScope(token.scope, 'channel:read:redemptions')
  ) {
    return res.status(409).json({
      error:
        'La chaîne doit être reconnectée pour accorder la gestion des points de chaîne.',
      code: 'missing_scope',
    });
  }

  // 1) REPRISE AVANT CRÉATION. `only_manageable_rewards=true` ne rend que les
  //    nôtres : si le drop a déjà sa récompense, on la reprend au lieu d'en
  //    poser une seconde sur la chaîne.
  let rewardId: string | null = null;
  try {
    const list = await helixFetch(
      token.accessToken,
      `/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}&only_manageable_rewards=true`
    );
    if (list.ok) {
      const json = (await list.json().catch(() => null)) as {
        data?: RewardRow[];
      } | null;
      rewardId =
        (json?.data ?? []).find((r) => r.title === rewardTitle)?.id ?? null;
    }
    // Une lecture en échec n'interrompt PAS : au pire on crée un doublon, et
    // Twitch refuse lui-même deux récompenses de même titre (400). Refuser ici
    // bloquerait la mise en service sur une lecture accessoire.
  } catch (err) {
    logger.warn(
      '[tcg-drop/setup] liste des récompenses illisible: %s',
      err instanceof Error ? err.message : String(err)
    );
  }

  const reused = rewardId !== null;

  // 2) La création, seulement si nécessaire.
  if (!rewardId) {
    try {
      const upstream = await helixFetch(
        token.accessToken,
        `/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(
          token.broadcasterId
        )}`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: rewardTitle,
            cost,
            prompt: cardTitle
              ? `Un paquet du TCG avec la carte « ${cardTitle} » garantie. Ton compte Twitch doit être relié à ton espace joueuse.`
              : 'Échange tes points contre une carte du TCG. Ton compte Twitch doit être relié à ton espace joueuse.',
            is_enabled: true,
            // Pas de saisie : on identifie la spectatrice par son compte
            // Twitch, pas par ce qu'elle tape.
            is_user_input_required: false,
            // La file d'attente de la chaîne n'a pas de sens ici : c'est NOTRE
            // webhook qui décide, et un échange en attente ne nous parvient
            // jamais.
            should_redemptions_skip_request_queue: true,
          }),
        }
      );
      const json = (await upstream.json().catch(() => null)) as {
        data?: RewardRow[];
        message?: string;
      } | null;
      if (!upstream.ok) {
        logger.error(
          '[tcg-drop/setup] création refusée par Twitch: %d %s',
          upstream.status,
          json?.message ?? ''
        );
        return res.status(502).json({
          error: json?.message ?? 'Twitch a refusé la création.',
          code: 'reward_create_failed',
        });
      }
      rewardId = json?.data?.[0]?.id ?? null;
    } catch (err) {
      logger.error(
        '[tcg-drop/setup] création impossible: %s',
        err instanceof Error ? err.message : String(err)
      );
      return res
        .status(502)
        .json({ error: 'Twitch injoignable.', code: 'reward_create_failed' });
    }
  }

  if (!rewardId) {
    return res.status(502).json({
      error: 'Twitch n’a pas rendu d’identifiant de récompense.',
      code: 'reward_create_failed',
    });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    tenant_id: ctx.tenantId,
    action: 'settings_update',
    entity_type: 'tenant',
    entity_id: ctx.tenantId,
    payload: { tcgDropReward: rewardId, reused, cost, featuredFanartId },
  });

  // 3) L'abonnement reste la route qui le sait faire — et c'est elle qui
  //    persiste `tcg_reward_id`. La rejouer avec la même récompense est sans
  //    effet de bord : elle vérifie l'existence avant de créer.
  return res.status(200).json({ rewardId, reused, cost, featuredFanartId });
}
