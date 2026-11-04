// utils/db/d1/functions/technical.ts — quotas, limite de débit, verrous des tâches et secret des
// tickets (lot 4d de conference-website docs/D1-MIGRATION.md), réécrits depuis les fonctions SQL
// de Postgres (database/schema-prod.sql).
//
// Les écritures partent en un envoi (runBatch), atomique comme la fonction plpgsql. Le « bail
// neuf ou repris » que Postgres lisait dans `xmax = 0` est lu ici dans le même envoi : la ligne
// existait-elle avant l'upsert ?

import { DB_ERROR_CODES as C } from '../../errors';
import { dbError } from '../errors';
import { SQL_NOW } from '../now';
import { toInteger, toUuid } from '../values';
import { readArgs, REQUIRED, runBatch, type D1Function } from './context';

const text = (v: unknown): string | null => (v === null || v === undefined ? null : typeof v === 'string' ? v : String(v));

/** « maintenant + n secondes », au format de stockage des timestamptz. */
const nowPlusSeconds = `(strftime('%Y-%m-%dT%H:%M:%f', 'now', '+' || ? || ' seconds') || '000+00:00')`;

export const consumeApiUsage: D1Function = async (ctx, raw) => {
  const a = readArgs('consume_api_usage', raw, { p_tenant_id: REQUIRED, p_minute_key: REQUIRED, p_month_key: REQUIRED });
  const tenant = a.p_tenant_id === null ? null : toUuid(a.p_tenant_id);
  const upsert = (kind: 'minute' | 'month', key: string | null) => ({
    sql:
      `INSERT INTO "api_usage_counters" ("tenant_id", "window_kind", "window_key", "count", "updated_at") VALUES (?, '${kind}', ?, 1, ${SQL_NOW}) ` +
      `ON CONFLICT ("tenant_id", "window_kind", "window_key") DO UPDATE SET "count" = "api_usage_counters"."count" + 1, "updated_at" = ${SQL_NOW} RETURNING "count"`,
    params: [tenant, key],
  });
  const [minute, month] = await runBatch(ctx, [upsert('minute', text(a.p_minute_key)), upsert('month', text(a.p_month_key))], {
    table: 'api_usage_counters',
    operation: 'upsert',
  });
  return [{ minute_count: Number(minute?.[0]?.count), month_count: Number(month?.[0]?.count) }];
};

export const consumeRateLimit: D1Function = async (ctx, raw) => {
  const a = readArgs('consume_rate_limit', raw, { p_bucket: REQUIRED, p_window_seconds: REQUIRED, p_max: REQUIRED });
  const windowSeconds = a.p_window_seconds === null ? null : toInteger(a.p_window_seconds, 'integer');
  const max = a.p_max === null ? null : toInteger(a.p_max, 'integer');
  // to_timestamp(floor(epoch(now()) / w) * w) : le début de la fenêtre, à la seconde. D1 lie tout nombre JS en
  // REAL : sans CAST, la division ne tronque pas et la « fenêtre » devient la seconde courante.
  const windowStart = `(strftime('%Y-%m-%dT%H:%M:%S', (CAST(strftime('%s', 'now') AS INTEGER) / CAST(?2 AS INTEGER)) * CAST(?2 AS INTEGER), 'unixepoch') || '.000000+00:00')`;
  const [rows] = await runBatch(
    ctx,
    [
      {
        sql: `INSERT INTO "rate_limit_buckets" ("bucket", "window_start", "hits") VALUES (?1, ${windowStart}, 1) ON CONFLICT ("bucket", "window_start") DO UPDATE SET "hits" = "rate_limit_buckets"."hits" + 1 RETURNING "hits"`,
        params: [text(a.p_bucket), windowSeconds],
      },
    ],
    { table: 'rate_limit_buckets', operation: 'upsert' }
  );
  const hits = Number(rows?.[0]?.hits);
  return max === null ? null : hits <= max;
};

export const cronLockAcquire: D1Function = async (ctx, raw) => {
  const a = readArgs('cron_lock_acquire', raw, { p_name: REQUIRED, p_holder: REQUIRED, p_ttl_seconds: REQUIRED });
  const ttl = a.p_ttl_seconds === null ? null : toInteger(a.p_ttl_seconds, 'integer');
  const holder = a.p_holder === null ? null : toUuid(a.p_holder);
  const name = text(a.p_name);
  if (name === null || holder === null || (ttl ?? 0) < 1) {
    throw dbError(C.raiseException, 'cron_lock_acquire: invalid arguments', null, 'invalid');
  }
  const [before, written] = await runBatch(
    ctx,
    [
      { sql: 'SELECT EXISTS (SELECT 1 FROM "cron_locks" WHERE "name" = ?) AS "existed"', params: [name] },
      {
        sql:
          `INSERT INTO "cron_locks" AS l ("name", "holder", "locked_until", "acquired_at") VALUES (?, ?, ${nowPlusSeconds}, ${SQL_NOW}) ` +
          `ON CONFLICT ("name") DO UPDATE SET "holder" = excluded."holder", "locked_until" = excluded."locked_until", "acquired_at" = excluded."acquired_at" ` +
          `WHERE l."locked_until" < ${SQL_NOW} OR l."holder" = excluded."holder" RETURNING "holder"`,
        params: [name, holder, ttl],
      },
    ],
    { table: 'cron_locks', operation: 'upsert' }
  );
  if (!written?.length) return 'busy';
  return Number(before?.[0]?.existed) === 1 ? 'taken_over' : 'acquired';
};

export const cronLockRelease: D1Function = async (ctx, raw) => {
  const a = readArgs('cron_lock_release', raw, { p_name: REQUIRED, p_holder: REQUIRED });
  const holder = a.p_holder === null ? null : toUuid(a.p_holder);
  const [gone] = await runBatch(ctx, [{ sql: 'DELETE FROM "cron_locks" WHERE "name" = ? AND "holder" = ? RETURNING 1 AS "x"', params: [text(a.p_name), holder] }], {
    table: 'cron_locks',
    operation: 'delete',
  });
  return (gone?.length ?? 0) > 0;
};

/** Le secret des tickets du temps réel : une variable du Worker à la place de Supabase Vault. */
export const realtimeTicketSecret: D1Function = async (ctx, raw) => {
  readArgs('realtime_ticket_secret', raw, {});
  return ctx.env.REALTIME_TICKET_SECRET ?? null;
};
