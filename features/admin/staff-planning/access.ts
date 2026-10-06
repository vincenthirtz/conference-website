// features/admin/staff-planning/access.ts — qui peut écrire QUEL créneau.
//
// `manage_staff` tient tout le planning. Tout autre membre du staff tient SES
// disponibilités, et seulement elles (« Mes dispos ») : un créneau est à lui
// quand son pseudo (`person_name`, celui du tableur partagé) est son nom
// affiché, à la casse et aux espaces de bord près. Le contrôle est fait par le
// service, côté serveur, sur la ligne en base — jamais sur ce que le client
// prétend.
//
// Logique PURE (aucune I/O) : testée seule, appelée par le service.

import { AdminError } from '@/utils/admin/errors';

export type PlanningWriter = {
  /** `manage_staff` (et double authentification si exigée) : tout le planning. */
  manageAll: boolean;
  /** Nom affiché du staff : ses créneaux sont ceux à ce pseudo. */
  selfName: string | null;
  /**
   * `manage_staff` détenue mais double authentification manquante : réduit à
   * ses propres créneaux, et le refus le dit (`reason: 'mfa_required'`).
   */
  mfaMissing?: boolean;
};

/** Écriture sans restriction (import, tâches système, tests). */
export const FULL_PLANNING_ACCESS: PlanningWriter = {
  manageAll: true,
  selfName: null,
};

const norm = (s: string) => s.trim().toLocaleLowerCase('fr');

/** Même personne : casse et espaces de bord ignorés. */
export function samePerson(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

/** Nom affiché utilisable comme pseudo de planning (`null` si vide). */
export function selfNameOf(displayName: string | null | undefined) {
  const name = displayName?.trim();
  return name ? name : null;
}

export function canWriteFor(writer: PlanningWriter, person: string): boolean {
  if (writer.manageAll) return true;
  return !!writer.selfName && samePerson(writer.selfName, person);
}

/**
 * Lève 403 si `writer` ne peut pas écrire le créneau de `person` ; sinon
 * rend `person` tel quel — la graphie du planning (celle du tableur), que
 * l'écran envoie, pour qu'un membre n'apparaisse pas sous deux casses.
 */
export function assertCanWriteFor(
  writer: PlanningWriter,
  person: string
): string {
  if (writer.manageAll) return person;
  if (!writer.selfName) {
    throw new AdminError(
      403,
      'forbidden',
      'Renseigne ton nom affiché pour saisir tes disponibilités.'
    );
  }
  if (!samePerson(writer.selfName, person)) {
    throw new AdminError(
      403,
      'forbidden',
      'Tu ne peux modifier que tes propres disponibilités.',
      writer.mfaMissing ? { reason: 'mfa_required' } : undefined
    );
  }
  return person;
}
