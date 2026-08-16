// lib/i18n/locales/fr/contactPage.ts
//
// Traductions FRANCAISES du namespace `contactPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('contactPage', {
  badge: 'Contact & support',
  title: 'Nous contacter',
  intro:
    "Choisis le canal le plus rapide pour joindre l'équipe OW Women's Cup : email, Discord ou formulaire direct.",
  openForm: 'Ouvrir le formulaire',
  writeEmail: 'Écrire un email',
  channelEmailTitle: 'Email principal',
  channelEmailDesc:
    'Questions générales, inscriptions, suivi des demandes staff ou équipes.',
  channelDiscordTitle: 'Discord communautaire',
  channelDiscordDesc:
    'Rejoins le serveur pour discuter avec le staff et la communauté.',
  channelDiscordCta: 'Serveur Discord',
  channelPressTitle: 'Partenariats & presse',
  channelPressDescBefore:
    'Collaborations marque, médias ou bénévolat pro (graphisme, cast, prod) — voir nos',
  channelPressLink: 'partenaires actuels',
  channelPressDescAfter: '.',
  channelPressCta: 'Écrire au staff',
  supportLabel: 'Support',
  supportHeading: 'Ce que tu peux attendre',
  supportDesc:
    "Nous centralisons les demandes via l'email et le formulaire pour garantir une réponse.",
  helpPoint1:
    'Temps de réponse moyen : 24 à 48h hors périodes de tournoi en direct.',
  helpPoint2:
    "En cas d'incident pendant une rencontre, pingez le staff sur Discord pour une prise en charge rapide.",
  helpPoint3:
    'Les échanges sont modérés : respect et bienveillance obligatoires envers toutes les participantes.',
  prepareTitle: 'À prévoir dans ton message',
  prepareDesc:
    "Pour les demandes d'équipes : nom de l'équipe, BattleTag/Twitter des capitaines, disponibilité. Pour les partenariats : objectifs, budget ou contreparties envisagées.",
  formLabel: 'Formulaire',
  formHeading: 'Envoyer un message',
  formDisclaimerBefore:
    'En soumettant ce formulaire, tu acceptes que les informations fournies soient utilisées pour répondre à ta demande. Voir les',
  formDisclaimerLink: 'mentions légales',
  formDisclaimerAfter: '.',
});
