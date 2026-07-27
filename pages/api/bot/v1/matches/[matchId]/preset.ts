// GET /api/bot/v1/matches/[matchId]/preset
//
// Renvoie le preset de partie personnalisée applicable à un match : le code
// d'import du jeu que l'hôte doit coller (Partie perso > Paramètres > Importer)
// plus le rappel de config. Aucun jeu n'expose d'API pour créer ou lancer un
// lobby — ce code est le seul levier automatisable, donc le bot le pousse dans
// le thread du match et via /match-meta.
//
// Périmètre résolu côté site (phase > tournoi > tenant), cf.
// utils/customGamePresets.ts : le bot n'a aucune règle de résolution à
// dupliquer, il affiche ce qu'on lui donne.
//
// Auth : x-api-key (BOT_API_KEY) + x-tenant-id. PAS d'acteur Discord requis —
// c'est une lecture, et le thread de match est déjà restreint aux équipes
// concernées. Le code d'import ne transite jamais vers l'API publique.
//
// 200 `{ matchId, tournamentId, stageId, game, preset: {...} | null, lines: [] }`
// 404 si le match n'existe pas dans ce tenant.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { uuidSchema } from '@/utils/botValidation';
import { resolveMatchPreset } from '@/utils/matches/resolveMatchPreset';
import { formatPresetLines } from '@/utils/customGamePresets';

const presetQuerySchema = z.object({ matchId: uuidSchema });

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<typeof presetQuerySchema>;

  const result = await resolveMatchPreset(matchId, req.botContext.tenantId);
  if (!result) {
    return res.status(404).json({ error: 'Match introuvable' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    matchId: result.matchId,
    tournamentId: result.tournamentId,
    stageId: result.stageId,
    game: result.game,
    preset: result.preset,
    // Mise en forme centralisée côté site pour que le thread de match, le DM
    // hôte et /match-meta affichent exactement le même bloc.
    lines: result.preset ? formatPresetLines(result.preset) : [],
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-match-preset' },
  querySchema: presetQuerySchema,
});
