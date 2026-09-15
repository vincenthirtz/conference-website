// lib/i18n/locales/fr/circuitPartnersPage.ts
//
// Traductions FRANCAISES du namespace `circuitPartnersPage` — SOURCE DE VERITE.
// Toute cle ajoutee ici doit l'etre aussi dans `../en/circuitPartnersPage.ts`
// (garde-fou de compilation : `locales/parity.ts`).
//
// L'offre partenaire des circuits feminins et mixtes
// (`pages/organisateurs/circuits-feminins.tsx`) et son formulaire
// (`components/organisateurs/CircuitApplicationForm.tsx`). Les termes de l'offre
// (plan, duree, prix catalogue) ne sont JAMAIS ecrits ici : ils arrivent par
// interpolation depuis `config/circuitPartnerOffer.ts` et le bareme.

import { ns } from '@/lib/i18n/ns';

export default ns('circuitPartnersPage', {
  heroBadge: 'Offre partenaire',
  heroTitle: 'Circuits féminins et mixtes, dans tous nos jeux',
  heroSubtitle:
    'Vous animez un circuit féminin ou mixte sur Valorant, League of Legends ou un autre jeu pris en charge ? L’association vous ouvre la plateforme de la OW Women’s Cup pour toute une saison.',
  heroCta: 'Candidater',
  heroGuide: 'Lire le guide d’organisation',

  offerTitle: 'Ce qui est offert',
  offerPlan: 'L’offre {plan} pendant {months} mois, sans frais',
  offerPlanFootnote:
    'Soit {price} € au tarif catalogue. À l’échéance, l’offre se renouvelle sur bilan de la saison, ou l’espace repasse sur la formule gratuite.',
  offerBot: 'Le bot Discord : inscriptions, check-in, salons de match, rappels',
  offerLeagues: 'Ligues et saisons en nombre illimité',
  offerArbitration:
    'Arbitrage des litiges avec preuves, file prioritaire et délai suivi',
  offerRatings: 'Classement des joueuses et historique des matchs',
  offerBrand: 'Votre marque : logo, couleurs et domaine personnalisé',
  offerApi: 'API en lecture et en écriture pour vos outils et vos overlays',
  offerSupport:
    'Un appel de lancement avec l’association, et le règlement type à adapter',

  eligibleTitle: 'Qui peut candidater',
  eligibleFormat:
    'Un circuit féminin (femmes cis et trans, personnes non-binaires) ou mixte avec une règle de composition écrite.',
  eligibleSeason:
    'Une compétition récurrente : une saison, une ligue ou plusieurs tournois, pas un événement isolé.',
  eligibleGame: 'Dans l’un des jeux pris en charge :',

  commitmentsTitle: 'Ce que nous vous demandons',
  commitmentCharter:
    'Publier une charte de conduite et un canal de signalement avant l’ouverture des inscriptions.',
  commitmentLead:
    'Nommer une personne référente sécurité, joignable pendant les matchs.',
  commitmentDeclarative:
    'Tenir l’identité de genre pour déclarative : jamais de justificatif demandé aux joueuses.',

  stepsTitle: 'Comment ça se passe',
  step1: 'Vous créez votre espace et vous candidatez ci-dessous.',
  step2: 'L’association étudie le dossier et vous recontacte par email.',
  step3:
    'Une fois le circuit retenu, l’offre est activée sur votre espace, pour {months} mois.',
  createSpace: 'Créer mon espace',

  formTitle: 'Candidater',
  formIntro: 'Quelques minutes suffisent. Nous répondons à chaque candidature.',
  labelOrganization: 'Nom du circuit ou de la structure',
  labelContact: 'Votre nom',
  labelEmail: 'Email de contact',
  labelGame: 'Jeu',
  labelFormat: 'Format',
  formatFeminin: 'Féminin',
  formatMixte: 'Mixte',
  labelSeasonStart: 'Début de saison prévu (facultatif)',
  labelExpectedTeams: 'Nombre d’équipes attendues (facultatif)',
  labelWebsite: 'Site web (facultatif)',
  labelCommunity: 'Discord, Twitch ou réseau social (facultatif)',
  labelSpace: 'Slug de votre espace, s’il existe déjà (facultatif)',
  hintSpace:
    'La partie de l’adresse de votre espace, par exemple « ligue-valo ».',
  labelMessage: 'Présentez le circuit',
  hintMessage:
    'Format, calendrier, public visé, ce qui existe déjà. 20 caractères au minimum.',
  labelCommitCharter:
    'Nous publierons une charte de conduite et un canal de signalement.',
  labelCommitLead: 'Nous nommerons une personne référente sécurité.',
  honeypotLabel: 'Ne pas remplir',
  captchaLabel: 'Vérification : {question}',
  captchaPlaceholder: 'Votre réponse',
  submit: 'Envoyer la candidature',
  submitting: 'Envoi…',
  successTitle: 'Candidature envoyée',
  successBody:
    'Merci ! Un email de confirmation est en route. L’association revient vers vous après étude du dossier.',
  errorRequired:
    'Renseignez le nom, le contact, un email valide, la présentation et les deux engagements.',
  errorGeneric: 'Envoi impossible pour le moment. Réessayez.',
  privacyNote:
    'Ces informations servent uniquement à étudier la candidature et à vous recontacter.',
});
