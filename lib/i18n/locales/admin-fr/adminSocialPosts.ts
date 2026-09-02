// lib/i18n/locales/admin-fr/adminSocialPosts.ts
//
// Traductions FRANCAISES du namespace `adminSocialPosts` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts`. Toute cle ajoutee ici doit
// l'etre aussi cote anglais : le garde-fou `../admin-parity.ts` casse le
// typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminSocialPosts', {
  intro:
    'Un texte écrit une fois, envoyé sur plusieurs destinations. Chacune peut recevoir son propre texte et sa propre image.',

  baseLegend: 'Contenu commun',
  baseTextLabel: 'Texte',
  baseTextPlaceholder:
    'Ce que vous voulez annoncer. Chaque destination en hérite tant qu’elle ne le remplace pas.',
  baseImageLabel: 'Image (URL publique)',
  baseImagePlaceholder: 'https://…',
  baseImageHelp:
    'Doit rester en ligne après la publication : certaines plateformes vont la chercher après coup.',

  targetsLegend: 'Destinations',
  targetInherits: 'Hérite du texte commun',
  targetOverride: 'Texte propre',
  targetUseOwnText: 'Écrire un texte propre',
  targetUseBaseText: 'Revenir au texte commun',
  targetOwnImage: 'Image propre (URL)',
  targetTitleLabel: 'Titre de l’actualité',
  targetTitlePlaceholder: 'Déduit de la première ligne si vous le laissez vide',
  charCount: '{count} caractères',
  charCountLimited: '{count} / {limit} caractères',
  charOver: '{over} de trop',

  previewCta: 'Aperçu',
  publishCta: 'Publier',
  publishing: 'Publication…',
  previewTitle: 'Ce qui va partir',
  previewEmpty: 'Cochez au moins une destination.',
  publishLocked: 'Relisez l’aperçu avant de publier.',
  confirmTitle: 'Publier ce post ?',
  confirmBody:
    'Il partira sur {count} destination(s). Une publication ne se rattrape qu’à la main sur chaque plateforme.',
  confirmCta: 'Publier',

  resultDone: 'Publié sur toutes les destinations.',
  resultPartial:
    'Publié partiellement : {sent} destination(s) sur {total}. Les autres sont détaillées ci-dessous.',
  resultFailed: 'Aucune destination n’a reçu le post.',
  statusSent: 'Envoyé',
  statusFailed: 'Échec',
  statusPending: 'En attente',
  statusSkipped: 'Ignoré',
  seePost: 'Voir',

  connectedAs: 'Compte connecté : {handle}',
  notConnected: 'Compte non connecté.',
  connectionExpired: 'La connexion a expiré.',
  connectCta: 'Connecter le compte',
  secretMissing: 'Mise en service : il manque l’App Secret de l’app Meta.',
  secretLabel: 'App Secret Meta',
  secretPlaceholder: '32 caractères hexadécimaux',
  secretSaveCta: 'Enregistrer',
  secretHelp:
    'Il est chiffré à l’enregistrement et n’est jamais réaffiché. Visible une seule fois dans le tableau de bord Meta, section Paramètres de l’app.',
  secretSaved: 'App Secret enregistré. Vous pouvez connecter le compte.',
  secretError: 'Le secret n’a pas pu être enregistré.',
  historyTitle: 'Envois précédents',
  historyEmpty: 'Aucun post envoyé pour l’instant.',
  historyLoading: 'Chargement…',
  loadError: 'Chargement impossible.',
});
