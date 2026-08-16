// lib/i18n/locales/admin-fr/adminNewsNew.ts
//
// Traductions FRANCAISES du namespace `adminNewsNew` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminNewsNew', {
  pageTitle: 'Admin – Nouvelle news',
  back: 'Retour a la liste des news',
  heading: 'Nouvelle news',
  subtitle: 'Publie une actualite pour le site.',
  sectionGeneral: 'Informations generales',
  titleLabel: 'Titre',
  titlePlaceholder: 'Titre de la news',
  slugLabel: 'Slug (URL)',
  slugPlaceholder: 'sera-genere-si-vide',
  slugHint: 'Laisse vide pour generer automatiquement.',
  tagLabel: 'Tag / categorie',
  tagPlaceholder: 'general, tournoi, announcement...',
  tagHint: 'Utilise pour filtrer les news par categorie.',
  imageLabel: 'Image',
  imageHint: 'PNG, JPEG ou WebP, max 2 Mo.',
  excerptLabel: 'Resume',
  excerptPlaceholder: 'Court resume de la news...',
  sectionContent: 'Contenu',
  contentLabel: 'Contenu (markdown ou texte)',
  contentPlaceholder: '# Titre\n\nContenu de la news en markdown...',
  sectionPublication: 'Publication',
  statusLabel: 'Statut',
  statusDraft: 'Brouillon',
  statusPublished: 'Publie',
  publishDateLabel: 'Date de publication',
  publishDateHint: 'Laisse vide pour utiliser la date actuelle.',
  creating: 'Creation en cours...',
  submit: 'Creer la news',
  cancel: 'Annuler',
  sectionPreview: 'Apercu',
  sectionInfo: 'Informations',
  infoDraft: 'La news sera creee en brouillon par defaut.',
  infoMarkdown: 'Le contenu supporte le format Markdown.',
  infoTag: 'Le tag permet de categoriser et filtrer les news.',
  errorGeneric: 'Erreur inattendue.',
});
