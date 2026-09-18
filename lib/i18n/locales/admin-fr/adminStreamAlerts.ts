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
    'Chemin servi par le site (/…) ou URL https complète. Vide = alerte muette.',
  soundUrlInvalid:
    'Le son doit être un chemin du site (/…) ou une URL https://.',
  volumeLabel: 'Volume',

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
});
