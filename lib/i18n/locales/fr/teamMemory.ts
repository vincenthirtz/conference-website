// lib/i18n/locales/fr/teamMemory.ts
//
// Traductions FRANCAISES du namespace `teamMemory` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('teamMemory', {
  title: "Mémoire d'équipe",
  subtitle:
    "Ce que vous avez retenu de chaque affrontement. Visible par votre équipe seule, jamais par l'adversaire.",
  reviewedCount: '{reviewed} / {total} débriefés',
  filterLabel: 'Adversaire',
  filterAll: 'Tous les adversaires',
  unknownOpponent: 'Adversaire inconnu',
  typeMatch: 'Match',
  typeScrim: 'Scrim',
  badgeReviewed: 'Débriefé',
  badgeTodo: 'À débriefer',
  win: 'Victoire',
  loss: 'Défaite',
  write: 'Écrire',
  edit: 'Modifier',
  close: 'Fermer',
  vodLabel: 'Lien de la VOD',
  vodPlaceholder: 'https://…',
  notesLabel: 'Notes de revue',
  notesPlaceholder:
    "Ce qui a marché, ce qui a coincé, ce qu'on travaille d'ici la prochaine fois…",
  privacy:
    "Ces notes restent dans votre équipe : ni l'adversaire, ni le staff, ni aucune page publique n'y ont accès.",
  saveCta: 'Enregistrer',
  saving: 'Enregistrement…',
  saved: 'Revue enregistrée.',
  saveError: 'Enregistrement impossible.',
  deleteCta: 'Supprimer la revue',
  deleted: 'Revue supprimée.',
  watchVod: 'Voir la VOD',
  // ── Objectifs d'avant-match (lot J5) ─────────────────────────────────
  objectivesLabel: 'Objectifs :',
  notesFromObjectives: 'Objectifs fixés :\n{objectives}\n\nCe qu’on en retient :\n',
});
