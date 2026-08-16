// lib/i18n/locales/fr/homeV2.ts
//
// Traductions FRANCAISES du namespace `homeV2` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('homeV2', {
  loadError:
    "Une partie du contenu n'a pas pu être chargée. Réessayez dans quelques instants.",
  announceAria: 'Annonce',
  announceCta: 'En savoir plus',
  announceDismiss: "Fermer l'annonce",
  heroEyebrow: 'Tournoi Overwatch · 100 % féminin',
  heroTagline: 'La compétition qui met les joueuses au centre du jeu.',
  heroTaglineStrong: 'Des équipes, un cash-prize, des casts en direct.',
  heroCtaRegister: 'Inscrire mon équipe',
  heroCtaDiscord: 'Rejoindre le Discord',
  heroTrust: '100 % féminin · Casts FR en direct · Cash-prize communautaire',
  stepsEyebrow: 'Participer',
  stepsTitle: 'Rejoins la compétition en 3 étapes',
  stepsCta: 'Inscrire mon équipe',
  step1Title: 'Crée ou rejoins une équipe',
  step1Desc:
    "Monte ton roster ou trouve une équipe qui recrute via l'espace « recherche une équipe » sur le Discord.",
  step2Title: 'Inscris ton équipe',
  step2Desc:
    'En quelques clics : nom, joueuses, disponibilités. Ta capitaine valide, et vous êtes sur la grille.',
  step3Title: 'Joue tes matchs, en direct',
  step3Desc:
    'Suis le calendrier, joue tes rencontres et retrouve les temps forts castés en français sur Twitch.',
  statusLive: 'En direct maintenant',
  statusNext: 'Prochain rendez-vous dans',
  cdDays: 'jours',
  cdHours: 'h',
  cdMinutes: 'min',
  cdSeconds: 'sec',
  spotEyebrow: "L'événement",
  spotTitle: 'Le prochain rendez-vous',
  spotSeeTournament: 'Voir le tournoi',
  spotChipLive: 'En cours',
  spotChipOpen: 'Inscriptions ouvertes',
  spotFactFormat: 'Format',
  spotFactPrize: 'Cash-prize',
  spotFactTeams: 'Équipes',
  spotProgressAria: '{pct} % des places prises',
  spotCtaRegister: 'Inscrire mon équipe',
  spotCtaView: 'Voir le tournoi',
  spotCtaTeams: 'Voir les équipes engagées',
  spotLiveNow: 'En direct sur Twitch',
  spotLiveIframeTitle: 'Lecteur Twitch en direct',
  spotViewers_one: '{count} spectateur connecté',
  spotViewers_other: '{count} spectateurs connectés',
  spotTwitchHandle: 'Twitch · womens_cup',
  spotNextLive: "Le lecteur s'ouvre ici quand la chaîne est en direct.",
  spotNextLiveHint: 'Suivre sur Twitch →',
  newsEyebrow: 'Actualités',
  newsTitle: 'Les dernières actus',
  newsAll: 'Toutes les actus',
  newsRead: 'Lire',
  newsExcerptFallback: 'Découvre les dernières nouvelles de la compétition.',
  newsEmpty: "Pas encore d'actualité. Reviens bientôt !",
  supportLead: 'Ils soutiennent la compétition · ils en parlent',
  supportPartnersLink: 'Voir tous les partenaires',
});
