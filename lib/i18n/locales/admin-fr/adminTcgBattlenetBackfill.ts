// lib/i18n/locales/admin-fr/adminTcgBattlenetBackfill.ts
//
// Traductions FRANCAISES du namespace `adminTcgBattlenetBackfill` — SOURCE DE
// VERITE. Le pendant anglais vit dans `../admin-en/adminTcgBattlenetBackfill.ts`.
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.
//
// VOCABULAIRE D'UNE RECOMPENSE GAGNEE, JAMAIS D'UN ACHAT NI D'UN CADEAU
// DISTRIBUE A LA VOLEE : la joueuse a prouve son compte, l'ecran rattrape ce
// que ce geste lui aurait rapporte. La monnaie se gagne (cf. docs/TCG.md §4).

import { adminNs } from '../../ns';

export default adminNs('adminTcgBattlenetBackfill', {
  heading: 'Rattraper la récompense Battle.net',
  subtitle:
    'Les joueuses qui ont vérifié leur compte Battle.net avant l’arrivée de la récompense n’ont rien reçu. Ce rattrapage les crédite une fois, dans cet espace uniquement. Une joueuse déjà récompensée, ici ou ailleurs, ne l’est pas deux fois.',
  eligible: '{count} compte(s) vérifié(s) rattaché(s) à cet espace',
  alreadyRewarded: '{count} déjà récompensé(s)',
  wouldGrant: '{count} à créditer',
  discordDms: '{count} message(s) Discord partiront',
  discordDmsUnknown: 'Nombre de messages Discord non mesurable',
  outsideSpace:
    '{count} compte(s) vérifié(s) hors de cet espace (ni roster ni collection ici) : non concernés',
  reward: '{coins} pièces par compte, une fois à vie, sans paquet',
  notReady:
    'La récompense n’est pas encore activée (migration non déclarée passée) : rien ne peut être crédité.',
  nothingToDo: 'Rien à rattraper.',
  replayHint:
    'Relancer plus tard est sans risque : seuls les comptes vérifiés ou rattachés entre-temps seront crédités.',
  grant: 'Rattraper',
  granting: 'Rattrapage…',
  confirmTitle: 'Rattraper la récompense Battle.net ?',
  confirmBody:
    '{count} compte(s) recevront {coins} pièces chacun, soit {total} pièces au total. La récompense est unique : une fois versée ici, elle ne pourra plus l’être dans un autre espace.',
  confirmDms: '{dms} message(s) Discord partiront.',
  confirmDmsUnknown: 'Le nombre de messages Discord n’a pas pu être mesuré.',
  resultGranted:
    '{granted} compte(s) crédité(s), {already} déjà récompensé(s).',
  resultPartial:
    '{granted} compte(s) crédité(s), {errors} en échec : consulter les journaux avant de relancer.',
  resultNothing: 'Aucun compte crédité : {already} déjà récompensé(s).',
  loadError: 'Simulation illisible pour le moment.',
  grantError: 'Le rattrapage a échoué.',
});
