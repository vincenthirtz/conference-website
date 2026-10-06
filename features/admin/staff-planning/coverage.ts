// features/admin/staff-planning/coverage.ts — LA définition d'un soir de
// match « couvert » : au moins une personne du staff a posé un créneau ce
// jour-là (quels que soient son rôle et ses horaires).
//
// Partagée par l'écran planning (./view.ts : puces rouges, statistiques du
// mois) et par le badge d'alertes de l'admin (./service.ts →
// features/admin/dashboard) : l'alerte et l'écran ne peuvent pas diverger.
// Logique PURE, sans import serveur ni client.

/** Jours (AAAA-MM-JJ) où au moins un créneau est posé. */
export function staffedDays(
  slots: readonly { slot_date: string }[]
): Set<string> {
  return new Set(slots.map((s) => s.slot_date));
}

/** Soirs de match sans aucun créneau ce jour-là, dans l'ordre reçu. */
export function uncoveredNights<N extends { date: string }>(
  nights: readonly N[],
  slots: readonly { slot_date: string }[]
): N[] {
  const staffed = staffedDays(slots);
  return nights.filter((n) => !staffed.has(n.date));
}
