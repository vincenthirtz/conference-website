// utils/dormancyMemo.ts
//
// Un mémo « rien à faire » pour les routes et crons pollés : la dernière
// lecture, gardée tant qu'AUCUNE écriture connue ne l'a périmée et qu'une
// fenêtre de sûreté court encore.
//
// POURQUOI. Le bot et les crons Netlify interrogent l'API toutes les une à dix
// minutes, jour et nuit, pour des événements qui n'ont lieu que quelques soirs
// par semaine. Chaque appel coûtait une requête Supabase — et les journaux
// Supabase sont facturés à la requête. Or toutes les écritures des tables
// concernées passent par l'API : chacune note le signal du mémo de sa table
// (`utils/sharedSignals.ts`), et la réponse « rien de neuf » peut être rendue de
// mémoire.
//
// DEUX PROTECTIONS, PAS UNE :
//   - la GÉNÉRATION : `ticket()` est pris AVANT la lecture ; si une écriture
//     tombe pendant qu'elle est en vol, `set()` jette le résultat au lieu de
//     mémoriser un état déjà périmé ;
//   - la FENÊTRE DE SÛRETÉ : au-delà, on relit quoi qu'il arrive. Elle couvre
//     une écriture faite hors de l'API (SQL à la main, suppression en cascade)
//     ou une note qui s'est perdue.
//
// Ce que l'appelant ne doit JAMAIS faire : mémoriser une lecture en erreur. Une
// erreur passe son chemin, et le prochain appel relit.
//
// Les valeurs restent en mémoire de l'exemplaire : une instance froide repart de
// zéro et relit, ce qui est le comportement voulu. Seul le signal est partagé, et
// il est remis à zéro avant chaque test (`utils/processCaches.ts`).

import { noteSharedSignal, readSharedSignal } from './sharedSignals';

/** Pris au DÉBUT d'une lecture, rendu à `set()` à la fin. */
export type MemoTicket = { readonly generation: number; readonly atMs: number };

export type DormancyMemo<V> = {
  /**
   * La valeur mémorisée pour `key`, emballée (elle peut valoir `null`), ou
   * `undefined` s'il n'y a rien d'exploitable : jamais lu, invalidé, ou
   * fenêtre de sûreté écoulée.
   */
  get(key: string, nowMs: number): { value: V } | undefined;
  /** À prendre juste avant la lecture que l'on compte mémoriser. */
  ticket(nowMs: number): MemoTicket;
  /** Mémorise `value`, sauf si une écriture est survenue depuis `ticket`. */
  set(key: string, value: V, ticket: MemoTicket): void;
  /** Une écriture a eu lieu : tout est à relire. */
  invalidate(): void;
};

/**
 * `signal` nomme le signal partagé du mémo (`utils/sharedSignals.ts`) : stable,
 * et propre à ce que le mémo garde. Deux mémos sous le même nom se réveillent
 * ensemble.
 */
export function createDormancyMemo<V>(
  signal: string,
  safetyMs: number
): DormancyMemo<V> {
  const entries = new Map<
    string,
    { value: V; atMs: number; generation: number }
  >();
  const currentGeneration = () => readSharedSignal(signal).version;

  return {
    get(key, nowMs) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      // Écriture notée depuis, horloge qui recule, ou fenêtre écoulée : on relit.
      if (
        entry.generation !== currentGeneration() ||
        nowMs < entry.atMs ||
        nowMs - entry.atMs >= safetyMs
      ) {
        entries.delete(key);
        return undefined;
      }
      return { value: entry.value };
    },
    ticket(nowMs) {
      return { generation: currentGeneration(), atMs: nowMs };
    },
    set(key, value, ticket) {
      if (ticket.generation !== currentGeneration()) return;
      entries.set(key, {
        value,
        atMs: ticket.atMs,
        generation: ticket.generation,
      });
    },
    invalidate() {
      noteSharedSignal(signal);
      entries.clear();
    },
  };
}
