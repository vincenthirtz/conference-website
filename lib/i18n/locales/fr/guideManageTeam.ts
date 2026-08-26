// lib/i18n/locales/fr/guideManageTeam.ts
//
// Traductions FRANCAISES du namespace `guideManageTeam` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('guideManageTeam', {
  heroBadge: 'Guide capitaine',
  heroTitle: 'Gère ton équipe en quelques clics',
  heroSubtitle:
    "Roster, candidatures, scrims, check-in, messagerie : tout est dans ton espace. Voici un aperçu concret de chaque étape, avec des captures de l'interface réelle.",
  createTeam: 'Créer mon équipe',
  goToSpace: 'Aller à mon espace',
  stepLabel: 'Étape {number}',
  alsoTitle: 'Et aussi…',
  ctaTitle: 'Prête à passer le brassard ?',
  ctaDesc:
    "L'inscription est libre, le formulaire prend deux minutes et tu peux ajuster le roster à tout moment.",
  readFaq: 'Lire la FAQ capitaine',
  step1Title: 'Inscris ton équipe',
  step1Desc:
    'Crée ton équipe en deux minutes : nom, BattleTag de capitaine, premiers membres. Tu deviens capitaine automatiquement.',
  step1Bullet1: 'Choisis un nom et un tag (ex. PHX)',
  step1Bullet2: 'Renseigne 5 BattleTags pour démarrer le roster',
  step1Bullet3: 'Tu peux ajouter coachs et remplaçantes plus tard',
  step2Title: 'Reçois et valide les candidatures',
  step2Desc:
    'Active le mode “équipe ouverte” pour recevoir des demandes. Lis le message, accepte ou refuse — la joueuse reçoit une notification.',
  step2Bullet1: 'Toggle ouvert/fermé en un clic',
  step2Bullet2: "Voir le rôle souhaité et un mot d'intro",
  step2Bullet3: 'Accepter assigne automatiquement le rôle',
  step3Title: 'Gère le roster et les rôles',
  step3Desc:
    'Ajuste les rôles (tank/dps/support/sub/coach), passe le brassard de capitaine, copie un BattleTag en un clic pour les lobbies.',
  step3Bullet1: 'Compteur Tank / DPS / Support visible',
  step3Bullet2: 'Bouton 📋 à côté de chaque BattleTag',
  step3Bullet3: 'Transfert de capitaine en deux clics',
  step4Title: 'Discute avec les autres capitaines',
  step4Desc:
    'Messagerie intégrée entre capitaines pour caler horaires, lobbies ou règles maison sans quitter le site.',
  step4Bullet1: 'Inbox triée par dernière activité',
  step4Bullet2: 'Compteur de messages non lus dans la navbar',
  step4Bullet3: 'Modération staff active si besoin',
  step5Title: 'Check-in du prochain match',
  step5Desc:
    "Une heure avant le coup d'envoi, le bouton check-in s'ouvre directement dans ton espace. Plus besoin de chercher le mail Draftbot.",
  step5Bullet1: 'Carte “Prochain match” en haut du dashboard',
  step5Bullet2: 'Compte à rebours, format BO3/BO5, lien live',
  step5Bullet3: 'Forfait auto si pas de check-in à T-0',
  step6Title: 'Propose des scrims',
  step6Desc:
    'Choisis une équipe adverse, propose un horaire et un message. La capitaine adverse accepte ou refuse depuis son espace.',
  step6Bullet1: "Recherche d'équipe avec filtre pays/places",
  step6Bullet2: 'Proposition + date + commentaire',
  step6Bullet3: 'Une fois accepté, ajoute-le à ton agenda',
  feature1Title: 'Cloche de notifications',
  feature1Desc:
    'Un badge rose en navbar agrège messages non lus, scrims en attente, candidatures et check-in à valider.',
  feature2Title: 'Page publique d’équipe',
  feature2Desc:
    "Profite d'une vitrine partageable (logo, roster, palmarès) à diffuser sur les réseaux et auprès des sponsors.",
  feature3Title: 'Historique des demandes',
  feature3Desc:
    'Toutes tes demandes (capitanat, transferts, scrims) sont tracées avec leur statut et la date de traitement staff.',
  feature4Title: 'Sécurité & modération',
  feature4Desc:
    'Charte anti-harcèlement, staff formé, signalement intégré, suppression de compte conforme RGPD.',
  previewNewTeamTitle: 'Créer mon équipe',
  previewFieldName: 'Nom',
  previewFieldTag: 'Tag',
  previewTagHint: '3-4 lettres, visible en bracket',
  previewFieldCaptain: 'Capitaine',
  previewRosterInitial: 'Roster initial',
  previewRegisterTeam: 'Inscrire mon équipe',
  previewApplications: 'Candidatures',
  previewTeamOpen: 'Équipe ouverte',
  previewReq1Message: 'Disponible 3 soirs/semaine, niveau Diamant.',
  previewReq2Message: 'Master saison passée, cherche projet sérieux.',
  previewAccept: 'Accepter',
  previewDecline: 'Refuser',
  previewMembers: 'membres',
  previewCaptain: 'Capitaine',
  previewMessaging: 'Messagerie',
  previewMsg1: 'On peut décaler le scrim à 21h ? On a un imprévu côté tank.',
  previewMsg2: 'BattleTag du capitaine pour le lobby ?',
  previewMsg3: 'Merci pour le scrim hier, vous avez bien progressé !',
  previewTime1: 'il y a 4 min',
  previewTime2: 'il y a 1 h',
  previewTime3: 'hier',
  previewNextMatch: 'Prochain match',
  previewVs: 'vs',
  previewMatchDate: 'dimanche 18 mai 2026 à 19:00 · dans 2j 4h',
  previewViewMatch: 'Voir le match →',
  previewLiveCast: 'Live cast ↗',
  previewCheckinNow: 'Check-in maintenant',
  previewProposeScrim: 'Proposer un scrim',
  previewOpponentTeam: 'Équipe adverse',
  previewOpponentValue: 'Sparkles · 5 membres · 🇫🇷',
  previewProposedDate: 'Date proposée',
  previewProposedDateValue: 'dimanche 18 mai 2026 à 21:00',
  previewMessage: 'Message',
  previewMessageValue:
    'Salut ! On cherche un BO3 dimanche soir, vous êtes dispo ?',
  previewSendRequest: 'Envoyer la demande',
});
