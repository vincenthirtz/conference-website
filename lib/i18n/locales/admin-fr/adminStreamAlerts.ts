// lib/i18n/locales/admin-fr/adminStreamAlerts.ts
//
// Traductions FRANCAISES du namespace `adminStreamAlerts` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.
//
// A NE PAS CONFONDRE avec les PHRASES des alertes : celles-ci sont du CONTENU
// (ce que la regie ecrit, dans la langue de sa chaine) et vivent en base, avec
// leurs defauts dans `utils/overlay/alertBox.ts`. Ici, seuls les libelles de
// l'editeur.

import { adminNs } from '../../ns';

export default adminNs('adminStreamAlerts', {
  title: 'Réglages de la boîte d’alertes',
  description:
    'Ce que la source « Alertes » annonce à l’antenne, et comment. La source relit ces réglages toutes les 5 s : un changement s’applique en plein direct, sans recoller l’URL dans OBS.',
  loadError: 'Impossible de charger les réglages des alertes.',
  saveError: 'Enregistrement impossible.',
  saved: 'Réglages des alertes enregistrés.',
  save: 'Enregistrer',
  saving: 'Enregistrement…',

  enabledLabel: 'Alertes à l’antenne',
  enabledHelp:
    'Coupe-circuit : décocher éteint toutes les alertes d’un coup, sans toucher aux réglages ni retirer la source d’OBS. Appliqué immédiatement.',
  enabledOn: 'Alertes rallumées.',
  enabledOff: 'Alertes coupées.',

  durationLabel: 'Durée d’affichage',
  durationUnit: 's',
  durationHelp:
    'Entre {min} et {max} secondes. Laisser vide pour garder la durée de l’animation ({default} s).',
  durationInvalid: 'La durée doit être comprise entre {min} et {max} secondes.',

  soundUrlLabel: 'Son joué',
  soundUrlPlaceholder: '/sounds/alerte.mp3',
  soundUrlHelp:
    'Chemin servi par le site (/…) ou URL https complète. Vide = alerte muette. Un fichier déposé ci-dessous PRIME sur cette URL ; le retirer fait retomber dessus.',
  soundUrlInvalid:
    'Le son doit être un chemin du site (/…) ou une URL https://.',
  volumeLabel: 'Volume',

  // --- Fichiers (habillage, son) -----------------------------------------
  // « Retirer » ne veut jamais dire « aucun » : l'habillage retiré rétablit
  // celui du CODE (l'animation du nœud), le son retiré retombe sur l'URL.
  frameLabel: 'Habillage de la boîte',
  frameHelp:
    'Image PNG, JPEG ou WebP (2 Mio max), ou vidéo MP4 / WebM (8 Mio max). Le fichier remplace l’habillage Women’s Cup dans la source OBS.',
  frameChoose: 'Déposer un habillage',
  frameReplace: 'Remplacer l’habillage',
  frameReset: 'Revenir à l’habillage Women’s Cup',
  frameIsDefault:
    'Habillage Women’s Cup : l’animation du nœud, livrée avec le site. C’est le défaut, pas une absence d’habillage.',
  framePreviewAlt: 'Aperçu de l’habillage des alertes',
  frameResetPending:
    'Au prochain enregistrement, la boîte reprendra l’habillage Women’s Cup.',
  frameTypeRefused:
    'Habillage refusé : formats acceptés PNG, JPEG, WebP, MP4, WebM.',
  frameTooLargeClient:
    'Habillage trop lourd ({size}) : {max} maximum pour ce format.',

  soundFileLabel: 'Fichier son déposé',
  soundFileHelp:
    'MP3, OGG ou WAV, 2 Mio max. Un fichier déposé prime sur l’URL ci-dessus ; le retirer fait retomber dessus.',
  soundChoose: 'Déposer un son',
  soundReplace: 'Remplacer le son',
  soundFileRemove: 'Retirer le fichier déposé',
  soundFileNone: 'Aucun fichier déposé, et aucune URL de son renseignée.',
  soundFromFile: 'Ce son vient du fichier déposé.',
  soundFromUrl: 'Ce son vient de l’URL ci-dessus.',
  soundRemovePending:
    'Au prochain enregistrement, le fichier sera retiré : le son retombera sur l’URL, ou se taira si elle est vide.',
  soundTypeRefused: 'Son refusé : formats acceptés MP3, OGG, WAV.',
  soundTooLargeClient: 'Son trop lourd ({size}) : {max} maximum.',

  filePending:
    'Prêt à envoyer : {name}. Cliquer « Enregistrer » pour l’appliquer.',
  fileSizeUnit: 'Mio',
  fileUnreadable: 'Fichier illisible : réenregistre-le puis réessaie.',
  fileUnsupportedType: 'Format de fichier refusé par le serveur.',
  fileTooLarge: 'Fichier trop lourd : {max} maximum.',
  fileTooLargeAny: '2 Mio pour un son ou une image, 8 Mio pour une vidéo',
  fileContentMismatch:
    'Le contenu du fichier ne correspond pas au format annoncé.',

  accentLabel: 'Couleur d’accent',
  accentHelp: 'Teinte de l’habillage. « Défaut » rend la couleur de la charte.',
  accentReset: 'Défaut',
  accentInvalid: 'La couleur d’accent doit être un code hexadécimal #RRGGBB.',
  accentIsDefault: 'Couleur par défaut',

  rulesTitle: 'Par type d’alerte',
  rulesHint:
    'La phrase accepte deux jetons : {name} (le pseudo, ou « Quelqu’un » si Twitch n’en donne pas) et {amount} (la quantité, déjà mise en forme). Laisser vide rend la phrase par défaut, affichée en gris.',
  messageAria: 'Phrase annoncée pour « {kind} »',
  thresholdAria: 'Seuil d’annonce pour « {kind} »',
  thresholdPlaceholder: 'Aucun',
  thresholdInvalid: 'Le seuil de « {kind} » doit être un nombre positif.',
  rulesThresholdHint:
    'Le seuil n’annonce qu’au-delà de la quantité indiquée — de quoi survivre à une soirée de raid sans une file de « 1 bit ». Il n’existe que pour les types qui portent une quantité.',

  kind_follow: 'Nouveau suivi',
  kind_sub: 'Abonnement',
  kind_resub: 'Réabonnement',
  kind_gift: 'Abonnements offerts',
  kind_cheer: 'Bits',
  kind_raid: 'Raid',
  kind_donation: 'Don',

  unit_resub: 'mois',
  unit_gift: 'abos',
  unit_cheer: 'bits',
  unit_raid: 'spectateurs',
  unit_donation: '€',
  twitchHeading: 'Événements Twitch',
  twitchHelp:
    'Pour que subs, follows, bits et raids arrivent dans la boîte, Twitch doit être abonné à la chaîne. Les dons HelloAsso n’en dépendent pas.',
  twitchCount: '{active}/{total} actifs',
  twitchSubOk: 'actif',
  twitchSubMissing: 'non abonné',
  twitchSubMissingScope:
    'permission {scope} manquante — reconnecter la chaîne (Diffusion → Live)',
  twitchSecretMissing:
    'TWITCH_EVENTSUB_SECRET absent côté serveur : aucun abonnement possible.',
  twitchUnreadable:
    'Liste des abonnements Twitch illisible pour l’instant : l’état ci-dessous peut être incomplet.',
  twitchSubscribe: 'Activer les événements Twitch',
  twitchSubscribing: 'Activation…',
  twitchSubscribed: 'Événements Twitch activés.',
  twitchSubscribedPartial:
    'Activation partielle : voir le détail type par type.',
  twitchSubscribeError: 'Activation impossible.',
});
