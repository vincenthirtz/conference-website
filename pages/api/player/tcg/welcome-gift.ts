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

export type PlayerWelcomeGift = {
  coins: number;
  receivedAt: string;
};

export type PlayerWelcomeGiftResponse = { gift: PlayerWelcomeGift | null };

export default withSubjectRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { subject }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
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

  const { data, error } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .select('amount, created_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('source_kind', 'welcome_gift')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Une erreur de LECTURE n'est pas une absence de cadeau : on la journalise
    // au lieu de la traduire en « tu n'as rien reçu », ce qui serait un
    // mensonge et ferait disparaître la carte sans raison.
    logger.error('[tcg/welcome] lecture impossible: %s', error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const row = data as { amount: number; created_at: string } | null;

  return res.status(200).json({
    gift: row ? { coins: row.amount, receivedAt: row.created_at } : null,
  } satisfies PlayerWelcomeGiftResponse);
});
