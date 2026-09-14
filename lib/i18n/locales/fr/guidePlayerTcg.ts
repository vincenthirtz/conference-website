// lib/i18n/locales/fr/guidePlayerTcg.ts
//
// Traductions FRANCAISES du namespace `guidePlayerTcg` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// AUCUN MONTANT N'EST ECRIT ICI. Les chiffres arrivent par interpolation
// (`{coins}`, `{price}`, `{refund}`) depuis `/api/player/tcg/packs`, qui les
// derive d'`economy.ts`. Ce depot a deja paye quatre fois le prix d'un bareme
// recopie : un guide qui annoncerait « 300 pieces » mentirait au premier
// reglage, et ce serait le pire endroit ou mentir puisque c'est celui qui
// pretend expliquer la regle.

import { ns } from '../../ns';

export default ns('guidePlayerTcg', {
  heroBadge: 'Guide',
  heroTitle: 'Comment marche le TCG',
  heroSubtitle:
    'Des cartes à collectionner qui relisent la compétition : les joueuses, les équipes et les maps du circuit. Voici comment on en obtient, ce qu’on peut en faire, et ce que tu contrôles sur ta propre carte.',
  backToCollection: 'Retour à ma collection',
  sectionLabel: 'Partie {number}',

  // ── 1. Ce que c'est ────────────────────────────────────────────────
  whatTitle: 'Une carte, trois sujets',
  whatIntro:
    'Une carte représente une joueuse, une équipe ou une map. Les trois ne se ressemblent pas, et c’est voulu : une joueuse est une personne, une équipe est une entité déjà publique, une map est un objet de jeu qui n’appartient à personne.',
  whatPack:
    'Un paquet contient toujours cinq cartes : trois joueuses, une équipe, une map. Ce sont des emplacements réservés, pas un tirage au hasard sur l’ensemble — sans quoi il sortirait des paquets entièrement composés d’équipes.',
  whatNoNewData:
    'Le TCG n’invente aucune donnée : il relit celle qui existe déjà. Les paquets viennent des victoires enregistrées, la rareté des badges affichés sur ta fiche, la face d’une carte d’équipe de son nom et de son logo publics.',

  // ── 2. Comment on en gagne ─────────────────────────────────────────
  earnTitle: 'Comment on obtient des paquets',
  earnIntro:
    'Chaque voie donne un paquet ET des pièces. Les montants ci-dessous sont ceux réellement appliqués, lus depuis le serveur — pas des exemples.',
  earnMatchWin: 'Victoire en match de tournoi',
  earnScrimWin: 'Victoire en scrim classé',
  earnWelcome: 'Cadeau de bienvenue, une fois',
  earnTwitchDrop: 'Carte récupérée pendant un direct',
  /** Interpole `{coins}`. */
  earnCoins: '+{coins} pièces',
  earnPackToo: 'et un paquet',
  earnTwitchOff:
    'Le drop en direct n’est pas actif en ce moment. Il n’apparaîtra ici que lorsqu’une chaîne sera connectée et qu’une récompense lui sera associée — inutile de le chercher d’ici là.',
  earnTwitchHow:
    'Pour recevoir un drop, il faut avoir lié son compte Twitch depuis la page de collection : un événement Twitch livre un identifiant Twitch, jamais un compte du site. Sans ce pont, une carte réclamée en direct n’a pas de destinataire.',

  // ── 3. La monnaie ──────────────────────────────────────────────────
  moneyTitle: 'La monnaie se gagne, elle ne s’achète pas',
  moneyBody:
    'Il n’y a aucun moyen d’acheter des pièces avec de l’argent réel, et il n’y en aura pas. Une monnaie achetable associée à un contenu aléatoire est une boîte à butin payante : c’est interdit en Belgique et aux Pays-Bas, surveillé par l’ANJ en France, et notre public compte des mineures.',
  moneyDonation:
    'Faire un don à l’association ne crédite donc rien, jamais. Soutenir et collectionner sont deux gestes distincts du même compte, pas un échange de l’un contre l’autre.',

  // ── 4. La boucle ───────────────────────────────────────────────────
  loopTitle: 'Ouvrir, recycler, racheter',
  loopOpen:
    'Un paquet gagné arrive fermé. L’ouvrir tire ses cinq cartes et les fige — jusque-là, il peut attendre autant que tu veux.',
  /** Interpole `{price}`. */
  loopBuy:
    'Avec {price} pièces, tu peux acheter un paquet supplémentaire. L’achat crée un paquet fermé : le tirage appartient toujours à l’ouverture.',
  /** Interpole `{refund}`. */
  loopRecycle:
    'Un doublon se recycle contre {refund} pièces. Ton dernier exemplaire d’une carte est intouchable — sans cette règle, « recycler un doublon » deviendrait « détruire sa collection contre de la monnaie ».',
  loopRecycleWhich:
    'Quand tu recycles, c’est toujours l’exemplaire le MOINS précieux qui part : la plus basse rareté, et la version non brillante à rareté égale. Ta meilleure copie reste chez toi.',

  // ── 5. La rareté ───────────────────────────────────────────────────
  rarityTitle: 'D’où vient la rareté',
  rarityBody:
    'La rareté d’une carte de joueuse vient de ses badges — les mêmes que sur sa fiche. Un titre (championne d’un tournoi, première d’une saison de ligue) donne le palier le plus haut ; sinon le palier du meilleur badge décide.',
  rarityCommon: 'Commune — badge bronze',
  rarityRare: 'Rare — badge argent',
  rarityEpic: 'Épique — badge or',
  rarityLegendary: 'Légendaire — badge platine, ou un titre',
  rarityFoil:
    'Le brillant est indépendant de la rareté : c’est une variante d’impression, pas un cinquième palier. Une commune brillante reste une commune.',

  // ── 6. Ta photo ────────────────────────────────────────────────────
  photoTitle: 'Ta photo, et ce que tu en contrôles',
  photoIntro:
    'C’est la partie qui compte. Une carte n’est pas un avatar : elle circule chez d’autres personnes, elle se garde, elle s’affiche sans que tu sois là. Trois garanties encadrent donc ta photo, et aucune ne dépend de la bonne volonté de qui que ce soit.',
  photoOptIn: 'Rien sans ton geste',
  photoOptInBody:
    'Aucune photo n’entre dans le TCG sans que tu l’aies déposée toi-même. Tant que tu n’as rien envoyé, ta carte existe sans portrait — et aucune image de toi ne circule.',
  photoModeration: 'Relue avant d’être visible',
  photoModerationBody:
    'Une photo déposée est en attente : personne ne la voit tant que l’équipe ne l’a pas approuvée. Une photo que tu remplaces repasse en attente, même si l’ancienne était déjà validée.',
  photoWithdraw: 'Retirable, y compris après coup',
  photoWithdrawBody:
    'Tu peux retirer ta photo à tout moment, et le retrait atteint les cartes DÉJÀ distribuées : la face est relue à chaque affichage, et le fichier est supprimé. Les cartes existantes retombent sur ton avatar public.',

  // ── 7. Sans équipe ─────────────────────────────────────────────────
  supporterTitle: 'Tu ne joues pas ?',
  supporterBody:
    'Les victoires ne sont pas la seule voie. Un compte supportrice reçoit un cadeau de bienvenue, puis gagne des cartes en suivant les directs — c’est le drop Twitch, qui ne demande aucune équipe.',
  supporterLink: 'Lier mon compte Twitch',

  ctaTitle: 'Prête à ouvrir un paquet ?',
  ctaBody:
    'Ta collection t’attend. Les cartes que tu possèdes s’y trient de la plus rare à la plus commune.',
  ctaButton: 'Voir ma collection',
});
