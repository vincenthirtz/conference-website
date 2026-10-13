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

let lastWriteMs = 0;

/** À appeler après une insertion réussie dans `bot_event_outbox`. */
export function noteOutboxWrite(nowMs: number = Date.now()): void {
  if (nowMs > lastWriteMs) lastWriteMs = nowMs;
}

/** Vrai si une écriture a été notée à `sinceMs` ou après (bornes incluses). */
export function outboxWrittenSince(sinceMs: number): boolean {
  return lastWriteMs >= sinceMs;
}

/** Oublie l'horodatage. Usage strictement test. */
export function __resetOutboxActivityForTests(): void {
  lastWriteMs = 0;
}
