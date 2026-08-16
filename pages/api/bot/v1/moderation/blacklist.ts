// pages/api/bot/v1/moderation/blacklist.ts
//
// Feature Blacklist joueurs — Lot 3 (endpoint bot).
// Ref: docs/BLACKLIST_DESIGN.md, docs/BOT_API_CONTRACT.md.
//
// GET    → liste les entrées `active` du tenant pour que le bot scanne les
//          membres du serveur (`{ blacklist: [{ id, battleTag, displayName,
//          discordUserId, reason }] }`). Idempotent (GET, lecture).
// POST   → slash `/blacklist add` : ajoute une entrée. Au moins un identifiant.
//          battle_tag normalisé lowercase. `banned_by` = null (acteur Discord,
//          pas un compte auth.users) ; on trace l'acteur Discord dans `notes`.
//          Réservé staff (requireBotStaff). idempotent: false.
// DELETE  → slash `/blacklist remove` : désactive (soft, active=false) une
//          entrée identifiée par `{ id }` OU `{ battleTag }` OU
//          `{ discordUserId }`. Réservé staff. idempotent: true.
//
// Table service-role only (RLS default-deny) → supabaseAdmin + scope tenant_id.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
import { discordIdSchema, uuidSchema } from '@/utils/botValidation';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

/** Normalise un battletag pour le stockage (lowercase + trim). */
function normalizeBattleTag(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normalise une valeur texte optionnelle en `string | null` (vide → null). */
function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// POST : actorDiscordUserId requis (staff), au moins un identifiant.
const addSchema = z
  .object({
    actorDiscordUserId: discordIdSchema,
    battleTag: z.string().trim().max(190).optional().nullable(),
    displayName: z.string().trim().max(190).optional().nullable(),
    discordUserId: discordIdSchema.optional().nullable(),
    reason: z.string().trim().max(1000).optional().nullable(),
  })
  .refine(
    (v) => !!(v.battleTag?.trim() || v.displayName?.trim() || v.discordUserId),
    {
      message:
        'Au moins un identifiant requis (battleTag, displayName ou discordUserId).',
    }
  );

// DELETE : actorDiscordUserId requis (staff) + un sélecteur parmi id /
// battleTag / discordUserId.
const removeSchema = z
  .object({
    actorDiscordUserId: discordIdSchema,
    id: uuidSchema.optional(),
    battleTag: z.string().trim().max(190).optional().nullable(),
    discordUserId: discordIdSchema.optional().nullable(),
  })
  .refine((v) => !!(v.id || v.battleTag?.trim() || v.discordUserId), {
    message: 'Un sélecteur requis (id, battleTag ou discordUserId).',
  });

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext.tenantId;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('player_blacklist')
      .select('id, battle_tag, display_name, discord_user_id, reason')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[bot/moderation/blacklist] list error', error);
      return res.status(500).json({ error: 'Erreur de lecture' });
    }

    const blacklist = (data ?? []).map((row) => {
      const r = row as {
        id: string;
        battle_tag: string | null;
        display_name: string | null;
        discord_user_id: string | null;
        reason: string | null;
      };
      return {
        id: r.id,
        battleTag: r.battle_tag,
        displayName: r.display_name,
        discordUserId: r.discord_user_id,
        reason: r.reason,
      };
    });

    // `?withAlerted=1` → on renvoie en plus l'ensemble (distinct) des
    // discord_user_id qui ont DÉJÀ fait l'objet d'une alerte de détection (table
    // `blacklist_alerts`). Le bot s'en sert au démarrage pour amorcer son état
    // « déjà alerté » : un restart ne doit PAS ré-émettre une alerte pour un
    // membre déjà signalé avant le restart. Seules les détections réellement
    // nouvelles (jamais alertées) déclenchent. Dégradation gracieuse : si le
    // bot n'envoie pas le flag, on ne change rien (rétrocompatible).
    const withAlerted =
      req.query.withAlerted === '1' || req.query.withAlerted === 'true';
    if (!withAlerted) {
      return res.status(200).json({ blacklist });
    }

    const { data: alertRows, error: alertErr } = await supabaseAdmin
      .from('blacklist_alerts')
      .select('discord_user_id')
      .eq('tenant_id', tenantId)
      .not('discord_user_id', 'is', null);

    if (alertErr) {
      // Best-effort : si la lecture des alertes échoue, on renvoie quand même la
      // blacklist (le bot retombera sur son comportement sans seed plutôt que de
      // ne rien scanner). On signale par un ensemble null pour distinguer
      // « vide » de « indisponible ».
      logger.error('[bot/moderation/blacklist] alerted lookup error', alertErr);
      return res.status(200).json({ blacklist, alertedDiscordUserIds: null });
    }

    const alertedDiscordUserIds = [
      ...new Set(
        (alertRows ?? [])
          .map((r) => (r as { discord_user_id: string | null }).discord_user_id)
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
      ),
    ];

    return res.status(200).json({ blacklist, alertedDiscordUserIds });
  }

  if (req.method === 'POST') {
    const parsed = addSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: formatZodError(parsed.error),
        code: 'INVALID_BODY',
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    const body = parsed.data;

    // Moderation write → réservé staff admin/owner.
    const actor = await requireBotStaff(
      req,
      res,
      (req.body ?? {}) as Record<string, unknown>
    );
    if (!actor) return;

    const insertPayload = {
      tenant_id: tenantId,
      battle_tag: normalizeBattleTag(body.battleTag),
      display_name: nullableText(body.displayName),
      discord_user_id: nullableText(body.discordUserId),
      reason: nullableText(body.reason),
      // Acteur Discord → pas de compte auth.users, banned_by reste null. On
      // trace l'auteur du ban dans notes pour l'audit.
      banned_by: null,
      notes: `added via Discord by ${body.actorDiscordUserId}`,
      active: true,
    };

    const { data, error } = await supabaseAdmin
      .from('player_blacklist')
      .insert(insertPayload)
      .select('id, battle_tag, display_name, discord_user_id, reason')
      .single();

    if (error || !data) {
      logger.error('[bot/moderation/blacklist] insert error', error);
      return res.status(500).json({ error: 'Échec de la création' });
    }

    return res.status(201).json({
      entry: {
        id: data.id,
        battleTag: data.battle_tag,
        displayName: data.display_name,
        discordUserId: data.discord_user_id,
        reason: data.reason,
      },
    });
  }

  if (req.method === 'DELETE') {
    const parsed = removeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: formatZodError(parsed.error),
        code: 'INVALID_BODY',
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    const body = parsed.data;

    // Moderation write → réservé staff admin/owner.
    const actor = await requireBotStaff(
      req,
      res,
      (req.body ?? {}) as Record<string, unknown>
    );
    if (!actor) return;

    // Soft-disable (active=false) plutôt que delete : on garde l'historique,
    // cohérent avec le toggle admin. Sélecteur prioritaire : id > discordUserId
    // > battleTag (normalisé lowercase).
    let query = supabaseAdmin
      .from('player_blacklist')
      .update({ active: false })
      .eq('tenant_id', tenantId)
      .eq('active', true);

    if (body.id) {
      query = query.eq('id', body.id);
    } else if (body.discordUserId) {
      query = query.eq('discord_user_id', body.discordUserId.trim());
    } else {
      query = query.eq('battle_tag', normalizeBattleTag(body.battleTag));
    }

    const { data, error } = await query.select('id');

    if (error) {
      logger.error('[bot/moderation/blacklist] disable error', error);
      return res.status(500).json({ error: 'Échec de la suppression' });
    }

    const removed = data?.length ?? 0;
    if (removed === 0) {
      return res
        .status(404)
        .json({ error: 'Aucune entrée active correspondante.' });
    }

    return res.status(200).json({ removed });
  }

  res.setHeader('Allow', 'GET,POST,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST', 'DELETE'],
  rateLimit: {
    max: 30,
    key: 'bot-moderation',
    perActor: { max: 10, windowMs: 60_000 },
  },
  // Idempotency n'est honorée que sur les méthodes non-safe et seulement si
  // l'appelant envoie un header Idempotency-Key. GET n'est jamais caché par ce
  // mécanisme (lecture). On l'active pour rendre le DELETE rejouable sans
  // double effet ; POST reste non-idempotent (un ré-ajout doit créer une row).
  idempotent: true,
});
