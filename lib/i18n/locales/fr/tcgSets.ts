// lib/i18n/locales/fr/tcgSets.ts
//
// Traductions FRANCAISES du namespace `tcgSets` — SOURCE DE VERITE.
// Toute cle ajoutee ici doit l'etre aussi dans `../en/tcgSets.ts`
// (garde-fou de compilation : `locales/parity.ts`).
//
// Les SERIES du TCG (`components/tcg/TcgSetsPanel.tsx`). Vocabulaire du gain,
// jamais de l'achat : une serie se complete en jouant et en ouvrant ses
// paquets. Les joueuses manquantes ne sont JAMAIS nommees — d'ou des cles de
// comptage (`missingPlayers_*`) et aucune cle qui interpolerait un nom de
// joueuse.

import { ns } from '@/lib/i18n/ns';

export default ns('tcgSets', {
  title: 'Séries',
  intro:
    'Complète une série pour recevoir {coins} pièces — une seule fois par série.',
  introNoReward:
    'Des ensembles de cartes à compléter : toutes les maps d’un mode, les équipes d’une édition, le roster d’une équipe.',
  privacyNote:
    'Pour les joueuses, on indique combien de cartes il te manque, jamais lesquelles.',
  tradeNote:
    'Une carte reçue par échange ne compte pas pour une série : sinon deux comptes pourraient s’échanger les mêmes cartes en boucle pour encaisser la récompense.',
  loading: 'Chargement des séries…',
  error: 'Impossible de charger tes séries pour le moment.',
  retry: 'Réessayer',
  empty: 'Aucune série à compléter pour l’instant.',

  labelMapMode: 'Maps — {mode}',
  labelTournamentTeams: 'Équipes — {tournament}',
  labelTeamRoster: 'Roster {team} — {tournament}',
  unknownTeam: 'équipe',
  unknownTournament: 'édition',
  modeControl: 'Contrôle',
  modeEscort: 'Escorte',
  modeHybrid: 'Hybride',
  modePush: 'Poussée',
  modeFlashpoint: 'Point chaud',

  progress: '{owned} sur {total}',
  progressAria: 'Progression de la série {label}',
  complete: 'Série complète',
  rewarded: 'Récompense reçue',
  rewardedIncomplete:
    'Récompense déjà reçue — une carte a quitté ta collection depuis.',
  missingNamed: 'Il manque : {names}',
  missingPlayers_one: '1 carte de joueuse à trouver',
  missingPlayers_other: '{count} cartes de joueuses à trouver',

  showAll: 'Voir toutes les séries ({count})',
  showLess: 'Voir moins de séries',

  justCompleted: 'Série complétée : {label}. +{coins} pièces.',
});
