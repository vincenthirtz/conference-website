// utils/outboxActivity.ts
//
// « Quelque chose a-t-il été écrit dans `bot_event_outbox` depuis… ? »
//
// POURQUOI. Le dispatcher Web Push tourne chaque minute et commençait chaque
// passage par relire l'outbox — 1 440 lectures par jour pour constater, la
// plupart du temps, qu'aucun événement n'a été émis depuis le passage
// précédent. Or TOUS les producteurs de l'outbox vivent dans ce processus
// (`utils/botEvents.ts` est le seul point d'insertion ; les crons et routes
// qui émettent passent par lui). Un simple horodatage en mémoire suffit donc
// à savoir si une relecture a une chance de trouver du nouveau.
//
// PORTÉE. Mémoire du processus : une instance froide repart à zéro et relit
// (c'est le comportement voulu — mieux vaut une lecture de trop qu'un
// événement en retard). Les consommateurs gardent par ailleurs une relecture
// de sûreté périodique pour couvrir une écriture faite hors de ce processus
// (SQL à la main, deux couleurs qui se recouvrent pendant un déploiement).

import { createDormancyMemo } from './dormancyMemo';

let lastWriteMs = 0;

/**
 * Fenêtre de sûreté de `pendingQueueEmptyMemo` : au-delà, le poller du bot
 * relit l'outbox même sans écriture connue.
 */
export const PENDING_EMPTY_SAFETY_MS = 15 * 60_000;

/**
 * « La file `pending` était vide », par portée de clé (`'*'` pour le bot
 * mutualisé, sinon l'id du tenant).
 *
 * POURQUOI. Le poller de rattrapage du bot (`GET /api/bot/v1/events/pending`)
 * passe toutes les trois minutes au repos, soit ~430 lectures par jour, et
 * trouve la file vide presque à chaque fois : le push HMAC a déjà livré. Une
 * file vide ne se remplit QUE par une écriture — une émission, ou un rejeu
 * `failed → pending` depuis /admin/logs —, et les deux passent par
 * `noteOutboxWrite`. Seul le constat « vide » est mémorisé : une file non vide
 * est relue à chaque appel jusqu'à ce que le bot l'ait acquittée.
 */
export const pendingQueueEmptyMemo = createDormancyMemo<true>(
  PENDING_EMPTY_SAFETY_MS
);

/**
 * À appeler après toute écriture qui peut faire apparaître une ligne `pending`
 * dans `bot_event_outbox` : insertion (même incertaine), rejeu.
 */
export function noteOutboxWrite(nowMs: number = Date.now()): void {
  if (nowMs > lastWriteMs) lastWriteMs = nowMs;
  pendingQueueEmptyMemo.invalidate();
}

/** Vrai si une écriture a été notée à `sinceMs` ou après (bornes incluses). */
export function outboxWrittenSince(sinceMs: number): boolean {
  return lastWriteMs >= sinceMs;
}

/** Oublie l'horodatage. Usage strictement test. */
export function __resetOutboxActivityForTests(): void {
  lastWriteMs = 0;
  pendingQueueEmptyMemo.invalidate();
}
