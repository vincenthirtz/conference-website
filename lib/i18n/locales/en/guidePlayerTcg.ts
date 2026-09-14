// lib/i18n/locales/en/guidePlayerTcg.ts
//
// Traductions ANGLAISES du namespace `guidePlayerTcg`.
//
// La SOURCE DE VERITE est le francais (`../fr/guidePlayerTcg.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'Guide',
  heroTitle: 'How the TCG works',
  heroSubtitle:
    'Collectible cards that re-read the competition: the players, teams and maps of the circuit. Here is how you get them, what you can do with them, and what you control on your own card.',
  backToCollection: 'Back to my collection',
  sectionLabel: 'Part {number}',

  whatTitle: 'One card, three subjects',
  whatIntro:
    'A card represents a player, a team or a map. The three are not alike, and that is deliberate: a player is a person, a team is an already-public entity, a map is a game object that belongs to no one.',
  whatPack:
    'A pack always holds five cards: three players, one team, one map. These are reserved slots, not a random draw over everything — otherwise packs made entirely of teams would come out.',
  whatNoNewData:
    'The TCG invents no data: it re-reads what already exists. Packs come from recorded victories, rarity from the badges shown on your profile, a team card’s face from its public name and logo.',

  earnTitle: 'How you get packs',
  earnIntro:
    'Every path gives a pack AND coins. The amounts below are the ones actually applied, read from the server — not examples.',
  earnMatchWin: 'Tournament match win',
  earnScrimWin: 'Ranked scrim win',
  earnWelcome: 'Welcome gift, once',
  earnTwitchDrop: 'Card claimed during a stream',
  earnCoins: '+{coins} coins',
  earnPackToo: 'and a pack',
  earnTwitchOff:
    'The live drop is not active right now. It will only appear here once a channel is connected and a reward is attached to it — no need to look for it before then.',
  earnTwitchHow:
    'To receive a drop you must link your Twitch account from the collection page: a Twitch event delivers a Twitch identity, never a site account. Without that bridge, a card claimed on stream has no recipient.',

  moneyTitle: 'Coins are earned, never bought',
  moneyBody:
    'There is no way to buy coins with real money, and there will not be one. A purchasable currency attached to random content is a paid loot box: banned in Belgium and the Netherlands, watched by the ANJ in France, and our audience includes minors.',
  moneyDonation:
    'Donating to the association therefore credits nothing, ever. Supporting and collecting are two separate acts of the same account, not a trade of one for the other.',

  loopTitle: 'Open, recycle, buy again',
  loopOpen:
    'A pack you earn arrives sealed. Opening it draws its five cards and locks them in — until then, it can wait as long as you like.',
  loopBuy:
    'With {price} coins you can buy an extra pack. Buying creates a sealed pack: the draw still belongs to the opening.',
  loopRecycle:
    'A duplicate can be recycled for {refund} coins. Your last copy of a card is untouchable — without that rule, “recycle a duplicate” would become “destroy your collection for currency”.',
  loopRecycleWhich:
    'When you recycle, it is always the LEAST valuable copy that goes: the lowest rarity, and the non-foil version at equal rarity. Your best copy stays with you.',

  rarityTitle: 'Where rarity comes from',
  rarityBody:
    'A player card’s rarity comes from her badges — the same ones as on her profile. A title (tournament champion, league season winner) grants the highest tier; otherwise the best badge’s tier decides.',
  rarityCommon: 'Common — bronze badge',
  rarityRare: 'Rare — silver badge',
  rarityEpic: 'Epic — gold badge',
  rarityLegendary: 'Legendary — platinum badge, or a title',
  rarityFoil:
    'Foil is independent of rarity: it is a print variant, not a fifth tier. A foil common is still a common.',

  photoTitle: 'Your photo, and what you control',
  photoIntro:
    'This is the part that matters. A card is not an avatar: it circulates among other people, it is kept, it is displayed without you being there. Three guarantees therefore frame your photo, and none of them depends on anyone’s goodwill.',
  photoOptIn: 'Nothing without your action',
  photoOptInBody:
    'No photo enters the TCG unless you uploaded it yourself. As long as you send nothing, your card exists without a portrait — and no image of you circulates.',
  photoModeration: 'Reviewed before it is visible',
  photoModerationBody:
    'An uploaded photo is pending: nobody sees it until the team approves it. A photo you replace goes back to pending, even if the previous one was already approved.',
  photoWithdraw: 'Removable, even afterwards',
  photoWithdrawBody:
    'You can remove your photo at any time, and the removal reaches cards ALREADY handed out: the face is re-read on every display, and the file is deleted. Existing cards fall back to your public avatar.',

  supporterTitle: 'You don’t play?',
  supporterBody:
    'Victories are not the only path. A supporter account receives a welcome gift, then earns cards by following the streams — that is the Twitch drop, and it needs no team.',
  supporterLink: 'Link my Twitch account',

  ctaTitle: 'Ready to open a pack?',
  ctaBody:
    'Your collection is waiting. The cards you own are sorted there from the rarest to the most common.',
  ctaButton: 'View my collection',
};
