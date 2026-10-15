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
// concernées passent par ce processus (l'API Lightsail) : chacune invalide le
// mémo de sa table, et la réponse « rien de neuf » peut être rendue de mémoire.
//
// DEUX PROTECTIONS, PAS UNE :
//   - la GÉNÉRATION : `ticket()` est pris AVANT la lecture ; si une écriture
//     tombe pendant qu'elle est en vol, `set()` jette le résultat au lieu de
//     mémoriser un état déjà périmé ;
//   - la FENÊTRE DE SÛRETÉ : au-delà, on relit quoi qu'il arrive. Elle couvre
//     une écriture faite hors de ce processus (SQL à la main, suppression en
//     cascade, deux couleurs qui se recouvrent pendant un déploiement).
//
// Ce que l'appelant ne doit JAMAIS faire : mémoriser une lecture en erreur. Une
// erreur passe son chemin, et le prochain appel relit.
//
// Mémoire du processus : une instance froide repart de zéro et relit, ce qui
// est le comportement voulu. Remis à zéro avant chaque test
// (`utils/processCaches.ts`).

import { registerProcessCache } from './processCaches';

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

export function createDormancyMemo<V>(safetyMs: number): DormancyMemo<V> {
  let generation = 0;
  const entries = new Map<string, { value: V; atMs: number }>();
  const invalidate = () => {
    generation += 1;
    entries.clear();
  };
  registerProcessCache(invalidate);

  return {
    get(key, nowMs) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      // Horloge qui recule, ou fenêtre écoulée : on relit.
      if (nowMs < entry.atMs || nowMs - entry.atMs >= safetyMs) {
        entries.delete(key);
        return undefined;
      }
      return { value: entry.value };
    },
    ticket(nowMs) {
      return { generation, atMs: nowMs };
    },
    set(key, value, ticket) {
      if (ticket.generation !== generation) return;
      entries.set(key, { value, atMs: ticket.atMs });
    },
    invalidate,
  };
}
