// POST /api/bot/v1/role-sync/presence
//
// Le bot rapporte QUI est effectivement présent sur le serveur Discord.
//
// Pendant du snapshot (GET, site → bot : « qui doit avoir quels rôles »), dans
// l'autre sens : seul le bot voit le guild. Le site savait jusqu'ici qu'un
// compte Discord était LIÉ, pas que la personne était encore là — et les deux
// divergent dès que quelqu'un lie son compte puis quitte le serveur. Elle
// apparaissait alors en règle, alors que le bot ne pouvait plus ni lui donner
// ses rôles, ni l'ajouter aux salons, ni la convoquer.
//
// Le bot ne calcule rien de neuf : `role-sync` parcourt déjà tous les comptes
// liés à chaque cycle et jetait le résultat (`if (!member) continue`). Il le
// poste désormais ici.
//
// DEUX modes, parce que le bot a deux occasions de constater :
//
//   mode: 'replace' (défaut) — FIN DE CYCLE role-sync. Le bot vient de parcourir
//     l'ENSEMBLE des comptes liés, sa vue est complète : les lignes du tenant
//     absentes du payload sont périmées (compte délié entre-temps), pas
//     manquantes — on les supprime. Même contrat que /api/bot/v1/free-players/sync.
//
//   mode: 'upsert' — ÉVÉNEMENT ponctuel (GuildMemberAdd / GuildMemberRemove).
//     Le bot ne sait rien du reste du roster à ce moment-là : il rapporte la
//     seule ligne qui vient de changer, et un full replace effacerait tout le
//     tenant sur la foi d'un membre. Sans ce mode, un badge « a quitté le
//     Discord » survivait jusqu'à 30 min au retour effectif de la personne.
//
// Auth : x-api-key (per-tenant). Tenant-scopé : req.botContext.tenantId.
//
// Réponse 200 : { count, present, absent, mode }.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { discordIdSchema } from '@/utils/botValidation';
import { logger } from '@/utils/logger';

/** Même ordre de grandeur que free-players/sync : un guild, pas une fédération. */
const MAX_MEMBERS = 5000;

const presenceBodySchema = z.object({
  members: z
    .array(
      z.object({
        discordUserId: discordIdSchema,
        inGuild: z.boolean(),
      })
    )
    .max(MAX_MEMBERS),
  /**
   * Défaut 'replace' : c'est le contrat historique, et un bot d'une version
   * antérieure (qui n'envoie pas le champ) doit continuer à faire un full
   * replace de fin de cycle.
   */
  mode: z.enum(['replace', 'upsert']).optional().default('replace'),
});

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext.tenantId;
  const input = req.botInput as z.infer<typeof presenceBodySchema>;

  // Dédup par discord_user_id (le dernier gagne) : la PK (tenant_id,
  // discord_user_id) rejetterait un doublon dans le même INSERT.
  const byDiscordId = new Map<string, boolean>();
  for (const m of input.members) byDiscordId.set(m.discordUserId, m.inGuild);

  const checkedAt = new Date().toISOString();
  const rows = [...byDiscordId.entries()].map(([discordUserId, inGuild]) => ({
    tenant_id: tenantId,
    discord_user_id: discordUserId,
    in_guild: inGuild,
    checked_at: checkedAt,
  }));

  if (input.mode === 'upsert') {
    // Constat ponctuel : on ne touche QUE les lignes rapportées. Rien à faire
    // si le bot n'a rien vu — surtout pas une purge.
    if (rows.length > 0) {
      const { error: upsertErr } = await supabaseAdmin!
        .from('discord_guild_presence')
        .upsert(rows, { onConflict: 'tenant_id,discord_user_id' });
      if (upsertErr) {
        logger.error('[bot/role-sync/presence] upsert error', upsertErr);
        return res
          .status(500)
          .json({ error: 'Échec de l’enregistrement des présences.' });
      }
    }
  } else {
    // FULL REPLACE : on purge le tenant…
    const { error: deleteErr } = await supabaseAdmin!
      .from('discord_guild_presence')
      .delete()
      .eq('tenant_id', tenantId);
    if (deleteErr) {
      logger.error('[bot/role-sync/presence] delete error', deleteErr);
      return res
        .status(500)
        .json({ error: 'Échec du nettoyage des présences.' });
    }

    // …puis on réinsère le constat complet.
    if (rows.length > 0) {
      const { error: insertErr } = await supabaseAdmin!
        .from('discord_guild_presence')
        .insert(rows);
      if (insertErr) {
        logger.error('[bot/role-sync/presence] insert error', insertErr);
        return res
          .status(500)
          .json({ error: 'Échec de l’enregistrement des présences.' });
      }
    }
  }

  const present = rows.filter((r) => r.in_guild).length;
  return res.status(200).json({
    count: rows.length,
    present,
    absent: rows.length - present,
    mode: input.mode,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  // 30 suffisait pour un POST par cycle de 30 min ; le mode 'upsert' ajoute un
  // POST par arrivée/départ sur le serveur, ce qui monte vite lors d'une vague
  // d'inscriptions.
  rateLimit: { max: 120, key: 'bot-role-sync-presence' },
  idempotent: true,
  bodySchema: presenceBodySchema,
});
