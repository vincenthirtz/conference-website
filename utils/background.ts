// utils/background.ts — UN SEUL chemin pour le travail « lancé en fond »
// (événements du bot, journaux joueuse, e-mails, posts Discord…) : ce que
// l'API déclenche sans l'attendre avant de répondre.
//
// POURQUOI. Sur Node (serveur Lightsail), une promesse non attendue continue
// après la réponse : le processus vit. Sur un Worker Cloudflare (phase 2 de
// conference-website docs/API-WORKER.md), ce qui reste en cours après la
// réponse PEUT ÊTRE ANNULÉ — sauf si on le confie à `ctx.waitUntil`. Tout
// passe donc par `runInBackground`, et la phase 2 n'aura qu'à brancher le
// « runner » une fois, au lieu de retoucher 140 appels.
//
// AUJOURD'HUI (aucun runner) : comportement identique à `void fn()`, à une
// différence près — une erreur est TOUJOURS journalisée, au lieu de finir en
// rejet non géré.
//
// SUR UN WORKER : aucun réglage. OpenNext expose le contexte de LA requête en
// cours sur `globalThis` (un AsyncLocalStorage par requête), lu ici à CHAQUE
// appel : ne jamais capturer un `ctx` au démarrage. Sur Node, il n'existe pas.
// Mesuré sur le Worker construit : sans ce `waitUntil`, rien ne tourne après la
// réponse, pas même le premier `fetch`.
//
// Garde-fou : tests/unit/backgroundTasksGuard.test.ts refuse tout nouveau
// `void appel(…)` ou `appel(…).catch(…)` non attendu.

import { logger } from './logger';

type BackgroundRunner = (task: Promise<unknown>) => void;

let runner: BackgroundRunner | null = null;

const CLOUDFLARE_CONTEXT = Symbol.for('__cloudflare-context__');

function workerWaitUntil(): BackgroundRunner | null {
  const context = (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] as
    | { ctx?: { waitUntil(task: Promise<unknown>): void } }
    | undefined;
  const ctx = context?.ctx;
  return ctx ? (task) => ctx.waitUntil(task) : null;
}

/** Branche (ou retire, avec `null`) le prolongateur de vie des tâches. */
export function setBackgroundRunner(next: BackgroundRunner | null): void {
  runner = next;
}

/**
 * Lance `task` sans l'attendre. Une fonction est appelée TOUT DE SUITE
 * (même ordre d'exécution qu'un `void task()`) ; une erreur, synchrone ou
 * non, est journalisée sous `label` et ne remonte jamais à l'appelant.
 */
export function runInBackground(
  // PromiseLike : les requêtes supabase-js (`.then(…)`) en sont, pas des Promise.
  task: PromiseLike<unknown> | (() => PromiseLike<unknown>),
  label: string
): void {
  let promise: PromiseLike<unknown>;
  try {
    promise = typeof task === 'function' ? task() : task;
  } catch (err) {
    logger.error(`[background] ${label}`, err);
    return;
  }
  const guarded = Promise.resolve(promise).catch((err: unknown) => {
    logger.error(`[background] ${label}`, err);
  });
  const run = runner ?? workerWaitUntil();
  if (!run) return;
  try {
    run(guarded);
  } catch (err) {
    logger.error(`[background] ${label} (runner)`, err);
  }
}
