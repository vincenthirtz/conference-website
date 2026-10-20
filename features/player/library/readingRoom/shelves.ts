// features/player/library/readingRoom/shelves.ts — les rayonnages de la Grande
// salle de lecture (lot 8 de docs/PLAN-womens-library.md) : ce qu'on y lit, et
// où le même contenu vit hors du monde.
//
// UNE SEULE SOURCE DE VÉRITÉ : la page publique /securite (lot 8a). La salle
// ne recopie aucun texte. Chaque rayonnage pointe une SECTION de /securite (son
// ancre) ; le panneau de lecture rend les composants de cette section
// (`components/safety/**`), et les numéros viennent de `HELPLINES`. Changer un
// numéro ou une phrase là-bas la change ici.
//
//   1. les ressources d'aide (urgences et lignes d'écoute) ;
//   2. réagir au harcèlement : en jeu, sur Discord, en stream ;
//   3. comment l'association traite un signalement ;
//   4. la charte — un emplacement réservé jusqu'à son écriture.
//
// CONTENU À FAIRE VALIDER PAR L'ASSOCIATION (comme /securite) : la liste des
// numéros, la description du traitement d'un signalement, la charte.
//
// LE GUICHET ouvre /support pré-rempli : catégorie `behavior`, anonymat
// proposé (case cochée, décochable). AUCUN contexte de salle dans le lien :
// un sujet ou un message « depuis la salle de lecture » deviendrait, dans le
// ticket, la trace de qui fréquente la salle.
//
// PUR : aucune lecture réseau, aucun import de valeur du moteur ni de React.

import { HELPLINES, type Helpline } from '@/components/safety/helplines';
import { buildSupportHref, type SupportPrefill } from '@/utils/support/prefill';

/** Les rayonnages, dans l'ordre de la salle (et de /securite). */
export const READING_ROOM_SHELF_IDS = [
  'helplines',
  'guides',
  'report',
  'charter',
] as const;

export type ReadingRoomShelfId = (typeof READING_ROOM_SHELF_IDS)[number];

/** Page publique, sans compte, ouverte à toutes (mineures comprises). */
export const SECURITE_PATH = '/securite';

/**
 * L'ancre de la section de /securite qui porte le même contenu. Les trois
 * premières sont celles qu'exportent les composants (SAFETY_HELPLINES_ID,
 * SAFETY_HARASSMENT_ID, SAFETY_REPORT_ID), la charte celle de la page :
 * tests/unit/libraryReadingRoomShelves.test.ts vérifie qu'elles existent.
 */
export const SECURITE_ANCHORS: Readonly<Record<ReadingRoomShelfId, string>> = {
  helplines: 'urgences',
  guides: 'harcelement',
  report: 'signaler',
  charter: 'charte',
};

export function isReadingRoomShelfId(
  value: unknown
): value is ReadingRoomShelfId {
  return (
    typeof value === 'string' &&
    (READING_ROOM_SHELF_IDS as readonly string[]).includes(value)
  );
}

/** Le lien vers la section de /securite qui porte le même contenu. */
export function securiteHref(shelf: ReadingRoomShelfId): string {
  return `${SECURITE_PATH}#${SECURITE_ANCHORS[shelf]}`;
}

/** L'id du titre (`h2`) que `SafetySection` pose dans la section. */
export function shelfHeadingId(shelf: ReadingRoomShelfId): string {
  return `${SECURITE_ANCHORS[shelf]}-titre`;
}

/**
 * Les numéros du rayonnage d'aide, dans l'ordre de /securite (urgences, puis
 * écoute). Le 114 est un SMS : l'interface le dit.
 */
export function helplineNumbers(
  lines: readonly Helpline[] = HELPLINES
): string[] {
  const urgent = lines.filter((l) => l.group === 'urgent');
  const listen = lines.filter((l) => l.group === 'listen');
  return [...urgent, ...listen].map((l) => l.number);
}

/** Le guichet : un signalement de comportement, l'anonymat proposé. */
export const GUICHET_PREFILL: Readonly<SupportPrefill> = {
  category: 'behavior',
  anonymous: true,
};

/** `/support?category=behavior&anonymous=1` — rien d'autre. */
export const GUICHET_HREF = buildSupportHref(GUICHET_PREFILL);

/** Même formulaire, sans l'anonymat coché, pour qui veut une réponse. */
export const GUICHET_NAMED_HREF = buildSupportHref({ category: 'behavior' });
