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

import crypto from 'node:crypto';
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
import {
  ALERT_MEDIA_BUCKET,
  alertMediaPath,
  resolveAlertFrame,
  resolveAlertSoundUrl,
} from '@/utils/overlay/alertMedia';
import {
  decodeMediaPayload,
  maxBytesForMime,
} from '@/utils/uploads/mediaBytes';
import {
  decodeAudioPayload,
  AUDIO_MAX_BYTES,
} from '@/utils/uploads/audioBytes';

/**
 * Le corps porte des fichiers en base64, et Next plafonne à 1 Mo par défaut.
 *
 * 12 Mo, parce que le base64 GONFLE d'un tiers : une vidéo d'habillage de 8 Mio
 * (le plafond de `mediaBytes`) pèse ~10,7 Mio une fois encodée. Sans cette
 * ligne, un habillage parfaitement valide se ferait refuser en 413 par le
 * framework, AVANT d'atteindre la validation qui, elle, l'acceptait — et le
 * message d'erreur ne parlerait pas du bon plafond.
 */
export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

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

/**
 * Un fichier déposé, en base64. `null` est un RETRAIT explicite ; la clé
 * absente veut dire « n'y touche pas » — trois états, parce qu'un éditeur qui
 * n'envoie pas de fichier ne doit pas effacer celui d'hier.
 */
const UploadSchema = z
  .object({ data: z.string().min(1), mimeType: z.string().min(1) })
  .nullable();

const PatchSchema = z.object({
  settings: SettingsSchema.optional(),
  rules: z.array(RuleSchema).max(ALERT_KINDS.length).optional(),
  /** L'habillage : image ou vidéo. Remplace le nœud du code. */
  frame: UploadSchema.optional(),
  /** Le son d'alerte. */
  sound: UploadSchema.optional(),
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
        .select(
          'enabled, duration_ms, sound_url, sound_volume, accent_color, frame_path, frame_kind, sound_path'
        )
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

    const row = settingsRes.data as Record<string, unknown> | null;
    const frame = resolveAlertFrame(row);
    return res.status(200).json({
      settings: row,
      rules: rulesRes.data ?? [],
      // Les chemins de bucket ne s'affichent pas : l'éditeur a besoin d'URLs
      // servables pour prévisualiser ce qui est déjà en place.
      media: {
        frameUrl: frame.url,
        frameKind: frame.kind,
        soundUrl: resolveAlertSoundUrl(row),
      },
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

  const { settings, rules, frame, sound } = parsed.data;

  // Ce qui devra être écrit dans la ligne de réglages, en plus des champs
  // simples : les chemins des fichiers déposés.
  const mediaRow: Record<string, unknown> = {};
  // Les anciens fichiers, supprimés APRÈS que les nouveaux sont référencés.
  const toRemove: string[] = [];

  if (frame !== undefined || sound !== undefined) {
    const { data: previous } = await supabaseAdmin
      .from('stream_alert_settings')
      .select('frame_path, sound_path')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const prev = (previous ?? {}) as {
      frame_path?: string | null;
      sound_path?: string | null;
    };

    if (frame !== undefined) {
      if (frame === null) {
        // Retrait explicite : on retombe sur l'habillage du CODE (le nœud),
        // pas sur rien.
        mediaRow.frame_path = null;
        mediaRow.frame_kind = null;
        if (prev.frame_path) toRemove.push(prev.frame_path);
      } else {
        const decoded = decodeMediaPayload(frame.data, frame.mimeType);
        if (!decoded.ok) {
          return res.status(400).json({
            error: 'Habillage refusé.',
            code: decoded.code,
            maxBytes: maxBytesForMime(frame.mimeType),
          });
        }
        const path = alertMediaPath(
          tenantId,
          crypto.randomBytes(8).toString('hex'),
          decoded.ext
        );
        // `upsert: false` : un chemin par dépôt, jamais réécrit — on n'écrase
        // pas silencieusement un fichier encore référencé ailleurs.
        const { error } = await supabaseAdmin.storage
          .from(ALERT_MEDIA_BUCKET)
          .upload(path, decoded.buffer, {
            contentType: frame.mimeType,
            upsert: false,
          });
        if (error) {
          logger.error(
            '[admin/stream-alerts] envoi habillage: %s',
            error.message
          );
          return res.status(500).json({ error: 'Envoi impossible.' });
        }
        mediaRow.frame_path = path;
        mediaRow.frame_kind = decoded.kind;
        if (prev.frame_path) toRemove.push(prev.frame_path);
      }
    }

    if (sound !== undefined) {
      if (sound === null) {
        mediaRow.sound_path = null;
        if (prev.sound_path) toRemove.push(prev.sound_path);
      } else {
        const decoded = decodeAudioPayload(sound.data, sound.mimeType);
        if (!decoded.ok) {
          return res.status(400).json({
            error: 'Son refusé.',
            code: decoded.code,
            maxBytes: AUDIO_MAX_BYTES,
          });
        }
        const path = alertMediaPath(
          tenantId,
          crypto.randomBytes(8).toString('hex'),
          decoded.ext
        );
        const { error } = await supabaseAdmin.storage
          .from(ALERT_MEDIA_BUCKET)
          .upload(path, decoded.buffer, {
            contentType: sound.mimeType,
            upsert: false,
          });
        if (error) {
          logger.error('[admin/stream-alerts] envoi son: %s', error.message);
          return res.status(500).json({ error: 'Envoi impossible.' });
        }
        mediaRow.sound_path = path;
        if (prev.sound_path) toRemove.push(prev.sound_path);
      }
    }
  }

  if (settings || Object.keys(mediaRow).length > 0) {
    // Seuls les champs REÇUS sont écrits : un éditeur qui n'envoie que le
    // volume ne doit pas remettre la durée à sa valeur par défaut.
    const row: Record<string, unknown> = {
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
      updated_by: ctx.user.id,
      ...mediaRow,
    };
    if (settings?.enabled !== undefined) row.enabled = settings.enabled;
    if (settings?.durationMs !== undefined)
      row.duration_ms = settings?.durationMs ?? null;
    if (settings?.soundUrl !== undefined) {
      row.sound_url = emptyToNull(settings?.soundUrl ?? null);
    }
    if (settings?.soundVolume !== undefined) {
      row.sound_volume = settings?.soundVolume;
    }
    if (settings?.accentColor !== undefined) {
      row.accent_color = emptyToNull(settings?.accentColor ?? null);
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

  // Les anciens fichiers partent APRÈS que les nouveaux sont référencés. Un
  // échec ici ne remet pas le réglage en cause : c'est un fichier orphelin dans
  // un bucket, pas une panne visible à l'antenne.
  if (toRemove.length > 0) {
    const { error } = await supabaseAdmin.storage
      .from(ALERT_MEDIA_BUCKET)
      .remove(toRemove);
    if (error) {
      logger.warn(
        '[admin/stream-alerts] anciens médias non supprimés: %s',
        error.message
      );
    }
  }

  return res.status(200).json({ ok: true });
}

export default withStaffRoute(handler, { permission: 'manage_broadcast' });
