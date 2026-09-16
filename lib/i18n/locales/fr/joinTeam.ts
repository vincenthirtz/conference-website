// lib/i18n/locales/fr/joinTeam.ts
//
// Traductions FRANCAISES du namespace `joinTeam` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
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
    'Pas de place ouverte pour l’instant. Trois façons d’avancer, de la plus rapide à la plus longue :',
  createMyTeam: 'Creer mon equipe →',
  // Etat vide « aucune equipe ouverte » : trois recours, du plus rapide au plus
  // lent. La creation passe par une validation du staff — on le dit, sinon la
  // joueuse attend sans savoir qu'elle attend.
  emptyFreePlayerCta: 'Me signaler comme joueuse libre',
  emptyFreePlayerDesc:
    'Signale-toi en deux minutes : les capitaines qui recrutent te contactent.',
  emptyOpeningsCta: 'Voir les équipes qui recrutent',
  emptyOpeningsDesc:
    'Des équipes publient leurs besoins : contacte directement celles qui te correspondent.',
  emptyCreateCta: 'Créer mon équipe',
  emptyCreateDesc:
    'Ta demande de capitanat doit être validée par le staff avant que l’équipe existe.',
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
  battleTagLabel: 'Ton BattleTag',
  battleTagPlaceholder: 'Pseudo#1234',
  battleTagHint:
    'Format Blizzard : pseudo, dièse, quatre chiffres. Il apparaîtra sur le roster de ton équipe.',
  battleTagInvalid: 'Format BattleTag invalide (ex: Pseudo#1234).',
  battleTagRequired: 'Ton BattleTag est nécessaire pour rejoindre un roster.',
  teamsLoadError: 'Impossible de charger les équipes. Réessaie.',
  retry: 'Réessayer',
});
