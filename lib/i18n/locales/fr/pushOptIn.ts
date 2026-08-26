// lib/i18n/locales/fr/pushOptIn.ts
//
// Traductions FRANCAISES du namespace `pushOptIn` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('pushOptIn', {
  msgAdmin:
    'Active les notifications pour etre alerte des matches, disputes et inscriptions, meme quand l onglet est ferme.',
  msgCaster:
    'Active les notifications pour recevoir tes assignations cast, briefings et signaux du Director, meme hors session.',
  msgPlayer:
    'Active les notifications pour recevoir tes alertes de match, check-in, scrim et news, meme quand l onglet est ferme.',
  msgPublic:
    'Active les notifications pour recevoir les annonces de l event en direct.',
  cardTitle: 'Notifications navigateur',
  activating: 'Activation...',
  activate: 'Activer',
  later: 'Plus tard',
  errVapidMissing:
    'Notifications non configurees sur ce serveur (cle VAPID manquante).',
  permDenied:
    'Permission refusee. Tu peux la reactiver depuis les reglages du navigateur.',
  successCaster:
    'Notifications caster activees. Tu recevras tes assignations et signaux Director.',
  successPlayer:
    'Notifications activees. Tu recevras tes alertes match, check-in et scrim.',
  successDefault:
    'Notifications activees. Tu recevras les alertes match, scrim et support.',
  errActivate: 'Impossible d activer les notifications. Reessaie plus tard.',
});
