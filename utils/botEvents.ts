// utils/botEvents.ts
//
// Push sortant signe HMAC vers le bot Discord (repo separe).
//
// Le bot poll deja /api/bot/v1/reminders, mais le polling est trop lent pour les
// evenements latence-sensibles (annonce de match qui commence, dispute ouverte,
// news qui sort). Cet emetteur permet au site de pousser ces evenements en
// quelques ms.
//
// Auth : HMAC-SHA256 du body (raw JSON string) avec BOT_WEBHOOK_SECRET. Le bot
// recalcule la signature cote receveur et compare en constant-time.
//
// Livraison at-least-once :
//   1. Chaque event est insere dans bot_event_outbox (status='pending').
//   2. On tente le push HTTP (3 retries, backoff lineaire).
//   3. Sur succes : status='delivered', delivered_at=now().
//   4. Sur echec : row reste 'pending' ; le bot peut la rattraper via
//      GET /api/bot/v1/events/pending puis POST /api/bot/v1/events/[id]/ack.

import crypto from 'crypto';
import { supabaseAdmin } from './supabase';
import { logger } from './logger';

// Liste runtime des events sortants — SOURCE UNIQUE : le type `BotEventName`
// en derive. Expose aussi le dropdown de filtre du journal Discord
// (/admin/logs ?tab=discord) sans risque de drift avec le type.
/**
 * `BOT_EVENT_NAMES` / `BotEventName` vivent désormais dans
 * `utils/botEventNames.ts` (constante pure, importable côté CLIENT sans
 * traîner `crypto` ni le client service-role). Ré-exportés ici pour ne rien
 * casser des appelants serveur et des tests existants.
 */
export { BOT_EVENT_NAMES } from './botEventNames';
export type { BotEventName } from './botEventNames';
import type { BotEventName } from './botEventNames';

export type BotEventPayload = Record<string, unknown>;

export type EmitResult = {
  delivered: boolean;
  status?: number;
  error?: string;
  attempts: number;
};

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5_000;

function isConfigured(): boolean {
  // Le webhook URL est obligatoire (cible). Le secret est resolu per-tenant
  // (tenant_secrets.bot_webhook_secret) au moment de l'emission ; absence de
  // secret → livraison outbox-only (cf. resolveWebhookSecret).
  return Boolean(process.env.BOT_WEBHOOK_URL);
}

/**
 * Secret webhook par tenant, mis en cache en mémoire du process.
 *
 * Il était relu à chaque événement émis. Combiné à l'authentification des
 * appels bot (utils/botAuth.ts), `tenant_secrets` totalisait 8 898 lectures en
 * 24 h — pour une valeur qui ne change qu'à la rotation.
 *
 * TTL court, et seuls les succès sont mémorisés : un secret tout juste posé est
 * pris en compte immédiatement, et une rotation met au plus une minute à se
 * propager aux process déjà chauds. Une signature obsolète est refusée par le
 * bot, pas acceptée à tort — le risque est une livraison ratée, rattrapée par
 * l'outbox, pas un trou de sécurité.
 */
const WEBHOOK_SECRET_TTL_MS = 60_000;
const webhookSecretCache = new Map<
  string,
  { secret: string; expiresAt: number }
>();

/**
 * Resolve the HMAC webhook secret to sign a push to the bot for `tenantId`.
 *
 * Lookup `tenant_secrets.bot_webhook_secret` (provisioned via
 * `POST /api/admin/tenants/:id/rotate-secrets`). Le fallback env legacy
 * `BOT_WEBHOOK_SECRET` a été retiré : chaque tenant DOIT avoir son secret seedé.
 *
 * Returns `null` if absent — in that case the caller falls back to outbox-only
 * delivery (the bot will pick it up via polling), so a missing secret degrades
 * gracefully instead of crashing the emit.
 */
async function resolveWebhookSecret(tenantId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const cached = webhookSecretCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.secret;

  const { data } = await supabaseAdmin
    .from('tenant_secrets')
    .select('bot_webhook_secret')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const secret = (data?.bot_webhook_secret as string | undefined) ?? null;
  // On ne met en cache qu'un secret TROUVÉ : une absence est un état qu'on veut
  // revoir tout de suite (secret fraîchement seedé, tenant en cours de setup).
  if (secret) {
    webhookSecretCache.set(tenantId, {
      secret,
      expiresAt: Date.now() + WEBHOOK_SECRET_TTL_MS,
    });
  }
  return secret;
}

/**
 * Écriture dans l'outbox, en distinguant « pas de client » d'un ÉCHEC d'écriture.
 *
 * POURQUOI CE SOIN — audit du 2026-09-12. L'outbox n'est PAS un filet de
 * secours sur ce déploiement : le push direct échoue systématiquement (HTTP 401
 * sur toutes les lignes examinées) et le bot récupère tout par polling. Sans
 * ligne d'outbox, l'événement n'existe donc nulle part et rien ne le rejouera —
 * il est perdu en silence. `markDelivered`, l'enregistrement des échecs et
 * toute reprise sont conditionnés à l'identifiant de cette ligne.
 *
 * D'où la reprise immédiate : l'insertion échoue surtout sur un 504 transitoire
 * de PostgREST (~1,7 % des requêtes mesurées ce jour-là).
 *
 * ⚠️ UNE REPRISE N'EST SÛRE QUE GRÂCE À `UNIQUE (event_id)`. Un 504 est un
 * *gateway timeout* : l'insertion peut avoir été validée malgré l'erreur
 * rendue. Sans cette contrainte, réessayer créerait une SECONDE ligne pour le
 * même événement — donc un doublon dans Discord, précisément ce qu'on corrige.
 * La violation d'unicité (23505) est donc la preuve que la première tentative a
 * abouti : on la traite comme un succès.
 */
type OutboxWrite =
  | { ok: true; id: number | null }
  | { ok: false; error: string };

const OUTBOX_INSERT_ATTEMPTS = 2;
const OUTBOX_RETRY_DELAY_MS = 250;
/** Violation de contrainte unique (Postgres). */
const PG_UNIQUE_VIOLATION = '23505';

async function persistOutbox(params: {
  eventId: string;
  eventName: BotEventName;
  tenantId: string;
  payload: unknown;
}): Promise<OutboxWrite> {
  if (!supabaseAdmin) return { ok: false, error: 'supabase_admin_unavailable' };

  let lastError = 'unknown';
  for (let attempt = 1; attempt <= OUTBOX_INSERT_ATTEMPTS; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('bot_event_outbox')
      .insert({
        event_id: params.eventId,
        event_name: params.eventName,
        tenant_id: params.tenantId,
        payload: params.payload,
        status: 'pending',
      })
      .select('id')
      .maybeSingle();

    if (!error) {
      return { ok: true, id: (data?.id as number | undefined) ?? null };
    }

    if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      // La tentative précédente avait bien écrit, malgré son erreur. La ligne
      // existe : l'événement n'est pas perdu. On ne connaît pas son `id`, donc
      // pas de `markDelivered` — la ligne reste `pending` et le bot la
      // récupérera par polling, qui est déjà le chemin nominal ici.
      logger.warn(
        '[botEvents] outbox: ligne déjà écrite par la tentative précédente (%s)',
        params.eventId
      );
      return { ok: true, id: null };
    }

    lastError = error.message;
    logger.error(
      '[botEvents] outbox insert error (tentative %s/%s): %s',
      attempt,
      OUTBOX_INSERT_ATTEMPTS,
      error.message
    );
    if (attempt < OUTBOX_INSERT_ATTEMPTS) {
      await new Promise((resolve) =>
        setTimeout(resolve, OUTBOX_RETRY_DELAY_MS)
      );
    }
  }
  return { ok: false, error: lastError };
}

async function markDelivered(outboxId: number): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from('bot_event_outbox')
    .update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    })
    .eq('id', outboxId);
  if (error) {
    logger.error('[botEvents] outbox markDelivered error', error);
  }
}

async function recordPushAttempt(
  outboxId: number,
  errorMessage: string | null
): Promise<void> {
  if (!supabaseAdmin) return;
  const updates: Record<string, unknown> = {
    last_push_at: new Date().toISOString(),
    last_push_error: errorMessage,
  };
  // push_attempts increment : on lit puis incremente. La concurrence n'est
  // pas critique ici (compteur best-effort, pas un verrou).
  const { data } = await supabaseAdmin
    .from('bot_event_outbox')
    .select('push_attempts')
    .eq('id', outboxId)
    .maybeSingle();
  updates.push_attempts = ((data?.push_attempts as number) ?? 0) + 1;
  await supabaseAdmin
    .from('bot_event_outbox')
    .update(updates)
    .eq('id', outboxId);
}

type FullPayload = {
  id: string;
  event: BotEventName;
  tenantId: string;
  timestamp: string;
  data: BotEventPayload;
};

function buildFullPayload(
  event: BotEventName,
  data: BotEventPayload,
  tenantId: string
): FullPayload {
  return {
    id: crypto.randomUUID(),
    event,
    tenantId,
    timestamp: new Date().toISOString(),
    data,
  };
}

export async function emitBotEvent(
  event: BotEventName,
  data: BotEventPayload,
  tenantId: string
): Promise<EmitResult> {
  if (!tenantId) {
    logger.error(
      `[botEvents] ${event} aborted: tenantId missing — multi-tenant required`
    );
    return { delivered: false, error: 'missing_tenant_id', attempts: 0 };
  }

  const fullPayload = buildFullPayload(event, data, tenantId);

  // Persist d'abord — meme si le push HTTP rate, l'outbox permettra au bot
  // de rattraper via polling.
  const write = await persistOutbox({
    eventId: fullPayload.id,
    eventName: event,
    tenantId,
    payload: fullPayload,
  });

  if (!write.ok) {
    logger.error(
      `[botEvents] ${event} NON PERSISTÉ dans l'outbox (${write.error}) — le bot ne pourra pas le rattraper par polling`
    );
  }

  const result = await pushToBot(
    event,
    fullPayload,
    write.ok ? write.id : null,
    tenantId
  );

  // Ni ligne d'outbox, ni push abouti : l'événement est PERDU. On le dit à
  // l'appelant plutôt que de rendre un échec de push ordinaire, qui laisserait
  // croire au rattrapage habituel.
  if (!write.ok && !result.delivered) {
    return { ...result, error: `event_lost:${result.error ?? 'push_failed'}` };
  }

  return result;
}

export type BotEventBatchItem = {
  event: BotEventName;
  data: BotEventPayload;
  /**
   * Les événements d'un même groupe sont poussés DANS L'ORDRE, l'un après
   * l'autre (ex. `match.scheduled` puis `match.rescheduled` du même match).
   * Les groupes différents partent en parallèle (concurrence bornée). Sans
   * groupe, chaque événement est son propre groupe.
   */
  group?: string;
};

export type EmitBatchResult = {
  /** Lignes effectivement écrites dans l'outbox. */
  persisted: number;
  /**
   * Pushes HTTP vers le bot. Résolue quand tous sont terminés ; ne rejette
   * jamais. L'appelant peut l'ignorer : l'outbox est déjà écrite, le bot
   * rattrape par polling ce qu'un push aurait raté.
   */
  delivery: Promise<EmitResult[]>;
};

const BATCH_PUSH_CONCURRENCY = 4;

/**
 * Émission EN LOT : une seule insertion outbox pour N événements, puis push.
 *
 * Existe pour les écritures de masse (auto-planification, décalage d'un round) :
 * 28 matchs × 2 événements, c'étaient 56 INSERT séquentiels et autant de pushes
 * lancés d'un coup. Ici, la persistance est UN aller-retour, et la promesse
 * retournée résout dès qu'elle est faite — c'est la garantie qui compte (le
 * bot rattrape l'outbox). Les pushes continuent dans `delivery`.
 */
export async function emitBotEvents(
  items: BotEventBatchItem[],
  tenantId: string
): Promise<EmitBatchResult> {
  if (!tenantId) {
    logger.error(
      `[botEvents] batch of ${items.length} aborted: tenantId missing — multi-tenant required`
    );
    return { persisted: 0, delivery: Promise.resolve([]) };
  }
  if (items.length === 0) {
    return { persisted: 0, delivery: Promise.resolve([]) };
  }

  const payloads = items.map((it) =>
    buildFullPayload(it.event, it.data, tenantId)
  );

  const outboxIds = new Map<string, number>();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('bot_event_outbox')
      .insert(
        payloads.map((p) => ({
          event_id: p.id,
          event_name: p.event,
          tenant_id: tenantId,
          payload: p,
          status: 'pending',
        }))
      )
      .select('id, event_id');
    if (error) {
      logger.error('[botEvents] outbox batch insert error', error);
    } else {
      for (const row of (data ?? []) as Array<{
        id: number;
        event_id: string;
      }>) {
        outboxIds.set(row.event_id, row.id);
      }
    }
  }

  // Groupes ordonnés : l'ordre d'apparition est conservé dans chaque groupe.
  const groups = new Map<string, number[]>();
  items.forEach((it, idx) => {
    const key = it.group ?? payloads[idx].id;
    const list = groups.get(key) ?? [];
    list.push(idx);
    groups.set(key, list);
  });

  const results: EmitResult[] = new Array(items.length);
  const queue = [...groups.values()];
  const worker = async () => {
    for (let g = queue.shift(); g; g = queue.shift()) {
      for (const idx of g) {
        const p = payloads[idx];
        try {
          results[idx] = await pushToBot(
            p.event,
            p,
            outboxIds.get(p.id) ?? null,
            tenantId
          );
        } catch (e) {
          results[idx] = {
            delivered: false,
            error: e instanceof Error ? e.message : String(e),
            attempts: 0,
          };
        }
      }
    }
  };
  const delivery = Promise.all(
    Array.from(
      { length: Math.min(BATCH_PUSH_CONCURRENCY, queue.length) },
      worker
    )
  ).then(() => results);

  return { persisted: outboxIds.size, delivery };
}

async function pushToBot(
  event: BotEventName,
  fullPayload: FullPayload,
  outboxId: number | null,
  tenantId: string
): Promise<EmitResult> {
  if (!isConfigured()) {
    // Dev/staging : pas de webhook configure. L'outbox suffit ; le bot pollera.
    return { delivered: false, error: 'not_configured', attempts: 0 };
  }

  const url = process.env.BOT_WEBHOOK_URL as string;
  const secret = await resolveWebhookSecret(tenantId);
  if (!secret) {
    // Ni tenant_secrets ni env : pas de signature possible. L'outbox suffit.
    logger.warn(
      `[botEvents] ${event} no webhook secret for tenant ${tenantId}, outbox-only`
    );
    return { delivered: false, error: 'no_webhook_secret', attempts: 0 };
  }

  const body = JSON.stringify(fullPayload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  let lastErr: string | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          'X-Tenant-Id': tenantId,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok) {
        if (outboxId !== null) await markDelivered(outboxId);
        return { delivered: true, status: res.status, attempts: attempt };
      }

      lastStatus = res.status;
      lastErr = `HTTP ${res.status}`;

      // 4xx (sauf 408/429) : pas de retry, le bot rejette explicitement.
      // On marque l'echec dans l'outbox mais l'event reste 'pending' — un
      // operateur peut decider de re-pousser manuellement apres correction.
      if (
        res.status >= 400 &&
        res.status < 500 &&
        res.status !== 408 &&
        res.status !== 429
      ) {
        logger.error(`[botEvents] ${event} rejected by bot (${res.status})`);
        if (outboxId !== null) await recordPushAttempt(outboxId, lastErr);
        return {
          delivered: false,
          status: res.status,
          error: lastErr,
          attempts: attempt,
        };
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  logger.error(
    `[botEvents] ${event} delivery failed after ${MAX_ATTEMPTS} attempts: ${lastErr}`
  );
  if (outboxId !== null) {
    await recordPushAttempt(outboxId, lastErr ?? 'unknown');
  }
  return {
    delivered: false,
    status: lastStatus,
    error: lastErr,
    attempts: MAX_ATTEMPTS,
  };
}
