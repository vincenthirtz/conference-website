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
  // LE TOURNOI EST LANCÉ. Annoncer « complet » n'a plus de sens une fois la
  // première journée jouée : à ce moment-là, ce qu'on vient chercher sur la
  // home, c'est le classement, la prochaine affiche et le direct.
  heroRunningHint: 'Saison régulière en cours · {teams} équipes en lice',
  heroRunningHintUntil:
    'Saison régulière en cours · {teams} équipes en lice · finale le {date}',
  heroCtaStandings: 'Voir le classement',
  heroCtaSchedule: 'Calendrier & résultats',
  heroCtaWatch: 'Regarder le direct',
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
  // Lu par les lecteurs d'écran à la place des cellules (décoratives) : à la
  // minute, sans les secondes, qui changeaient à chaque lecture.
  cdSrRemaining: '{days} jours, {hours} heures et {minutes} minutes',
  // Le bloc ne porte plus la fiche du tournoi (dates, format, places) : il
  // montre la chaîne et les prochaines rencontres. Son titre suit.
  spotEyebrow: 'En ce moment',
  spotTitle: 'À suivre',
  // Imminence : ce qui prime quand un début est en vue. `_zero` et `_one` ont
  // leur propre formulation — « dans 0 jour » et « dans 1 jours » ne se disent
  // pas.
  // Les portes de sortie restent, au second rang : une visiteuse arrivée trop
  // tard garde les scrims, la recherche d’équipe et la saison suivante.
  // Les affiches de la prochaine journée, en pied de la carte du rendez-vous.
  // Le jour lui-même n'est pas une clé : c'est une donnée, formatée par Intl
  // dans la langue de l'interface (« vendredi 18 septembre »).
  matchdayTitle_one: '{count} match au programme',
  matchdayTitle_other: '{count} matchs au programme',
  matchdayLive: 'En direct',
  matchdayFinished: 'Terminé',
  matchdayMatchAria: '{home} contre {away}, à {time}',
  matchdayMatchAriaScore: '{home} {score1} – {away} {score2}, à {time}',
  matchdayMore_one: '+ {count} autre match ce jour-là',
  matchdayMore_other: '+ {count} autres matchs ce jour-là',
  standingsTitle: 'Classement de la saison',
  standingsColTeam: 'Équipe',
  standingsColRecord: 'V–D',
  standingsColRecordTitle: 'Victoires – défaites',
  standingsColDiff: '+/-',
  standingsColDiffTitle: 'Différence de maps',
  standingsColPoints: 'Pts',
  standingsColPointsTitle: 'Points',
  standingsNote:
    '3 points par victoire · départage à la confrontation directe.',
  clipsTitle: 'Les clips du moment',
  clipsChannel: 'La chaîne',
  clipsViews_one: '{count} vue',
  clipsViews_other: '{count} vues',
  matchdayNextDay: 'Puis {day}',
  matchdayAll: 'Tout le calendrier',
  teamsStripEyebrow_one: '{count} équipe engagée',
  teamsStripEyebrow_other: '{count} équipes engagées',
  teamsStripTitle: 'Elles participent à la seconde édition de la Women’s Cup',
  newsEyebrow: 'Actualités',
  newsTitle: 'Les dernières actus',
  newsAll: 'Toutes les actus',
  newsRead: 'Lire',
  newsExcerptFallback: 'Découvre les dernières nouvelles de la compétition.',
  newsEmpty: "Pas encore d'actualité. Reviens bientôt !",
  supportLead:
    'Ils soutiennent la compétition · ils la diffusent · ils en parlent',
  supportPartnersLink: 'Voir tous les partenaires',
  supportBecomePartner: 'Devenir partenaire',
  socialEyebrow: 'En direct de nos comptes',
  socialTitle: 'Nos réseaux',
  socialOpen: 'Voir la publication',
  socialNoCaption: 'Publication sans légende',
  // La carte réseau porte le nom du réseau dans son lien : « Voir la
  // publication » seul, répété quatre fois dans une liste de liens, n'apprend
  // rien à qui navigue au lecteur d'écran.
  socialOpenAria: 'Voir la publication sur {network}',
  // Partage depuis les cartes de l'accueil. Le libellé du GROUPE porte
  // l'intitulé de l'élément : sans lui, les sept cartes de la page annoncent
  // toutes « Partager sur Bluesky », sans jamais dire de quoi.
  shareNewsGroup: 'Partager : {title}',
  shareSocialGroup: 'Partager cette publication {network}',
  shareOnBluesky: 'Partager sur Bluesky',
  shareOnX: 'Partager sur X',
  shareCopyLink: 'Copier le lien',
  shareLinkCopied: 'Lien copié',
  shareCopyFailed: 'Impossible de copier le lien',
});
