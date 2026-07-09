// utils/emailDispatcher.ts
//
// Dispatcher EMAIL générique — pendant email du dispatcher Web Push
// (pages/api/cron/web-push-dispatch.ts). Lit `bot_event_outbox` (source de
// vérité unique) et envoie un DIGEST par utilisateur agrégeant ses events
// email-éligibles en attente.
//
// Modèle OPT-IN (à l'inverse du push, opt-out) : un user n'est emailé pour un
// event QUE s'il a une row notification_prefs(channel='email', enabled=true)
// explicite (cf. loadEmailOptedInUserIds).
//
// Dedup : email_deliveries(outbox_event_id, user_id) UNIQUE. On ne ré-emaile
// jamais une paire (event, user) déjà présente — idempotent si le cron se
// re-exécute / se chevauche.
//
// Digest : on GROUPE les paires (event, user) restantes PAR user → un seul
// email avec N items, plutôt que N emails. Économise le quota Brevo (300/jour
// free tier) et limite le bruit côté utilisateur.
//
// Garde-fous :
//   - EMAIL_DIGEST_MAX_PER_RUN (défaut 250) : plafond d'emails par run pour
//     rester sous Brevo 300/jour. Au-delà, on tronque (log) et le reste passe
//     au prochain run.
//   - In-process mutex : empêche le chevauchement de deux runs dans le même
//     worker (cross-instance, le UNIQUE de email_deliveries protège).
//   - try/catch par user : un échec d'envoi/résolution n'avorte jamais le run.

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { EMAIL_EVENT_TYPES, renderEmailPayload } from './webPushEvents';
import { sendDigestEmail } from './email';
import { generateUnsubscribeToken } from './emailUnsubscribe';
import {
  loadCandidateEvents,
  loadStaffUserIdsForTenant,
  loadPlayerUserIdsForMatch,
  loadCasterUserIdsForMatch,
  loadCaptainManagerUserIdsForTeams,
  loadEmailOptedInUserIds,
  type OutboxRow,
} from './notificationAudience';

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_BATCH_LIMIT = 500;
const DEFAULT_MAX_PER_RUN = 250;

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://owwomenscup.fr';

// In-process mutex (cf. web-push dispatcher) — un seul run à la fois par worker.
let _emailDispatcherInFlight = false;

export type EmailDispatcherResult = {
  candidates: number;
  emailsSent: number;
  recipients: number;
  skipped: number;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

type PendingItem = {
  event: OutboxRow;
  heading: string;
  body: string;
  url: string;
};

/**
 * Charge les paires (outbox_event_id, user_id) déjà présentes dans
 * email_deliveries pour un batch d'event_ids. Retourne un Set de clés
 * "eventId::userId" pour un lookup O(1) au moment du dedup.
 */
async function loadExistingDeliveryKeys(
  eventIds: string[]
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from('email_deliveries')
    .select('outbox_event_id, user_id')
    .in('outbox_event_id', eventIds);
  if (error) {
    logger.error('[cron/email] load deliveries error', error);
    return new Set();
  }
  const out = new Set<string>();
  for (const r of (data ?? []) as Array<{
    outbox_event_id: string;
    user_id: string;
  }>) {
    out.add(`${r.outbox_event_id}::${r.user_id}`);
  }
  return out;
}

/**
 * Résout l'audience email d'un event (staff du tenant + joueuses/casters selon
 * l'event), puis filtre aux users OPT-IN email. Retourne la liste des user_ids
 * éligibles à recevoir cet event par email.
 */
async function resolveEmailAudience(event: OutboxRow): Promise<string[]> {
  if (!event.tenant_id) return [];

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

  const audience = new Set<string>();

  // Staff du tenant (+ pole admins) reçoivent tous les events email-éligibles.
  for (const u of await loadStaffUserIdsForTenant(event.tenant_id)) {
    audience.add(u);
  }

  // Fanout match : joueuses des 2 équipes + casters assignés.
  if (
    matchId &&
    (event.event_name === 'match.scheduled' ||
      event.event_name === 'match.starting' ||
      event.event_name === 'match.finished' ||
      event.event_name === 'checkin.opened')
  ) {
    for (const u of await loadPlayerUserIdsForMatch(matchId)) audience.add(u);
    for (const u of await loadCasterUserIdsForMatch(matchId)) audience.add(u);
  }

  // Fanout scrim planning : capitaines/managers des 2 équipes de la grille
  // (en plus du staff du tenant, déjà ajouté au-dessus).
  if (event.event_name.startsWith('scrim.planning.')) {
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
      for (const u of await loadCaptainManagerUserIdsForTeams(
        teamIds,
        event.tenant_id
      )) {
        audience.add(u);
      }
    }
  }

  if (audience.size === 0) return [];

  // Filtre OPT-IN email (seul un opt-in explicite reçoit).
  const optedIn = await loadEmailOptedInUserIds(
    Array.from(audience),
    event.event_name
  );
  return Array.from(audience).filter((u) => optedIn.has(u));
}

/**
 * Résout l'email d'un user via l'API admin auth. Retourne null si introuvable.
 */
async function resolveUserEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    const email = data.user.email;
    return typeof email === 'string' && email.length > 0 ? email : null;
  } catch (err) {
    logger.error('[cron/email] getUserById error for %s', userId, err);
    return null;
  }
}

/**
 * Écrit les rows email_deliveries (status sent/failed) pour toutes les paires
 * (event, user) incluses dans le digest envoyé à ce user. Best-effort : une
 * erreur d'insert (ex. race UNIQUE 23505) est loggée mais n'avorte rien.
 */
async function writeDeliveries(
  userId: string,
  events: OutboxRow[],
  status: 'sent' | 'failed'
): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map((e) => ({
    tenant_id: e.tenant_id,
    outbox_event_id: e.event_id,
    user_id: userId,
    status,
  }));
  const { error } = await supabaseAdmin.from('email_deliveries').insert(rows);
  if (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === '23505') {
      // Race : une autre instance a déjà inscrit (les paires existantes ont
      // normalement été filtrées en amont). Bénin.
      logger.warn('[cron/email] delivery insert race (23505) for %s', userId);
      return;
    }
    logger.error('[cron/email] delivery insert error', error);
  }
}

/**
 * Run principal — orchestré par le handler cron ou directement par les tests.
 */
export async function runEmailDispatcher(): Promise<EmailDispatcherResult> {
  const result: EmailDispatcherResult = {
    candidates: 0,
    emailsSent: 0,
    recipients: 0,
    skipped: 0,
  };

  if (_emailDispatcherInFlight) {
    logger.warn('[cron/email] previous run still in flight — skipping');
    return result;
  }
  _emailDispatcherInFlight = true;

  try {
    const windowHours = envNumber('EMAIL_DIGEST_WINDOW_HOURS', DEFAULT_WINDOW_HOURS);
    const batchLimit = envNumber('EMAIL_DIGEST_BATCH_LIMIT', DEFAULT_BATCH_LIMIT);
    const maxPerRun = envNumber('EMAIL_DIGEST_MAX_PER_RUN', DEFAULT_MAX_PER_RUN);

    const events = await loadCandidateEvents(
      EMAIL_EVENT_TYPES,
      windowHours,
      batchLimit,
      '[cron/email]'
    );
    result.candidates = events.length;
    if (events.length === 0) return result;

    const existingKeys = await loadExistingDeliveryKeys(
      events.map((e) => e.event_id)
    );

    // Agrège par user : userId → liste d'items (un par event en attente).
    const pendingByUser = new Map<string, PendingItem[]>();

    for (const event of events) {
      if (!event.tenant_id) {
        result.skipped += 1;
        continue;
      }
      const eligibleUserIds = await resolveEmailAudience(event);
      if (eligibleUserIds.length === 0) continue;

      const rendered = renderEmailPayload(
        event.event_name,
        event.payload ?? {}
      );

      for (const userId of eligibleUserIds) {
        const key = `${event.event_id}::${userId}`;
        if (existingKeys.has(key)) {
          // Déjà emailé à ce user pour cet event → dedup.
          result.skipped += 1;
          continue;
        }
        // Évite aussi un doublon intra-run (même event listé deux fois).
        existingKeys.add(key);
        let bucket = pendingByUser.get(userId);
        if (!bucket) {
          bucket = [];
          pendingByUser.set(userId, bucket);
        }
        bucket.push({
          event,
          heading: rendered.heading,
          body: rendered.body,
          url: rendered.url,
        });
      }
    }

    if (pendingByUser.size === 0) return result;

    // Plafond par run : on n'envoie qu'aux N premiers users (les autres seront
    // traités au prochain run — leurs paires ne sont PAS en email_deliveries
    // tant qu'on ne les a pas envoyées, donc rien n'est perdu).
    const userIds = Array.from(pendingByUser.keys());
    let usersToProcess = userIds;
    if (userIds.length > maxPerRun) {
      logger.warn(
        '[cron/email] %d recipients exceed EMAIL_DIGEST_MAX_PER_RUN=%d — truncating to %d',
        userIds.length,
        maxPerRun,
        maxPerRun
      );
      usersToProcess = userIds.slice(0, maxPerRun);
    }

    for (const userId of usersToProcess) {
      const items = pendingByUser.get(userId) ?? [];
      if (items.length === 0) continue;
      try {
        const email = await resolveUserEmail(userId);
        if (!email) {
          // Pas d'email résolu → on n'inscrit RIEN dans email_deliveries pour
          // pouvoir réessayer plus tard si le user obtient un email.
          logger.warn('[cron/email] no email for user %s — skipping', userId);
          result.skipped += items.length;
          continue;
        }

        const unsubscribeUrl = `${SITE_URL}/api/email/unsubscribe?token=${generateUnsubscribeToken(
          userId
        )}`;

        const sendResult = await sendDigestEmail({
          to: email,
          items: items.map((i) => ({
            heading: i.heading,
            body: i.body,
            url: i.url,
          })),
          unsubscribeUrl,
        });

        const status: 'sent' | 'failed' = sendResult.success
          ? 'sent'
          : 'failed';
        await writeDeliveries(
          userId,
          items.map((i) => i.event),
          status
        );

        if (sendResult.success) {
          result.emailsSent += 1;
          result.recipients += 1;
        } else {
          // L'échec est inscrit (status=failed) pour ne pas re-spammer en
          // boucle sur un email durablement invalide.
          logger.error(
            '[cron/email] send failed for %s: %s',
            userId,
            sendResult.error
          );
        }
      } catch (err) {
        // Un échec isolé n'avorte jamais le run.
        logger.error('[cron/email] unexpected error for user %s', userId, err);
      }
    }

    return result;
  } finally {
    _emailDispatcherInFlight = false;
  }
}
