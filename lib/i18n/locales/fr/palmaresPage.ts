// lib/i18n/locales/fr/palmaresPage.ts
//
// Traductions FRANCAISES du namespace `palmaresPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('palmaresPage', {
  eyebrow: 'Palmarès',
  title: 'Le palmarès des joueuses',
  subtitle:
    "Titres, finales et podiums cumulés sur tous les tournois du circuit. Une joueuse est créditée des résultats des tournois qu'elle a réellement joués avec son équipe.",
  leaderboardLink: 'Voir le classement par rating →',
  statTitles_one: 'titre',
  statTitles_other: 'titres',
  statFinals_one: 'finale',
  statFinals_other: 'finales',
  statPodiums_one: 'podium',
  statPodiums_other: 'podiums',
  statMvps_one: 'MVP',
  statMvps_other: 'MVP',
  rankShort: '{rank}e',
  rankFirst: '1re',
  unknownPlayer: 'Joueuse inconnue',
  unknownTournament: 'Tournoi',
  emptyTitle: 'Aucun palmarès pour le moment',
  emptyBody:
    "Le palmarès se remplira dès qu'un tournoi aura été clôturé avec son classement final. Revenez après la prochaine édition !",
});
