// GET /api/bot/v1/players/battle-tags
//
// Correspondance discordUserId → BattleTag de TOUT le tenant, en une réponse
// (paginée par curseur). Conçue pour le scan blacklist du bot
// (owwc-discord-bot/blacklist.js) qui, sans elle, appelle
// GET /players/by-discord/:id/team pour CHAQUE membre de chaque serveur et n'y
// lit qu'un champ : `member.battleTag`. Un scan de serveur passe de N appels
// HTTP à 1 (ou quelques pages).
//
// SÉMANTIQUE. `battleTag` est EXACTEMENT celui que renverrait `.../team` dans
// `member.battleTag` : compte lié (user_discord_links), appartenance retenue
// par `pickMembership` dans le tenant, colonne `team_members.battle_tag`. Les
// comptes non liés, sans équipe dans le tenant ou sans BattleTag ne figurent
// PAS dans la liste — pour le bot, absence = `null`, comme un 404 de `.../team`.
//
// DONNÉES. Deux champs par entrée, rien d'autre (ni auth_user_id, ni équipe,
// ni pseudo Discord) : c'est tout ce que le scan consomme. Seuls les comptes
// ayant une appartenance dans le tenant de la clé apparaissent.
//
// COÛT. Lecture depuis l'instantané 30 s de utils/botPlayerTeamSnapshot.ts
// (3 lectures paginées pour tout le tenant, partagées avec le mode rafale de
// `.../team`). Les pages suivantes d'un même parcours sont servies par le même
// instantané.
//
// Auth : x-api-key (tenant déduit de la clé, cf. withBotRoute).

import type { NextApiResponse } from 'next';
import type * as z from 'zod';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import {
  getPlayerTeamSnapshot,
  type PlayerTeamSnapshot,
} from '@/utils/botPlayerTeamSnapshot';
import { pickMembership } from '@/utils/teams/memberships';
import { battleTagsQuerySchema } from '@/lib/apiContracts/bot/players/battle-tags.query';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

type BattleTagEntry = { discordUserId: string; battleTag: string };

/** Liste triée par discordUserId, calculée une fois par instantané. */
const entriesBySnapshot = new WeakMap<PlayerTeamSnapshot, BattleTagEntry[]>();

function entriesOf(snap: PlayerTeamSnapshot): BattleTagEntry[] {
  const hit = entriesBySnapshot.get(snap);
  if (hit) return hit;
  const out: BattleTagEntry[] = [];
  for (const [discordUserId, link] of snap.linksByDiscordId) {
    const membership = pickMembership(
      snap.membershipsByUser.get(link.auth_user_id) ?? []
    );
    const battleTag = membership?.battle_tag;
    if (typeof battleTag === 'string' && battleTag) {
      out.push({ discordUserId, battleTag });
    }
  }
  out.sort((a, b) =>
    a.discordUserId < b.discordUserId
      ? -1
      : a.discordUserId > b.discordUserId
        ? 1
        : 0
  );
  entriesBySnapshot.set(snap, out);
  return out;
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const query = req.botQuery as z.infer<typeof battleTagsQuerySchema>;
  const limit = query.limit
    ? Math.min(MAX_LIMIT, Number(query.limit))
    : DEFAULT_LIMIT;
  const cursor = query.cursor ?? null;

  const snap = await getPlayerTeamSnapshot(req.botContext.tenantId);
  if (!snap) {
    // Lecture en échec (ou tenant hors gabarit) : transitoire du point de vue
    // du bot, qui peut retomber sur `.../team` membre par membre.
    res.setHeader('Retry-After', '60');
    return res.status(503).json({
      error: 'Correspondance BattleTag momentanément indisponible.',
      code: 'BATTLE_TAGS_UNAVAILABLE',
    });
  }

  const all = entriesOf(snap);
  let start = 0;
  if (cursor) {
    while (start < all.length && all[start].discordUserId <= cursor) start += 1;
  }
  const items = all.slice(start, start + limit);
  const nextCursor: string | null =
    start + limit < all.length ? items[items.length - 1].discordUserId : null;

  return res.status(200).json({ items, nextCursor });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-player-battle-tags' },
  querySchema: battleTagsQuerySchema,
});
