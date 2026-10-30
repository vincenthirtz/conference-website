// utils/sharedSignals.ts — UN SEUL chemin pour « une écriture a eu lieu » : ce
// qui réveille les crons et les routes pollés mis en sommeil
// (`utils/dormancyMemo.ts`, `utils/outboxActivity.ts`, le tick d'auto-pick de
// `utils/draftEngine.ts`).
//
// POURQUOI. L'écrivain note un signal, le lecteur compare avant de dormir. Dans
// un seul processus Node, une variable suffit. Sur des Workers Cloudflare (phase
// 2 de conference-website docs/API-WORKER.md), l'écrivain et le lecteur sont
// souvent deux exemplaires sans mémoire commune : le signal se perdrait, et le
// lecteur dormirait jusqu'à sa fenêtre de sûreté — jusqu'à 15 min de retard sur
// un push ou sur une échéance de draft. Tout passe donc par ici, et la phase 2
// n'aura qu'à brancher le « backend » une fois.
//
// AUJOURD'HUI (aucun backend) : une table en mémoire du processus, comportement
// identique aux variables qu'elle remplace.
//
// PHASE 2 : `setSharedSignalBackend(backendDurableObjectOuKv)`. L'interface reste
// SYNCHRONE, alors qu'un Durable Object ou KV ne l'est pas, parce que ses
// lecteurs le sont (`memo.get`, `memo.ticket`, `memo.set`, une quinzaine de sites,
// dont des `.invalidate` passés en écouteurs). Un backend partagé garde donc un
// instantané local :
//   - `read` répond depuis l'instantané, que le Worker recharge en tête de chaque
//     requête et de chaque passage planifié ;
//   - `note` met l'instantané à jour et envoie la note par `runInBackground`,
//     regroupée par requête (une écriture de match note plusieurs signaux, un par
//     mémo abonné).
// Le prix : une note peut n'être vue qu'au passage suivant. Une note perdue
// retombe sur la fenêtre de sûreté, comme une écriture faite en SQL à la main.
//
// Module recopié vers le site avec `utils/dormancyMemo.ts` : là-bas, personne ne
// branche rien.

import { logger } from './logger';
import { registerProcessCache } from './processCaches';

export type SharedSignal = {
  /** Change à chaque note. À comparer, jamais à calculer. */
  readonly version: number;
  /** Instant (ms) de la note la plus récente ; 0 si aucune. Ne recule jamais. */
  readonly lastAtMs: number;
};

export type SharedSignalBackend = {
  /** Enregistre une note sans la faire attendre à l'écrivain. */
  note(name: string, atMs: number): void;
  /** Dernier état connu du signal. Synchrone, et ne lève jamais. */
  read(name: string): SharedSignal;
};

const notes = new Map<string, SharedSignal>();
/** Compteur commun : une version ne sert jamais deux fois. */
let lastVersion = 0;
/** Version d'un signal sans note depuis la dernière remise à zéro. */
let unnotedVersion = 0;

const memoryBackend: SharedSignalBackend = {
  note(name, atMs) {
    lastVersion += 1;
    notes.set(name, {
      version: lastVersion,
      lastAtMs: Math.max(atMs, notes.get(name)?.lastAtMs ?? 0),
    });
  },
  read(name) {
    return notes.get(name) ?? { version: unnotedVersion, lastAtMs: 0 };
  },
};

let backend: SharedSignalBackend = memoryBackend;

/** Branche (ou retire, avec `null`) la mémoire partagée entre exemplaires. */
export function setSharedSignalBackend(next: SharedSignalBackend | null): void {
  backend = next ?? memoryBackend;
}

/**
 * Note que l'écriture `name` a eu lieu. Ne lève jamais : l'écriture annoncée est
 * déjà faite, et un lecteur non réveillé retombe sur sa fenêtre de sûreté.
 */
export function noteSharedSignal(
  name: string,
  atMs: number = Date.now()
): void {
  try {
    backend.note(name, atMs);
  } catch (err) {
    logger.error(`[sharedSignals] ${name}`, err);
  }
}

/** État du signal `name`, tel que cet exemplaire le connaît. */
export function readSharedSignal(name: string): SharedSignal {
  return backend.read(name);
}

/** Oublie tous les signaux et retire le backend. Usage strictement test. */
export function __resetSharedSignalsForTests(): void {
  backend = memoryBackend;
  notes.clear();
  lastVersion += 1;
  unnotedVersion = lastVersion;
}
registerProcessCache(__resetSharedSignalsForTests);
