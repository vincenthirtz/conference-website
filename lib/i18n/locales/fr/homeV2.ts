// lib/i18n/locales/fr/homeV2.ts
//
// Traductions FRANCAISES du namespace `homeV2` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
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
  // Le tournoi a rempli ses places. On cesse d'inviter à le rejoindre, mais on
  // ne ferme pas le site pour autant : une équipe peut toujours se constituer.
  heroTournamentFull: 'Tournoi complet',
  heroTournamentFullHint:
    'Les {count} places de l’édition {year} sont pourvues.',
  heroCtaCreateTeam: 'Créer mon équipe',
  // Lot 1 acquisition : la joueuse SANS équipe n'avait aucune porte d'entrée
  // dans le hero. CTA de rang égal, pas un lien de repli.
  heroCtaJoin: 'Je cherche une équipe',
  heroCtaDiscord: 'Rejoindre le Discord',
  heroTrust: '100 % féminin · Casts FR en direct · Cash-prize communautaire',
  // Reformulé au lot 1 : la version précédente renvoyait sur Discord pour
  // trouver un roster, c'est-à-dire hors du site — et laissait sans réponse
  // celles qui n'ont pas d'équipe, précisément le public à capter.
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
  spotChipFull: 'Complet',
  spotFullLead:
    'Toutes les places sont prises pour cette édition. En attendant la suite :',
  spotCtaScrim: 'Proposer un scrim',
  spotCtaFindTeam: 'Chercher une équipe',
  spotCtaCreateTeamNext: 'Créer une équipe (prochaine saison)',
  spotCtaView: 'Voir le tournoi',
  spotCtaTeams: 'Voir les équipes engagées',
  spotLiveNow: 'En direct sur Twitch',
  spotLiveIframeTitle: 'Lecteur Twitch en direct',
  spotViewers_one: '{count} spectateur connecté',
  spotViewers_other: '{count} spectateurs connectés',
  spotTwitchHandle: 'Twitch · womens_cup',
  spotNextLive: "Le lecteur s'ouvre ici quand la chaîne est en direct.",
  spotNextLiveHint: 'Suivre sur Twitch →',
  teamsStripEyebrow: '{count} équipes engagées',
  teamsStripTitle:
    'Elles participent à la seconde édition de la Women’s Cup',
  newsEyebrow: 'Actualités',
  newsTitle: 'Les dernières actus',
  newsAll: 'Toutes les actus',
  newsRead: 'Lire',
  newsExcerptFallback: 'Découvre les dernières nouvelles de la compétition.',
  newsEmpty: "Pas encore d'actualité. Reviens bientôt !",
  supportLead:
    'Ils soutiennent la compétition · ils la diffusent · ils en parlent',
  supportPartnersLink: 'Voir tous les partenaires',
});
