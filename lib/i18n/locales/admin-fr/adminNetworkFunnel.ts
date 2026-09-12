// lib/i18n/locales/admin-fr/adminNetworkFunnel.ts
//
// Traductions FRANCAISES du namespace `adminNetworkFunnel` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts`.
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminNetworkFunnel', {
  pageTitle: 'Admin – Réseau',
  heading: 'Entonnoir du réseau',
  subtitle:
    'Où les joueuses s’arrêtent, entre le compte créé et la première rencontre. Chaque marche demande un engagement de plus que la précédente.',

  stepsHeading: 'Les marches',
  stepAccounts: 'Comptes créés',
  stepAccountsHint: 'Toutes les inscriptions, tous rôles confondus.',
  stepDiscord: 'Discord lié',
  stepDiscordHint:
    'Sans lien Discord, ni message privé du bot ni rôle synchronisé.',
  stepBattlenet: 'BattleTag vérifié',
  stepBattlenetHint: 'Vérification Blizzard réelle, pas un champ déclaré.',
  stepProfiles: 'Carte joueuse créée',
  stepProfilesHint: 'La carte existe — visible ou non.',
  stepDiscoverable: 'Carte visible',
  stepDiscoverableHint:
    'Le seul chiffre qui rend quelqu’un trouvable. Invisible par défaut, et c’est voulu.',
  stepFollows: 'Liens de suivi',
  stepFollowsHint: 'Nombre d’abonnements, pas de personnes.',
  stepScrims: 'Demandes de scrim',
  stepScrimsHint: 'Tous statuts : c’est l’intention qui compte ici.',

  marketsHeading: 'Les portes d’entrée sans compte',
  marketsHint:
    'Ces deux marchés ne demandent pas de compte : ce sont des entrées, pas des marches de l’entonnoir.',
  marketFreePlayers: 'Fiches « je cherche une équipe »',
  marketTeamOpenings: 'Annonces « on recrute »',
  marketsActiveOnly: 'Annonces encore actives (les périmées sont exclues).',

  scopeGlobal: 'réseau entier',
  scopeTenant: 'cet espace',
  ofPrevious: '{pct} % de l’étape précédente',
  unknown: 'inconnu',
  unknownHint: 'Le comptage a échoué — ce n’est pas un zéro.',

  loading: 'Chargement de l’entonnoir…',
  loadError: 'Impossible de charger l’entonnoir.',
  retry: 'Réessayer',
});
