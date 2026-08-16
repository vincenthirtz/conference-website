// lib/i18n/locales/fr/supportPage.ts
//
// Traductions FRANCAISES du namespace `supportPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('supportPage', {
  catDisputeLabel: 'Litige / Contestation',
  catDisputeDesc:
    'Score contesté, forfait abusif, désaccord sur un résultat...',
  catBehaviorLabel: 'Comportement / Safety',
  catBehaviorDesc:
    'Toxicité, harcèlement, comportement inapproprié, propos déplacés...',
  catTechnicalLabel: 'Problème technique',
  catTechnicalDesc: 'Bug du site, problème de connexion lobby, etc.',
  catOtherLabel: 'Autre',
  catOtherDesc: 'Tout autre signalement.',
  sevLowLabel: 'Basse',
  sevLowHint: 'Pas urgent',
  sevMediumLabel: 'Moyenne',
  sevMediumHint: 'À traiter sous 24-48h',
  sevHighLabel: 'Haute',
  sevHighHint: 'Sécurité ou urgent — ping immédiat de la modération',
  errMessageTooShort: 'Le message doit faire au moins 10 caractères',
  errEmailRequired: 'Email requis (ou cochez "Rester anonyme")',
  errSubmit: "Échec de l'envoi",
  pageTitle: 'Signalement / Support',
  pageSubtitle:
    'Litige, comportement inapproprié, problème technique : signalez-le ici. Vous pouvez rester anonyme.',
  successTitle: 'Signalement reçu',
  successBody: "Notre équipe de modération l'examine.",
  referenceLabel: 'Référence :',
  anotherReport: 'Faire un autre signalement',
  categoryLabel: 'Catégorie',
  severityLabel: 'Sévérité',
  anonToggle: 'Rester anonyme',
  anonHint:
    "Aucune information personnelle n'est envoyée. La modération ne pourra pas vous recontacter.",
  nameLabel: 'Votre nom (optionnel)',
  namePlaceholder: 'Ada Lovelace',
  emailLabel: 'Email',
  emailPlaceholder: 'vous@exemple.com',
  subjectLabel: 'Sujet (optionnel)',
  subjectPlaceholder: 'Bref résumé du signalement',
  messageLabel: 'Message',
  messagePlaceholder:
    'Décrivez la situation : quoi, qui, quand, où... Pour les comportements, citez si possible des messages précis.',
  reportedTitle: 'Personne ou équipe concernée (optionnel)',
  reportedHint:
    'Ces informations aident la modération à traiter le signalement.',
  reportedTypeLabel: 'Type',
  reportedTypeNone: '— Aucun —',
  reportedTypePlayer: 'Joueur / Joueuse',
  reportedTypeTeam: 'Équipe',
  reportedTypeOrg: 'Structure / Association',
  reportedNameLabel: 'Pseudo ou nom',
  reportedNamePlaceholder: 'Pseudo ou nom de la personne/équipe concernée',
  reportedBattleTagLabel: 'BattleTag (optionnel)',
  reportedBattleTagPlaceholder: 'Pseudo#12345',
  errReportedNameRequired:
    'Indiquez le pseudo ou nom concerné (ou remettez le type sur "Aucun")',
  submitting: 'Envoi...',
  submit: 'Envoyer le signalement',
  discordNote:
    'Pour toute urgence immédiate, contactez aussi la modération sur Discord.',
});
