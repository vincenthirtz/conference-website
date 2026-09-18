// GET / PATCH /api/admin/stream-alerts
//
// Les réglages de la source OBS « boîte d'alertes », édités depuis la page
// Outils d'un tournoi.
//
// PAR ESPACE, PAS PAR TOURNOI, même si l'éditeur vit dans la page d'un tournoi.
// Les alertes sont celles de LA CHAÎNE : les mêmes subs, les mêmes dons, quel
// que soit le tournoi en cours. Les ranger sous un tournoi obligerait à
// reconfigurer la boîte à chaque édition, et laisserait la précédente
// configuration pourrir en base.
//
// UNE ÉCRITURE PARTIELLE, JAMAIS UN REMPLACEMENT. Le PATCH n'applique que les
// champs reçus : deux membres du staff peuvent régler la boîte en même temps
// pendant une préparation de direct sans s'écraser l'un l'autre.
//
// `NULL` VEUT DIRE « GARDE LE DÉFAUT DU CODE », pas « vide ». Effacer une
// phrase dans l'éditeur rétablit donc la formulation par défaut au lieu de
// laisser une alerte muette à l'antenne.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import type { AuthenticatedStaffContext } from '@/types/staff';
import {
  ALERT_KINDS,
  ALERT_DURATION_MAX_MS,
  ALERT_DURATION_MIN_MS,
} from '@/utils/overlay/alertBox';

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Le son est servi par le site ou par un hôte https. On refuse `javascript:`,
 * `data:` et le reste : cette valeur finit dans l'attribut `src` d'un lecteur
 * audio, sur une page qui tourne en régie.
 */
const soundUrl = z
  .string()
  .max(500)
  .refine((v) => v === '' || v.startsWith('/') || v.startsWith('https://'), {
    message: 'URL de son invalide (chemin du site ou https://).',
  });

const SettingsSchema = z
  .object({
    enabled: z.boolean(),
    durationMs: z
      .number()
      .int()
      .min(ALERT_DURATION_MIN_MS)
      .max(ALERT_DURATION_MAX_MS)
      .nullable(),
    soundUrl: soundUrl.nullable(),
    soundVolume: z.number().int().min(0).max(100),
    accentColor: z.string().regex(HEX).nullable(),
  })
  .partial();

const RuleSchema = z.object({
  kind: z.enum(ALERT_KINDS),
  enabled: z.boolean().optional(),
  message: z.string().max(120).nullable().optional(),
  minAmount: z.number().int().min(0).max(1_000_000).nullable().optional(),
});

const PatchSchema = z.object({
  settings: SettingsSchema.optional(),
  rules: z.array(RuleSchema).max(ALERT_KINDS.length).optional(),
});

/** `''` saisi dans l'éditeur = « reviens au défaut », donc `null` en base. */
function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
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
      { max: 60, windowMs: 60_000 },
      'admin-stream-alerts'
    )
  ) {
    return;
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const tenantId = ctx.tenantId;

  if (req.method === 'GET') {
    const [settingsRes, rulesRes] = await Promise.all([
      supabaseAdmin
        .from('stream_alert_settings')
        .select('enabled, duration_ms, sound_url, sound_volume, accent_color')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from('stream_alert_rules')
        .select('kind, enabled, message, min_amount')
        .eq('tenant_id', tenantId),
    ]);

    if (settingsRes.error || rulesRes.error) {
      logger.error(
        '[admin/stream-alerts] read error',
        settingsRes.error ?? rulesRes.error
      );
      return res.status(500).json({ error: 'Lecture impossible.' });
    }

    return res.status(200).json({
      settings: settingsRes.data ?? null,
      rules: rulesRes.data ?? [],
    });
  }

  if (req.method === 'PATCH') return patch(req, res, ctx);

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}

/** L'écriture, séparée pour que les méthodes acceptées se lisent d'un coup. */
async function patch(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }
  const tenantId = ctx.tenantId;
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Réglages invalides.',
      details: parsed.error.issues.map((i) => i.message),
    });
  }

  const { settings, rules } = parsed.data;

  if (settings) {
    // Seuls les champs REÇUS sont écrits : un éditeur qui n'envoie que le
    // volume ne doit pas remettre la durée à sa valeur par défaut.
    const row: Record<string, unknown> = {
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
      updated_by: ctx.user.id,
    };
    if (settings.enabled !== undefined) row.enabled = settings.enabled;
    if (settings.durationMs !== undefined)
      row.duration_ms = settings.durationMs;
    if (settings.soundUrl !== undefined) {
      row.sound_url = emptyToNull(settings.soundUrl);
    }
    if (settings.soundVolume !== undefined) {
      row.sound_volume = settings.soundVolume;
    }
    if (settings.accentColor !== undefined) {
      row.accent_color = emptyToNull(settings.accentColor);
    }

    const { error } = await supabaseAdmin
      .from('stream_alert_settings')
      .upsert(row, { onConflict: 'tenant_id' });
    if (error) {
      logger.error('[admin/stream-alerts] settings write error', error);
      return res.status(500).json({ error: 'Enregistrement impossible.' });
    }
  }

  if (rules?.length) {
    const rows = rules.map((rule) => ({
      tenant_id: tenantId,
      kind: rule.kind,
      enabled: rule.enabled ?? true,
      message: emptyToNull(rule.message ?? null),
      min_amount: rule.minAmount ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin
      .from('stream_alert_rules')
      .upsert(rows, { onConflict: 'tenant_id,kind' });
    if (error) {
      logger.error('[admin/stream-alerts] rules write error', error);
      return res.status(500).json({ error: 'Enregistrement impossible.' });
    }
  }

  return res.status(200).json({ ok: true });
}

export default withStaffRoute(handler, { permission: 'manage_broadcast' });
