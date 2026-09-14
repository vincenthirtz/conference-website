// pages/api/player/tcg/welcome-gift.ts
//
// « M'a-t-on offert un cadeau de bienvenue, et lequel ? »
//
// POURQUOI UNE ROUTE PLUTÔT QUE DE LIRE LE PORTE-MONNAIE. `/api/player/tcg/
// wallet` rend les 50 derniers mouvements ; y chercher une ligne
// `welcome_gift` obligerait la carte du tableau de bord à connaître le
// vocabulaire du registre et à espérer que le cadeau soit encore dans la
// fenêtre. Une question simple mérite une réponse simple.
//
// `withSubjectRoute` ET NON `withAuthRoute`, ET C'EST LE POINT IMPORTANT. Le
// tableau de bord est PARTAGÉ avec la vue d'inspection admin (`?as=`) : une
// route qui lirait `user.id` afficherait le cadeau de l'ADMIN sur la page de la
// joueuse inspectée. Aucune route `tcg/` ne gère le sujet à ce jour — celle-ci
// est la première, parce qu'elle est la première à s'afficher sur cet écran.
// Le wrapper force aussi `private, no-store` en inspection.
//
// L'ABSENCE DE CADEAU EST UN ÉTAT NORMAL, pas une erreur : une joueuse d'une
// équipe non engagée, ou arrivée après la distribution, n'en a pas. On rend
// `gift: null` et la carte ne s'affiche pas — jamais un 404, qui ferait passer
// un état ordinaire pour une panne.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import { logger } from '@/utils/logger';
import { grantSupporterWelcome } from '@/utils/tcg/grantSupporterWelcome';

export type PlayerWelcomeGift = {
  coins: number;
  receivedAt: string;
};

export type PlayerWelcomeGiftResponse = {
  gift: PlayerWelcomeGift | null;
  /**
   * Le cadeau d'accueil SUPPORTRICE est-il réclamable par ce compte ?
   *
   * Calculé par `grantSupporterWelcome({ dryRun: true })`, donc avec exactement
   * les conditions du chemin d'écriture : proposer un bouton que le POST
   * refuserait ensuite serait pire que ne rien proposer.
   */
  supporterClaimable: boolean;
};

/** Réponse du POST de réclamation. `status` suffit à la carte pour brancher. */
export type PlayerWelcomeClaimResponse =
  | { status: 'granted'; coins: number; packGranted: boolean }
  | { status: 'already' | 'not_supporter' | 'on_roster' };

export default withSubjectRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { subject }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'player-tcg-welcome'
    )
  ) {
    return;
  }

  // `subject.userId` / `subject.tenantId`, jamais `user.id` : cf. l'en-tête.
  const { userId, tenantId } = subject;

  // Aiguillage en forme POSITIVE : c'est ce que lit le garde de dérive OpenAPI,
  // qui ne reconnaît pas un `else` final.
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('tcg_wallet_entries')
      .select('amount, created_at')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      // LES DEUX ACCUEILS, et pas seulement celui des participantes : depuis
      // `tcg_supporter_welcome.sql`, une supportrice a le sien. Filtrer sur la
      // seule clé d'origine aurait rendu son cadeau invisible sur l'écran
      // même qui sert à l'annoncer.
      .in('source_kind', ['welcome_gift', 'supporter_welcome'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // Une erreur de LECTURE n'est pas une absence de cadeau : on la
      // journalise au lieu de la traduire en « tu n'as rien reçu », ce qui
      // serait un mensonge et ferait disparaître la carte sans raison.
      logger.error('[tcg/welcome] lecture impossible: %s', error.message);
      return res.status(500).json({ error: 'Lecture impossible.' });
    }

    const row = data as { amount: number; created_at: string } | null;

    // Une seule raison d'interroger l'éligibilité : la carte de réclamation.
    // Inutile si le cadeau est déjà là.
    const probe = row
      ? null
      : await grantSupporterWelcome({ tenantId, userId, dryRun: true });

    return res.status(200).json({
      gift: row ? { coins: row.amount, receivedAt: row.created_at } : null,
      supporterClaimable: probe?.status === 'claimable',
    } satisfies PlayerWelcomeGiftResponse);
  }

  if (req.method === 'POST') {
    // PAS de `allowActAs` sur cette route : `withSubjectRoute` refuse donc
    // `?as=` hors GET, et `subject.userId === user.id` est GARANTI ici. Un
    // staff qui inspecte une supportrice ne peut pas réclamer à sa place — un
    // cadeau réclamé ne se rend pas.
    if (
      applyRateLimit(
        req,
        res,
        { max: 6, windowMs: 60_000 },
        'player-tcg-welcome-claim'
      )
    ) {
      return;
    }

    const outcome = await grantSupporterWelcome({ tenantId, userId });

    if (outcome.status === 'error') {
      return res.status(500).json({ error: 'Réclamation impossible.' });
    }
    if (outcome.status === 'granted') {
      // `packGranted` est RENDU, pas avalé : si l'insertion du paquet a échoué,
      // les pièces sont écrites et ne seront pas rejouées. L'écran doit le dire
      // — c'est précisément ce qui a manqué le 2026-09-14.
      return res.status(200).json({
        status: 'granted',
        coins: outcome.coins,
        packGranted: outcome.packGranted,
      } satisfies PlayerWelcomeClaimResponse);
    }
    // `claimable` ne peut pas sortir d'un appel sans `dryRun` ; le reste est un
    // refus ordinaire, pas une panne, donc 200 avec un motif lisible.
    return res.status(200).json({
      status: outcome.status === 'claimable' ? 'already' : outcome.status,
    } satisfies PlayerWelcomeClaimResponse);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
});
