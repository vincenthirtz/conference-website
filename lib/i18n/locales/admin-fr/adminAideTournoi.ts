// lib/i18n/locales/admin-fr/adminAideTournoi.ts
//
// Traductions FRANCAISES du namespace `adminAideTournoi` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminAideTournoi', {
  pageTitle: 'Aide tournoi (Discord) – Admin',
  metaDescription:
    "Parcours complet pour gérer un tournoi depuis le bot Discord, sans toucher à l'UI admin.",
  breadcrumbAdmin: 'Admin',
  breadcrumbCurrent: 'Aide tournoi (Discord)',
  docLabel: 'Documentation staff',
  heading: 'Aide tournoi (Discord)',
  intro:
    "Parcours complet pour gérer un tournoi depuis le bot, sans toucher à l'UI. Chaque commande indique son rôle, son endpoint, ses impacts DB/UI et un exemple de payload.",
  versionLabel: 'version {version}',
  sectionsCount: '{sections} sections · {commands} commandes',
  tocTitle: 'Sommaire',
  tocAriaLabel: 'Sommaire',
  roleAdmin: 'Admin',
  roleCaptain: 'Capitaine',
  rolePlayer: 'Joueuse',
  rolePublic: 'Public',
  prereqs: 'Prérequis',
  endpoint: 'Endpoint',
  apiNote: '(aucun appel API site)',
  impactDb: 'Impact DB',
  noneReadOnly: 'Aucun (lecture seule)',
  uiPages: 'Pages UI affectées',
  noneFem: 'Aucune',
  examplesLabel: 'Exemples ({count})',
  payload: 'Payload',
  copied: 'Copié !',
  copy: 'Copier',
  expectedResult: 'Résultat attendu',
  noPayload: '(aucun payload)',
});
