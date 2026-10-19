// lib/i18n/locales/fr/safetyPage.ts
//
// Traductions FRANCAISES du namespace `safetyPage` — SOURCE DE VERITE.
// Page publique /securite (« Aide et sécurité »), le pendant hors du monde de
// la Grande salle de lecture de la Women's Library (docs/PLAN-womens-library.md,
// lot 8). Ouverte à toutes et tous, mineur·es compris : phrases courtes, « tu ».
//
// CONTENU A FAIRE VALIDER PAR L'ASSOCIATION avant que la page soit liée
// (numéros, services, disponibilités, description du traitement d'un
// signalement). Les disponibilités ne sont écrites que là où elles sont sûres.
//
// Toute clé ajoutée ici doit l'être aussi côté anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('safetyPage', {
  // ── En-tête ────────────────────────────────────────────────────────────
  heroBadge: 'Ouvert à toutes et tous, sans compte',
  heroTitle: 'Aide et sécurité',
  heroSubtitle:
    'Des numéros à appeler quand ça ne va pas, des gestes pour réagir au harcèlement, et la façon de nous le signaler.',
  validationNotice: "Contenu en cours de validation par l'association.",
  quickExitHint:
    'Besoin de partir vite ? Le bouton « Quitter vite » ou deux appuis sur Échap ferment cette page.',
  tocLabel: 'Sur cette page',

  // ── Sortie rapide (bouton fixe) ────────────────────────────────────────
  quickExitButton: 'Quitter vite',
  quickExitAria: 'Quitter vite cette page. Google s’ouvre à sa place.',
  quickExitKeyHint: 'ou Échap ×2',

  // ── 1. Urgences et lignes d'écoute ─────────────────────────────────────
  emergencyTitle: "Urgences et lignes d'écoute",
  emergencyIntro:
    'Ces numéros fonctionnent en France et sont gratuits. Tu peux les utiliser à tout âge.',
  urgentGroupTitle: 'En danger maintenant',
  listenGroupTitle: 'Pour parler et être conseillé·e',
  listenGroupIntro:
    "Tu peux appeler pour toi ou pour quelqu'un d'autre, même si tu n'es pas sûr·e que ce soit grave.",
  freeLabel: 'Gratuit',
  availability24: '24 h/24, 7 j/7',
  callAria: 'Appeler le {number}',
  smsAria: 'Envoyer un SMS au {number}',
  smsLabel: 'Par SMS',

  line17Name: 'Police secours',
  line17Body:
    "Police ou gendarmerie : si tu es en danger, ou témoin d'une agression.",
  line112Name: "Numéro d'urgence européen",
  line112Body: "Toutes les urgences, partout dans l'Union européenne.",
  line114Name: 'Urgence par SMS',
  line114Body:
    "Si tu ne peux pas parler : parce que tu es sourd·e ou malentendant·e, ou parce que quelqu'un pourrait t'entendre.",
  line3919Name: 'Violences Femmes Info',
  line3919Body:
    "Écoute et conseils pour les femmes victimes de violences, quelles qu'elles soient, et pour leur entourage. Anonyme.",
  line3018Name: 'Harcèlement et violences en ligne',
  line3018Body:
    'Pour les jeunes victimes de cyberharcèlement ou de violences sur internet, et pour leurs proches. Anonyme et confidentiel.',
  line3018ExtraBefore: 'Aussi par tchat sur ',
  line3018ExtraAfter: " et dans l'application 3018.",
  line119Name: 'Allô Enfance en Danger',
  line119Body:
    "Si tu es un enfant ou un·e ado en danger, ou si tu t'inquiètes pour un enfant.",
  line3114Name: 'Prévention du suicide',
  line3114Body:
    "Si tu penses au suicide, si tu traverses une crise, ou si tu t'inquiètes pour quelqu'un. Des professionnels du soin te répondent.",

  // ── 2. Réagir au harcèlement ───────────────────────────────────────────
  harassTitle: 'Réagir au harcèlement',
  harassIntro:
    "Ce n'est jamais de ta faute. Voici ce que tu peux faire, à ton rythme.",
  reflexTitle: 'Les bons réflexes, partout',
  reflex1: "Tu n'as pas à répondre, ni à te justifier.",
  reflex2:
    "Garde des preuves : des captures d'écran où l'on voit la date, l'heure et le pseudo, et les liens vers les messages. Range-les ailleurs que sur la plateforme, car un message peut être supprimé.",
  reflex3: 'Bloque le compte et signale-le à la plateforme.',
  reflex4:
    "Parles-en à quelqu'un de confiance, ou à une des lignes d'écoute ci-dessus.",
  reflex5:
    'Le harcèlement, en ligne aussi, est puni par la loi : tu peux porter plainte au commissariat ou à la gendarmerie, avec tes preuves.',
  gameTitle: 'Dans le jeu (Overwatch)',
  game1:
    "Coupe le chat vocal ou écrit d'une personne, ou de tout le groupe, depuis le jeu.",
  game2:
    'Signale la personne à Blizzard depuis le jeu, pendant ou après la partie.',
  game3:
    'Bloque son compte Battle.net pour ne plus recevoir ses messages ni ses invitations.',
  game4:
    "Un signalement à Blizzard ne prévient pas l'association. Si la personne joue à la Cup, signale-la-nous aussi.",
  discordTitle: 'Sur Discord',
  discord1:
    'Bloque la personne : ses messages sont masqués et elle ne peut plus t’écrire en privé.',
  discord2:
    "Signale le message à Discord depuis ses options (clic droit, ou appui long sur mobile) : il part à l'équipe de sécurité de Discord.",
  discord3:
    "Préviens les modératrices et modérateurs du serveur où ça s'est passé.",
  discord4:
    "Sur le serveur de la Cup, utilise la commande /signalement : la réponse du bot n'est visible que par toi, et tu peux rester anonyme.",
  discordLink: 'Centre de sécurité de Discord',
  streamTitle: 'En stream (Twitch)',
  stream1:
    "Bloque la personne : elle ne peut plus t'envoyer de messages privés.",
  stream2:
    'Signale le compte ou le message à Twitch, depuis le chat ou depuis la chaîne de la personne.',
  stream3:
    "Si tu streames, nomme des modératrices et modérateurs de confiance : ils peuvent supprimer des messages, exclure ou bannir du chat. AutoMod, l'outil de Twitch, filtre aussi les messages automatiquement.",
  stream4:
    "Pendant un stream de la Cup, préviens la modération du chat, ou signale-le à l'association.",
  twitchLink: 'Centre de sécurité de Twitch',
  newTab: '(nouvel onglet)',

  // ── 3. Signaler à l'association ────────────────────────────────────────
  reportTitle: "Signaler à l'association",
  reportIntro:
    'Si ça concerne la Cup (une joueuse, une équipe, un membre du staff, un match, notre Discord ou nos streams), dis-le-nous.',
  reportStep1:
    'Deux façons de signaler : le formulaire du site, ou la commande /signalement sur notre serveur Discord.',
  reportStep2:
    'Tu peux rester anonyme : ni ton nom, ni ton adresse e-mail, ni ton compte ne sont alors enregistrés.',
  reportStep3:
    "Choisis la gravité. « Haute » est faite pour les situations de sécurité ou urgentes : l'équipe de modération est alertée tout de suite sur Discord. Les autres signalements arrivent dans sa file, sans alerte.",
  reportStep4:
    "Une personne du staff prend ton signalement en charge et l'examine. Les suites peuvent aller jusqu'à l'exclusion des compétitions de la Cup.",
  reportStep5:
    "Si tu as laissé ton adresse e-mail, tu reçois un accusé de réception, et l'équipe peut t'écrire pour te dire la suite donnée. Un signalement anonyme ne peut pas recevoir de réponse.",
  reportNotEmergency:
    "L'association n'est pas un service d'urgence. En cas de danger immédiat, appelle le 17 ou le 112.",
  reportCta: 'Faire un signalement',
  reportCtaHint:
    "Le formulaire s'ouvre avec l'option anonyme cochée. Décoche-la si tu veux qu'on puisse te répondre.",
  reportCtaNamed: 'Signaler avec mon adresse e-mail',

  // ── 4. La charte ───────────────────────────────────────────────────────
  charterTitle: 'La charte',
  charterBody: "La charte de la communauté est en cours d'écriture.",

  // ── 5. Sortie rapide ───────────────────────────────────────────────────
  exitTitle: 'Sortie rapide',
  exitBody:
    "Le bouton « Quitter vite », toujours visible en haut de l'écran, ou deux appuis rapides sur la touche Échap remplacent cette page par Google : le bouton Retour ne ramène pas ici.",
  exitLimit:
    "Cela n'efface pas ton historique de navigation. Si quelqu'un peut regarder ton appareil, utilise la navigation privée ou efface ton historique.",
});
