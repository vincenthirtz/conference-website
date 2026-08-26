// lib/i18n/locales/admin-en/adminApiTokenReveal.ts
//
// Traductions ANGLAISES du namespace admin `adminApiTokenReveal`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminApiTokenReveal.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Votre nouveau token API',
  warning:
    'Ce token ne sera plus jamais affiché après la fermeture de cette fenêtre. Copiez-le et conservez-le dans un endroit sûr.',
  tokenLabel: 'Token',
  copy: 'Copier',
  copied: 'Copié !',
  copiedToast: 'Token copié dans le presse-papier.',
  copyError: 'Copie impossible : copie-le manuellement.',
  close: "J'ai copié le token, fermer",
};
