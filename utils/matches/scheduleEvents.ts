// utils/matches/scheduleEvents.ts
//
// Événements bot de PLANIFICATION d'un match — source unique de la règle et
// des payloads.
//
// POURQUOI UN MODULE. La règle vivait recopiée dans le PATCH admin et dans
// schedule-move ; le PATCH bot en avait une version amputée (jamais de
// `match.rescheduled`), et l'auto-planification, le décalage d'un round et la
// planification en masse d'une phase n'émettaient RIEN. Le 2026-09-09, 14
// matchs ont bougé sans que le bot Discord, les pushs ou les emails ne suivent.
// Toute route qui écrit `matches.scheduled_at` passe désormais par ici.
//
// LA RÈGLE (celle du PATCH admin, inchangée) — pour un match avant → après :
//   - même instant (ou null → null)  → rien ;
//   - nouvelle date, pas d'ancienne  → `match.scheduled` ;
//   - nouvelle date, ancienne date   → `match.scheduled` PUIS `match.rescheduled`
//       (le premier pour l'event Discord natif, le second pour prévenir les
//       équipes : push joueuse + email — cf. web-push-dispatch) ;
//   - date retirée                   → `match.unscheduled`.
// La comparaison se fait sur l'INSTANT, pas sur la chaîne : « 18:30:00+00:00 »
// et « 18:30:00.000Z » sont le même créneau, et ré-écrire un créneau inchangé
// (l'auto-scheduler renvoie les matchs verrouillés à leur heure) ne doit rien
// notifier.
//
// Payloads : documentés dans docs/BOT_API_CONTRACT.md (« Outbox event
// catalog » + section `match.rescheduled`). `match.rescheduled` est un
// SUR-ENSEMBLE de `match.scheduled`.

import { emitBotEvents, type BotEventBatchItem } from '@/utils/botEvents';
import {
  enrichMatchEvent,
  type EnrichedMatchEvent,
} from '@/utils/matches/botEventEnrich';
import { logger } from '@/utils/logger';

export type ScheduleChange = {
  matchId: string;
  tournamentId: string | null;
  scrimId: string | null;
  /** `scheduled_at` AVANT l'écriture. */
  previous: string | null | undefined;
  /** `scheduled_at` APRÈS l'écriture (valeur effectivement écrite). */
  next: string | null | undefined;
};

export type ScheduleEventName =
  | 'match.scheduled'
  | 'match.rescheduled'
  | 'match.unscheduled';

/** Deux `scheduled_at` désignent-ils le même créneau ? */
export function sameScheduleInstant(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null || y === null) return x === y;
  const tx = Date.parse(x);
  const ty = Date.parse(y);
  if (Number.isNaN(tx) || Number.isNaN(ty)) return x === y;
  return tx === ty;
}

/** Noms d'événements à émettre pour UN changement, dans l'ordre d'émission. */
export function scheduleEventNames(
  change: ScheduleChange
): ScheduleEventName[] {
  const prev = change.previous ?? null;
  const next = change.next ?? null;
  if (sameScheduleInstant(prev, next)) return [];
  if (next) {
    return prev
      ? ['match.scheduled', 'match.rescheduled']
      : ['match.scheduled'];
  }
  return ['match.unscheduled'];
}

/**
 * Dédoublonne par match (une requête peut viser deux fois le même) : on garde
 * la date d'AVANT la première écriture et celle de la dernière — c'est le
 * mouvement réel. Écarte les matchs dont le créneau n'a pas changé.
 */
export function collapseScheduleChanges(
  changes: ScheduleChange[]
): ScheduleChange[] {
  const byId = new Map<string, ScheduleChange>();
  for (const c of changes) {
    const seen = byId.get(c.matchId);
    if (seen) {
      byId.set(c.matchId, {
        ...seen,
        next: c.next ?? null,
        tournamentId: c.tournamentId ?? seen.tournamentId,
        scrimId: c.scrimId ?? seen.scrimId,
      });
    } else {
      byId.set(c.matchId, {
        ...c,
        previous: c.previous ?? null,
        next: c.next ?? null,
      });
    }
  }
  return [...byId.values()].filter(
    (c) => !sameScheduleInstant(c.previous, c.next)
  );
}

/** Payloads `data` des événements d'un changement (pur, testé). */
export function buildScheduleEvents(
  change: ScheduleChange,
  enriched: EnrichedMatchEvent | null
): BotEventBatchItem[] {
  const prev = change.previous ?? null;
  const next = change.next ?? null;
  const base = {
    matchId: change.matchId,
    tournamentId: change.tournamentId ?? null,
    scrimId: change.scrimId ?? null,
  };
  return scheduleEventNames(change).map((event): BotEventBatchItem => {
    switch (event) {
      case 'match.scheduled':
        return {
          event,
          group: change.matchId,
          data: { ...base, scheduledAt: next, enriched },
        };
      case 'match.rescheduled':
        return {
          event,
          group: change.matchId,
          data: {
            ...base,
            // snake_case historique, lu par web-push-dispatch / l'email.
            match_id: change.matchId,
            scheduledAt: next,
            previousScheduledAt: prev,
            from: prev,
            to: next,
            enriched,
          },
        };
      case 'match.unscheduled':
        return {
          event,
          group: change.matchId,
          data: { ...base, previousScheduledAt: prev, enriched },
        };
    }
  });
}

const ENRICH_CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return out;
}

export type ScheduleEmitResult = {
  /** Matchs dont le créneau a réellement changé. */
  matches: number;
  /** Événements construits (et persistés sauf erreur outbox). */
  events: number;
  /** Pushes HTTP vers le bot, en fond. Ne rejette jamais. */
  delivery: Promise<unknown>;
};

/**
 * Décide et enfile les événements de planification de N matchs.
 *
 * À appeler APRÈS l'écriture, avec uniquement les écritures réussies :
 * l'enrichissement relit le match (équipes, `discordScheduledEventId`…).
 *
 * Résout une fois l'outbox écrite, en UNE insertion pour tout le lot ; les
 * pushes HTTP continuent dans `delivery`. Ne rejette jamais : un échec
 * d'émission est journalisé, il ne doit pas transformer en 500 une écriture
 * déjà faite.
 */
export async function emitScheduleEvents(
  changes: ScheduleChange[],
  tenantId: string
): Promise<ScheduleEmitResult> {
  const none: ScheduleEmitResult = {
    matches: 0,
    events: 0,
    delivery: Promise.resolve(),
  };
  try {
    const effective = collapseScheduleChanges(changes);
    if (effective.length === 0) return none;

    const enriched = await mapWithConcurrency(
      effective,
      ENRICH_CONCURRENCY,
      (c) => enrichMatchEvent(c.matchId).catch(() => null)
    );
    const items = effective.flatMap((c, i) =>
      buildScheduleEvents(c, enriched[i])
    );
    const { delivery } = await emitBotEvents(items, tenantId);
    return { matches: effective.length, events: items.length, delivery };
  } catch (e) {
    logger.error('[scheduleEvents] emit error:', e);
    return none;
  }
}

/**
 * Variante « lancer et oublier » pour les routes unitaires (PATCH d'un match),
 * qui émettaient déjà en `void` : la réponse n'attend pas l'enrichissement.
 */
export function emitScheduleEventsInBackground(
  changes: ScheduleChange[],
  tenantId: string
): void {
  void emitScheduleEvents(changes, tenantId);
}
