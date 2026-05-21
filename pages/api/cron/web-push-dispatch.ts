// pages/api/cron/web-push-dispatch.ts
//
// Dispatch des notifications Web Push pour la PWA /admin à partir des events
// déjà persistés dans `bot_event_outbox`. Triggered chaque minute par la
// Netlify Scheduled Function `web-push-dispatcher-cron`.
//
// Pourquoi on lit l'outbox (et pas une queue dédiée) :
//   - C'est déjà la source de vérité des events sortants (bot Discord +
//     web-push tirent dessus). Pas de duplication producteurs.
//   - On ne TOUCHE PAS à `bot_event_outbox.status` (qui appartient au consumer
//     Discord bot). Notre tracking se fait dans `web_push_deliveries` :
//     UNIQUE(outbox_event_id, subscription_id) garantit l'idempotence si la
//     scheduled function se re-exécute ou se chevauche.
//
// Recipients :
//   - Tous les staff du tenant de l'event, via `tenant_staff` joint à `staff`
//     pour récupérer `auth_user_id` → liaison avec `push_subscriptions.user_id`.
//   - Les staff `is_pole_admin = true` reçoivent les events de TOUS les
//     tenants (cross-tenant), pour aligner sur les helpers existants
//     (`canAccessTenant` / `listAccessibleTenants`).
//   - Opt-out : si `notification_prefs(user_id, event_type, enabled=false)`
//     existe pour ce user et cet event_type, on SKIP. Sinon (row absente ou
//     enabled=true), on envoie (modèle opt-out par défaut).
//
// Retry policy :
//   - Erreurs transient (5xx, network, autres) : delivery passe en
//     `status='failed'` avec `attempts` incrémenté. Le tick suivant
//     re-tentera tant que `attempts < MAX_ATTEMPTS_BEFORE_GIVING_UP`. Le
//     `pending` initial est créé dès qu'on commence l'envoi pour réserver le
//     row (UNIQUE collision = un autre tick s'en occupe déjà).
//   - 410 / 404 : subscription morte → on supprime la row de
//     `push_subscriptions` (CASCADE → web_push_deliveries) et on inscrit un
//     row final `status='expired'`.
//   - Pas de backoff exponentiel intra-tick : le cron tourne déjà à 1 minute,
//     ce qui agit comme un backoff naturel. Une fois `attempts >=
//     MAX_ATTEMPTS_BEFORE_GIVING_UP`, on ne re-tente plus (status final
//     'failed').
//
// Concurrency :
//   - In-process mutex pour éviter qu'un tick lent ne chevauche le suivant
//     dans le même worker Netlify (les scheduled functions ne tournent pas en
//     parallèle d'elles-mêmes, mais une cold-start + un slow tick peuvent
//     théoriquement se croiser). Cross-instance, on s'appuie sur le UNIQUE
//     constraint de `web_push_deliveries(outbox_event_id, subscription_id)` :
//     une seconde tentative de creating la même row échoue en 23505 et on
//     l'interprète comme "un autre tick s'en charge".
//
// Time budget :
//   - 8s soft cap interne. Si on dépasse, on break la boucle d'events. Le
//     reste sera traité au prochain tick. Avec un schedule 1m, la latence
//     max d'une notification est ≤ 2 minutes (1 tick à attendre + 1 tick
//     d'envoi).

import type { NextApiRequest, NextApiResponse } from 'next';
import webpush from 'web-push';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  WEB_PUSH_EVENT_TYPES,
  renderWebPushPayload,
  type WebPushEventType,
} from '@/utils/webPushEvents';

const DEFAULT_VAPID_SUBJECT = 'mailto:hirtzvincent@gmail.com';
const DEFAULT_BATCH_LIMIT = 200;
const DEFAULT_WINDOW_HOURS = 24;
const SOFT_TIME_BUDGET_MS = 8_000;
const MAX_ATTEMPTS_BEFORE_GIVING_UP = 5;

// In-process mutex pour éviter le chevauchement de deux ticks dans le même
// Lambda Netlify. La scope est par-process : sur Netlify, chaque container
// scheduled-function tourne en série, mais on protège tout de même.
let _dispatcherInFlight = false;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/web-push] CRON_SECRET not configured — refusing');
    return false;
  }
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  if (typeof q === 'string' && q === secret) return true;
  return false;
}

/**
 * Erreur HTTP de web-push : extrait le code statut de manière défensive.
 * web-push throw un Error enrichi avec `statusCode`, `body`, `endpoint`.
 */
function extractStatusCode(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const v = (err as { statusCode?: unknown }).statusCode;
    if (typeof v === 'number') return v;
  }
  return undefined;
}

function extractErrorBody(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { body?: unknown; message?: unknown };
    if (typeof e.body === 'string') return e.body.slice(0, 500);
    if (typeof e.message === 'string') return e.message.slice(0, 500);
  }
  return String(err).slice(0, 500);
}

type OutboxRow = {
  id: number;
  event_id: string;
  event_name: string;
  tenant_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type DeliveryRow = {
  id?: string;
  outbox_event_id: string;
  subscription_id: string;
  status: 'pending' | 'delivered' | 'failed' | 'expired';
  attempts: number;
  last_error?: string | null;
};

type TickCounters = {
  processed: number;
  sent: number;
  skipped_already_delivered: number;
  skipped_max_attempts: number;
  skipped_prefs: number;
  expired_removed: number;
  failed: number;
  events_examined: number;
  duration_ms: number;
  truncated_by_time_budget: boolean;
};

/**
 * Charge les events outbox candidats au dispatch Web Push.
 * Filtre par event_name (∈ WEB_PUSH_EVENT_TYPES) et par fenêtre temporelle.
 */
async function loadCandidateEvents(
  windowHours: number,
  batchLimit: number
): Promise<OutboxRow[]> {
  const cutoffIso = new Date(
    Date.now() - windowHours * 3_600_000
  ).toISOString();
  const { data, error } = await supabaseAdmin
    .from('bot_event_outbox')
    .select('id, event_id, event_name, tenant_id, payload, created_at')
    .in('event_name', WEB_PUSH_EVENT_TYPES as readonly string[] as string[])
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(batchLimit);
  if (error) {
    logger.error('[cron/web-push] load candidates error', error);
    return [];
  }
  return (data ?? []) as OutboxRow[];
}

/**
 * Charge les rows existantes de web_push_deliveries pour un batch d'event_ids.
 * Retourne une Map<event_id, Map<subscription_id, DeliveryRow>>.
 */
async function loadExistingDeliveries(
  eventIds: string[]
): Promise<Map<string, Map<string, DeliveryRow>>> {
  if (eventIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from('web_push_deliveries')
    .select('id, outbox_event_id, subscription_id, status, attempts')
    .in('outbox_event_id', eventIds);
  if (error) {
    logger.error('[cron/web-push] load deliveries error', error);
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

/**
 * Pour un tenant donné, retourne la liste des auth_user_id staff candidats :
 *   - rows tenant_staff(tenant_id) → staff_id → staff.auth_user_id
 *   - rows staff(is_pole_admin=true) (cross-tenant)
 * Combinés et dédupliqués.
 */
async function loadStaffUserIdsForTenant(tenantId: string): Promise<string[]> {
  const userIds = new Set<string>();

  // 1. Staff scopés au tenant via tenant_staff.
  const { data: tsRows, error: tsErr } = await supabaseAdmin
    .from('tenant_staff')
    .select('staff_id')
    .eq('tenant_id', tenantId);
  if (tsErr) {
    logger.error('[cron/web-push] tenant_staff load error', tsErr);
  }
  const staffIds = ((tsRows ?? []) as Array<{ staff_id: string }>).map(
    (r) => r.staff_id
  );

  // 2. Cross-tenant pole admins.
  const { data: poleRows, error: poleErr } = await supabaseAdmin
    .from('staff')
    .select('id')
    .eq('is_pole_admin', true);
  if (poleErr) {
    logger.error('[cron/web-push] pole admins load error', poleErr);
  }
  for (const r of (poleRows ?? []) as Array<{ id: string }>) {
    if (!staffIds.includes(r.id)) staffIds.push(r.id);
  }

  if (staffIds.length === 0) return [];

  // 3. Resolve auth_user_id via la table staff (un seul query batché).
  const { data: staffRows, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('id, auth_user_id, is_active, deleted_at')
    .in('id', staffIds);
  if (staffErr) {
    logger.error('[cron/web-push] staff resolve error', staffErr);
    return [];
  }
  for (const r of (staffRows ?? []) as Array<{
    id: string;
    auth_user_id: string | null;
    is_active?: boolean | null;
    deleted_at?: string | null;
  }>) {
    // Soft-delete filtering : un staff inactif/deleted ne reçoit plus de
    // notifications (cohérent avec utils/staff.ts:getStaffByUserId).
    if (r.is_active === false || r.deleted_at) continue;
    if (r.auth_user_id) userIds.add(r.auth_user_id);
  }
  return Array.from(userIds);
}

/**
 * Pour une liste de user_ids et un event_type, retourne le sous-ensemble qui
 * a OPT-OUT explicite (row notification_prefs avec enabled=false).
 */
async function loadOptedOutUserIds(
  userIds: string[],
  eventType: string
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from('notification_prefs')
    .select('user_id, enabled')
    .in('user_id', userIds)
    .eq('event_type', eventType)
    .eq('enabled', false);
  if (error) {
    logger.error('[cron/web-push] prefs load error', error);
    return new Set();
  }
  const out = new Set<string>();
  for (const r of (data ?? []) as Array<{ user_id: string }>) {
    out.add(r.user_id);
  }
  return out;
}

/**
 * Charge toutes les push_subscriptions des user_ids éligibles.
 */
async function loadSubscriptions(
  userIds: string[]
): Promise<SubscriptionRow[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (error) {
    logger.error('[cron/web-push] subs load error', error);
    return [];
  }
  return (data ?? []) as SubscriptionRow[];
}

/**
 * INSERT ou UPDATE d'un row web_push_deliveries. Le UNIQUE
 * (outbox_event_id, subscription_id) garantit l'atomicité côté DB : si on
 * lose une race, l'INSERT échoue en 23505 et on retombe sur un UPDATE
 * ciblé par les deux IDs.
 *
 * On évite supabase-js `.upsert({ onConflict })` ici parce que la PK est
 * composite : l'API JS prend une string CSV qui ne mappe pas bien à un
 * INSERT ... ON CONFLICT (col1, col2). Le pattern manuel reste équivalent
 * en sémantique et plus lisible.
 */
async function writeDelivery(
  existing: DeliveryRow | undefined,
  row: {
    outbox_event_id: string;
    subscription_id: string;
    status: 'delivered' | 'failed' | 'expired';
    attempts: number;
    delivered_at?: string | null;
    last_error?: string | null;
  }
): Promise<void> {
  const nowIso = new Date().toISOString();
  if (existing) {
    const { error } = await supabaseAdmin
      .from('web_push_deliveries')
      .update({
        status: row.status,
        attempts: row.attempts,
        delivered_at: row.delivered_at ?? null,
        last_error: row.last_error ?? null,
        updated_at: nowIso,
      })
      .eq('outbox_event_id', row.outbox_event_id)
      .eq('subscription_id', row.subscription_id);
    if (error) {
      logger.error('[cron/web-push] delivery update error', error);
    }
    return;
  }
  const { error } = await supabaseAdmin.from('web_push_deliveries').insert({
    outbox_event_id: row.outbox_event_id,
    subscription_id: row.subscription_id,
    status: row.status,
    attempts: row.attempts,
    delivered_at: row.delivered_at ?? null,
    last_error: row.last_error ?? null,
    updated_at: nowIso,
  });
  if (error) {
    // Race : un autre tick a inséré entre notre check existence et l'INSERT.
    // Code 23505 = unique violation → on retombe sur l'UPDATE. Tout autre
    // code → log et abandon.
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === '23505') {
      const { error: retryErr } = await supabaseAdmin
        .from('web_push_deliveries')
        .update({
          status: row.status,
          attempts: row.attempts,
          delivered_at: row.delivered_at ?? null,
          last_error: row.last_error ?? null,
          updated_at: nowIso,
        })
        .eq('outbox_event_id', row.outbox_event_id)
        .eq('subscription_id', row.subscription_id);
      if (retryErr) {
        logger.error('[cron/web-push] delivery retry-update error', retryErr);
      }
      return;
    }
    logger.error('[cron/web-push] delivery insert error', error);
  }
}

/**
 * Tente d'envoyer un push pour une (event, subscription). Met à jour
 * web_push_deliveries en conséquence. Retourne un classifier pour les
 * compteurs.
 */
async function dispatchOne(params: {
  event: OutboxRow;
  subscription: SubscriptionRow;
  existing: DeliveryRow | undefined;
  payloadJson: string;
  vapidDetails: { subject: string; publicKey: string; privateKey: string };
}): Promise<
  | 'sent'
  | 'expired'
  | 'failed'
  | 'skipped_already_delivered'
  | 'skipped_max_attempts'
> {
  const { event, subscription, existing, payloadJson, vapidDetails } = params;

  if (existing?.status === 'delivered') {
    return 'skipped_already_delivered';
  }
  if (existing?.status === 'expired') {
    // La subscription a déjà été marquée morte et CASCADE devrait l'avoir
    // supprimée ; si elle est encore là, on skip pour pas re-essayer.
    return 'skipped_already_delivered';
  }
  if (
    existing?.status === 'failed' &&
    existing.attempts >= MAX_ATTEMPTS_BEFORE_GIVING_UP
  ) {
    return 'skipped_max_attempts';
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payloadJson,
      { vapidDetails }
    );
    await writeDelivery(existing, {
      outbox_event_id: event.event_id,
      subscription_id: subscription.id,
      status: 'delivered',
      attempts: (existing?.attempts ?? 0) + 1,
      delivered_at: new Date().toISOString(),
      last_error: null,
    });
    return 'sent';
  } catch (err) {
    const status = extractStatusCode(err);
    const errBody = extractErrorBody(err);
    const isExpired = status === 410 || status === 404;

    if (isExpired) {
      // Subscription morte : on note delivery=expired AVANT la suppression
      // (CASCADE FK push_subscriptions → web_push_deliveries supprimerait
      // tout sinon) et on retire le row push pour ne plus le re-traiter.
      await writeDelivery(existing, {
        outbox_event_id: event.event_id,
        subscription_id: subscription.id,
        status: 'expired',
        attempts: (existing?.attempts ?? 0) + 1,
        last_error: errBody,
      });
      const { error: delErr } = await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .eq('id', subscription.id);
      if (delErr) {
        logger.error('[cron/web-push] expired sub delete error', delErr);
      }
      return 'expired';
    }

    // Transient / 5xx : incrémente attempts. Si on dépasse le seuil, le row
    // reste 'failed' mais on ne re-tentera plus (cf. skip logic au prochain
    // tick).
    const nextAttempts = (existing?.attempts ?? 0) + 1;
    await writeDelivery(existing, {
      outbox_event_id: event.event_id,
      subscription_id: subscription.id,
      status: 'failed',
      attempts: nextAttempts,
      last_error: errBody,
    });
    if (nextAttempts >= MAX_ATTEMPTS_BEFORE_GIVING_UP) {
      logger.warn(
        '[cron/web-push] giving up after %d attempts: event=%s sub=%s status=%s',
        nextAttempts,
        event.event_id,
        subscription.id,
        status ?? 'n/a'
      );
    }
    return 'failed';
  }
}

/**
 * Run principal — orchestré par le handler ou directement par les tests.
 */
export async function runWebPushDispatcher(): Promise<TickCounters> {
  const startedAt = Date.now();
  const counters: TickCounters = {
    processed: 0,
    sent: 0,
    skipped_already_delivered: 0,
    skipped_max_attempts: 0,
    skipped_prefs: 0,
    expired_removed: 0,
    failed: 0,
    events_examined: 0,
    duration_ms: 0,
    truncated_by_time_budget: false,
  };

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_NOT_CONFIGURED');
  }
  const vapidDetails = { subject, publicKey, privateKey };

  const batchLimit = envNumber('WEB_PUSH_BATCH_LIMIT', DEFAULT_BATCH_LIMIT);
  const windowHours = envNumber('WEB_PUSH_WINDOW_HOURS', DEFAULT_WINDOW_HOURS);

  const events = await loadCandidateEvents(windowHours, batchLimit);
  counters.events_examined = events.length;
  if (events.length === 0) {
    counters.duration_ms = Date.now() - startedAt;
    return counters;
  }

  const existingByEvent = await loadExistingDeliveries(
    events.map((e) => e.event_id)
  );

  for (const event of events) {
    if (Date.now() - startedAt > SOFT_TIME_BUDGET_MS) {
      counters.truncated_by_time_budget = true;
      break;
    }
    if (!event.tenant_id) {
      // event sans tenant : on ne sait pas à qui envoyer → skip silencieux
      // (audit log côté outbox suffit).
      continue;
    }

    // Recipients du tenant.
    const userIds = await loadStaffUserIdsForTenant(event.tenant_id);
    if (userIds.length === 0) continue;

    // Filtrage opt-out.
    const optedOut = await loadOptedOutUserIds(userIds, event.event_name);
    const eligibleUserIds = userIds.filter((u) => !optedOut.has(u));
    counters.skipped_prefs += userIds.length - eligibleUserIds.length;
    if (eligibleUserIds.length === 0) continue;

    const subs = await loadSubscriptions(eligibleUserIds);
    if (subs.length === 0) continue;

    const rendered = renderWebPushPayload(
      event.event_name as WebPushEventType,
      event.payload ?? {}
    );
    const payloadJson = JSON.stringify({
      title: rendered.title,
      body: rendered.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: rendered.url, event_name: event.event_name },
      tag: event.event_id,
    });

    const existingForEvent =
      existingByEvent.get(event.event_id) ?? new Map<string, DeliveryRow>();

    // Envois parallèles sur les subs d'un même event — chaque endpoint est
    // un push service distinct (Mozilla/Google/Apple), donc pas de risque
    // d'over-pressurer un même fournisseur.
    const results = await Promise.all(
      subs.map((sub) =>
        dispatchOne({
          event,
          subscription: sub,
          existing: existingForEvent.get(sub.id),
          payloadJson,
          vapidDetails,
        })
      )
    );

    for (const r of results) {
      switch (r) {
        case 'sent':
          counters.sent += 1;
          break;
        case 'expired':
          counters.expired_removed += 1;
          break;
        case 'failed':
          counters.failed += 1;
          break;
        case 'skipped_already_delivered':
          counters.skipped_already_delivered += 1;
          break;
        case 'skipped_max_attempts':
          counters.skipped_max_attempts += 1;
          break;
      }
    }
    counters.processed += 1;
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

  if (_dispatcherInFlight) {
    logger.warn(
      '[cron/web-push] previous tick still in flight — skipping this one'
    );
    return res.status(200).json({
      success: true,
      skipped: 'in_flight',
    });
  }
  _dispatcherInFlight = true;

  try {
    const counters = await runWebPushDispatcher();
    logger.info(
      '[cron/web-push] tick done events=%d processed=%d sent=%d failed=%d ' +
        'expired=%d skipped_prefs=%d skipped_delivered=%d skipped_max=%d ' +
        'duration_ms=%d truncated=%s',
      counters.events_examined,
      counters.processed,
      counters.sent,
      counters.failed,
      counters.expired_removed,
      counters.skipped_prefs,
      counters.skipped_already_delivered,
      counters.skipped_max_attempts,
      counters.duration_ms,
      counters.truncated_by_time_budget ? 'yes' : 'no'
    );
    return res.status(200).json({ success: true, ...counters });
  } catch (err) {
    if (err instanceof Error && err.message === 'VAPID_NOT_CONFIGURED') {
      logger.error('[cron/web-push] VAPID keys missing in env');
      return res.status(500).json({
        error: 'Web Push n’est pas configuré sur ce serveur.',
        code: 'VAPID_NOT_CONFIGURED',
      });
    }
    logger.error('[cron/web-push] unexpected error:', err);
    return res
      .status(500)
      .json({ error: 'Internal server error', detail: String(err) });
  } finally {
    _dispatcherInFlight = false;
  }
}
