// pages/api/admin/support/tickets/[id]/convert-blacklist.ts
//
// Feature « conversion signalement → blacklist ».
// Ref: docs/BLACKLIST_DESIGN.md (sous-section « Conversion depuis un
// signalement ») + migration add_reported_target_to_support_tickets.sql.
//
// POST → convertit un ticket support en entrée de blacklist :
//   - kind 'player' → insert player_blacklist (mêmes règles/normalisations que
//     POST /api/admin/moderation/blacklist : au moins un identifiant,
//     battle_tag lowercase/trim, snowflake Discord validé).
//   - kind 'entity' → insert entity_blacklist (entity_type + name requis).
//   Puis trace la conversion sur le ticket via converted_player_blacklist_id /
//   converted_entity_blacklist_id. 409 si le ticket est déjà converti pour ce
//   kind. Audit logStaffAction('support_ticket_convert_blacklist').
//
// NOTE tenant : support_tickets n'a PAS de tenant_id — la conversion écrit
// l'entrée de blacklist dans le tenant COURANT du staff (ctx.tenantId).
//
// Les tables blacklist sont service-role only (RLS default-deny) : on passe
// par supabaseAdmin.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

const PLAYER_SELECT_COLS =
  'id, tenant_id, battle_tag, display_name, discord_user_id, reason, notes, banned_by, active, created_at, updated_at';
const ENTITY_SELECT_COLS =
  'id, tenant_id, entity_type, name, reason, notes, banned_by, active, created_at, updated_at';

// Body discriminé sur `kind`. Miroir des schémas de création des endpoints
// admin blacklist (joueurs / entités).
const playerSchema = z
  .object({
    kind: z.literal('player'),
    battle_tag: z.string().trim().max(190).optional().nullable(),
    display_name: z.string().trim().max(190).optional().nullable(),
    discord_user_id: z
      .string()
      .trim()
      .regex(/^[0-9]{15,25}$/, 'discord_user_id invalide.')
      .optional()
      .nullable(),
    reason: z.string().trim().max(1000).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine(
    (v) =>
      !!(v.battle_tag?.trim() || v.display_name?.trim() || v.discord_user_id),
    {
      message:
        'Au moins un identifiant requis (battle_tag, display_name ou discord_user_id).',
    }
  );

const entitySchema = z.object({
  kind: z.literal('entity'),
  entity_type: z.enum(['team', 'org']),
  name: z.string().trim().min(1, 'Le nom est requis.').max(190),
  reason: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/** Normalise une valeur texte optionnelle en `string | null` (vide → null). */
function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normalise un battletag pour le stockage (lowercase + trim). */
function normalizeBattleTag(value: string | null | undefined): string | null {
  const trimmed = nullableText(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-support-convert-blacklist'
    )
  )
    return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid ticket ID.' });
  }
  const ticketId = String(id);

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  // Discrimination manuelle sur `kind` (400 propre si absent/inconnu), puis
  // parse zod du schéma correspondant.
  const rawKind = (req.body ?? {}).kind;
  if (rawKind !== 'player' && rawKind !== 'entity') {
    return res.status(400).json({
      error: "Champ 'kind' requis ('player' ou 'entity').",
    });
  }

  const parsed =
    rawKind === 'player'
      ? playerSchema.safeParse(req.body ?? {})
      : entitySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Charge le ticket + son état de conversion.
  const { data: ticket, error: ticketError } = await admin
    .from('support_tickets')
    .select('id, converted_player_blacklist_id, converted_entity_blacklist_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError) {
    logger.error(
      '[admin/support/convert-blacklist] ticket load error',
      ticketError
    );
    return res.status(500).json({ error: 'Failed to load the ticket.' });
  }
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket introuvable.' });
  }

  // Déjà converti pour ce kind → 409 (conflit d'état métier).
  if (rawKind === 'player' && ticket.converted_player_blacklist_id) {
    return res.status(409).json({
      error: 'Ce ticket a déjà été converti en entrée blacklist joueur.',
    });
  }
  if (rawKind === 'entity' && ticket.converted_entity_blacklist_id) {
    return res.status(409).json({
      error: 'Ce ticket a déjà été converti en entrée blacklist entité.',
    });
  }

  // Insère l'entrée dans la bonne table, scopée sur le tenant COURANT du
  // staff (support_tickets n'a pas de tenant_id).
  let entry: Record<string, unknown>;
  let convertedColumn: string;
  let logIdentifiers: Record<string, unknown>;

  if (parsed.data.kind === 'player') {
    const body = parsed.data;
    const insertPayload = {
      tenant_id: ctx.tenantId,
      battle_tag: normalizeBattleTag(body.battle_tag),
      display_name: nullableText(body.display_name),
      discord_user_id: nullableText(body.discord_user_id),
      reason: nullableText(body.reason),
      notes: nullableText(body.notes),
      // banned_by = FK auth.users(id) → c'est l'auth user, pas le staff.id.
      banned_by: ctx.user.id,
      active: true,
    };
    const { data, error } = await admin
      .from('player_blacklist')
      .insert(insertPayload)
      .select(PLAYER_SELECT_COLS)
      .single();
    if (error || !data) {
      logger.error(
        '[admin/support/convert-blacklist] player insert error',
        error
      );
      return res
        .status(500)
        .json({ error: 'Failed to create the blacklist entry.' });
    }
    entry = data;
    convertedColumn = 'converted_player_blacklist_id';
    logIdentifiers = {
      battle_tag: insertPayload.battle_tag,
      display_name: insertPayload.display_name,
      discord_user_id: insertPayload.discord_user_id,
    };
  } else {
    const body = parsed.data;
    const insertPayload = {
      tenant_id: ctx.tenantId,
      entity_type: body.entity_type,
      name: body.name,
      reason: nullableText(body.reason),
      notes: nullableText(body.notes),
      banned_by: ctx.user.id,
      active: true,
    };
    const { data, error } = await admin
      .from('entity_blacklist')
      .insert(insertPayload)
      .select(ENTITY_SELECT_COLS)
      .single();
    if (error || !data) {
      logger.error(
        '[admin/support/convert-blacklist] entity insert error',
        error
      );
      return res
        .status(500)
        .json({ error: 'Failed to create the entity blacklist entry.' });
    }
    entry = data;
    convertedColumn = 'converted_entity_blacklist_id';
    logIdentifiers = {
      entity_type: insertPayload.entity_type,
      name: insertPayload.name,
    };
  }

  // Trace la conversion sur le ticket. Best-effort : si cet UPDATE échoue,
  // l'entrée de blacklist EXISTE déjà (c'est elle qui compte) — on log
  // l'erreur mais on renvoie quand même 201, le lien de traçabilité pourra
  // être reposé à la main.
  const { error: updateError } = await admin
    .from('support_tickets')
    .update({
      [convertedColumn]: entry.id,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', ctx.tenantId)
    .eq('id', ticketId);
  if (updateError) {
    logger.error(
      '[admin/support/convert-blacklist] ticket link update error (entry created anyway)',
      updateError
    );
  }

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'support_ticket_convert_blacklist',
      entity_type: 'support_ticket',
      entity_id: ticketId,
      tenant_id: ctx.tenantId,
      payload: {
        kind: parsed.data.kind,
        blacklist_entry_id: entry.id,
        ...logIdentifiers,
      },
    });
  }

  return res.status(201).json({
    kind: parsed.data.kind,
    entry,
    ticket_id: ticketId,
  });
}

export default withStaffRoute(handler, { permission: 'moderate_support' });
