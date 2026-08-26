// lib/i18n/locales/admin-en/adminMatchDraft.ts
//
// Traductions ANGLAISES du namespace admin `adminMatchDraft`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminMatchDraft.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  unavailableHeading: 'Draft unavailable',
  blockMatchNotFound: 'This match cannot be found in your tenant.',
  blockNoTournament:
    "This match isn't attached to any tournament — unable to resolve the game.",
  blockNotDraftable:
    'This match has no draftable game{detail}. Draft is only available for LoL and Dota 2.',
  blockNotDraftableDetail: ' (current game: {detail})',
};
