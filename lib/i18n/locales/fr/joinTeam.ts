// lib/i18n/locales/fr/joinTeam.ts
//
// Traductions FRANCAISES du namespace `joinTeam` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('joinTeam', {
  connectionError: 'Erreur de connexion.',
  selectTeamError: 'Selectionne une equipe a rejoindre.',
  createRequestError: 'Impossible de creer la demande.',
  genericError: 'Une erreur est survenue.',
  selectedTeamFallback: "l'equipe selectionnee",
  successTitle: 'Demande envoyee',
  successTabTitle: "Demande envoyee | OW Women's Cup",
  successBody:
    'Ta demande pour rejoindre "{name}" a bien ete envoyee. Le capitaine de l\'equipe la validera prochainement.',
  backToSpace: 'Retour a mon espace',
  pageTabTitle: "Rejoindre une equipe | OW Women's Cup",
  pageTitle: 'Rejoindre une equipe',
  pageIntro:
    "Recherche et selectionne l'equipe que tu souhaites rejoindre. Le capitaine de l'equipe validera ta demande.",
  searchLabel: 'Rechercher une equipe',
  searchPlaceholder: 'Rechercher par nom...',
  allCountries: 'Tous les pays',
  slotsOnly: 'Places disponibles uniquement',
  loading: 'Chargement...',
  emptyTitle: 'Aucune equipe ne recrute pour le moment.',
  emptySubtitle:
    'Reviens plus tard, ou cree la tienne pour lancer ton propre roster.',
  createMyTeam: 'Creer mon equipe →',
  membersSuffix: 'membres',
  desiredRoleLabel: 'Role souhaite',
  rolePlayer: 'Joueur',
  roleSub: 'Remplacant (sub)',
  messageLabel: 'Message au capitaine (optionnel)',
  messagePlaceholder: 'Presente-toi brievement au capitaine...',
  submitting: 'Envoi en cours...',
  submit: 'Envoyer ma demande',
  ctaQuestion: 'Tu veux creer ta propre equipe ?',
  becomeCaptain: 'Devenir capitaine',
  alreadyInTeamTitle: "Tu fais deja partie d'une equipe",
  alreadyInTeamBody:
    'Tu es deja membre de "{teamName}". Pour changer d\'equipe, passe par Demandes › Transfert.',
  alreadyInTeamCta: 'Aller a mes demandes de transfert →',
  teamsLoadError: 'Impossible de charger les équipes. Réessaie.',
  retry: 'Réessayer',
});
