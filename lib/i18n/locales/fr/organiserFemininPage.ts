// lib/i18n/locales/fr/organiserFemininPage.ts
//
// Traductions FRANCAISES du namespace `organiserFemininPage` — SOURCE DE VERITE.
// Toute cle ajoutee ici doit l'etre aussi dans `../en/organiserFemininPage.ts`
// (garde-fou de compilation : `locales/parity.ts`).
//
// Le guide « Organiser un tournoi feminin ou mixte »
// (`pages/organisateurs/tournoi-feminin-ou-mixte.tsx`). Deux regles d'ecriture :
//   - l'identite de genre est DECLARATIVE : aucune formulation ne suggere un
//     justificatif, une verification ou une preuve ;
//   - on ne promet que ce que la plateforme fait. Les capacites citees sont
//     celles du code (signalement, liste noire, arbitrage, verification
//     Battle.net, decouverte opt-in, RGPD), et la cagnotte est decrite telle
//     qu'elle est : encaissee par l'association.
// Les clauses du reglement type (`clause*`) sont aussi COPIEES en texte brut
// par le bouton « Copier » : pas de balisage dedans, les crochets marquent ce
// que l'organisatrice complete.

import { ns } from '@/lib/i18n/ns';

export default ns('organiserFemininPage', {
  heroBadge: 'Guide organisateur',
  heroTitle: 'Organiser un tournoi féminin ou mixte',
  heroSubtitle:
    'Ce que deux éditions de la OW Women’s Cup nous ont appris : qui peut jouer, le règlement, la modération, la sécurité et le financement. Reprenez ce qui vous sert, sur la plateforme ou ailleurs.',
  heroCtaCreate: 'Créer mon espace',
  heroCtaCircuits: 'Offre circuits féminins',

  eligibilityTitle: 'Décider qui peut jouer',
  eligibilityIntro:
    'Écrivez la règle avant d’ouvrir les inscriptions, et tenez-vous-y. Deux formats reviennent le plus souvent.',
  formatFemTitle: 'Tournoi féminin',
  formatFemBody:
    'Ouvert aux femmes, cis ou trans, et aux personnes non-binaires. C’est la règle de la OW Women’s Cup.',
  formatMixTitle: 'Tournoi mixte',
  formatMixBody:
    'Ouvert à toutes et à tous, avec une règle de composition écrite : par exemple, au moins deux joueuses ou personnes non-binaires parmi les cinq en jeu à chaque manche.',
  eligibilityRuleTitle: 'La règle qui compte le plus',
  eligibilityRuleBody:
    'L’identité de genre est déclarative. Ne demandez jamais de justificatif, de photo ou d’enregistrement de voix. Une contestation se traite comme un signalement : en privé, par l’équipe de modération, jamais en public ni dans un salon de match.',

  templateTitle: 'Règlement type',
  templateIntro:
    'Dix clauses à adapter à votre jeu et à votre format. Copiez-les, puis complétez les passages entre crochets.',
  templateCopy: 'Copier le règlement',
  templateCopied: 'Règlement copié dans le presse-papiers.',
  templateCopyError:
    'Copie impossible depuis ce navigateur : sélectionnez le texte à la main.',
  templateHeading: 'Règlement du tournoi [nom du tournoi]',
  clause1Title: '1. Éligibilité',
  clause1Body:
    'Le tournoi est ouvert [aux femmes cis et trans et aux personnes non-binaires | aux équipes mixtes comptant au moins [2] joueuses ou personnes non-binaires en jeu à chaque manche]. L’identité de genre est déclarative : aucun justificatif n’est demandé.',
  clause2Title: '2. Équipes et remplaçantes',
  clause2Body:
    'Chaque équipe compte [5] titulaires et jusqu’à [2] remplaçantes, inscrites avant le [date]. Un changement de roster en cours de tournoi est soumis à l’accord de l’organisation.',
  clause3Title: '3. Pseudos, pronoms et comptes',
  clause3Body:
    'Les pseudos et les noms d’équipe ne contiennent aucun propos injurieux. Chaque participante peut indiquer ses pronoms, et tout le monde les respecte. Le partage de compte et l’usage d’un compte de niveau différent (smurf) sont interdits.',
  clause4Title: '4. Conduite',
  clause4Body:
    'Le harcèlement, les propos sexistes, transphobes, homophobes, racistes ou validistes, et les commentaires sur le physique ou la voix sont interdits : en jeu, en vocal, sur Discord et sur les réseaux sociaux. La règle s’applique aussi au staff, aux casters et au public des salons.',
  clause5Title: '5. Sanctions',
  clause5Body:
    'Selon la gravité : avertissement, perte d’une manche, perte du match, exclusion du tournoi, inscription sur la liste noire de l’organisation. Un fait grave peut entraîner l’exclusion immédiate.',
  clause6Title: '6. Signalement',
  clause6Body:
    'Tout comportement contraire à ce règlement peut être signalé à [canal de signalement], y compris de façon anonyme. La personne qui signale n’est jamais identifiée auprès de la personne mise en cause. L’organisation répond sous [48] heures.',
  clause7Title: '7. Litiges et preuves',
  clause7Body:
    'Un désaccord sur un résultat se déclare dans les [30] minutes suivant le match, avec captures d’écran ou vidéo. L’arbitrage tranche, et sa décision est définitive.',
  clause8Title: '8. Diffusion et image',
  clause8Body:
    'Les matchs peuvent être diffusés. Aucune participante n’est tenue d’activer sa caméra ni d’être entendue en direct : celles qui le refusent le signalent à l’inscription. Le chat des diffusions est modéré.',
  clause9Title: '9. Participantes mineures',
  clause9Body:
    'Une participante mineure fournit une autorisation parentale avant son premier match. [Précisez l’âge minimum. En cas de cash-prize, vérifiez le cadre légal applicable aux mineures.]',
  clause10Title: '10. Données personnelles',
  clause10Body:
    'Les données d’inscription servent uniquement à l’organisation du tournoi et sont supprimées [durée] après sa fin. Chaque participante peut en demander la suppression à [adresse de contact].',

  safetyTitle: 'Modération et sécurité',
  safetyIntro:
    'Un tournoi féminin ou mixte attire aussi du harcèlement. Préparez-vous avant le premier match, pas pendant.',
  platformTitle: 'Ce que la plateforme fait pour vous',
  platformReport:
    'Signalement depuis le site ou le bot Discord, anonyme si besoin, avec un niveau de gravité et une alerte au staff pour les cas graves.',
  platformBlacklist:
    'Liste noire des équipes et des structures exclues, alimentée directement depuis un signalement.',
  platformArbitration:
    'Arbitrage des litiges avec dépôt de preuves et délai de traitement suivi, à partir de l’offre {plan}.',
  platformBattlenet:
    'Vérification du compte Battle.net pour Overwatch, contre les comptes de niveau différent.',
  platformDiscovery:
    'Aucun annuaire public des joueuses : se rendre visible des autres joueuses est un choix de chacune, derrière connexion.',
  platformGdpr:
    'Export des données et suppression du compte, à la demande de chaque joueuse.',
  yoursTitle: 'Ce qui reste entre vos mains',
  yoursReferent:
    'Nommer une personne référente sécurité, joignable pendant tout le tournoi.',
  yoursPublish:
    'Publier la charte et le canal de signalement avant l’ouverture des inscriptions.',
  yoursChat:
    'Modérer le chat des diffusions, avec un mode lent et une liste de mots bloqués prêts à l’emploi.',
  yoursBriefing:
    'Briefer casters et arbitres : on commente le jeu, jamais le physique, la voix ou le genre.',
  yoursRaid:
    'Prévoir la réponse à un raid : chat réservé aux abonnés, coupure de la diffusion, message aux joueuses.',
  yoursDebrief:
    'Faire le point après chaque journée avec la référente sécurité, et consigner les sanctions prononcées.',

  prizeTitle: 'Une cagnotte solidaire',
  prizeIntro:
    'Un cash-prize peut se financer sans sponsor : la communauté abonde une cagnotte, et le total s’affiche en direct sur la page du tournoi.',
  prizeGaugeTitle: 'Une jauge publique',
  prizeGaugeBody:
    'Un montant de départ, un objectif, le total et les derniers soutiens. Chaque contributrice ou contributeur peut rester anonyme, et son adresse e-mail n’est jamais publiée.',
  prizeHelloassoTitle: 'Encaissée par l’association',
  prizeHelloassoBody:
    'Les contributions passent par HelloAsso et sont encaissées par l’association OW Women’s Cup. La plateforme les enregistre : elle ne verse rien elle-même.',
  prizeAgreementTitle: 'Sur convention hors de la Coupe',
  prizeAgreementBody:
    'Pour un tournoi organisé par une autre structure, la cagnotte s’ouvre après accord écrit avec l’association, qui fixe la remise du cash-prize. Écrivez-nous avant de l’annoncer.',
  prizeContact: 'Nous écrire',
  prizeLegal:
    'Avant d’annoncer un cash-prize, vérifiez le cadre des compétitions de jeux vidéo (décret n° 2017-871 du 9 mai 2017), en particulier pour les participantes mineures.',

  gamesTitle: 'Les jeux pris en charge',
  gamesIntro:
    'Inscriptions, brackets, check-in, arbitrage et bot Discord fonctionnent pour chacun de ces jeux.',
  gameMapVeto: 'Veto de maps',
  gameDraft: 'Draft',

  ctaTitle: 'Vous lancez un circuit sur toute une saison ?',
  ctaBody:
    'Les circuits féminins et mixtes, dans tous les jeux pris en charge, peuvent candidater à notre offre partenaire.',
  ctaCircuits: 'Découvrir l’offre circuits',
  ctaCreate: 'Créer mon espace',
});
