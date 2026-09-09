// lib/i18n/locales/fr/regieNewRun.ts
//
// Traductions FRANCAISES du namespace `regieNewRun` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('regieNewRun', {
  title: 'Démarrer un nouveau run',
  description:
    "Aucun run n'est en cours. Crée un run et lance-le pour ouvrir le pupitre régie.",
  tournamentHint:
    "Un run peut être 100 % libre : ni tournoi ni scrim n'est requis.",
  nameLabel: 'Nom du run',
  namePlaceholder: 'Ex. Soirée de lancement',
  scheduledLabel: 'Date planifiée',
  sourceLabel: 'Compétition liée (optionnel)',
  sourceNone: 'Aucune (run libre)',
  sourceTournament: 'Tournoi',
  sourceScrim: 'Scrim',
  tournamentLabel: 'Tournoi lié (optionnel)',
  tournamentNone: 'Aucun (run libre)',
  scrimLabel: 'Scrim lié',
  scrimNone: 'Choisir un scrim…',
  scrimEmpty: 'Aucun scrim disponible.',
  listLoading: 'Chargement…',
  listError: 'Chargement impossible : {message}',
  listRetry: 'Réessayer',
  submit: 'Créer et démarrer',
  submitting: 'Démarrage…',
  nameRequired: 'Le nom du run est requis.',
  createSuccess: 'Run créé et démarré.',
  createError: 'Impossible de créer ou démarrer le run.',
  segmentsCreated_one: '{count} segment ajouté depuis le tournoi.',
  segmentsCreated_other: '{count} segments ajoutés depuis le tournoi.',
  matchesCreated_one: '{count} match ajouté depuis le scrim.',
  matchesCreated_other: '{count} matchs ajoutés depuis le scrim.',
  fromTournamentError:
    "Le run a été créé mais les segments du tournoi n'ont pas pu être ajoutés. Vous pouvez le lancer via « Démarrer un run préparé » ou le compléter dans le Director.",
  fromScrimError:
    "Le run a été créé mais les matchs du scrim n'ont pas pu être ajoutés. Vous pouvez le lancer via « Démarrer un run préparé » ou le compléter dans le Director.",
});
