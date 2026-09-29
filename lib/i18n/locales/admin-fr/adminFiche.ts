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
});
