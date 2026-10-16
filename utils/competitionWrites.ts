// utils/competitionWrites.ts
//
// « Une ligne de `matches`, `tournaments` ou `tournament_stages` vient d'être
// écrite. » — le signal qui réveille les lecteurs POLLÉS mis en dormance.
//
// POURQUOI. Le bot (rappels), les crons (litiges) et le badge d'alertes de
// l'admin relisaient ces tables toutes les une à cinq minutes pour constater,
// la plupart du temps, que rien n'avait bougé. Or toutes les écritures de ces
// tables passent par ce processus (l'API Lightsail) : chacune appelle
// `noteMatchWrite` ou `noteTournamentWrite` APRÈS l'écriture, et les mémos
// abonnés (`utils/dormancyMemo.ts`) repartent de zéro. Entre deux écritures,
// une échéance connue suffit.
//
// APPELER APRÈS L'ÉCRITURE, MÊME EN ERREUR. Avant, une lecture partie entre
// l'appel et l'écriture mémoriserait l'état d'avant. Après, chaque ordre
// possible est sûr : une lecture en vol est écartée par la génération du mémo,
// une lecture déjà mémorisée est effacée. Une écriture en erreur peut avoir
// porté (coupure réseau après le commit) : on invalide quand même, ça ne coûte
// qu'une relecture.
//
// UN TOURNOI OU UNE PHASE ÉCRITS RÉVEILLENT AUSSI LES LECTEURS DE MATCHS : leur
// suppression emporte les matchs en cascade, sans écriture de `matches` vue
// d'ici.
//
// Le garde-fou `tests/unit/competitionWritesGuard.test.ts` refuse un fichier
// qui écrit ces tables sans appeler la note correspondante.
//
// Aucune dépendance : ce module est importé par des fichiers recopiés vers le
// site (`utils/checkin.ts`, `utils/matches/*`, `utils/bracket/*`…). Là-bas,
// personne ne s'abonne et la note ne fait rien.

type Listener = () => void;

const matchListeners = new Set<Listener>();
const tournamentListeners = new Set<Listener>();

/** Abonne `listener` (en pratique `memo.invalidate`) aux écritures de matchs. */
export function onMatchWrite(listener: Listener): void {
  matchListeners.add(listener);
}

/** Abonne `listener` aux écritures de tournois et de phases. */
export function onTournamentWrite(listener: Listener): void {
  tournamentListeners.add(listener);
}

/** Une ligne de `matches` a été insérée, modifiée ou supprimée. */
export function noteMatchWrite(): void {
  for (const listener of matchListeners) listener();
}

/**
 * Une ligne de `tournaments` ou de `tournament_stages` a été insérée, modifiée
 * ou supprimée. Réveille aussi les lecteurs de matchs (suppression en
 * cascade).
 */
export function noteTournamentWrite(): void {
  for (const listener of tournamentListeners) listener();
  noteMatchWrite();
}
