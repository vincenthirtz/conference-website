// lib/i18n/locales/fr/invitationPage.ts
//
// Traductions FRANCAISES du namespace `invitationPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts`.

import { ns } from '../../ns';

export default ns('invitationPage', {
  title: 'Invitation',
  loading: 'Chargement…',
  notFound: 'Invitation introuvable.',
  unavailable: 'Invitation indisponible pour le moment.',
  acceptFailed: "L'acceptation a échoué.",
  offer: "On vous propose un accès {role} à l'espace {tenant}.",
  emailHint:
    'Invitation envoyée à {email} — connectez-vous avec cette adresse pour l’accepter.',
  accept: "Accepter l'invitation",
  accepting: 'Acceptation…',
  doneTitle: 'C’est fait : vous avez accès à {tenant}.',
  openAdmin: "Ouvrir l'administration",
  revoked: 'Cette invitation a été annulée.',
  expired: 'Cette invitation a expiré.',
  askAgain: 'Demandez-en une nouvelle à la personne qui vous a invité·e.',
  roleOwner: 'propriétaire',
  roleAdmin: 'administration',
  roleCaster: 'cast et régie',
});
