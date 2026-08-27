// lib/i18n/locales/fr/teamRegistration.ts
//
// Traductions FRANCAISES du namespace `teamRegistration` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts`.
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('teamRegistration', {
  title: 'Inscription au tournoi',
  loading: 'Lecture de ton inscription…',
  loadError:
    "Impossible de lire l'état de ton inscription. Recharge la page ou contacte le staff.",

  registeredTitle: 'Inscrite à {tournament}',
  registeredDesc:
    "Rien à faire de plus de ce côté : ton équipe fait partie des équipes inscrites.",

  pendingTitle: 'Candidature envoyée',
  pendingDesc:
    'Le staff doit encore la valider. Tu n\'as pas besoin d\'en déposer une seconde.',

  rejectedNotice:
    "Ta candidature précédente n'a pas été retenue (le {date}). Tu peux en redéposer une, ou en parler au staff avant.",

  notRegisteredTitle: "Ton équipe n'est pas encore inscrite à {tournament}",
  notRegisteredDesc:
    "L'inscription tentée à la création de l'équipe n'a pas abouti — c'est le cas quand le roster n'est pas encore complet au moment où l'équipe est créée. Dépose la candidature d'ici, quand tu es prête.",

  blockersTitle: 'Ce qu\'il reste à faire',
  blockerNotOpen:
    'Les inscriptions à ce tournoi ne sont pas ouvertes en ce moment.',
  blockerRosterShortfall:
    'Il faut au moins {min} membres dans le roster (hors coach) — vous êtes {count}.',
  blockerTournamentFull:
    'Le tournoi est complet : {registered} équipes sur {max}.',
  blockerNoPermission:
    "Ton rôle dans l'équipe ne permet pas d'inscrire l'équipe à un tournoi. Demande-le à la capitaine.",

  rosterCta: 'Compléter le roster',
  contactStaffCta: 'Contacter le staff',

  messageLabel: 'Message pour le staff',
  messageOptional: 'facultatif',
  messagePlaceholder: 'Un contexte utile à la validation ?',

  customFieldsTitle: "Champs demandés par le tournoi",
  customFieldRequiredMark: '*',
  customFieldRequiredError: 'Ce champ est requis.',
  customFieldSelectPlaceholder: 'Choisir…',

  submitCta: 'Déposer la candidature',
  submitting: 'Envoi…',
  submitError: "La candidature n'a pas pu être envoyée. Réessaie.",
  submitSuccess:
    'Candidature envoyée. Le staff la validera, tu verras le résultat ici.',

  readOnlyNote:
    'Inspection : les gestes sont désactivés, tu vois ce que voit la capitaine.',
});
