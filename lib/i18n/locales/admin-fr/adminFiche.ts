// lib/i18n/locales/admin-fr/adminFiche.ts
//
// Traductions FRANCAISES du namespace `adminFiche` — le vocabulaire commun de
// l'archétype Fiche (Le Ruban) : état d'enregistrement, métadonnées, zone
// sensible. SOURCE DE VERITE ; pendant anglais dans `../admin-en/adminFiche.ts`.

import { adminNs } from '../../ns';

export default adminNs('adminFiche', {
  dirty: 'Modifications non enregistrées',
  cancel: 'Annuler',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  metaTitle: 'Métadonnées',
  metaId: 'Identifiant',
  metaCreated: 'Créée le',
  metaUpdated: 'Modifiée le',
  dangerTitle: 'Zone sensible',
  dangerIntro:
    'Ces actions engagent des données que d’autres écrans consomment. Chacune demande une confirmation par saisie du nom.',
  typeToConfirm: 'Tapez « {name} » pour confirmer',
  execute: 'Exécuter',
  unsavedConfirm:
    'Des modifications ne sont pas enregistrées. Quitter quand même ?',
  staleTitle: 'Cette fiche a changé entre-temps',
  staleBody:
    'Quelqu’un l’a modifiée depuis que vous l’avez ouverte. Rechargez pour repartir de la version à jour (votre saisie en cours sera perdue).',
  reload: 'Recharger',
});
