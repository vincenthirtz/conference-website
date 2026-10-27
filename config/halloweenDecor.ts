// config/halloweenDecor.ts
//
// La décoration d'Halloween du site public (components/Halloween) : toiles et
// araignées dans les coins, chauves-souris, sorcière, momie, fantôme,
// citrouilles.
//
// POURQUOI UN FICHIER ET PAS UN RÉGLAGE ADMIN. Comme l'encart d'événement
// (config/homeEventSpotlight) : cela revient une fois par an, et deux dates
// coûtent moins cher qu'un formulaire. La décoration apparaît à `visibleFrom`
// et se retire seule à `visibleUntil` — inutile de penser à la désactiver.
// Pour l'an prochain : changer les deux dates. `null` la coupe partout.

export type HalloweenDecorWindow = {
  /** ISO 8601 avec fuseau — début de l'affichage. */
  visibleFrom: string;
  /** ISO 8601 avec fuseau — au-delà, la décoration disparaît. */
  visibleUntil: string;
};

export const halloweenDecor: HalloweenDecorWindow | null = {
  visibleFrom: '2026-10-27T00:00:00+01:00',
  // Lendemain de la Toussaint : la soirée du 31 et le week-end restent décorés.
  visibleUntil: '2026-11-02T00:00:00+01:00',
};

/** La décoration est-elle à l'affiche à cet instant ? */
export function isHalloweenDecorOn(
  period: HalloweenDecorWindow | null,
  nowMs: number
): boolean {
  if (!period) return false;
  return (
    nowMs >= new Date(period.visibleFrom).getTime() &&
    nowMs < new Date(period.visibleUntil).getTime()
  );
}
