// lib/i18n/locales/admin-fr/adminOnboarding.ts
//
// Traductions FRANCAISES du namespace `adminOnboarding` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminOnboarding', {
  pageTitle: 'Admin – Onboarding',
  heading: 'Onboarding',
  subtitle:
    'Mise en service des espaces, et ce qui attend à la porte : demandes self-service, serveurs Discord en attente.',
  breadcrumbAdmin: 'Admin',
  breadcrumbCurrent: 'Onboarding',
  tabsAriaLabel: "Sections d'onboarding",
  tabInbox: 'À traiter',
  createTenantCta: 'Créer un espace',
  tabReadiness: 'Espaces',
  readinessLoading: 'Chargement des espaces…',
  readinessLoadError: 'État des espaces indisponible.',
  readinessEmpty: 'Aucun espace à afficher.',
  readinessAllReady: 'Tous les espaces sont opérationnels.',
  readinessBlockedCount: '{count} espace(s) ont encore quelque chose à régler.',
  readinessOnlyBlocked: 'Uniquement ceux à régler',
  readinessReady: 'Opérationnel',
  readinessBlockers: '{count} à régler',
  readinessTrial: 'Essai',
  readinessTrialDays: 'Essai — {days} j',
  readinessTrialEndingSoon: 'Essai bientôt fini',
  criterionBot: 'Bot',
  criterionGuilds: '{count} serveur(s)',
  criterionBotSecrets: 'Secrets bot',
  criterionApiKeys: '{count} clé(s) d’API',
  mintKeyCta: 'Émettre une clé d’API',
  grantAccessCta: 'Ouvrir l’accès à quelqu’un',
  grantAccessTitle: 'Ouvrir l’accès à {tenant}',
  grantAccessIntro:
    'Une adresse email suffit. Si la personne a déjà un compte, elle est rattachée immédiatement ; sinon elle reçoit une invitation.',
  grantAccessEmailLabel: 'Adresse email',
  grantAccessRoleLabel: 'Rôle sur cet espace',
  grantAccessRoleHint:
    'Le rôle ne vaut que sur cet espace : il élève, il ne déborde pas. Un owner peut ouvrir l’accès au reste de son équipe lui-même.',
  grantAccessSubmit: 'Ouvrir l’accès',
  grantAccessBusy: 'En cours…',
  grantAccessCancel: 'Annuler',
  grantAccessClose: 'Fermer',
  grantAccessAttached: '{email} avait déjà un compte : elle est rattachée.',
  grantAccessAttachedHint:
    'Rien de plus à faire. À sa prochaine connexion, cet espace lui est accessible.',
  grantAccessInvited: 'Invitation envoyée à {email}.',
  grantAccessInvitedHint:
    'Valable 14 jours. Elle devra être connectée à cette adresse au moment de cliquer — sans compte, le lien ne peut pas aboutir.',
  grantAccessError: 'Impossible d’ouvrir l’accès.',
  grantAccessErrorNoEmail: 'Renseigne une adresse email.',
  mintKeyTitle: 'Clé d’API pour {tenant}',
  mintKeyIntro:
    'La clé sera rattachée à cet espace, et à lui seul. Elle n’est affichée qu’une fois.',
  mintKeyNameLabel: 'Nom de la clé',
  mintKeyScopesLabel: 'Portées',
  mintKeyExpiryLabel: 'Expire dans (jours)',
  mintKeyExpiryHint:
    'Vider le champ pour une clé sans échéance — à éviter : une clé survit à la raison qui l’a fait naître.',
  mintKeyCompLabel: 'Clé partenaire (accès gratuit)',
  mintKeyCompHint:
    'Contourne entièrement le gate de plan : lecture et écriture, sans quota, même si le plan de l’espace a expiré.',
  mintKeyCompNotePlaceholder: 'Pourquoi cette exemption ? (tracé)',
  mintKeyCancel: 'Annuler',
  mintKeySubmit: 'Émettre pour {tenant}',
  mintKeyBusy: 'Émission…',
  mintKeyError: 'Émission impossible.',
  mintKeyErrorNoScope: 'Choisis au moins une portée.',
  criterionConfig: '{count} réglage(s) Discord',
  criterionOwners: '{count} propriétaire(s)',
  criterionEmail: 'Envoi d’emails',
  blockerInactive: 'Espace désactivé',
  blockerNoGuild: 'Aucun serveur Discord',
  blockerNoStaff: 'Personne rattaché à l’espace',
  blockerNoBotSecrets: 'Bot sans secrets : il ne répondra pas',
  blockerNoConfig: 'Discord non configuré',
  blockerNoEmail: 'Envoi d’emails non configuré',
  attachGuildCta: 'Rattacher un serveur',
  attachGuildTitle: 'Rattacher un serveur Discord',
  attachGuildSubtitle: 'Le serveur sera piloté par l’espace « {name} ».',
  attachGuildPendingLabel: 'Serveurs en attente de rattachement',
  attachGuildPendingNone: '— Choisir —',
  attachGuildNoPending:
    'Aucun serveur en attente : saisissez l’identifiant ci-dessous.',
  attachGuildManualLabel: 'Ou identifiant du serveur',
  attachGuildManualHelp:
    'Discord › Paramètres › Avancés › Mode développeur, puis clic droit sur le serveur › Copier l’identifiant.',
  attachGuildBotDelay:
    'Le bot prend le rattachement en compte au rafraîchissement de son cache (environ 5 minutes). Rien à redéployer.',
  attachGuildSubmit: 'Rattacher',
  attachGuildSaving: 'Rattachement…',
  attachGuildCancel: 'Annuler',
  attachGuildInvalid: 'Identifiant de serveur invalide (15 à 25 chiffres).',
  attachGuildDone: 'Serveur rattaché à « {name} ».',
  attachGuildError: 'Rattachement impossible.',
  attachGuildInviteHeading: '1. Inviter le bot sur le serveur',
  attachGuildInviteHelp:
    'Ouvre Discord dans un onglet. Une fois le bot ajouté, revenez ici et rafraîchissez : le serveur apparaît dans la liste ci-dessous.',
  attachGuildInviteCta: 'Inviter le bot',
  attachGuildRefresh: 'Rafraîchir la liste',
  attachGuildRefreshing: 'Rafraîchissement…',
  attachGuildInviteUnavailable:
    'Invitation indisponible : DISCORD_CLIENT_ID n’est pas configuré côté serveur.',
  configureChannelsCta: 'Configurer les salons',
  configureChannelsCount: '{count} réglage(s)',
  guildPrimaryTag: 'principal',
  attachGuildInviteHelpDirect:
    "Ce lien porte cet espace : à la fin de l'installation, Discord vous ramène ici et le serveur est rattaché tout seul. Rien à recopier, rien à retrouver dans une file d'attente.",
});
