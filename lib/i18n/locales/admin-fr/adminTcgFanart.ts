// lib/i18n/locales/admin-fr/adminTcgFanart.ts
//
// Traductions FRANCAISES du namespace `adminTcgFanart` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/adminTcgFanart.ts`
// (garde-fou : `../admin-parity.ts`).
//
// La file de modération des cartes fan art
// (`components/admin/moderation/TcgFanartPanel.tsx`).

import { adminNs } from '../../ns';

export default adminNs('adminTcgFanart', {
  title: 'Cartes fan art',
  intro:
    'Les cartes proposées par la communauté. Valider, c’est décider d’une rareté et faire entrer l’œuvre dans les paquets — avec le crédit de son autrice.',
  tabLabel: 'Fan art',
  statusPending: 'En relecture',
  statusApproved: 'Validées',
  statusRejected: 'Refusées',
  statusRevoked: 'Retirées',
  empty: 'Rien dans cette vue.',
  loadError: 'Impossible de charger la file.',
  by: 'par {artist}',
  artistLink: 'Voir son travail',
  rarityIs: 'Rareté : {rarity}',
  notesAre: 'Note : {notes}',
  imageAlt: '{title}, par {artist}',
  labelRarity: 'Rareté à attribuer',
  labelNotes: 'Note (obligatoire pour un refus ou un retrait)',
  approve: 'Valider',
  reject: 'Refuser',
  revoke: 'Retirer des paquets',
  notesRequired: 'Indiquez le motif.',
  toastApproved: 'Carte validée : elle entre dans les paquets.',
  toastRejected: 'Proposition refusée.',
  toastRevoked: 'Carte retirée des paquets à venir.',
  toastError: 'Action impossible.',
});
