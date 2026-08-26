// lib/i18n/locales/fr/requestCaptain.ts
//
// Traductions FRANCAISES du namespace `requestCaptain` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('requestCaptain', {
  connectionError: 'Erreur de connexion.',
  errSelectTeam: 'Selectionne une equipe.',
  errTeamNameRequired: "Le nom de l'equipe est requis.",
  errTeamNameTooShort:
    "Le nom de l'equipe doit contenir au moins 2 caracteres.",
  errInvalidEmail: 'Email invalide : {email}',
  errMemberInvalid:
    "Corrige les erreurs sur les membres avant d'envoyer (BattleTag, email ou doublon).",
  errCreateRequest: 'Impossible de creer la demande.',
  errGeneric: 'Une erreur est survenue.',
  fallbackSelectedTeam: "l'equipe selectionnee",
  successTitleTab: "Demande envoyee | OW Women's Cup",
  successHeading: 'Demande envoyee',
  successBody:
    'Ta demande pour devenir capitaine de "{teamName}" a bien ete envoyee. Un admin la validera prochainement.',
  backToSpace: 'Retour a mon espace',
  pageTitleTab: "Devenir capitaine | OW Women's Cup",
  backLink: '← Retour a mon espace',
  heading: "Devenir capitaine d'equipe",
  intro:
    'Choisis une equipe existante ou cree-en une nouvelle. Un admin validera ta demande.',
  modeNew: 'Creer une equipe',
  modeExisting: 'Equipe existante',
  messageLabel: 'Message (optionnel)',
  messagePlaceholder: 'Informations complementaires pour les admins...',
  submitting: 'Envoi en cours...',
  submit: 'Envoyer ma demande',
  footerNote:
    "En devenant capitaine, tu pourras gerer les membres de ton equipe et l'inscrire aux tournois.",
  teamsLoadError: 'Impossible de charger les équipes. Réessaie.',
  retry: 'Réessayer',
  searchLabel: 'Rechercher une équipe',
  searchPlaceholder: 'Rechercher par nom...',
  noTeams: 'Aucune équipe trouvée',
});
