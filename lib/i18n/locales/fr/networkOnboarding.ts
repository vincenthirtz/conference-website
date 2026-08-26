// lib/i18n/locales/fr/networkOnboarding.ts
//
// Traductions FRANCAISES du namespace `networkOnboarding` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('networkOnboarding', {
  title: 'Exister dans le réseau',
  subtitle:
    "Trois liaisons conditionnent presque tout : les notifications, les salons d'équipe, le classement et la mise en relation.",
  dismiss: 'Masquer ce rappel',
  stepDiscordTitle: 'Lier ton compte Discord',
  stepDiscordWhy:
    "Sans lui, le bot ne peut ni te donner tes rôles, ni t'ouvrir les salons de ton équipe, ni te prévenir.",
  stepDiscordCta: 'Lier',
  stepBattleTagTitle: 'Vérifier ton BattleTag',
  stepBattleTagWhy:
    "Un roster vérifié est crédible auprès des autres équipes, et c'est ce qui permet de te compter dans le classement.",
  stepBattleTagCta: 'Vérifier',
  stepDiscoveryTitle: 'Te rendre découvrable',
  stepDiscoveryWhy:
    'Visible uniquement derrière connexion, jamais indexé : les équipes qui recrutent peuvent te trouver. Réversible à tout moment.',
  stepDiscoveryCta: 'Activer',
});
