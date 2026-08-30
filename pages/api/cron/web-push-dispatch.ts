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
  shouldPushForEvent,
  playerUrlForEvent,
  type WebPushEventType,
} from '@/utils/webPushEvents';
import {
  loadCandidateEvents as loadCandidateEventsShared,
  loadStaffUserIdsForTenant,
  loadPlayerUserIdsForMatch,
  loadTeamMemberUserIds,
  loadCasterUserIdsForMatch,
  loadCaptainManagerUserIdsForTeams,
  loadOptedOutUserIds,
  type OutboxRow,
} from '@/utils/notificationAudience';

const DEFAULT_VAPID_SUBJECT = 'mailto:hirtzvincent@gmail.com';
const DEFAULT_BATCH_LIMIT = 200;
/**
 * Fenêtre d'événements rebalayée à chaque tick.
 *
 * Elle valait 24 h. Le cron tourne CHAQUE MINUTE : il reprenait donc, 1 440
 * fois par jour, tous les événements de la journée écoulée — résolution
 * d'audience (`tenant_staff` + `staff`), abonnements et préférences compris —
 * pour des notifications livrées depuis des heures. C'est ce qui tenait le
 * plancher de trafic base observé en production : ~360 lectures `staff`/h et
 * ~195 `push_subscriptions`/h alors qu'il n'y avait rien à envoyer.
 *
 * Une heure suffit largement comme filet de reprise : une livraison en échec
 * est retentée à chaque tick jusqu'à MAX_ATTEMPTS_BEFORE_GIVING_UP, soit cinq
 * minutes au pire. On garde donc un ordre de grandeur de marge, sans repayer la
 * journée entière chaque minute.
 *
 * Réglable par `WEB_PUSH_WINDOW_HOURS` si un incident demande de remonter plus
 * loin en arrière.
 */
const DEFAULT_WINDOW_HOURS = 1;
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
 * Charge les events outbox candidats au dispatch Web Push (wrapper sur le
 * helper partagé, avec la liste blanche WEB_PUSH_EVENT_TYPES).
 */
function loadCandidateEvents(
  windowHours: number,
  batchLimit: number
): Promise<OutboxRow[]> {
  return loadCandidateEventsShared(
    WEB_PUSH_EVENT_TYPES as readonly string[],
    windowHours,
    batchLimit,
    '[cron/web-push]'
  );
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

// Audience resolvers (staff / player / caster) et filtre opt-out push sont
// désormais partagés via utils/notificationAudience.ts (réutilisés par le
// dispatcher email). Le comportement push reste strictement identique.

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
 * Calcule le nombre d'events Web Push non-ack'd pour chaque user. Utilisé
 * pour alimenter `data.unread_count` du payload Web Push (Badge API V2).
 *
 * Sémantique :
 *   - Compte DISTINCT outbox_event_id (un event broadcasté à 3 devices ne
 *     compte que 1, sinon le badge gonflerait avec le nombre de devices).
 *   - Filtre status='delivered' AND acked_at IS NULL → l'index partiel
 *     `idx_web_push_deliveries_unacked` accélère.
 *   - Ne compte PAS l'event en cours d'envoi (qui n'est pas encore en DB) :
 *     le SW additionne lui-même +1 quand il reçoit le push.
 */
async function loadUnreadCountByUser(
  userIds: string[]
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();

  const { data: subs, error: subsErr } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, user_id')
    .in('user_id', userIds);
  if (subsErr || !subs || subs.length === 0) {
    if (subsErr) {
      logger.error('[cron/web-push] unread-count subs error', subsErr);
    }
    return new Map();
  }
  const subToUser = new Map<string, string>();
  for (const s of subs) subToUser.set(s.id, s.user_id);

  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from('web_push_deliveries')
    .select('outbox_event_id, subscription_id')
    .in('subscription_id', Array.from(subToUser.keys()))
    .eq('status', 'delivered')
    .is('acked_at', null);
  if (rowsErr || !rows) {
    if (rowsErr) {
      logger.error('[cron/web-push] unread-count rows error', rowsErr);
    }
    return new Map();
  }

  // Group by user → set of distinct event_ids → count.
  const perUser = new Map<string, Set<string>>();
  for (const row of rows) {
    const userId = subToUser.get(row.subscription_id as string);
    if (!userId) continue;
    if (!perUser.has(userId)) perUser.set(userId, new Set());
    perUser.get(userId)!.add(row.outbox_event_id as string);
  }
  const result = new Map<string, number>();
  for (const [userId, set] of perUser) result.set(userId, set.size);
  return result;
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

  // Compteur d'events non-ack'd par user, alimenté lazy au fil des events
  // (chaque event a une audience différente : staff du tenant, casters d'un
  // match, etc.). Mutable : incrémenté en mémoire après chaque dispatch
  // réussi pour que les events suivants du même tick voient un count à jour.
  const unreadCountByUser = new Map<string, number>();

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

    // Filtre amont par event_name : certains events (event_segment.transitioned
    // notamment) ne déclenchent un push que pour un sous-ensemble de leurs
    // transitions/types. Voir shouldPushForEvent dans utils/webPushEvents.ts.
    if (!shouldPushForEvent(event.event_name, event.payload ?? {})) {
      continue;
    }

    // Recipients staff : par défaut staff du tenant + pole admins ; pour les
    // transitions de segment match→live, on cible les casters assignés au
    // match uniquement (audience réduite, cf. loadCasterUserIdsForMatch).
    let staffUserIds: string[];
    if (event.event_name === 'team.weekly.recap') {
      // N7 : un récap d'équipe n'est PAS une information de staff. Sans cette
      // exception, chaque staff recevrait le bilan hebdomadaire de toutes les
      // équipes du tenant — le meilleur moyen de faire couper les
      // notifications à tout le monde.
      staffUserIds = [];
    } else if (event.event_name === 'event_segment.transitioned') {
      const data = (event.payload ?? {}) as Record<string, unknown>;
      const inner =
        data.data && typeof data.data === 'object'
          ? (data.data as Record<string, unknown>)
          : data;
      const segment =
        inner.segment && typeof inner.segment === 'object'
          ? (inner.segment as Record<string, unknown>)
          : {};
      const matchId =
        typeof segment.matchId === 'string' ? segment.matchId : null;
      if (!matchId) {
        // shouldPushForEvent garantit normalement matchId présent — défense
        // en profondeur.
        continue;
      }
      staffUserIds = await loadCasterUserIdsForMatch(matchId);
    } else {
      staffUserIds = await loadStaffUserIdsForTenant(event.tenant_id);
    }

    // Recipients players : pour les events match-related (V1 chunk B), on
    // ajoute les joueuses des 2 équipes du match. Le payload Web Push leur
    // pointera vers /player (cf. playerUrlForEvent dans webPushEvents.ts)
    // au lieu de /admin/matches/<id> (qui leur retournerait 403).
    let playerUserIds: string[] = [];
    if (
      event.event_name === 'match.starting' ||
      event.event_name === 'match.finished' ||
      event.event_name === 'match.score_reported' ||
      event.event_name === 'checkin.opened'
    ) {
      const data = (event.payload ?? {}) as Record<string, unknown>;
      const inner =
        data.data && typeof data.data === 'object'
          ? (data.data as Record<string, unknown>)
          : data;
      const matchId =
        typeof inner.match_id === 'string'
          ? inner.match_id
          : typeof inner.matchId === 'string'
            ? inner.matchId
            : null;
      if (matchId) {
        playerUserIds = await loadPlayerUserIdsForMatch(matchId);
      }
    } else if (event.event_name === 'team.weekly.recap') {
      // Audience = TOUT le roster (pas seulement les décideurs) : une équipe
      // dont seule la capitaine reçoit le bilan est une équipe dont seule la
      // capitaine revient.
      const data = (event.payload ?? {}) as Record<string, unknown>;
      const inner =
        data.data && typeof data.data === 'object'
          ? (data.data as Record<string, unknown>)
          : data;
      const teamId = typeof inner.teamId === 'string' ? inner.teamId : null;
      if (teamId) {
        playerUserIds = await loadTeamMemberUserIds([teamId], event.tenant_id);
      }
    } else if (event.event_name === 'scrim.search.matched') {
      // R6 : l'émetteur a déjà résolu les équipes compatibles
      // (payload.targetTeamIds) — on notifie leurs capitaines/managers. Pas de
      // re-calcul ici : le matching appartient au producteur, le dispatcher ne
      // fait que router.
      const data = (event.payload ?? {}) as Record<string, unknown>;
      const inner =
        data.data && typeof data.data === 'object'
          ? (data.data as Record<string, unknown>)
          : data;
      const raw = inner.targetTeamIds;
      const teamIds = Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === 'string' && v.length > 0)
        : [];
      if (teamIds.length > 0) {
        playerUserIds = await loadCaptainManagerUserIdsForTeams(
          teamIds,
          event.tenant_id
        );
      }
    } else if (event.event_name.startsWith('scrim.planning.')) {
      // Scrim planning : audience player = capitaines/managers des 2 équipes
      // (les décideurs de la grille de dispos). Le staff du tenant reste
      // destinataire par défaut (staffUserIds ci-dessus). Ils reçoivent l'URL
      // /player/scrim-planning/<id> via playerUrlForEvent (perspective player).
      const data = (event.payload ?? {}) as Record<string, unknown>;
      const inner =
        data.data && typeof data.data === 'object'
          ? (data.data as Record<string, unknown>)
          : data;
      const teamId = (side: 'team1' | 'team2'): string | null => {
        const t = inner[side];
        if (t && typeof t === 'object' && !Array.isArray(t)) {
          const id = (t as Record<string, unknown>).id;
          return typeof id === 'string' && id.length > 0 ? id : null;
        }
        return null;
      };
      const teamIds = [teamId('team1'), teamId('team2')].filter(
        (v): v is string => Boolean(v)
      );
      if (teamIds.length > 0) {
        playerUserIds = await loadCaptainManagerUserIdsForTeams(
          teamIds,
          event.tenant_id
        );
      }
    }

    // Audience combinée : staff prioritaire pour la perspective (un user
    // staff qui joue aussi reçoit la version admin avec URL /admin/matches/...).
    const staffSet = new Set(staffUserIds);
    const allUserIds = Array.from(new Set([...staffUserIds, ...playerUserIds]));
    if (allUserIds.length === 0) continue;

    // Filtrage opt-out (s'applique aux deux audiences indistinctement —
    // un user opt-out de match.starting ne le reçoit ni en staff ni en player).
    const optedOut = await loadOptedOutUserIds(allUserIds, event.event_name);
    const eligibleUserIds = allUserIds.filter((u) => !optedOut.has(u));
    counters.skipped_prefs += allUserIds.length - eligibleUserIds.length;
    if (eligibleUserIds.length === 0) continue;

    const subs = await loadSubscriptions(eligibleUserIds);
    if (subs.length === 0) continue;

    // Lazy load des unread_count pour les users de cet event qu'on n'a pas
    // encore vus dans ce tick. Un staff cross-tenant qui apparaît sur 2 events
    // différents n'est chargé qu'une fois.
    const usersToLoad = eligibleUserIds.filter(
      (u) => !unreadCountByUser.has(u)
    );
    if (usersToLoad.length > 0) {
      const fresh = await loadUnreadCountByUser(usersToLoad);
      for (const u of usersToLoad) {
        unreadCountByUser.set(u, fresh.get(u) ?? 0);
      }
    }

    const rendered = renderWebPushPayload(
      event.event_name as WebPushEventType,
      event.payload ?? {}
    );
    // Sépare les `actions` (forme Notification API : {action, title}) des
    // `action_urls` (forme custom SW : {action: url}). Les browsers ignorent
    // les champs non-standard dans `actions`, donc on stocke les URLs dans
    // `data.action_urls` que le SW lit dans son handler `notificationclick`.
    const actions = rendered.actions?.map((a) => ({
      action: a.action,
      title: a.title,
    }));
    const actionUrls = rendered.actions?.reduce<Record<string, string>>(
      (acc, a) => {
        if (a.url) acc[a.action] = a.url;
        return acc;
      },
      {}
    );

    // Pré-calcule l'URL côté joueuse une fois par event (la résolution
    // dépend uniquement du event_name + payload, pas du sub).
    const playerUrl = playerUrlForEvent(event.event_name, event.payload ?? {});

    // Le payload est construit PAR-SUB parce que `data.unread_count` varie
    // par user (Badge API V2) ET que l'URL bascule selon que le sub
    // appartient à un user staff (URL admin) ou player (URL /player).
    const buildPayload = (sub: SubscriptionRow): string => {
      const unreadCount = unreadCountByUser.get(sub.user_id) ?? 0;
      // Staff prioritaire : si le user est dans staffSet, on lui envoie la
      // perspective admin (URL /admin/...). Sinon, on bascule sur l'URL
      // player (/player) si l'event en a une, sinon fallback sur rendered.url.
      const isStaffPerspective = staffSet.has(sub.user_id);
      const url = isStaffPerspective || !playerUrl ? rendered.url : playerUrl;
      return JSON.stringify({
        title: rendered.title,
        body: rendered.body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data: {
          url,
          event_name: event.event_name,
          // Compteur d'events non-ack'd AVANT celui-ci. Le SW ajoute +1
          // lui-même (il est en train de show la notif courante).
          unread_count: unreadCount,
          // action_urls ne s'applique qu'à la perspective admin (les
          // boutons d'action pointent vers des URLs /admin/...). Côté
          // player on omet — le clic ouvrira data.url (/player).
          ...(isStaffPerspective &&
          actionUrls &&
          Object.keys(actionUrls).length > 0
            ? { action_urls: actionUrls }
            : {}),
        },
        tag: event.event_id,
        // Re-notifie l'utilisateur si un push avec le même tag arrive (ex:
        // match.starting suivi d'un autre match.starting plus tard). Sans
        // renotify, le 2e remplace silencieusement le 1er.
        renotify: true,
        // actions admin uniquement (mêmes URLs que action_urls).
        ...(isStaffPerspective && actions && actions.length > 0
          ? { actions }
          : {}),
      });
    };

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
          payloadJson: buildPayload(sub),
          vapidDetails,
        })
      )
    );

    // Si l'event a été envoyé avec succès à au moins un sub d'un user, on
    // incrémente son compteur in-memory pour que le prochain event de ce
    // tick voie le count actualisé (sinon plusieurs events dans le même
    // tick auraient tous le même unread_count, et SW gonflerait
    // incorrectement le badge avec +1 chacun).
    const sentForUsers = new Set<string>();
    subs.forEach((sub, i) => {
      if (results[i] === 'sent') sentForUsers.add(sub.user_id);
    });
    for (const userId of sentForUsers) {
      const cur = unreadCountByUser.get(userId) ?? 0;
      unreadCountByUser.set(userId, cur + 1);
    }

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
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    _dispatcherInFlight = false;
  }
}
