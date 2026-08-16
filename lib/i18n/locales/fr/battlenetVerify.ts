// lib/i18n/locales/fr/battlenetVerify.ts
//
// Traductions FRANCAISES du namespace `battlenetVerify` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('battlenetVerify', {
  title: 'Vérifier mon BattleTag',
  why: 'Relie ton compte Battle.net pour prouver que ce BattleTag est bien le tien. Ton équipe gagne un badge de confiance sur le roster, et ça protège la compétition contre les smurfs.',
  onboardingTitle: 'Dernière étape : vérifie ton BattleTag',
  onboardingWhy:
    'Ton équipe est créée 🎉 Relie maintenant ton compte Battle.net : ça prouve que le BattleTag de ton roster est bien le tien, affiche un badge de confiance sur ta page publique et protège le tournoi contre les smurfs.',
  onboardingHint: 'Moins de 2 minutes, via la page officielle de Blizzard.',
  verifyBtn: 'Vérifier mon compte Battle.net',
  later: 'Plus tard',
  verifiedTitle: 'Compte Battle.net vérifié',
  verifiedProof:
    "Ce BattleTag t'appartient réellement : preuve anti-usurpation et anti-smurf.",
  verifiedOn: 'Vérifié le {date}',
  toastVerified: 'Ton BattleTag est vérifié ✅',
  toastLinked: 'Ton compte Battle.net est relié ✅',
  toastNoMatch:
    'Compte Battle.net lié, mais il ne correspond à aucun BattleTag de tes rosters. Vérifie que le tag saisi dans ton équipe correspond bien à ce compte.',
  toastAlreadyLinked: 'Ce compte Battle.net est déjà lié à une autre joueuse.',
  toastError: 'La vérification a échoué, réessaie.',
});
