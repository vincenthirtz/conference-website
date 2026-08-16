// lib/i18n/locales/fr/rulesPage.ts
//
// Traductions FRANCAISES du namespace `rulesPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('rulesPage', {
  heroBadge: 'Règlement officiel',
  heroTitle: 'Règles officielles Overwatch',
  heroSubtitle:
    "Résumé des paramètres compétitifs Overwatch utilisés pour l'OW Women's Cup. Toute l'organisation se base sur les règles officielles Blizzard, adaptées au format du tournoi.",
  section1Title: 'Composition & restrictions',
  section1Item1: '5v5 obligatoire : 1 Tank, 2 Dégâts, 2 Soutien (Role Queue).',
  section1Item2: 'Héros uniques : aucun doublon autorisé dans une même équipe.',
  section1Item3:
    "Patch en cours : toutes les parties se jouent sur la dernière version live d'Overwatch (pas de rollbacks).",
  section1Item4: 'Objets de workshop, mods, macros ou scripts interdits.',
  section2Title: 'Paramètres de salon officiels',
  section2Item1: 'Préréglage : Règles de compétition.',
  section2Item2: 'Score limité par mode (ex. Contrôle en BO3).',
  section2Item3: 'Temps de préparation 45 s (départ) / 35 s (mi-temps).',
  section2Item4:
    'Pause technique : uniquement en cas de bug ou déconnexion, max 5 min par équipe.',
  section3Title: 'Fair-play & conduite',
  section3Item1: 'Aucun exploit, stream sniping ou partage de compte.',
  section3Item2: 'Chat vocal et textuel soumis au Code de conduite Blizzard.',
  section3Item3:
    "Résolution des litiges : décision finale par l'arbitrage tournoi.",
  section3Item4:
    'Rejoindre le Discord du tournoi est obligatoire : https://discord.gg/gERSsjC3Vd',
  modesEyebrow: 'Modes de jeu',
  modesTitle: 'Conditions de victoire par mode',
  modesNote:
    "S'applique avec le préréglage « Règles de compétition » dans les salons personnalisés.",
  mode1Name: 'Contrôle (Control)',
  mode1Rules:
    'BO3 sur trois points de contrôle. Si 1-1, manche décisive. Overtime si une équipe conteste ou est sur le point de capturer.',
  mode2Name: 'Hybride (Assaut/ Escorte)',
  mode2Rules:
    'Att/Def : capture du point A puis escorte du convoi. Victoire à la meilleure progression; overtime si la progression est contestée.',
  mode3Name: 'Escorte (Escort)',
  mode3Rules:
    "Att/Def : escorte pure du convoi jusqu'au point final. Si égalité après les deux manches, reprise avec banque de temps; meilleure distance départage.",
  mode4Name: 'Flashpoint',
  mode4Rules:
    "Points de capture successifs, premier à 2 points. Overtime si un point est contesté. Reset d'ultimes à chaque prise.",
  mode5Name: 'Push',
  mode5Rules:
    "Équipe gagnante : distance la plus avancée. Overtime si le robot est contesté ou proche du marqueur de l'adversaire.",
  referencesEyebrow: 'Références officielles',
  referencesTitle: 'Sources Blizzard',
  referencesNote:
    'Consultez les documents officiels pour les mises à jour de règles, de maps ou de patchs.',
  ref1Label: 'Code de conduite Blizzard',
  ref2Label: 'Notes de mise à jour Overwatch (patch live)',
  ref3Label: 'Paramètres « Règles de compétition » (guide officiel)',
});
