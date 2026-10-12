// lib/i18n/locales/fr/homeTcg.ts
//
// Traductions FRANCAISES du namespace `homeTcg` — le bloc TCG de l'accueil
// (components/Home/HomeTcgShowcase.tsx). SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/homeTcg.ts` : toute cle ajoutee ici doit
// l'etre la-bas, sans quoi le garde-fou `../parity.ts` casse le typecheck.
//
// POURQUOI UN NAMESPACE A PART, ET PAS `playerTcg`. Les libelles de carte
// (raretes, « Brillante »…) existent deja dans `playerTcg`, mais ce
// namespace pese ~17 Ko : l'embarquer dans la page la plus vue du site pour
// sept mots aurait alourdi chaque visite. Les sept mots sont donc repris ici,
// et `tests/unit/homeTcgShowcase.test.tsx` verifie qu'ils restent IDENTIQUES a
// ceux de `playerTcg`, dans les deux langues : une copie surveillee, pas une
// copie libre de diverger.

import { ns } from '../../ns';

export default ns('homeTcg', {
  eyebrow: 'Cartes à collectionner',
  title: 'Toute la Cup tient dans un paquet de cartes',
  lede: 'Équipes, maps, visuels de l’association, joueuses : chaque match fait tomber des cartes. Ouvre des paquets, complète des séries, échange tes doubles.',
  // `{n}` est déjà formaté selon la langue (séparateur de milliers).
  totalCards: '{n} cartes à collectionner',
  coinsTitle: 'Les pièces, ça se gagne en jouant',
  coins:
    'Une victoire rapporte {win} pièces — une défaite aussi, {loss} : chaque match compte. Participer au tournoi en rapporte {participation}, et le classement final jusqu’à {top}.',
  cardsAria: 'Trois cartes du jeu',
  ctaStart: 'Commencer ma collection',
  ctaLogin: 'J’ai déjà un compte',
  ctaCatalog: 'Voir toutes les cartes',
  // Libelles de carte — IDENTIQUES a `playerTcg` (cf. en-tete).
  rarityCommon: 'Commune',
  rarityRare: 'Rare',
  rarityEpic: 'Épique',
  rarityLegendary: 'Légendaire',
  foil: 'Brillante',
  copies: '×{count}',
  logoCredit: 'Logo : {artist}',
  associationCredit: 'Crédit : {artist}',
  cardAssociation: 'L’association',
});
