// lib/i18n/locales/fr/playerTeams.ts
//
// Traductions FRANCAISES du namespace `playerTeams` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerTeams', {
  pageTitle: "Annuaire des équipes — OW Women's Cup",
  heading: 'Annuaire des équipes',
  subtitle:
    'Qui cherche un scrim, qui recrute, et sur quels créneaux. Les équipes dont les créneaux recoupent les tiens remontent en premier.',
  mySearchTitle: 'Notre recherche de scrim',
  mySearchHelp:
    "Annonce des créneaux concrets : l'annonce expire toute seule après le dernier créneau, et les équipes compatibles sont prévenues.",
  mySearchActive: 'Annonce en ligne',
  expiresAt: 'Expire le {date}',
  slotsLabel: 'Créneaux souhaités',
  slotsEmpty: 'Aucun créneau sélectionné.',
  removeSlot: 'Retirer ce créneau',
  maxSlotsHint: 'Clique sur les créneaux où ton équipe est disponible.',
  timezoneNote: 'Créneaux dans ton fuseau ({tz}).',
  prevWeek: 'Semaine précédente',
  nextWeek: 'Semaine suivante',
  weekOf: 'Semaine du {date}',
  maxReached: '{max} créneaux maximum.',
  noteLabel: 'Précision (facultatif)',
  notePlaceholder:
    'BO3, niveau intermédiaire, on cherche à travailler le dive…',
  publishCta: "Publier l'annonce",
  relaunchCta: "Mettre à jour l'annonce",
  closeCta: "Clore l'annonce",
  published: 'Annonce publiée.',
  publishedWithMatches:
    'Annonce publiée — {count} équipe(s) compatible(s) prévenue(s).',
  closed: 'Annonce close.',
  errorNoSlot: 'Sélectionne au moins un créneau.',
  errorPublish: "L'annonce n'a pas pu être publiée.",
  errorClose: "L'annonce n'a pas pu être close.",
  filterAll: 'Toutes',
  filterScrim: 'Cherchent un scrim',
  filterRecruiting: 'Recrutent',
  searchPlaceholder: 'Rechercher une équipe…',
  badgeScrim: 'cherche un scrim',
  badgeRecruiting: 'recrute',
  membersCount: '{count} membre(s)',
  ratingLabel: 'niveau {rating}',
  commonSlots: '{count} créneau(x) en commun :',
  proposeCta: 'Proposer un scrim',
  joinCta: 'Rejoindre',
  viewCta: 'Voir la fiche',
  empty: 'Aucune équipe ne correspond à ce filtre.',
  errorLoad: "L'annuaire n'a pas pu être chargé.",
  retry: 'Réessayer',
  responseRate: '{rate} % de réponse',
  matchScore: 'Compatibilité {score}',
  matchScoreHelp:
    "Score calculé à partir des créneaux communs, de l'écart de niveau, de la fiabilité et de la nouveauté de l'adversaire.",
  commonRhythm: "{count} créneau(x) d'habitude en commun",
  reasonCommonSlots: 'créneaux annoncés en commun',
  reasonCommonRhythm: 'mêmes habitudes horaires',
  reasonNoCommonSlots: 'aucun créneau en commun',
  reasonSimilarLevel: 'niveau proche',
  reasonLevelGap: 'écart de niveau important',
  reasonReliable: 'répond aux propositions',
  reasonSlowToAnswer: 'répond rarement',
  reasonNeverPlayed: 'jamais affrontée récemment',
  reasonPlayedRecently: 'déjà affrontée plusieurs fois',
  scoutCta: 'Dossier',
});
