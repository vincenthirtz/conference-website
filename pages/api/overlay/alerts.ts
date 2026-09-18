// GET (PUBLIC) /api/overlay/alerts
//
// Ce que la source OBS « boîte d'alertes » (`/overlay/alertes`) lit : les
// événements Twitch reçus par webhook, les dons HelloAsso, et la configuration
// que la régie a posée depuis la page Outils — le tout en UN appel.
//
// UN SEUL APPEL, ET C'EST VOULU. La source poll toutes les 5 s pendant six
// heures ; trois requêtes au lieu d'une, c'est trois fois plus d'occasions
// qu'une d'elles échoue et laisse l'écran dans un état incohérent (des alertes
// sans leurs règles annonceraient ce que la régie a éteint).
//
// LA CONFIGURATION VOYAGE AVEC LES ALERTES, pour qu'un changement de réglage
// s'applique EN MOINS DE CINQ SECONDES sans toucher à OBS. C'est la raison
// d'être de la table de réglages : pendant un direct, on ne recolle pas une URL.
//
// FENÊTRE COURTE, PAS D'HISTORIQUE. On ne rend que les dernières minutes : la
// source ne rattrape jamais le passé (cf. `ingestAlerts`), donc lui servir plus
// serait du trafic pur. Même posture que `/api/overlay/donations`, avec une
// fenêtre plus serrée — une alerte, ça se périme vite.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { resolveEmbedTenantId } from '@/utils/embed';
import { readTenantBranding } from '@/utils/tenant';
import { capabilityDenial } from '@/utils/billing/tenantCapabilityGate';
import {
  resolveAlertFrame,
  resolveAlertSoundUrl,
  type AlertFrameKind,
} from '@/utils/overlay/alertMedia';
import {
  ALERT_KINDS,
  clampAlertDurationMs,
  clampVolume,
  isAlertKind,
  mergeAlertSources,
  type AlertKind,
  type StreamAlert,
} from '@/utils/overlay/alertBox';

/**
 * Fenêtre de lecture. Plus courte que celle des dons (24 h) : une alerte plus
 * vieille que ça ne sera jamais annoncée de toute façon (ALERT_MAX_AGE_MS vaut
 * 5 min côté source), la marge sert seulement à absorber une coupure réseau.
 */
const ALERTS_WINDOW_MS = 15 * 60 * 1000;
/** Une rafale de raid en produit beaucoup ; la source les joue une à une. */
const ALERTS_LIMIT = 50;

export type OverlayAlertSettings = {
  enabled: boolean;
  durationMs: number;
  /** Résolu ici : fichier déposé, sinon URL externe, sinon muet. */
  soundUrl: string | null;
  soundVolume: number;
  accentColor: string | null;
  /**
   * Habillage déposé par la régie. `null` = celui du CODE (le nœud animé), pas
   * « aucun » — la source sait quoi faire de ce `null`.
   */
  frameUrl: string | null;
  frameKind: AlertFrameKind | null;
};

export type OverlayAlertRule = {
  kind: AlertKind;
  enabled: boolean;
  message: string | null;
  minAmount: number | null;
};

export type OverlayAlertsResponse = {
  alerts: StreamAlert[];
  settings: OverlayAlertSettings;
  rules: OverlayAlertRule[];
  branding: {
    name: string | null;
    logoUrl: string | null;
    accent: string | null;
  } | null;
  /** L'horloge du SERVEUR : celle du poste de régie peut être fausse. */
  serverTime: string;
};

/** Les réglages du code, quand l'espace n'a jamais ouvert l'éditeur. */
function defaultSettings(): OverlayAlertSettings {
  return {
    enabled: true,
    durationMs: clampAlertDurationMs(null),
    soundUrl: null,
    soundVolume: clampVolume(null),
    accentColor: null,
    frameUrl: null,
    frameKind: null,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (
    applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'overlay-alerts')
  ) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  try {
    const tenantId = await resolveEmbedTenantId(req.query);
    const denial = await capabilityDenial(
      tenantId,
      'matchOverlays',
      'Les sources de stream font partie de l’offre Régie.'
    );
    if (denial) return res.status(402).json(denial);

    const nowMs = Date.now();
    const sinceIso = new Date(nowMs - ALERTS_WINDOW_MS).toISOString();

    const [eventsRes, donationsRes, settingsRes, rulesRes, branding] =
      await Promise.all([
        supabaseAdmin
          .from('stream_alert_events')
          .select('id, kind, actor_name, amount, tier, created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(ALERTS_LIMIT),
        supabaseAdmin
          .from('helloasso_donations')
          .select('id, amount_cents, created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(ALERTS_LIMIT),
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
        readTenantBranding(tenantId),
      ]);

    if (eventsRes.error || donationsRes.error) {
      logger.error(
        '[overlay/alerts] read error',
        eventsRes.error ?? donationsRes.error
      );
      return res.status(500).json({ error: 'Lecture impossible.' });
    }

    const alerts = mergeAlertSources(
      (eventsRes.data ?? []) as never[],
      (donationsRes.data ?? []) as never[]
    ).slice(0, ALERTS_LIMIT);

    // Une table de réglages illisible ne doit PAS éteindre la boîte : on
    // retombe sur les défauts du code et on continue d'annoncer. Un direct qui
    // perd ses alertes parce qu'une table de configuration a hoqueté serait un
    // mauvais échange.
    const settingsRow = settingsRes.error ? null : settingsRes.data;
    if (settingsRes.error) {
      logger.error('[overlay/alerts] settings error', settingsRes.error);
    }
    let settings: OverlayAlertSettings;
    if (settingsRow) {
      const row = settingsRow as Record<string, unknown>;
      const frame = resolveAlertFrame(row);
      settings = {
        enabled: row.enabled !== false,
        durationMs: clampAlertDurationMs(
          (row.duration_ms as number | null) ?? null
        ),
        // Fichier déposé d'abord, URL externe ensuite : cf. `alertMedia`.
        soundUrl: resolveAlertSoundUrl(row),
        soundVolume: clampVolume((row.sound_volume as number | null) ?? null),
        accentColor: (row.accent_color as string | null) || null,
        frameUrl: frame.url,
        frameKind: frame.kind,
      };
    } else {
      settings = defaultSettings();
    }

    const rules: OverlayAlertRule[] = [];
    for (const raw of (rulesRes.error ? [] : (rulesRes.data ?? [])) as Array<{
      kind?: unknown;
      enabled?: unknown;
      message?: unknown;
      min_amount?: unknown;
    }>) {
      // Un type inconnu en base (ajouté à la main) ne doit pas se glisser dans
      // le contrat : la source ne saurait pas le rendre.
      if (!isAlertKind(raw.kind)) continue;
      rules.push({
        kind: raw.kind,
        enabled: raw.enabled !== false,
        message: typeof raw.message === 'string' ? raw.message : null,
        minAmount: typeof raw.min_amount === 'number' ? raw.min_amount : null,
      });
    }
    if (rulesRes.error) {
      logger.error('[overlay/alerts] rules error', rulesRes.error);
    }

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=5, stale-while-revalidate=15'
    );
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(200).json({
      // Coupe-circuit d'antenne : une boîte éteinte ne sert AUCUNE alerte,
      // plutôt que d'en servir que la source filtrerait. Ce qui ne part pas sur
      // le réseau ne peut pas s'afficher par accident.
      alerts: settings.enabled ? alerts : [],
      settings,
      rules,
      branding: branding
        ? {
            name: branding.name ?? null,
            logoUrl: branding.logoUrl ?? null,
            accent: branding.accentColor ?? branding.primaryColor ?? null,
          }
        : null,
      serverTime: new Date(nowMs).toISOString(),
    } satisfies OverlayAlertsResponse);
  } catch (err) {
    logger.error('[overlay/alerts] unexpected', err);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
}

/** Réexporté pour l'éditeur admin, qui propose les mêmes types dans l'ordre. */
export { ALERT_KINDS };
