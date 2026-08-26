// lib/i18n/locales/fr/teamHealth.ts
//
// Traductions FRANCAISES du namespace `teamHealth` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('teamHealth', {
  title: "Santé de l'équipe",
  subtitle:
    'Ce qui vous empêche de jouer, de vous faire trouver ou de progresser. Rien de déclaratif : tout est dérivé de vos données.',
  blockingCount: '{count} bloquant(s)',
  fixCta: 'Réparer',
  noCaptain: 'Aucune capitaine désignée',
  whyNoCaptain:
    "Sans capitaine, personne ne peut accepter un scrim, inscrire l'équipe ni rapporter un score.",
  rosterShortfall: 'Il manque {count} titulaire(s) sur {required}',
  whyRosterShortfallTournament:
    "En dessous de l'effectif exigé par le tournoi, l'équipe ne peut pas être seedée.",
  whyRosterShortfallLineup:
    "En dessous de l'effectif de jeu, l'équipe ne peut aligner ni match ni scrim.",
  missingBattleTag: '{count} membre(s) sans BattleTag',
  whyMissingBattleTag:
    'Sans BattleTag, impossible de les identifier en jeu ni de les compter au classement.',
  unverifiedBattleTag: '{count} BattleTag(s) non vérifié(s)',
  whyUnverifiedBattleTag:
    "Un roster vérifié est crédible auprès des autres équipes et lève les litiges d'identité.",
  discordUnlinked: '{count} membre(s) sans compte Discord lié',
  whyDiscordUnlinked:
    "Elles ne recevront ni rôle, ni accès aux salons d'équipe, ni convocation avant un match.",
  neverLoggedIn: '{count} compte(s) jamais utilisé(s)',
  whyNeverLoggedIn:
    'Ces personnes ont été ajoutées mais ne se sont jamais connectées : elles ne verront rien.',
  noRhythm: "{count} membre(s) n'ont pas déclaré leurs créneaux",
  whyNoRhythm:
    "Tant qu'il manque du monde, le noyau de créneaux reste faux — et l'annonce de scrim aussi.",
  invisibleForScrims: 'Introuvable pour un scrim',
  whyInvisibleForScrims:
    "Sans annonce vivante ni créneaux d'habitude, aucune équipe ne peut vous proposer de jouer.",
  unreviewedEncounters: '{count} affrontement(s) jamais débriefé(s)',
  whyUnreviewedEncounters:
    "Ce que vous en avez appris se perd si personne ne l'écrit pendant que c'est frais.",
});
