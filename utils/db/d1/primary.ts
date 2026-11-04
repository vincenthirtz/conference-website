// utils/db/d1/primary.ts — D1, base principale (lot 6 de conference-website
// docs/D1-MIGRATION.md et docs/D1-SWITCH.md : l'interrupteur `DB_BACKEND`).
//
// Quand `DB_BACKEND` vaut « d1 », le Worker (worker/app.ts ici, cloudflare/worker.mjs côté
// site) appelle `bindD1Primary(env)` à chaque requête. Deux crochets sont posés sur globalThis :
//   * `owwc.db.from-hook` : utils/supabase.ts lui confie chaque `supabaseAdmin.from(table)`.
//     Il rend le constructeur de la façade D1 (client.ts) à la place de celui de Supabase ;
//   * `owwc.db.rpc-hook` : utils/db/rpc.ts lui confie chaque `dbFunctions(db)(nom, args)`.
//     Il appelle la fonction réécrite pour D1 (functions/).
// La façade reçoit son notificateur du temps réel (realtime.ts : `REALTIME_NOTIFY_URL`,
// `REALTIME_NOTIFY_SECRET`) et le secret des tickets (`REALTIME_TICKET_SECRET`), que
// Postgres lisait dans Supabase Vault. Ce sont des variables et secrets du Worker.
//
// Tant que `DB_BACKEND` vaut « supabase » ou n'est pas posé, rien n'est installé ici : la
// lecture dans l'ombre (shadow.ts, API seule) garde son crochet, et Supabase répond.
//
// Une valeur inconnue, ou « d1 » sans la liaison MAIN_DB, est une configuration cassée.
// `bindD1Primary` le dit (`invalid`, `missing-db`) ; à l'appelant de refuser de servir
// plutôt que d'écrire dans Supabase pendant que D1 est la base.
//
// Partagé avec le site (synchro inversée) : rien de propre à l'API ici.

import catalogJson from '../../../database/d1/catalog.json';
import { logger } from '@/utils/logger';
import { loadCatalog, type D1CatalogJson, type DbCatalog } from './catalog';
import { createD1Client, type D1Client, type D1Response } from './client';
import type { D1Database } from './execute';
import { createRealtimeNotifier, type RealtimeEvent } from './realtime';

/** Les clés lues sur globalThis par utils/supabase.ts et utils/db/rpc.ts (mêmes chaînes). */
export const DB_FROM_HOOK = Symbol.for('owwc.db.from-hook');
export const DB_RPC_HOOK = Symbol.for('owwc.db.rpc-hook');
/** La base qui répond à cette requête, pour /api/health : « d1 », absent sinon. */
export const DB_BACKEND_MARK = Symbol.for('owwc.db.backend');

export type DbBackend = 'supabase' | 'd1';

/** « supabase » (ou rien) / « d1 » ; `null` pour toute autre valeur (configuration cassée). */
export function resolveDbBackend(value: string | undefined): DbBackend | null {
  if (value === undefined || value === '' || value === 'supabase') return 'supabase';
  if (value === 'd1') return 'd1';
  return null;
}

export type PrimaryEnv = {
  DB_BACKEND?: string;
  MAIN_DB?: D1Database;
  /** `https://realtime.owwomenscup.fr/notify`. */
  REALTIME_NOTIFY_URL?: string;
  REALTIME_NOTIFY_SECRET?: string;
  REALTIME_TICKET_SECRET?: string;
};

export type PrimaryHooks = {
  client: D1Client;
  /** Le crochet de utils/supabase.ts : le constructeur de Supabase est ignoré. */
  from(builder: unknown, table: string): unknown;
  /** Le crochet de utils/db/rpc.ts : l'`rpc` de Supabase est ignoré. */
  rpc(original: unknown, name: string, args?: Record<string, unknown>): Promise<D1Response>;
};

let catalogCache: DbCatalog | null = null;
const catalog = () => (catalogCache ??= loadCatalog(catalogJson as unknown as D1CatalogJson));

export function createPrimaryHooks(options: {
  db: D1Database;
  notify?: (events: RealtimeEvent[]) => void | Promise<void>;
  /** Les variables que des fonctions de la base lisent à la place de Vault. */
  env?: Readonly<Record<string, string | undefined>>;
}): PrimaryHooks {
  const client = createD1Client(options.db, catalog(), { notify: options.notify, env: options.env });
  return {
    client,
    from: (_builder, table) => client.from(table),
    rpc: (_original, name, args) => client.rpc(name, args ?? {}),
  };
}

export type PrimaryStatus = DbBackend | 'invalid' | 'missing-db';

type Bound = { db: D1Database; realtime: boolean; url?: string; secret?: string; ticket?: string; hooks: PrimaryHooks };
let bound: Bound | null = null;
let warnedRealtime = false;

const store = () => globalThis as unknown as Record<symbol, unknown>;

function unbind(): void {
  const s = store();
  if (bound) {
    if (s[DB_FROM_HOOK] === bound.hooks.from) delete s[DB_FROM_HOOK];
    if (s[DB_RPC_HOOK] === bound.hooks.rpc) delete s[DB_RPC_HOOK];
    bound = null;
  }
  delete s[DB_BACKEND_MARK];
}

/**
 * Pose (DB_BACKEND = « d1 » et MAIN_DB lié) ou retire les crochets de la base principale. La
 * façade est gardée d'une requête à l'autre tant que la liaison et les réglages ne changent pas.
 * Ne touche jamais au crochet d'un autre (la lecture dans l'ombre) en mode « supabase ».
 *
 * `realtime: false` (le site, qui ne fait que lire) : ni notificateur ni avertissement.
 */
export function bindD1Primary(env: PrimaryEnv, options: { realtime?: boolean } = {}): PrimaryStatus {
  const backend = resolveDbBackend(env.DB_BACKEND);
  if (backend !== 'd1' || !env.MAIN_DB) {
    unbind();
    return backend === null ? 'invalid' : backend === 'd1' ? 'missing-db' : 'supabase';
  }
  const realtime = options.realtime !== false;
  const { MAIN_DB: db, REALTIME_TICKET_SECRET: ticket } = env;
  const url = realtime ? env.REALTIME_NOTIFY_URL : undefined;
  const secret = realtime ? env.REALTIME_NOTIFY_SECRET : undefined;
  if (!bound || bound.db !== db || bound.realtime !== realtime || bound.url !== url || bound.secret !== secret || bound.ticket !== ticket) {
    if (realtime && (!url || !secret) && !warnedRealtime) {
      warnedRealtime = true;
      // Les noms, jamais les valeurs.
      logger.warn('[d1] temps réel : REALTIME_NOTIFY_URL ou REALTIME_NOTIFY_SECRET absent, les écrans ne seront pas prévenus');
    }
    unbind();
    bound = {
      db,
      realtime,
      url,
      secret,
      ticket,
      hooks: createPrimaryHooks({
        db,
        notify: realtime ? createRealtimeNotifier({ url, secret }) : undefined,
        env: { REALTIME_TICKET_SECRET: ticket },
      }),
    };
  }
  const s = store();
  s[DB_FROM_HOOK] = bound.hooks.from;
  s[DB_RPC_HOOK] = bound.hooks.rpc;
  s[DB_BACKEND_MARK] = 'd1';
  return 'd1';
}

/** La base qui répond (lu par /api/health) : « d1 » si les crochets sont posés. */
export function currentDbBackend(): DbBackend {
  return store()[DB_BACKEND_MARK] === 'd1' ? 'd1' : 'supabase';
}
