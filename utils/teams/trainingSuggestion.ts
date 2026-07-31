// utils/teams/trainingSuggestion.ts
//
// Suggestion de créneau d'entraînement (N6) — cœur PUR.
//
// Le rythme d'équipe (N1) sait déjà dire « vous êtes au complet le mercredi
// 21 h ». Ce qu'il ne dit pas, et qui est justement l'information qui fait
// agir : **et vous ne jouez jamais ce jour-là**. Un créneau où le roster est
// disponible mais où rien ne se passe est le seul gisement de progression
// qu'une équipe possède déjà sans rien changer à son organisation.
//
// Trois règles :
//
//   1. UNE SEULE suggestion à la fois. Une liste de cinq créneaux « à
//      exploiter » n'est pas une suggestion, c'est un rapport — et un rapport
//      ne se lit pas.
//
//   2. RIEN QUI SOIT DÉJÀ FAIT. Un créneau déjà couvert par l'annonce de scrim
//      vivante est retiré : suggérer ce que l'équipe vient de publier la
//      ferait douter de tout le reste.
//
//   3. LE MOINS EXPLOITÉ D'ABORD, à disponibilité égale. Entre deux créneaux où
//      le roster est au complet, celui où l'équipe n'a jamais joué vaut mieux
//      que celui où elle joue déjà toutes les semaines.

import { parseRhythmSlot, rhythmSlotKey } from '@/utils/teams/teamRhythm';
import type { RhythmHeatmap } from '@/utils/teams/teamRhythm';

export type TrainingSuggestion = {
  /** Clé de créneau récurrent (`"<jour ISO>-<minutes>"`). */
  slot: string;
  /** Coéquipières disponibles sur ce créneau. */
  availableCount: number;
  /** Nombre de fois où l'équipe a RÉELLEMENT joué à cette heure-là. */
  playedCount: number;
};

export type TrainingSuggestionInput = {
  /** Créneaux où l'effectif requis est atteint (N1). */
  coreSlots: string[];
  heatmap: RhythmHeatmap;
  /**
   * Clés de créneau (même format) où l'équipe a déjà joué, avec le nombre
   * d'occurrences. Dérivé des affrontements passés, pas d'une déclaration.
   */
  playedBySlot: Map<string, number>;
  /** Clés de créneau déjà couvertes par l'annonce de scrim vivante. */
  announcedSlots: Set<string>;
};

/**
 * Nombre d'occurrences au-delà duquel un créneau est considéré comme DÉJÀ
 * exploité. Une équipe qui y a joué deux fois n'a pas besoin qu'on le lui
 * suggère ; une qui y a joué une fois, si — c'était peut-être un hasard.
 */
export const EXPLOITED_THRESHOLD = 2;

/**
 * Meilleur créneau de noyau encore inexploité, ou `null` s'il n'y a rien à
 * dire — cas parfaitement normal, et la carte ne s'affiche alors pas.
 */
export function pickTrainingSlot(
  input: TrainingSuggestionInput
): TrainingSuggestion | null {
  const candidates: TrainingSuggestion[] = [];

  for (const slot of input.coreSlots) {
    if (input.announcedSlots.has(slot)) continue;
    const playedCount = input.playedBySlot.get(slot) ?? 0;
    if (playedCount >= EXPLOITED_THRESHOLD) continue;
    candidates.push({
      slot,
      availableCount: input.heatmap[slot]?.count ?? 0,
      playedCount,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    // Le plus de monde disponible d'abord — c'est ce qui rend le créneau
    // jouable, et donc la suggestion crédible.
    if (a.availableCount !== b.availableCount) {
      return b.availableCount - a.availableCount;
    }
    // Puis le moins exploité : varier vaut mieux que renforcer l'existant.
    if (a.playedCount !== b.playedCount) return a.playedCount - b.playedCount;
    // Départage stable : ordre de la semaine.
    return compareSlotKeys(a.slot, b.slot);
  });

  return candidates[0];
}

function compareSlotKeys(a: string, b: string): number {
  const pa = parseRhythmSlot(a);
  const pb = parseRhythmSlot(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa.weekday !== pb.weekday) return pa.weekday - pb.weekday;
  return pa.minutes - pb.minutes;
}

/**
 * Compte, par créneau récurrent, les affrontements RÉELLEMENT joués.
 *
 * L'heure est arrondie à l'heure pleine pour retomber sur la grille du rythme
 * (pas horaire) : un match à 21 h 15 compte pour le créneau de 21 h. Sans cet
 * arrondi, presque aucun affrontement ne coïnciderait avec une case, et tous
 * les créneaux paraîtraient inexploités.
 *
 * Le décalage est passé en minutes plutôt qu'en fuseau IANA — le module reste
 * pur, et l'appelant sait déjà dans quel fuseau il raisonne.
 */
export function tallyPlayedBySlot(
  playedAtIso: Array<string | null>,
  offsetMinutes: number
): Map<string, number> {
  const out = new Map<string, number>();
  for (const iso of playedAtIso) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    const local = new Date(t + offsetMinutes * 60_000);
    const day = local.getUTCDay();
    const weekday = day === 0 ? 7 : day;
    const key = rhythmSlotKey(weekday, local.getUTCHours() * 60);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/**
 * Ramène des créneaux ISO absolus (l'annonce de scrim vivante) à des clés de
 * créneau récurrent, pour savoir ce qui est DÉJÀ couvert.
 */
export function announcedSlotKeys(
  isoSlots: string[],
  offsetMinutes: number
): Set<string> {
  return new Set(tallyPlayedBySlot(isoSlots, offsetMinutes).keys());
}
