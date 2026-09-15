// pages/api/bot/v1/moderation/blacklist-alert.ts
//
// Feature Blacklist joueurs — persistance des alertes de détection bot.
// Ref: docs/BLACKLIST_DESIGN.md, docs/BOT_API_CONTRACT.md.
//
// POST → le bot Discord rapporte une détection blacklist (scan des membres du
//        serveur, ou arrivée d'un nouveau membre) en l'enregistrant dans la
//        table `blacklist_alerts`. La détection N'A PAS d'acteur staff : c'est
//        le bot système qui rapporte (contrairement à tickets/close-log qui
//        résout un closer Discord vers un compte staff). On n'appelle donc PAS
//        requireBotStaff — pas de résolution d'acteur.
//
// Table service-role only (RLS default-deny) → supabaseAdmin + scope tenant_id
// = req.botContext.tenantId.
//
// Auth : x-api-key (per-tenant). Tenant-scopé. Idempotent (Idempotency-Key
// honoré sur le POST : un retour réseau ne crée pas deux rows).

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';
import { blacklistAlertBodySchema } from '@/lib/apiContracts/bot/moderation/blacklist-alert';

/** Normalise une valeur texte optionnelle en `string | null` (vide → null). */
function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext.tenantId;
  const input = req.botInput as z.infer<typeof blacklistAlertBodySchema>;

  const insertPayload = {
    tenant_id: tenantId,
    blacklist_entry_id: input.blacklistEntryId ?? null,
    discord_user_id: input.discordUserId,
    battle_tag: nullableText(input.battleTag),
    display_name: nullableText(input.displayName),
    matched_on: input.matchedOn,
    strength: input.strength,
    criteria: input.criteria ?? null,
    reason: nullableText(input.reason),
    source: input.source,
    context: nullableText(input.context),
  };

  const { data, error } = await supabaseAdmin
    .from('blacklist_alerts')
    .insert(insertPayload)
    .select('id, created_at')
    .single();

  if (error || !data) {
    logger.error('[bot/moderation/blacklist-alert] insert error', error);
    return res.status(500).json({ error: "Échec de l'enregistrement" });
  }

  return res.status(201).json({
    alert: { id: data.id, createdAt: data.created_at },
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-moderation' },
  bodySchema: blacklistAlertBodySchema,
  // Le bot peut renvoyer la même détection sur un retry réseau : Idempotency-Key
  // évite la double row (même mécanisme que les autres writes bot).
  idempotent: true,
  // Régie+ : alerte modération/arbitrage (blacklist). NB : la LECTURE de la
  // blacklist (moderation/blacklist.ts) reste BASIC — sécurité, ouverte à tous.
  requireCapability: 'arbitration',
});
