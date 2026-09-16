// pages/api/bot/v1/free-players/profile.ts
//
// POST — la joueuse complète SA fiche depuis Discord : poste(s), niveau,
// disponibilité.
//
// LE MANQUE QU'IL COMBLE. Le bot pousse la liste des porteuses du rôle
// « Recherche une équipe » (`/sync`), et Discord ne lui apprend qu'un
// identifiant et un pseudo. Mesuré le 16 septembre 2026 : les six fiches de
// provenance Discord avaient ZÉRO poste, zéro niveau, zéro disponibilité. Une
// capitaine qui filtre par poste ne les voyait jamais — elles existaient sans
// être trouvables.
//
// POURQUOI PAS DANS `/sync`. Cette route-là est un FULL REPLACE piloté par le
// bot toutes les trente minutes : elle décrit QUI porte le rôle, pas ce que
// chacune sait faire. Y glisser un profil obligerait le bot à retenir ces
// réponses entre deux synchros, c'est-à-dire à tenir un état qu'il n'a pas.
// Ici, chaque appel vaut pour une joueuse et une seule.
//
// LA FICHE DOIT EXISTER. On ne CRÉE rien : sans ligne, la réponse est `404`.
// Créer ici ferait du profil une seconde porte d'entrée au marché, avec ses
// propres règles de péremption — alors que la vérité du marché Discord, c'est
// le rôle. Une joueuse qui retire le rôle disparaît à la synchro suivante ; son
// profil ne doit pas la faire réapparaître.
//
// CE QUI SURVIT : `/sync` reporte désormais poste, niveau, disponibilité et
// note d'une synchro à l'autre (cf. son en-tête). Sans cela, ce que cette route
// écrit serait effacé au prochain filet périodique.

import type { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';
import { normalizeRoles } from '@/utils/freePlayers';
import { profileBodySchema } from '@/lib/apiContracts/bot/free-players/profile';

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  const tenantId = req.botContext.tenantId;
  const body = req.botInput as z.infer<typeof profileBodySchema>;

  // Scopé à la provenance Discord : une fiche web appartient à son formulaire
  // et à son lien de retrait, le bot n'a pas à la réécrire.
  const { data, error } = await supabaseAdmin
    .from('free_players')
    // Mise à jour PARTIELLE : on n'écrit que ce que l'appel apporte. Poser les
    // absents à `null` effacerait, à chaque réponse, celles données juste avant.
    .update({
      ...(body.roles !== undefined
        ? { roles: normalizeRoles(body.roles) }
        : {}),
      ...(body.level !== undefined ? { level: body.level } : {}),
      ...(body.availability !== undefined
        ? { availability: body.availability }
        : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('source', 'discord')
    .eq('discord_user_id', body.discordUserId)
    .select('id');

  if (error) {
    logger.error('[bot/free-players/profile] update error', error, {
      tenantId,
    });
    return res.status(500).json({ error: 'Échec de la mise à jour.' });
  }

  if (!data || data.length === 0) {
    // Pas de fiche : elle ne porte pas le rôle, ou la synchro n'est pas encore
    // passée. Le bot sait quoi en dire — on ne devine pas à sa place.
    return res.status(404).json({
      error: 'Aucune fiche « joueuse libre » pour ce compte Discord.',
      code: 'FREE_PLAYER_NOT_FOUND',
    });
  }

  return res.status(200).json({ ok: true, id: data[0].id });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 20, key: 'bot-free-players-profile' },
  idempotent: true,
  bodySchema: profileBodySchema,
});
