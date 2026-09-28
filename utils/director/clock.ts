// utils/director/clock.ts
//
// L'heure « HH:MM » des écrans du director (segments, vagues, cues, casteuses,
// conflits de planning) — recopiée dans cinq composants, sous deux formes
// (`getHours()` à la main, `toLocaleTimeString('fr-FR')`) qui rendaient la
// même chose. Heure LOCALE du navigateur, sur 24 h, comme avant.
//
// Pur : aucune dépendance, testable tel quel.

/** `HH:MM` d'un instant ISO, ou `null` s'il est absent ou illisible. */
export function clockHHMM(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
}

/** Comme `clockHHMM`, avec un tiret quand il n'y a rien à afficher. */
export function clockOrDash(iso: string | null | undefined): string {
  return clockHHMM(iso) ?? '—';
}
