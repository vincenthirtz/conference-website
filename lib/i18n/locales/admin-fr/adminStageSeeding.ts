// lib/i18n/locales/admin-fr/adminStageSeeding.ts
//
// Traductions FRANCAISES du namespace `adminStageSeeding` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStageSeeding', {
  errLoad: 'Erreur de chargement',
  errFallback: 'Échec',
  toastSelectSource: 'Sélectionne un stage source.',
  toastLockedReseed: 'Re-seed bloqué : un match round 1 a démarré.',
  confirmAutoTitle: 'Appliquer le seeding automatique ?',
  confirmAutoSubtitle:
    'Cela écrase les slots actuels du round 1 avec la proposition auto.',
  confirmAutoLabel: 'Appliquer auto',
  toastAutoApplied: 'Seeding automatique appliqué.',
  toastNoAssignments: 'Aucune assignation à appliquer.',
  toastDuplicateTeam: 'Équipe en double dans le draft.',
  confirmManualTitle: 'Appliquer le seeding manuel ?',
  confirmManualSubtitle:
    'Cela remplace les slots actuels du round 1 par tes choix manuels.',
  confirmManualLabel: 'Appliquer manuel',
  toastManualApplied: 'Seeding manuel appliqué.',
  toastRatingLocked: 'Seed par rating bloqué : un match round 1 a démarré.',
  toastGenBracketFirst:
    'Génère d’abord le bracket de ce stage avant de seeder.',
  confirmRatingTitle: 'Appliquer le seed par rating ?',
  confirmRatingSubtitle:
    'Cela classe les équipes inscrites par rating Glicko (+ SoS) et écrase les slots actuels du round 1.',
  confirmRatingLabel: 'Appliquer le seed par rating',
  toastRatingApplied: '{count} équipes placées.',
  toastRatingConflict:
    'Impossible : un match du round 1 est déjà joué ou en cours.',
  pageTitle: 'Admin – Seeding comparator',
  back: 'Retour au stage',
  heading: 'Seeding comparator',
  subtitle: '{stage} · {slots} slots round 1',
  refresh: 'Rafraîchir',
  lockNoticeSuffix:
    'Toute action de seeding est bloquée tant que ces matchs ne sont pas réinitialisés.',
  sourceStageLabel: 'Stage source (classement)',
  noSourceStage: '— Aucun stage source —',
  patternLabel: 'Pattern de placement',
  patternStandard: 'Standard (1 vs 2N, 2 vs 2N-1, …)',
  patternSequential: 'Séquentiel (1 vs 2, 3 vs 4, …)',
  copyAutoToManual: 'Copier auto → manuel',
  clearDraft: 'Vider le draft',
  autoTitle: 'Proposition auto',
  slotCount: '{count} slot(s)',
  matchLabel: 'Match #{n}',
  noRound1Matches: 'Aucun match round 1 dans ce bracket.',
  applying: 'Application…',
  applyAuto: 'Appliquer cette auto-seed',
  manualTitle: 'Draft manuel',
  draftSlotCount: '{count} slot(s) renseigné(s)',
  noRound1: 'Aucun match round 1.',
  applyManual: 'Appliquer ce draft manuel',
  ratingTitle: 'Seed par rating (Glicko + SoS)',
  ratingRankedCount: '{count} équipe(s) classée(s)',
  ratingIntroBefore:
    'Classe les équipes inscrites par rating Glicko cross-event (+ force du calendrier), sans phase qualificative. Lance d’abord un',
  ratingIntroLink: 'rebuild des ratings',
  ratingIntroAfter: 'si le classement paraît vide ou neutre.',
  methodLabel: 'Méthode',
  methodRatingSos: 'Rating + SoS',
  methodRating: 'Rating seul',
  sosWeightLabel: 'Poids SoS',
  sosWeightHint: '(avancé, vide = défaut)',
  sosWeightPlaceholder: 'défaut serveur',
  ratingLockReason: 'Seeding bloqué : un match round 1 a démarré.',
  ratingNoBracketNotice:
    'Aucun match round 1 : génère d’abord le bracket de ce stage.',
  loadingShort: 'Chargement…',
  ratingEmptyBefore:
    'Aucune équipe inscrite à ce stage. Ajoute des équipes depuis',
  ratingEmptyLink: 'l’onglet Équipes du stage',
  thRank: 'Rang',
  thTeam: 'Équipe',
  thRating: 'Rating',
  thSos: 'SoS',
  thScore: 'Score',
  applyRating: 'Appliquer le seed par rating',
  slotEmpty: '— vide —',
  teamUnknown: '— équipe inconnue —',
  provisionalTitle: 'RD Glicko élevé / peu de matchs : classement provisoire.',
  provisionalBadge: 'provisoire',
});
