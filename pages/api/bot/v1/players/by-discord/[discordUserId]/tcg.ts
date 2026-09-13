// GET /api/bot/v1/players/by-discord/[discordUserId]/tcg
//
// L'état TCG d'une joueuse, vu du bot Discord : son solde, ses paquets qui
// attendent, et un RÉSUMÉ de sa collection.
//
// UN RÉSUMÉ, PAS LA COLLECTION. Un message Discord n'affiche pas quarante
// cartes. Renvoyer la collection entière obligerait le bot à la tronquer, donc
// à décider seul ce qui mérite d'être montré — et deux consommateurs
// trancheraient différemment. On rend donc ce qui tient dans une phrase :
// combien de cartes distinctes, combien d'exemplaires, la meilleure rareté
// possédée. Le lien vers la page complète fait le reste.
//
// AUCUNE PHOTO, AUCUNE FACE ICI. Le bot n'a pas besoin des visages pour dire
// « tu as trois paquets », et ne pas les servir évite d'ouvrir une seconde voie
// d'accès aux photos consenties — celle de `readCardFaces` reste la seule, avec
// son filtre `approved` ET non révoquée.
//
// Auth : x-api-key (per-tenant) via withBotRoute. Scoping tenant systématique :
// une joueuse peut jouer dans plusieurs organisations, son TCG est celui du
// tenant qui interroge.

import type { NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { resolveActorPlayer } from '@/utils/botActor';
import { RARITY_ORDER, type TcgRarity } from '@/utils/tcg/rarity';
import { BOOSTER_PRICE_COINS } from '@/utils/tcg/economy';
import { cardSubjectKey } from '@/utils/tcg/subjectKey';
import { logger } from '@/utils/logger';

// Volontairement identique aux autres routes bot (`{15,25}`) et non au
// `pattern` de la spec : c'est le code qui fait foi, et un identifiant Discord
// court existe encore chez les comptes les plus anciens.
const DISCORD_ID_RE = /^[0-9]{15,25}$/;

/** Bornes de lecture, comme `/api/player/tcg/collection`. */
const MAX_PACKS = 500;
const MAX_CARDS = 5000;

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  // Pas de garde de méthode ici : `withBotRoute` filtre déjà et pose l'en-tête
  // `Allow` depuis `options.methods`. En redoubler un donnerait DEUX sources de
  // vérité pour les méthodes autorisées, qui divergeraient au premier ajout.
  const raw = req.query.discordUserId;
  const discordUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!discordUserId || !DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const player = await resolveActorPlayer(discordUserId);
  if (!player) {
    // 404 et code stable : le bot distingue « pas de compte lié » (où il faut
    // proposer /inscription) d'une erreur de lecture (où il faut réessayer).
    return res.status(404).json({
      error: "Ce compte Discord n'est pas lié au site.",
      code: 'NOT_LINKED',
    });
  }

  const tenantId = req.botContext.tenantId;
  const userId = player.authUserId;

  const [packsRes, walletRes] = await Promise.all([
    supabaseAdmin
      .from('tcg_packs')
      .select('id, opened_at')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .limit(MAX_PACKS),
    supabaseAdmin
      .from('tcg_wallets')
      .select('balance')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (packsRes.error) {
    logger.error('[bot/player/tcg] paquets illisibles', packsRes.error);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }

  const packs = (packsRes.data ?? []) as Array<{
    id: string;
    opened_at: string | null;
  }>;
  const openedPackIds = packs.filter((p) => p.opened_at).map((p) => p.id);
  const unopened = packs.length - openedPackIds.length;

  // Résumé de collection : les cartes des paquets OUVERTS. Un paquet fermé ne
  // contient encore rien — la collection se déduit, elle n'est pas stockée.
  let distinct = 0;
  let total = 0;
  let bestRarity: TcgRarity | null = null;

  if (openedPackIds.length > 0) {
    // Recyclées exclues, comme `/api/player/tcg/collection` : les deux
    // lecteurs comptent la même chose et doivent le compter pareil, sinon le
    // bot annoncerait une collection que le site ne montre pas.
    const { data: cardRows, error: cardsError } = await supabaseAdmin
      .from('tcg_pack_cards')
      .select('subject_kind, card_user_id, card_team_id, card_map_slug, rarity')
      .in('pack_id', openedPackIds)
      .is('recycled_at', null)
      .limit(MAX_CARDS);

    if (cardsError) {
      logger.error('[bot/player/tcg] cartes illisibles', cardsError);
      return res.status(500).json({ error: 'Erreur de lecture' });
    }

    const subjects = new Set<string>();
    for (const row of (cardRows ?? []) as Array<{
      subject_kind: 'player' | 'team' | 'map';
      card_user_id: string | null;
      card_team_id: string | null;
      card_map_slug: string | null;
      rarity: TcgRarity;
    }>) {
      // Le CHECK du schéma garantit exactement un sujet ; une ligne sans sujet
      // serait une corruption — on la saute plutôt que de la compter.
      const key = cardSubjectKey(row);
      if (!key) continue;
      subjects.add(key);
      total += 1;
      if (
        bestRarity === null ||
        RARITY_ORDER.indexOf(row.rarity) > RARITY_ORDER.indexOf(bestRarity)
      ) {
        bestRarity = row.rarity;
      }
    }
    distinct = subjects.size;
  }

  return res.status(200).json({
    authUserId: userId,
    discordUserId,
    balance: (walletRes.data as { balance?: number } | null)?.balance ?? 0,
    // Source unique du prix, comme côté site : le bot l'affiche, il ne le
    // connaît pas. Sans lui, un « il te manque X pièces » se calculerait avec
    // un barème recopié, qui mentirait au premier réglage.
    boosterPrice: BOOSTER_PRICE_COINS,
    packs: { unopened, opened: openedPackIds.length, total: packs.length },
    collection: { distinct, total, bestRarity },
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  // 60/min, comme les autres lectures TCG (`player-tcg-packs`,
  // `player-tcg-coll`) : c'est une consultation, pas une mutation.
  rateLimit: { max: 60, windowMs: 60_000, key: 'bot-player-tcg' },
});
