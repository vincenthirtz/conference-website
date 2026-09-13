// pages/api/player/twitch-status.ts
//
// GET    — l'état du lien Twitch de la personne connectée.
// DELETE — le retire.
//
// À QUOI SERT CE LIEN. Un événement Twitch livre un identifiant Twitch, jamais
// un compte du site. Sans ce pont, un drop réclamé en direct n'a pas de
// destinataire — c'est exactement ce que répondait le webhook
// (`identity_not_linked`). Le lien est donc la condition d'accès à une
// récompense, ce qui impose qu'il soit PROUVÉ par OAuth et non déclaré : un
// pseudo saisi à la main laisserait n'importe qui encaisser les drops d'une
// autre.
//
// `configured: false` quand la fonctionnalité est dormante : l'écran masque
// alors le bouton au lieu de proposer un chemin qui finirait en 503.
//
// LE DÉLIEMENT EST IMMÉDIAT ET SANS CONDITION. Rattacher son compte Twitch est
// un choix ; le défaire doit l'être tout autant, sans passer par le staff. Les
// cartes déjà gagnées restent acquises — elles ont été gagnées.

import type { NextApiRequest, NextApiResponse } from 'next';

import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { isTwitchIdentityConfigured } from '@/utils/twitchIdentity';
import {
  getTwitchLinkStatus,
  deleteTwitchLink,
} from '@/utils/auth/twitchLinks';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'twitch-status'))
    return;

  res.setHeader('Cache-Control', 'no-store');

  // Aiguillage en forme POSITIVE (`=== 'GET'`), et pas un `!==` composé suivi
  // d'un `DELETE` implicite : c'est ce que lit le garde de dérive OpenAPI, et
  // c'est aussi ce qu'un humain lit le plus vite. Les deux méthodes acceptées
  // se voient d'un coup d'œil au lieu de se déduire par élimination.
  if (req.method === 'GET') {
    const status = await getTwitchLinkStatus(user.id);
    return res.status(200).json({
      configured: isTwitchIdentityConfigured(),
      linked: status.linked,
      twitchLogin: status.twitchLogin,
      linkedAt: status.linkedAt,
    });
  }

  if (req.method === 'DELETE') {
    const ok = await deleteTwitchLink(user.id);
    if (!ok) {
      return res.status(500).json({ error: 'Suppression impossible.' });
    }
    return res.status(200).json({
      configured: isTwitchIdentityConfigured(),
      linked: false,
      twitchLogin: null,
      linkedAt: null,
    });
  }

  res.setHeader('Allow', 'GET, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
});
