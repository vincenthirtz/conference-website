// cloudflare/database.ts — la base que lit le rendu serveur du site (lot 6 de
// docs/D1-MIGRATION.md ; marche à suivre : docs/D1-SWITCH.md).
//
// Les pages lisent la base elles-mêmes, par `supabaseAdmin.from(…)` (utils/supabase.ts, recopié
// de l'API). Quand `DB_BACKEND` vaut « d1 » (wrangler.jsonc), cloudflare/worker.mjs appelle
// `bindSiteDatabase(env)` à chaque requête : le crochet de la façade D1 (utils/db/d1/primary.ts,
// recopié de l'API) est posé sur globalThis, et ces lectures partent dans la base MAIN_DB — la
// même que celle de l'API. Tant que `DB_BACKEND` vaut « supabase » ou n'est pas posé, rien
// n'est installé : Supabase répond, comme avant.
//
// Le site ne fait que lire (tests/unit/dbDirectReadsGuard.test.ts) : pas de temps réel à prévenir.
// Une configuration cassée (valeur inconnue, « d1 » sans MAIN_DB) laisse les pages lire
// Supabase, au pire figé au soir de la bascule, et le dit au journal une fois par exemplaire :
// une page un peu ancienne vaut mieux qu'un site en panne, et le site n'écrit rien.

import {
  bindD1Primary,
  type PrimaryEnv,
  type PrimaryStatus,
} from '../utils/db/d1/primary.ts';

let warned = false;

export function bindSiteDatabase(env: PrimaryEnv): PrimaryStatus {
  const status = bindD1Primary(env, { realtime: false });
  if ((status === 'invalid' || status === 'missing-db') && !warned) {
    warned = true;
    console.error(
      status === 'invalid'
        ? '[base] DB_BACKEND inconnu (attendu : « supabase » ou « d1 ») : les pages lisent Supabase'
        : '[base] DB_BACKEND = « d1 » sans la liaison MAIN_DB : les pages lisent Supabase'
    );
  }
  return status;
}
