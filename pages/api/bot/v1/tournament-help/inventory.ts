// GET /api/bot/v1/tournament-help/inventory
//
// Source unique du parcours "gerer un tournoi depuis Discord". Consommee par :
//   - le bot Discord (slash /aide-tournoi) qui rend chaque section en embed
//     pagine ;
//   - la future page admin staff-only /admin/aide-tournoi qui reaffiche les
//     memes commandes avec deeplinks stables.
//
// Le contenu vit dans config/tournament-help.json — ce handler se contente de
// le servir tel quel avec un Cache-Control court (le JSON ne change que sur
// PR). Le champ `version` permet au bot de detecter une mise a jour cote
// site sans avoir a diff l'arbre complet.
//
// Auth : x-api-key partage (lecture publique vue du bot, mais l'endpoint
// reste derriere la cle pour ne pas exposer la matrice commandes->endpoints
// a tout internet).

import type { NextApiRequest, NextApiResponse } from 'next';
import { withBotRoute } from '@/utils/botAuth';
import tournamentHelp from '@/config/tournament-help.json';

async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json(tournamentHelp);
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-tournament-help-inventory' },
});
