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
    "Mise en service des espaces, et ce qui attend à la porte : demandes self-service, serveurs Discord en attente.",
  breadcrumbAdmin: 'Admin',
  breadcrumbCurrent: 'Onboarding',
  tabsAriaLabel: "Sections d'onboarding",
  tabInbox: 'À traiter',
  createTenantCta: 'Créer un espace',
  tabReadiness: "Espaces",
  readinessLoading: "Chargement des espaces…",
  readinessLoadError: "État des espaces indisponible.",
  readinessEmpty: "Aucun espace à afficher.",
  readinessAllReady: "Tous les espaces sont opérationnels.",
  readinessBlockedCount: "{count} espace(s) ont encore quelque chose à régler.",
  readinessOnlyBlocked: "Uniquement ceux à régler",
  readinessReady: "Opérationnel",
  readinessBlockers: "{count} à régler",
  readinessTrial: "Essai",
  readinessTrialDays: "Essai — {days} j",
  readinessTrialEndingSoon: "Essai bientôt fini",
  criterionBot: "Bot",
  criterionGuilds: "{count} serveur(s)",
  criterionConfig: "{count} réglage(s) Discord",
  criterionOwners: "{count} propriétaire(s)",
  criterionEmail: "Envoi d’emails",
  blockerInactive: "Espace désactivé",
  blockerNoPlan: "Plan sans bot",
  blockerNoGuild: "Aucun serveur Discord",
  blockerNoStaff: "Personne rattaché à l’espace",
  blockerNoConfig: "Discord non configuré",
  blockerNoEmail: "Envoi d’emails non configuré",
  attachGuildCta: "Rattacher un serveur",
  attachGuildTitle: "Rattacher un serveur Discord",
  attachGuildSubtitle: "Le serveur sera piloté par l’espace « {name} ».",
  attachGuildPendingLabel: "Serveurs en attente de rattachement",
  attachGuildPendingNone: "— Choisir —",
  attachGuildNoPending: "Aucun serveur en attente : saisissez l’identifiant ci-dessous.",
  attachGuildManualLabel: "Ou identifiant du serveur",
  attachGuildManualHelp: "Discord › Paramètres › Avancés › Mode développeur, puis clic droit sur le serveur › Copier l’identifiant.",
  attachGuildBotDelay: "Le bot prend le rattachement en compte au rafraîchissement de son cache (environ 5 minutes). Rien à redéployer.",
  attachGuildSubmit: "Rattacher",
  attachGuildSaving: "Rattachement…",
  attachGuildCancel: "Annuler",
  attachGuildInvalid: "Identifiant de serveur invalide (15 à 25 chiffres).",
  attachGuildDone: "Serveur rattaché à « {name} ».",
  attachGuildError: "Rattachement impossible.",
  attachGuildInviteHeading: "1. Inviter le bot sur le serveur",
  attachGuildInviteHelp: "Ouvre Discord dans un onglet. Une fois le bot ajouté, revenez ici et rafraîchissez : le serveur apparaît dans la liste ci-dessous.",
  attachGuildInviteCta: "Inviter le bot",
  attachGuildRefresh: "Rafraîchir la liste",
  attachGuildRefreshing: "Rafraîchissement…",
  attachGuildInviteUnavailable: "Invitation indisponible : DISCORD_CLIENT_ID n’est pas configuré côté serveur.",
  configureChannelsCta: "Configurer les salons",
  configureChannelsCount: "{count} réglage(s)",
  guildPrimaryTag: "principal",
  attachGuildInviteHelpDirect:
    "Ce lien porte cet espace : à la fin de l'installation, Discord vous ramène ici et le serveur est rattaché tout seul. Rien à recopier, rien à retrouver dans une file d'attente.",
});
