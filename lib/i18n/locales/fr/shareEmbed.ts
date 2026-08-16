// lib/i18n/locales/fr/shareEmbed.ts
//
// Traductions FRANCAISES du namespace `shareEmbed` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('shareEmbed', {
  button: 'Partager / Intégrer',
  dialogTitle: 'Partager / Intégrer',
  close: 'Fermer',
  linkSectionTitle: 'Lien du tournoi',
  copyLink: 'Copier le lien',
  linkCopied: 'Lien copié',
  share: 'Partager',
  genericName: 'ce tournoi',
  shareText: 'Suivez {name} en direct',
  shareTextGeneric: 'Suivez ce tournoi en direct',
  shareOnX: 'Partager sur X',
  shareOnBluesky: 'Partager sur Bluesky',
  shareError: 'La copie a échoué. Copiez le lien manuellement.',
  embedTitle: 'Intégrer sur votre site',
  embedDescription:
    'Copiez-collez ces extraits iframe pour afficher les widgets du tournoi sur votre site.',
  themeLabel: 'Thème',
  themeLight: 'Clair',
  themeDark: 'Sombre',
  accentToggle: "Couleur d'accent",
  accentPickerLabel: "Choisir la couleur d'accent",
  bracketName: 'Arbre',
  standingsName: 'Classement',
  scheduleName: 'Planning',
  ffaName: 'FFA',
  snippetCopied: 'Snippet copié',
  copyBtn: 'Copier',
  copiedBtn: 'Copié',
  openWidget: 'Ouvrir le widget',
});
