// lib/i18n/locales/admin-fr/adminTenantDiscordConfig.ts
//
// Traductions FRANCAISES du namespace `adminTenantDiscordConfig` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTenantDiscordConfig', {
  previewCardHeading: 'Bienvenue {name} ! 🎉',
  previewCardFooter: 'Membre #{count}',
  previewAvatarAlt: "Avatar de l'arrivant (exemple)",
  fieldStaffLogLabel: 'Channel log staff',
  fieldStaffLogHelp:
    'Staff-logs / audit trail modération. Fallback env STAFF_LOG_CHANNEL_ID.',
  fieldMatchesLiveLabel: 'Channel matches live',
  fieldMatchesLiveHelp:
    'Annonces de matches en direct. Fallback env MATCHES_LIVE_CHANNEL_ID.',
  fieldDisputesForumLabel: 'Forum des disputes',
  fieldDisputesForumHelp:
    'Forum où le bot ouvre les threads de dispute. Fallback env DISPUTES_FORUM_CHANNEL_ID.',
  fieldNewsIngestLabel: 'Channel ingestion news',
  fieldNewsIngestHelp:
    'Ingestion des news Blizzard. Fallback env NEWS_INGEST_CHANNEL_ID.',
  fieldScrimsAnnounceLabel: 'Channel annonces scrims',
  fieldScrimsAnnounceHelp:
    'Annonces des scrims. Fallback env SCRIMS_ANNOUNCE_CHANNEL_ID.',
  fieldMemberLeaveLabel: 'Channel des départs',
  fieldMemberLeaveHelp:
    'Notifie quand un membre quitte le serveur (embed de départ). Vide = désactivé. Fallback env MEMBER_LEAVE_CHANNEL_ID.',
  fieldTeamsVoiceLabel: 'Catégorie voice équipes',
  fieldTeamsVoiceHelp:
    "Catégorie où le bot crée les salons vocaux d'équipe. Fallback env TEAMS_VOICE_CATEGORY_ID.",
  fieldCaptainRoleLabel: 'Rôle capitaine',
  fieldCaptainRoleHelp:
    'Rôle Discord « capitaine ». Fallback env CAPTAIN_ROLE_ID.',
  fieldSubstituteRoleLabel: 'Rôle remplaçant',
  fieldSubstituteRoleHelp:
    'Rôle Discord « remplaçant ». Fallback env SUBSTITUTE_ROLE_ID.',
  fieldStaffOwnerLabel: 'Staff role — Owner',
  fieldStaffOwnerHelp: 'Rôle Discord mappé sur le rôle staff owner.',
  fieldStaffAdminLabel: 'Staff role — Admin',
  fieldStaffAdminHelp: 'Rôle Discord mappé sur le rôle staff admin.',
  fieldStaffManagerLabel: 'Staff role — Manager',
  fieldStaffManagerHelp: 'Rôle Discord mappé sur le rôle staff manager.',
  fieldStaffCasterLabel: 'Staff role — Caster',
  fieldStaffCasterHelp: 'Rôle Discord mappé sur le rôle staff caster.',
  fieldTagOpenLabel: 'Tag dispute — Ouvert',
  fieldTagOpenHelp:
    'ID du tag de forum appliqué aux disputes ouvertes (pas un salon : ID de tag).',
  fieldTagPendingLabel: 'Tag dispute — En attente',
  fieldTagPendingHelp:
    "ID du tag de forum pour les disputes en attente d'arbitrage.",
  fieldTagResolvedLabel: 'Tag dispute — Résolu',
  fieldTagResolvedHelp: 'ID du tag de forum pour les disputes résolues.',
  roleManagedSuffix: ' (géré)',
  sectionChannels: 'Channels',
  sectionVoice: 'Voice / Catégorie',
  sectionRoles: 'Rôles Discord',
  sectionTags: 'Tags forum dispute',
  inventoryError: 'Impossible de lister les salons (bot injoignable ?).',
  errorSnowflakeInvalid: 'Snowflake invalide',
  errorSnowflakeInvalidItem: 'Snowflake invalide : {value}',
  errorLoad: 'Erreur de chargement',
  errorFixSnowflakes: "Corrige les snowflakes invalides avant d'enregistrer.",
  saveSuccess: 'Configuration Discord enregistrée.',
  errorSave: 'Enregistrement impossible.',
  pageTitle: 'Admin – Discord config',
  breadcrumbAdmin: 'Admin',
  breadcrumbTenants: 'Tenants',
  breadcrumbDiscordConfig: 'Discord config',
  heading: 'Configuration Discord',
  guildIdLabel: 'Guild ID :',
  fallbackNote:
    "Laisser un champ vide rétablit le fallback (variables d'environnement bot).",
  inventoryLoading: 'Chargement…',
  inventoryReload: '↻ Recharger les salons & rôles',
  inventoryList: '📋 Lister les salons & rôles du serveur',
  inventoryLoaded:
    '✓ {channels} salons · {roles} rôles chargés — sélecteurs activés',
  loadingConfig: 'Chargement de la configuration…',
  selectNoneFallback: '— Aucun (fallback env) —',
  currentId: 'ID actuel : {value}',
  clear: 'Effacer',
  clearFallbackTitle: 'Effacer (utiliser le fallback env)',
  welcomeHeading: 'Accueil des nouveaux arrivants',
  welcomeEnableLabel: 'Activer le message de bienvenue',
  welcomeEnableHelp:
    'Poste automatiquement un message quand un membre rejoint le serveur.',
  welcomeChannelLabel: "Salon d'arrivée",
  selectNoneNoMessage: '— Aucun (pas de message) —',
  clearTitle: 'Effacer',
  welcomeChannelHelp:
    "ID du salon où poster la carte de bienvenue. Renseigné = le bot poste une carte enrichie (avatar de l'arrivant) à chaque arrivée ; vide = pas de message public.",
  welcomeMessageLabel: 'Message public',
  welcomeMessageHelp:
    'Laissé vide = message enrichi par défaut. placeholders : {user} = mention, {server} = nom du serveur, {count} = numéro du membre',
  previewLabel: 'Aperçu',
  previewNoChannelWarning:
    "Renseigne un salon d'arrivée pour activer la carte (le bot ne poste pas sans salon).",
  welcomeDmLabel: 'Message privé (DM)',
  welcomeDmHelp: 'laissé vide = pas de DM ; mêmes placeholders',
  previewDmLabel: 'Aperçu DM',
  saving: 'Sauvegarde…',
  saveSubmit: 'Enregistrer la configuration',
  backToTenant: 'Retour au tenant',
  serverFallback: 'ton serveur',
  welcomeExample1: 'Bienvenue {user} sur {server} !',
  welcomeExample2: 'Salut {user}, bienvenue sur {server} !',
});
