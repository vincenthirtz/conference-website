// lib/i18n/locales/fr/donPage.ts
//
// Traductions FRANCAISES du namespace `donPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('donPage', {
  heroBadge: "Soutenir l'association",
  heroTitle: "Faites un don pour faire grandir l'esport féminin",
  heroSubtitle:
    'Chaque contribution nous aide à ouvrir plus de places pour les joueuses, sécuriser les événements et montrer que la performance féminine mérite un cadre ambitieux.',
  comingSoonBtn: 'Paiement en ligne bientôt disponible',
  donateOnline: 'Faire un don en ligne',
  discoverProject: 'Découvrir le projet',
  usesTitle: 'Ce que votre don rend possible',
  use1Title: 'Inclusion & accompagnement',
  use1Detail:
    'Frais de déplacement, hébergement solidaire et matériel prêté pour que chaque joueuse puisse participer dans de bonnes conditions.',
  use2Title: 'Production & diffusion',
  use2Detail:
    'Locations studio, captation, graphismes live et modération pour proposer un show accessible et sûr.',
  use3Title: 'Actions locales',
  use3Detail:
    "Ateliers découverte, interventions scolaires et mentorat avec des rôles modèles issues de l'esport féminin.",
  transparencyLabel: 'Transparence',
  transparencyTitle: 'Chaque euro est fléché et documenté.',
  transparency1: "Rapports d'impact envoyés aux donateur·rices",
  transparency2: "Budget suivi par l'équipe staff",
  transparency3: 'Priorité donnée aux actions inclusives',
  thanksTitle: 'Merci pour votre don !',
  thanksBody:
    'Votre paiement a bien été pris en compte. Vous recevrez un email de confirmation de la part de HelloAsso.',
  errorTitle: "Le paiement n'a pas abouti.",
  errorBody:
    'Vous pouvez réessayer ci-dessous ou nous contacter si le problème persiste.',
  chooseAmountLabel: 'Choisir un montant',
  chooseAmountTitle: 'Un geste, un impact concret',
  chooseAmountHint:
    'Les montants ci-dessous sont indicatifs : chaque don compte.',
  tier1Label: 'Coup de pouce',
  tier1Impact:
    'Aide à payer le site web (nom de domaine, serveur) ou des frais bancaires.',
  tier2Label: 'Supporter·rice',
  tier2Impact:
    "Couvre la création de visuels dédiés aux live et la modération d'une soirée de stream.",
  tier3Label: 'Allié·e',
  tier3Impact:
    'Participe au cashprize du futur tournoi et offre des goodies à toutes les joueuses.',
  tier4Label: 'Mécène',
  tier4Impact:
    'Permet de lancer un live (matériel + encadrement) dans une salle ou de sécuriser une captation entière.',
  comingSoonEyebrow: 'Coming soon',
  comingSoonTitle: 'Paiement en ligne bientôt disponible',
  comingSoonBody:
    'Le don par carte bancaire via HelloAsso sera disponible très prochainement. En attendant, vous pouvez nous contacter pour faire un don par virement.',
  formEyebrow: 'Faire un don en ligne',
  formTitle: 'Paiement sécurisé',
  formDesc:
    "Réglez par carte bancaire via HelloAsso, la plateforme de référence des associations françaises. Aucune commission n'est prélevée sur votre don.",
  qrAlt: 'QR code pour faire un don',
  qrHint: 'Ou scannez ce QR code',
  amountLabel: 'Montant du don',
  customAmountPlaceholder: 'Autre (€)',
  firstNameLabel: 'Prénom',
  lastNameLabel: 'Nom',
  emailLabel: 'Email',
  submitRedirecting: 'Redirection...',
  submitDonate: 'Donner {amount} via HelloAsso',
  redirectNote:
    'Vous serez redirigé vers HelloAsso pour finaliser le paiement de façon sécurisée.',
  otherMeansLabel: 'Autres moyens',
  otherMeansTitle: 'Virement ou mécénat',
  transferTitle: 'Virement',
  transferDesc:
    "Recevez le RIB de l'association et une confirmation dès réception de votre don.",
  transferBtn: 'Demander le RIB',
  companiesTitle: 'Entreprises',
  companiesDescBefore:
    'Vous souhaitez soutenir ou sponsoriser ? Parlons visibilité, ateliers et mécénat — voir aussi nos',
  companiesLink: 'partenaires actuels',
  companiesDescAfter: '.',
  sponsorBtn: 'Parler sponsoring',
  questionLabel: 'Une question ?',
  questionTitle: 'On reste disponible',
  questionBody:
    "Besoin d'un reçu, de comprendre l'affectation des dons ou de connaître les prochaines actions ? Écrivez-nous, on vous répond vite.",
  minAmountError: 'Le montant minimum est 1 €.',
  genericError: 'Une erreur est survenue.',
  serverError: 'Impossible de contacter le serveur. Réessayez plus tard.',
});
