// utils/competitionWrites.ts
//
// « Une ligne de `matches`, `tournaments` ou `tournament_stages` vient d'être
// écrite. » — le signal qui réveille les lecteurs POLLÉS mis en dormance.
//
// POURQUOI. Le bot (rappels), les crons (litiges) et le badge d'alertes de
// l'admin relisaient ces tables toutes les une à cinq minutes pour constater,
// la plupart du temps, que rien n'avait bougé. Or toutes les écritures de ces
// tables passent par l'API : chacune appelle `noteMatchWrite` ou
// `noteTournamentWrite` APRÈS l'écriture, et les mémos qui déclarent ces signaux
// (`wakeOn`, `utils/dormancyMemo.ts`) repartent de zéro. Entre deux écritures,
// une échéance connue suffit.
//
// DES SIGNAUX PARTAGÉS, PAS DES ABONNÉS. Une note appelait les mémos abonnés en
// mémoire. Or un module n'existe qu'une fois sa route chargée : sur un exemplaire
// du Worker qui n'a jamais servi le badge, son mémo n'était pas abonné, et rien ne
// partait vers les exemplaires qui l'ont. Le signal ne dépend plus de qui écoute.
//
// APPELER APRÈS L'ÉCRITURE, MÊME EN ERREUR. Avant, une lecture partie entre
// l'appel et l'écriture mémoriserait l'état d'avant. Après, chaque ordre
// possible est sûr : une lecture en vol est écartée par la génération du mémo,
// une lecture déjà mémorisée est périmée. Une écriture en erreur peut avoir
// porté (coupure réseau après le commit) : on note quand même, ça ne coûte
// qu'une relecture.
//
// UN TOURNOI OU UNE PHASE ÉCRITS RÉVEILLENT AUSSI LES LECTEURS DE MATCHS : leur
// suppression emporte les matchs en cascade, sans écriture de `matches` vue
// d'ici.
//
// Le garde-fou `tests/unit/competitionWritesGuard.test.ts` refuse un fichier
// qui écrit ces tables sans appeler la note correspondante.
//
// Ce module est importé par des fichiers recopiés vers le site (`utils/checkin.ts`,
// `utils/matches/*`, `utils/bracket/*`…). Là-bas, personne ne lit ces signaux.

import { noteSharedSignal } from './sharedSignals';

/** À déclarer dans `wakeOn` par un mémo de lignes de `matches`. */
export const MATCH_WRITE_SIGNAL = 'competition.match';

/** À déclarer dans `wakeOn` par un mémo de lignes de tournois ou de phases. */
export const TOURNAMENT_WRITE_SIGNAL = 'competition.tournament';

/** Une ligne de `matches` a été insérée, modifiée ou supprimée. */
export function noteMatchWrite(): void {
  noteSharedSignal(MATCH_WRITE_SIGNAL);
}

/**
 * Une ligne de `tournaments` ou de `tournament_stages` a été insérée, modifiée
 * ou supprimée. Réveille aussi les lecteurs de matchs (suppression en
 * cascade).
 */
export function noteTournamentWrite(): void {
  noteSharedSignal(TOURNAMENT_WRITE_SIGNAL);
  noteMatchWrite();
}
