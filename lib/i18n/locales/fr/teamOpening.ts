// lib/i18n/locales/fr/teamOpening.ts
//
// Traductions FRANCAISES du namespace `teamOpening` — SOURCE DE VERITE.
// Recrutement depuis l'espace capitaine (lot P8) : annonce rattachée à
// l'équipe, et décision sur les demandes d'adhésion.
// Le pendant anglais vit dans `../en/teamOpening.ts` : toute clé ajoutée ici
// doit l'être aussi côté anglais (garde-fou `../parity.ts`).

import { ns } from '../../ns';

export default ns('teamOpening', {
  title: 'Annonce de recrutement',
  intro:
    'Dis aux joueuses ce que ton équipe cherche. L’annonce apparaît sur la page Recrutement et dans l’annuaire des équipes, rattachée à ton équipe.',
  none: 'Aucune annonce publiée pour le moment.',
  since: 'Publiée le {date}',
  expires: 'Visible jusqu’au {date}',
  expired:
    'Annonce périmée : elle n’est plus visible. Mets-la à jour pour la remettre en ligne 60 jours.',
  rolesLabel: 'Postes recherchés',
  levelLabel: 'Niveau de l’équipe',
  availabilityLabel: 'Disponibilités (optionnel)',
  availabilityPlaceholder: 'Ex. mardi et jeudi, 21h–23h',
  noteLabel: 'Message aux joueuses (optionnel)',
  notePlaceholder: 'Ambiance, objectifs, ce que vous attendez…',
  discordLabel: 'Pseudo Discord de contact (optionnel)',
  contactNotice:
    'Contact partagé avec les joueuses connectées qui répondent : {email}.',
  noContactEmail:
    'Ton compte n’a pas d’adresse email utilisable comme contact : ajoute-en une à ton profil pour publier une annonce.',
  publish: 'Publier l’annonce',
  update: 'Mettre à jour',
  edit: 'Modifier',
  cancelEdit: 'Annuler',
  close: 'Clore l’annonce',
  closeConfirmTitle: 'Clore l’annonce de recrutement ?',
  closeConfirmSubtitle:
    'Elle disparaît de la page Recrutement et de l’annuaire. Tu pourras en publier une nouvelle à tout moment.',
  closeConfirmYes: 'Clore',
  closeConfirmNo: 'Garder l’annonce',
  saving: 'Enregistrement…',
  published: 'Annonce publiée.',
  updated: 'Annonce mise à jour.',
  closed: 'Annonce close.',
  saveError: 'Impossible d’enregistrer l’annonce.',
  closeError: 'Impossible de clore l’annonce.',
  loadError: 'Impossible de charger l’annonce.',
  errorRoles: 'Choisis au moins un poste recherché.',
  viewPublic: 'Voir la page Recrutement',
  // Demandes d'adhésion (JoinRequestsPanel)
  viewProfile: 'Voir le profil de {name} (rang, héros, historique)',
  discordHandle: 'Discord : {handle}',
  rejectConfirmTitle: 'Refuser la demande de {name} ?',
  rejectConfirmWithReason: 'Le motif saisi lui sera montré.',
  rejectConfirmNoReason:
    'Aucun motif ne lui sera indiqué. Tu peux en saisir un dans le champ prévu avant de refuser.',
  rejectConfirmNo: 'Annuler',
});
