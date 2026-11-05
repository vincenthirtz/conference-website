// lib/i18n/locales/admin-fr/adminTournamentDebriefs.ts
//
// Traductions FRANCAISES du namespace `adminTournamentDebriefs` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.
//
// Sous-onglet « Debriefs » de Resultats (pages/admin/tournament/[id]/stats) :
// les points positifs / negatifs envoyes par les equipes depuis Discord.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentDebriefs', {
  heading: 'Debriefs des équipes',
  intro:
    'À la fin du tournoi, le bot demande à chaque équipe ses points positifs et ses points négatifs, dans son salon privé Discord. Les réponses ne sont lisibles qu’ici, par le staff.',
  autoNote:
    'La demande part d’elle-même quand le podium est figé. Ce bouton sert pour un tournoi clos sans finalisation, ou pour relancer les équipes.',
  requestCta: 'Demander le debrief',
  requesting: 'Envoi…',
  refresh: 'Rafraîchir',
  noTeamsToRequest:
    'Aucune équipe engagée : il n’y a personne à qui demander un debrief.',
  confirmTitle: 'Demander le debrief ?',
  confirmSubtitle:
    'Le bot va demander un debrief dans le salon privé de chaque équipe engagée.',
  confirmAnswered_one:
    '{count} équipe a déjà répondu : elle recevra aussi le message et pourra modifier son debrief.',
  confirmAnswered_other:
    '{count} équipes ont déjà répondu : elles recevront aussi le message et pourront modifier leur debrief.',
  confirmLabel: 'Envoyer la demande',
  resultSent_one: 'Envoyé à {requested} équipe.',
  resultSent_other: 'Envoyé à {requested} équipes.',
  resultSentWithout_one:
    'Envoyé à {requested} équipe, dont {without} sans salon Discord.',
  resultSentWithout_other:
    'Envoyé à {requested} équipes, dont {without} sans salon Discord.',
  resultWithoutHint:
    'Une équipe sans salon privé ne reçoit pas le message : à contacter autrement.',
  resultNone: 'Aucune équipe engagée : rien n’a été envoyé.',
  requestError: 'La demande de debrief n’a pas pu être envoyée.',
  loading: 'Chargement des debriefs…',
  loadError: 'Impossible de charger les debriefs.',
  retry: 'Réessayer',
  emptyTitle: 'Aucune équipe engagée',
  emptyDescription:
    'Les debriefs apparaîtront ici dès que des équipes engagées dans le tournoi auront répondu au bot.',
  answeredCount: 'Réponses : {answered} sur {total}',
  listLabel: 'Debriefs par équipe',
  noAnswer: 'Pas encore de réponse',
  updatedAt: 'Mis à jour le {date}',
  positives: 'Points positifs',
  negatives: 'Points négatifs',
  nothingNoted: 'Rien de noté',
});
