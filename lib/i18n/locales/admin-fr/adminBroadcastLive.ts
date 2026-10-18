// lib/i18n/locales/admin-fr/adminBroadcastLive.ts
//
// Traductions FRANCAISES du namespace `adminBroadcastLive` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminBroadcastLive', {
  pageTitle: 'Admin – Twitch & interactions',
  heading: 'Twitch & interactions',
  subtitle:
    'Ce qui se pilote sur la chaîne pendant un direct : statut d’antenne, prédictions, points de chaîne et commandes Twitch. Les drops TCG se gèrent dans Diffusion › Overlays.',
  twitchHeading: 'Statut Twitch',
  twitchLoading: 'Chargement du statut Twitch…',
  twitchLive: '🔴 LIVE',
  twitchOffline: 'Hors ligne',
  twitchViewers: '{count} spectateurs',
  twitchNotConfigured: 'Twitch non configuré.',
  twitchCollapse: 'Replier',
  twitchExpand: 'Déplier',
  twitchPreviewTitle: 'Aperçu Twitch de {channel}',
  twitchChatTitle: 'Chat Twitch de {channel}',
  twitchOfflinePlayer: 'Hors ligne — aucun aperçu disponible.',

  // --- Santé de la chaîne de drop TCG -----------------------------------------
  // Préfixe `drop*` et non `twitch*` : il ne s'agit pas du statut d'antenne
  // (en direct / hors ligne) mais de la souscription EventSub qui fait tomber
  // les cartes. Deux sujets distincts sur le même écran.
  dropHeading: 'Drops TCG',
  dropSubtitle:
    'Twitch peut désactiver la souscription sans prévenir : sans cet écran, les drops s’arrêteraient en plein direct sans que rien ne le montre.',
  dropStatusHealthy: 'Opérationnel',
  dropStatusBroken: 'À réparer',
  dropStatusUnknown: 'Indéterminé',
  dropUnreadable:
    'Twitch n’a pas répondu : impossible de dire si la souscription vit. « On ne sait pas » n’est pas « il n’y en a aucune ».',
  dropSecretMissing:
    'TWITCH_EVENTSUB_SECRET absent : chaque livraison serait rejetée en 403.',
  dropScopeMissing:
    'Scope channel:read:redemptions manquant — reconnecte la chaîne.',
  dropManageScopeMissing:
    'Scope channel:manage:redemptions manquant : le site ne peut pas créer la récompense — reconnecte la chaîne.',
  /** Interpole `{message}` — la raison rendue par l'API / Twitch. */
  dropSetupFailed: 'Mise en service refusée : {message}',
  dropRewardMissing:
    'Aucune récompense de points de chaîne désignée : rien à écouter.',
  dropSetupCta: 'Mettre le drop en service',
  // Récompenses « mises en avant » : des paquets avec une carte garantie,
  // plusieurs à la fois (Octobre Rose ET Halloween).
  dropFeaturedHeading: 'Récompenses à carte garantie',
  dropFeaturedIntro:
    'Des récompenses Twitch plus chères, chacune avec un paquet qui contient à coup sûr une carte de « L’association ». Plusieurs peuvent tourner en même temps, à côté du drop ordinaire ; une carte n’a qu’une récompense.',
  dropFeaturedListLabel: 'Récompenses à carte garantie en service',
  dropFeaturedCard: 'Carte garantie',
  dropFeaturedCost: 'Coût en points de chaîne',
  /** Interpole `{cost}`. */
  dropFeaturedCostValue: '{cost} points',
  dropFeaturedAdd: 'Ajouter la récompense',
  dropFeaturedLive: 'En service',
  dropFeaturedUnpublished: 'Carte retirée — tirage ordinaire',
  dropFeaturedEmpty: 'Aucune récompense à carte garantie en service.',
  dropFeaturedAllBound:
    'Toutes les cartes « L’association » publiées ont déjà leur récompense.',
  dropFeaturedRemove: 'Retirer',
  dropFeaturedRemoving: 'Retrait…',
  /** Interpole `{title}`. */
  dropFeaturedRemoveAria: 'Retirer la récompense « {title} »',
  /** Interpole `{title}`. */
  dropFeaturedRemoveError:
    'Retrait de « {title} » impossible : rien n’a été retiré, réessayez.',
  /** Interpole `{title}`. */
  dropFeaturedRemovedStillEnabled:
    '« {title} » est retirée, mais Twitch n’a pas désactivé la récompense : désactivez-la dans l’onglet Récompenses, sinon un échange ne donnera rien.',
  dropFeaturedNone:
    'Aucune carte « L’association » publiée : créez-en une dans Admin → TCG.',
  dropFeaturedError:
    'Mise en service impossible. Si la récompense a été créée à la main dans Twitch, supprimez-la : seule une récompense créée par le site peut être honorée ou remboursée.',
  dropSetupBusy: 'Mise en service…',
  dropNoSubscription:
    'Aucune souscription active : Twitch n’enverra aucun échange.',
  /** Interpole `{name}` — titre de la carte garantie, ou le drop ordinaire. */
  dropRewardUnsubscribed:
    'Récompense « {name} » sans souscription active : ses échanges n’arrivent pas au site (points dépensés, rien reçu, aucun remboursement).',
  dropRewardOrdinaryName: 'drop ordinaire',
  /** Interpole `{status}` — le statut BRUT de Twitch, jamais reformulé. */
  dropSubscriptionAiling: 'Souscription en défaut : {status}',
  /** Interpole `{count}`. */
  dropHealthyDetail:
    '{count} souscription(s) active(s) — les drops peuvent tomber.',
});
