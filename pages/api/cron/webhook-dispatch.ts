// pages/api/cron/webhook-dispatch.ts
//
// Dispatcher des WEBHOOKS SORTANTS tiers. Triggered chaque minute par la Netlify
// Scheduled Function `webhook-dispatcher-cron`.
//
// Pattern (identique à web-push-dispatch / email-digest) :
//   - Lit `bot_event_outbox` en READ-ONLY (source de vérité des events). On ne
//     TOUCHE JAMAIS `bot_event_outbox.status` (propriété du bot Discord).
//   - Suit son propre état dans `webhook_deliveries` : UNIQUE(subscription_id,
//     outbox_event_id) => idempotence si le cron se chevauche / re-exécute.
//   - Ne fan-out que les events de la liste blanche WEBHOOK_EVENT_TYPES, filtrés
//     par abonnement (event_types, '*' = tous).
//
// Retry : chaque (event, subscription) est re-tentée à chaque tick tant que
// `attempts < WEBHOOK_MAX_ATTEMPTS` (le cron 1-min agit comme backoff). Un
// endpoint qui échoue `WEBHOOK_MAX_CONSECUTIVE_FAILURES` fois d'affilée (across
// events) est AUTO-DÉSACTIVÉ (enabled=false). Un succès remet le compteur à 0.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { loadCandidateEvents } from '@/utils/notificationAudience';
import {
  WEBHOOK_EVENT_TYPES,
  eventMatchesSubscription,
  buildWebhookHeaders,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_MAX_CONSECUTIVE_FAILURES,
} from '@/utils/webhooks';

const DEFAULT_BATCH_LIMIT = 200;
const DEFAULT_WINDOW_HOURS = 24;
const SOFT_TIME_BUDGET_MS = 8_000;
const DELIVERY_TIMEOUT_MS = 8_000;

let _inFlight = false;

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/webhook] CRON_SECRET not configured — refusing');
    return false;
  }
  if (req.headers.authorization === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  return typeof q === 'string' && q === secret;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

type SubRow = {
  id: string;
  tenant_id: string;
  url: string;
  secret: string;
  event_types: string[];
  consecutive_failures: number;
};

type DeliveryRow = {
  outbox_event_id: string;
  subscription_id: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
};

type Counters = {
  events_examined: number;
  delivered: number;
  failed: number;
  skipped: number;
  subs_disabled: number;
  duration_ms: number;
  truncated: boolean;
};

async function loadEnabledSubscriptions(
  tenantIds: string[]
): Promise<SubRow[]> {
  if (tenantIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from('webhook_subscriptions')
    .select('id, tenant_id, url, secret, event_types, consecutive_failures')
    .in('tenant_id', tenantIds)
    .eq('enabled', true);
  if (error) {
    logger.error('[cron/webhook] subs load error', error);
    return [];
  }
  return (data ?? []) as SubRow[];
}

async function loadExistingDeliveries(
  eventIds: string[]
): Promise<Map<string, Map<string, DeliveryRow>>> {
  if (eventIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from('webhook_deliveries')
    .select('outbox_event_id, subscription_id, status, attempts')
    .in('outbox_event_id', eventIds);
  if (error) {
    logger.error('[cron/webhook] deliveries load error', error);
    return new Map();
  }
  const out = new Map<string, Map<string, DeliveryRow>>();
  for (const row of (data ?? []) as DeliveryRow[]) {
    let bucket = out.get(row.outbox_event_id);
    if (!bucket) {
      bucket = new Map();
      out.set(row.outbox_event_id, bucket);
    }
    bucket.set(row.subscription_id, row);
  }
  return out;
}

/** Insert or update d'un row webhook_deliveries (23505 → update, comme web-push). */
async function writeDelivery(
  existing: DeliveryRow | undefined,
  row: {
    tenant_id: string;
    subscription_id: string;
    outbox_event_id: string;
    event_name: string;
    status: 'delivered' | 'failed';
    attempts: number;
    response_status: number | null;
    last_error: string | null;
    delivered_at: string | null;
  }
): Promise<void> {
  const nowIso = new Date().toISOString();
  const patch = {
    status: row.status,
    attempts: row.attempts,
    response_status: row.response_status,
    last_error: row.last_error,
    delivered_at: row.delivered_at,
    updated_at: nowIso,
  };
  if (existing) {
    const { error } = await supabaseAdmin
      .from('webhook_deliveries')
      .update(patch)
      .eq('subscription_id', row.subscription_id)
      .eq('outbox_event_id', row.outbox_event_id);
    if (error) logger.error('[cron/webhook] delivery update error', error);
    return;
  }
  const { error } = await supabaseAdmin.from('webhook_deliveries').insert({
    tenant_id: row.tenant_id,
    subscription_id: row.subscription_id,
    outbox_event_id: row.outbox_event_id,
    event_name: row.event_name,
    ...patch,
  });
  if (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === '23505') {
      // Race : un autre tick a inséré entre notre check et l'INSERT → update.
      const { error: retryErr } = await supabaseAdmin
        .from('webhook_deliveries')
        .update(patch)
        .eq('subscription_id', row.subscription_id)
        .eq('outbox_event_id', row.outbox_event_id);
      if (retryErr)
        logger.error('[cron/webhook] delivery retry-update error', retryErr);
      return;
    }
    logger.error('[cron/webhook] delivery insert error', error);
  }
}

async function postWebhook(
  url: string,
  body: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    return {
      ok: res.ok,
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runWebhookDispatcher(): Promise<Counters> {
  const startedAt = Date.now();
  const counters: Counters = {
    events_examined: 0,
    delivered: 0,
    failed: 0,
    skipped: 0,
    subs_disabled: 0,
    duration_ms: 0,
    truncated: false,
  };

  const batchLimit = envNumber('WEBHOOK_BATCH_LIMIT', DEFAULT_BATCH_LIMIT);
  const windowHours = envNumber('WEBHOOK_WINDOW_HOURS', DEFAULT_WINDOW_HOURS);

  const events = await loadCandidateEvents(
    WEBHOOK_EVENT_TYPES as readonly string[],
    windowHours,
    batchLimit,
    '[cron/webhook]'
  );
  counters.events_examined = events.length;
  if (events.length === 0) {
    counters.duration_ms = Date.now() - startedAt;
    return counters;
  }

  const tenantIds = [
    ...new Set(
      events.map((e) => e.tenant_id).filter((v): v is string => Boolean(v))
    ),
  ];
  const subs = await loadEnabledSubscriptions(tenantIds);
  if (subs.length === 0) {
    counters.duration_ms = Date.now() - startedAt;
    return counters;
  }
  const subsByTenant = new Map<string, SubRow[]>();
  for (const s of subs) {
    const list = subsByTenant.get(s.tenant_id) ?? [];
    list.push(s);
    subsByTenant.set(s.tenant_id, list);
  }

  const existing = await loadExistingDeliveries(events.map((e) => e.event_id));

  // Accumule les résultats par abonnement pour l'auto-désactivation (1 update
  // par sub par tick au lieu d'un update par event).
  const subOutcome = new Map<
    string,
    {
      sub: SubRow;
      anySuccess: boolean;
      fails: number;
      lastError: string | null;
    }
  >();

  for (const event of events) {
    if (Date.now() - startedAt > SOFT_TIME_BUDGET_MS) {
      counters.truncated = true;
      break;
    }
    if (!event.tenant_id) continue;
    const matching = (subsByTenant.get(event.tenant_id) ?? []).filter((s) =>
      eventMatchesSubscription(event.event_name, s.event_types)
    );
    if (matching.length === 0) continue;

    // Le payload outbox EST déjà l'enveloppe {id,event,tenantId,timestamp,data}.
    const body = JSON.stringify(event.payload ?? {});

    for (const sub of matching) {
      const ex = existing.get(event.event_id)?.get(sub.id);
      if (ex?.status === 'delivered') {
        counters.skipped += 1;
        continue;
      }
      if (ex?.status === 'failed' && ex.attempts >= WEBHOOK_MAX_ATTEMPTS) {
        counters.skipped += 1;
        continue;
      }

      const headers = buildWebhookHeaders({
        secret: sub.secret,
        rawBody: body,
        eventName: event.event_name,
        eventId: event.event_id,
        tenantId: event.tenant_id,
      });
      const result = await postWebhook(sub.url, body, headers);
      const attempts = (ex?.attempts ?? 0) + 1;

      await writeDelivery(ex, {
        tenant_id: event.tenant_id,
        subscription_id: sub.id,
        outbox_event_id: event.event_id,
        event_name: event.event_name,
        status: result.ok ? 'delivered' : 'failed',
        attempts,
        response_status: result.status,
        last_error: result.error,
        delivered_at: result.ok ? new Date().toISOString() : null,
      });

      const o = subOutcome.get(sub.id) ?? {
        sub,
        anySuccess: false,
        fails: 0,
        lastError: null,
      };
      if (result.ok) {
        o.anySuccess = true;
        counters.delivered += 1;
      } else {
        o.fails += 1;
        o.lastError = result.error;
        counters.failed += 1;
      }
      subOutcome.set(sub.id, o);
    }
  }

  // Applique reset / auto-désactivation par abonnement (1 update/sub).
  const nowIso = new Date().toISOString();
  for (const [subId, o] of subOutcome) {
    if (o.anySuccess) {
      await supabaseAdmin
        .from('webhook_subscriptions')
        .update({
          consecutive_failures: 0,
          last_delivery_at: nowIso,
          last_error: null,
        })
        .eq('id', subId);
      continue;
    }
    if (o.fails > 0) {
      const newCount = o.sub.consecutive_failures + o.fails;
      const disable = newCount >= WEBHOOK_MAX_CONSECUTIVE_FAILURES;
      await supabaseAdmin
        .from('webhook_subscriptions')
        .update({
          consecutive_failures: newCount,
          last_error: o.lastError,
          ...(disable ? { enabled: false, disabled_at: nowIso } : {}),
        })
        .eq('id', subId);
      if (disable) {
        counters.subs_disabled += 1;
        logger.warn(
          '[cron/webhook] auto-disabled subscription %s after %d consecutive failures',
          subId,
          newCount
        );
      }
    }
  }

  counters.duration_ms = Date.now() - startedAt;
  return counters;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }
  if (_inFlight) {
    logger.warn('[cron/webhook] previous tick still in flight — skipping');
    return res.status(200).json({ success: true, skipped: 'in_flight' });
  }
  _inFlight = true;
  try {
    const counters = await runWebhookDispatcher();
    logger.info(
      '[cron/webhook] tick events=%d delivered=%d failed=%d skipped=%d disabled=%d duration_ms=%d truncated=%s',
      counters.events_examined,
      counters.delivered,
      counters.failed,
      counters.skipped,
      counters.subs_disabled,
      counters.duration_ms,
      counters.truncated ? 'yes' : 'no'
    );
    return res.status(200).json({ success: true, ...counters });
  } catch (err) {
    logger.error('[cron/webhook] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    _inFlight = false;
  }
}
