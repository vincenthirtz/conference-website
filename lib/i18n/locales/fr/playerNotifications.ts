// lib/i18n/locales/fr/playerNotifications.ts
//
// Traductions FRANCAISES du namespace `playerNotifications` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerNotifications', {
  eventLabels: {
    'match.starting': 'Match imminent',
    'match.finished': 'Match terminé',
    'match.score_reported': 'Score reporté',
    'checkin.opened': 'Ouverture du check-in',
    'scrim.invitation': 'Invitation à un scrim',
    'scrim.confirmed': 'Scrim confirmé',
    'team.forfeit': 'Forfait d’équipe',
    'news.published': 'Nouvelle actualité',
    'team.weekly.recap': "Récap hebdomadaire d'équipe",
  },
  eventDescriptions: {
    'match.starting': 'Quand un de tes matchs va bientôt commencer.',
    'match.finished': 'Quand un de tes matchs se termine.',
    'match.score_reported': 'Quand un score est reporté sur un de tes matchs.',
    'checkin.opened': 'Quand la fenêtre de check-in s’ouvre.',
    'scrim.invitation': 'Quand ton équipe reçoit une invitation à un scrim.',
    'scrim.confirmed': 'Quand un scrim est confirmé.',
    'team.forfeit': 'Quand un forfait concerne ton équipe.',
    'news.published': 'Quand une actualité est publiée.',
    'team.weekly.recap':
      "Le bilan de la semaine de ton équipe. Envoyé seulement s'il s'est passé quelque chose.",
  },
  loadError: 'Erreur lors du chargement de tes notifications.',
  prefSaved: 'Préférence enregistrée.',
  prefSaveError: 'Impossible d’enregistrer la préférence.',
  pageTitle: 'Notifications',
  signedOutIntro: 'Connecte-toi pour gérer tes notifications.',
  signIn: 'Se connecter',
  unreadMessages: 'Messages non lus',
  unreadMessagesDesc: 'Discussions entre capitaines',
  pendingScrims: 'Demandes de scrim',
  pendingScrimsDesc: 'À traiter sur le tableau de bord',
  joinRequests: 'Demandes d’adhésion',
  joinRequestsDesc: 'Rejoindre ton équipe',
  checkinPending: 'Check-in à valider',
  checkinPendingDesc: 'Valide ta présence',
  backToDashboard: 'Tableau de bord',
  intro: 'Tes actions en attente et tes préférences de notifications push.',
  pendingHeading: 'En attente',
  allUpToDate: 'Tout est à jour ✓',
  noPending: 'Tu n’as aucune action en attente.',
  prefsHeading: 'Préférences de notifications',
  prefsFootnote:
    'Ces réglages s’appliquent aux notifications push du navigateur. Active d’abord les notifications ci-dessus pour les recevoir.',
  broadcastTitle: 'Annonces & campagnes',
  broadcastDesc:
    "Emails d'annonces et de nouveautés de l'OW Women's Cup. Tes notifications de match ne sont pas concernées.",
  broadcastAriaLabel: "Recevoir les emails d'annonces & campagnes",
  invitesTitle: 'Invitations reçues',
  invitesIntro: "Des équipes t'ont invitée à les rejoindre.",
  inviteRole: 'Rôle proposé : {role}',
  inviteRoleWithSpecialty: 'Rôle proposé : {role} ({specialty})',
  inviteExpires: 'Expire le {date}',
  inviteNoExpiry: "Sans date d'expiration",
  acceptInvite: "Rejoindre l'équipe",
  declineInvite: 'Décliner',
  inviteAccepted: "Tu as rejoint l'équipe {team} 🎉",
  inviteDeclined: 'Invitation déclinée.',
  alreadyInTeam:
    "Tu fais déjà partie d'une équipe. Quitte-la avant de rejoindre une autre.",
  inviteExpired: 'Cette invitation a expiré.',
  inviteNotFound: 'Invitation introuvable.',
  inviteForbidden: "Cette invitation ne t'est pas destinée.",
  inviteError: 'Une erreur est survenue. Réessaie plus tard.',
  inviteRolePlayer: 'Joueuse',
  inviteRoleSubstitute: 'Remplaçante',
  inviteRoleCoach: 'Coach',
  inviteRoleManager: 'Manager',
  inviteConfirmTitle: 'Rejoindre {team} ?',
  inviteConfirmSubtitle:
    'Tu rejoindras cette équipe. Si tu es déjà dans une équipe, tu la quitteras.',
  inviteConfirmYes: 'Rejoindre',
  inviteConfirmNo: 'Annuler',
  prefsChannelEvent: "Type d'événement",
  prefsChannelPush: 'Push',
  prefsChannelEmail: 'E-mail',
  prefsPushHint:
    'Les notifications push sont en temps réel, directement dans ton navigateur.',
  prefsEmailOptInHint:
    'Les e-mails sont désactivés par défaut (opt-in). Ils sont envoyés sous forme de récapitulatif environ deux fois par jour (pas en temps réel), avec un lien de désinscription dans chaque message.',
  prefsChannelNotApplicable: 'Indisponible pour ce canal',
  extraEventLabels: {
    'match.scheduled': 'Match planifié',
    'scrim.scheduled': 'Scrim planifié',
  },
  extraEventDescriptions: {
    'match.scheduled': 'Quand un de tes matchs est ajouté au planning.',
    'scrim.scheduled': 'Quand un scrim est planifié avec ton équipe.',
  },
});
