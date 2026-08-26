// lib/i18n/locales/admin-fr/adminScrimPlanningsList.ts
//
// Traductions FRANCAISES du namespace `adminScrimPlanningsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminScrimPlanningsList', {
  pageTitle: 'Admin – Grilles de scrim',
  heading: 'Planification de scrims',
  subtitle:
    'Grilles de disponibilités partagées pour caler un scrim entre 2 équipes.',
  backScrims: '← Retour aux scrims',
  newPlanning: '+ Nouvelle grille',
  statusFilterLabel: 'Statut',
  filterAll: 'Tous',
  statusOpen: 'Ouverte',
  statusValidated: 'Validée',
  statusClosed: 'Fermée',
  statusCancelled: 'Annulée',
  loading: 'Chargement…',
  empty: 'Aucune grille pour ce filtre.',
  untitled: 'Grille sans titre',
  teamsVs: '{team1} vs {team2}',
  validatedSlot: 'Créneau validé : {when}',
  linkedScrim: '• Scrim créé',
});
