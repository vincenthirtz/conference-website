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
import { readOwnedCardRows } from '@/utils/tcg/readOwnedCards';
import { logger } from '@/utils/logger';

// Volontairement identique aux autres routes bot (`{15,25}`) et non au
// `pattern` de la spec : c'est le code qui fait foi, et un identifiant Discord
// court existe encore chez les comptes les plus anciens.
const DISCORD_ID_RE = /^[0-9]{15,25}$/;

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

  // Paquets fermés COMPTÉS (et non déduits d'une liste bornée) ; cartes lues par
  // tranches (`readOwnedCards`), comme `/api/player/tcg/collection` : PostgREST
  // coupe toute réponse à 1000 lignes, et l'ancienne borne `.limit(5000)`
  // faisait annoncer au bot une collection plus petite que celle du site.
  const [unopenedRes, openedRes, walletRes, ownedRes] = await Promise.all([
    supabaseAdmin
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .is('opened_at', null),
    supabaseAdmin
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .not('opened_at', 'is', null)
      // Un paquet `trade` (cartes reçues par échange) n'a pas été « ouvert » :
      // le compter gonflerait le nombre de paquets annoncé sur Discord.
      .neq('source_kind', 'trade'),
    supabaseAdmin
      .from('tcg_wallets')
      .select('balance')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle(),
    readOwnedCardRows(tenantId, userId),
  ]);

  if (unopenedRes.error || openedRes.error) {
    logger.error(
      '[bot/player/tcg] paquets illisibles',
      unopenedRes.error ?? openedRes.error
    );
    return res.status(500).json({ error: 'Erreur de lecture' });
  }
  if (!ownedRes.ok) {
    logger.error('[bot/player/tcg] cartes illisibles', ownedRes.error);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }

  const unopened = unopenedRes.count ?? 0;
  const opened = openedRes.count ?? 0;

  // Résumé de collection : les cartes des paquets OUVERTS. Un paquet fermé ne
  // contient encore rien — la collection se déduit, elle n'est pas stockée.
  let total = 0;
  let bestRarity: TcgRarity | null = null;
  const subjects = new Set<string>();
  for (const row of ownedRes.value) {
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
  const distinct = subjects.size;

  return res.status(200).json({
    authUserId: userId,
    discordUserId,
    balance: (walletRes.data as { balance?: number } | null)?.balance ?? 0,
    // Source unique du prix, comme côté site : le bot l'affiche, il ne le
    // connaît pas. Sans lui, un « il te manque X pièces » se calculerait avec
    // un barème recopié, qui mentirait au premier réglage.
    boosterPrice: BOOSTER_PRICE_COINS,
    packs: { unopened, opened, total: unopened + opened },
    collection: { distinct, total, bestRarity },
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  // 60/min, comme les autres lectures TCG (`player-tcg-packs`,
  // `player-tcg-coll`) : c'est une consultation, pas une mutation.
  rateLimit: { max: 60, windowMs: 60_000, key: 'bot-player-tcg' },
});
