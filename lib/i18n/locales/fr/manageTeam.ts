// lib/i18n/locales/fr/manageTeam.ts
//
// Traductions FRANCAISES du namespace `manageTeam` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('manageTeam', {
  loadError: 'Erreur de chargement.',
  recruitmentOpen: 'Recrutement ouvert',
  recruitmentClosed: 'Recrutement ferme',
  memberRemoved: 'Membre retire',
  roleUpdated: 'Role mis a jour',
  playerAccepted: 'Joueur accepte',
  requestRejected: 'Demande rejetee',
  accessDeniedTitle: 'Acces refuse',
  accessDeniedBody:
    "Tu dois etre capitaine ou manager d'une equipe pour acceder a cette page.",
  backToSpace: 'Retour a mon espace',
  tabTitle: "Gerer {name} | OW Women's Cup",
  // Une membre sans droits VOIT son équipe sans la gérer : lui promettre
  // « Gérer » dans l'onglet serait faux.
  tabTitleMember: "{name} | OW Women's Cup",
  publicPage: 'Page publique →',
  recruitment: 'Recrutement',
  recruitmentOpenDesc: 'Ton equipe est ouverte aux demandes de joueurs.',
  recruitmentClosedDesc: 'Ton equipe est fermee au recrutement.',
  roster_one: 'Roster ({count} membre)',
  roster_other: 'Roster ({count} membres)',
  copyBattleTag: 'Copier le BattleTag',
  unknown: 'Inconnu',
  staffTitle: "Staff de l'équipe ({count})",
  captain: 'Capitaine',
  optionPlayer: 'Joueur',
  optionSubstitute: 'Remplacant',
  optionCoach: 'Coach',
  removeTitle: 'Retirer',
  pendingRequests: 'Demandes en attente',
  pendingRequestsHelp:
    'Joueuses qui demandent à rejoindre ton équipe. Les personnes que TU as invitées apparaissent au-dessus, dans « Invitations envoyées ».',
  noPendingRequests: 'Aucune demande en attente.',

  // Invitations SORTANTES — celles créées à l'inscription ou depuis le
  // formulaire ci-dessus. Sans cette section, une équipe fraîchement inscrite
  // affichait un roster d'une seule personne sans que rien n'explique où
  // étaient passées les joueuses saisies.
  sentInvitations: 'Invitations envoyées',
  sentInvitationsHelp:
    'En attente de réponse. Une joueuse rejoint le roster au moment où elle accepte son invitation — pas avant.',
  noSentInvitations: 'Aucune invitation en attente.',
  invitationsError: 'Impossible de charger les invitations en attente.',
  invitedAs: 'Invitée comme ',
  invitedAsCaptain: 'capitaine',
  invitationSentOn: 'Envoyée le {date}',
  invitationExpiresOn: 'expire le {date}',
  invitationExpired: 'Expirée',
  invitationNoEmail: 'Sans email — à transmettre à la main',
  resendInvitation: 'Relancer',
  resendInvitationTitle:
    "Renvoyer l'email d'invitation avec un nouveau lien (l'ancien cesse de fonctionner)",
  resendInvitationDone: 'Invitation relancée',
  resendInvitationDoneNoEmail:
    "Invitation relancée, mais l'email n'est pas parti — copie le lien et transmets-le.",
  resendInvitationError: 'Échec de la relance.',
  cancelInvitation: 'Annuler',
  cancelInvitationConfirm: "Annuler l'invitation de {name} ?",
  cancelInvitationDone: 'Invitation annulée',
  cancelInvitationError: "Échec de l'annulation.",
  copyInviteLink: 'Copier le lien',
  defaultPlayerName: 'Joueur',
  wantsToJoinAs: 'Souhaite rejoindre en tant que ',
  accept: 'Accepter',
  reject: 'Refuser',
  removeConfirm: "Retirer {name} de l'équipe ?",
  confirmRemove: 'Confirmer',
  cancelRemove: 'Annuler',
  promote: 'Nommer capitaine',
  promoteConfirm: 'Nommer {name} capitaine ?',
  promoteConfirmYes: 'Confirmer',
  promoteCancel: 'Annuler',
  promoteSuccess: '{name} est désormais capitaine.',
  promoteError: 'Impossible de transférer le capitanat.',
  designate: 'Désigner capitaine',
  designateConfirm: 'Désigner {name} comme capitaine ?',
  designateDialogSubtitle:
    "L'équipe n'a pas encore de capitaine. Une fois désignée, seule elle pourra transmettre le capitanat.",
  noCaptainTitle: "Cette équipe n'a pas encore de capitaine",
  noCaptainBody:
    'Désigne une joueuse du roster comme capitaine, ou attends que la capitaine invitée accepte son invitation.',
  noCaptainBodyEmpty:
    "Dès qu'une joueuse aura accepté son invitation, tu pourras la désigner capitaine.",
  specialtyLabel: 'Rôle en jeu',
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  specialtyNone: 'Non précisée',
  specialtyError: 'Impossible de mettre à jour le rôle en jeu.',
  onboardingTitle: 'Invite ta première joueuse',
  onboardingBody:
    "Ton roster est vide pour l'instant. Ouvre le recrutement et partage la page publique de l'équipe pour recevoir des demandes.",
  onboardingCta: "Voir la page de l'équipe",
  removeConsequences:
    "Conséquences : perte d'éligibilité au tournoi et des messages liés.",
  scrimOpenLabel: 'Ouverte aux scrims',
  scrimOpenHelp:
    'Ton équipe apparaît publiquement sur /scrim et peut recevoir des propositions de scrim.',
  scrimOpenOn: 'Ton équipe est visible sur la page scrims publique',
  scrimOpenOff: 'Ton équipe est masquée de la page scrims publique',
  verifiedBadge: 'vérifié',
  unverifiedBadge: 'non vérifié',
  joinMissingBattleTagLabel: 'BattleTag de la joueuse',
  joinMissingBattleTagHint:
    "Elle ne l'a pas renseigné : saisis-le pour l'ajouter au roster, ou demande-lui de compléter son profil.",
  skillRatingUpdated: 'Niveau mis à jour',
  skillRatingError: 'Impossible de mettre à jour le niveau.',
  verifiedBadgeTitle: 'BattleTag vérifié via Battle.net',
  discordUnlinkedBadge: 'Discord non lié',
  discordUnlinkedBadgeTitle:
    "Cette personne n'a pas lié son compte Discord : le bot ne peut ni lui donner ses rôles, ni l'ajouter aux salons de l'équipe, ni la convoquer.",
  discordGapTitle_one:
    '{count} membre sur {total} n’a pas lié son compte Discord',
  discordGapTitle_other:
    '{count} membres sur {total} n’ont pas lié leur compte Discord',
  discordLeftBadge: 'A quitté le Discord',
  discordLeftBadgeTitle:
    "Le compte est lié, mais cette personne n'est plus sur le serveur Discord : le bot ne peut plus lui donner ses rôles ni la convoquer.",
  discordLeftTitle_one:
    '{count} membre sur {total} a quitté le serveur Discord',
  discordLeftTitle_other:
    '{count} membres sur {total} ont quitté le serveur Discord',
  // Fraîcheur du constat : le bot ne repasse que toutes les 30 min, un badge
  // « partie » peut donc être périmé — le dire évite une réinvitation inutile.
  discordCheckedAt:
    'Dernier constat du bot : {date} — il revérifie toutes les 30 minutes.',
  discordLeftBody:
    "Leur compte est bien lié — c'est le serveur qu'elles ont quitté. Elles ne peuvent pas régler ça depuis leur espace joueur : il faut les réinviter sur le Discord.",
  discordGapBodyBoth:
    "Deux manques différents : lier son compte se fait depuis l'espace joueur, revenir sur le serveur demande une réinvitation. Dans les deux cas, la personne ne reçoit ni rôle, ni salon d'équipe, ni convocation — et ne peut pas être validée.",
  discordGapBody:
    'Repère-les au badge orange ci-dessous. Tant que la liaison manque, la personne ne reçoit ni rôle, ni salon d’équipe, ni convocation — et ne peut pas être validée. Elle la fait elle-même depuis son espace joueur, en une fois.',
  unverifiedBadgeTitle:
    'BattleTag non vérifié — la joueuse doit lier son compte Battle.net',
  roleManager: 'Manager',
  specialtyUpdated: 'Rôle en jeu mis à jour',
  roleLockedPrivileged:
    "Seule la capitaine peut modifier le rôle d'un membre qui a des droits de gestion — deux managers ne doivent pas pouvoir se destituer l'un l'autre.",
  roleSelectLabel: "Rôle dans l'équipe",
  errorTitle: "Impossible de charger l'équipe",
  errorBody:
    'Une erreur réseau est survenue. Vérifie ta connexion puis réessaie.',
  retry: 'Réessayer',
  promoteDialogSubtitle:
    'Le transfert du capitanat est irréversible : tu perdras tes droits de capitaine.',
  inviteTitle: "Inviter quelqu'un dans l'équipe",
  inviteHelp:
    "Envoie une invitation par email — ou copie le lien privé et transmets-le toi-même (Discord, SMS…). La personne rejoint l'équipe seulement quand elle accepte.",
  inviteEmailLabel: 'Email',
  inviteEmailPlaceholder: 'personne@email.tld',
  inviteRoleLabel: 'Rôle proposé',
  inviteCta: 'Inviter',
  invitePending: 'Envoi…',
  inviteCreated: 'Invitation créée.',
  inviteSentEmail: 'Invitation envoyée par email.',
  inviteEmailFailed: "Invitation créée — l'email n'a pas pu être envoyé.",
  inviteLinkHint:
    "Lien privé à transmettre (valable 7 jours, une seule personne peut l'utiliser) :",
  inviteCopyLink: 'Copier le lien',
  inviteError: "L'invitation n'a pas pu être créée.",
});
