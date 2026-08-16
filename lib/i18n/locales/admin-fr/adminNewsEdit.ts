// lib/i18n/locales/admin-fr/adminNewsEdit.ts
//
// Traductions FRANCAISES du namespace `adminNewsEdit` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminNewsEdit', {
  pageTitle: 'Admin – Éditer une news',
  breadcrumbNews: 'News',
  breadcrumbEdit: 'Modifier',
  staffSpace: 'Espace staff',
  heading: 'Éditer la news',
  subtitle: 'Met à jour le contenu ou le statut.',
  loading: 'Chargement…',
  titleLabel: 'Titre',
  slugLabel: 'Slug',
  slugPlaceholder: 'sera généré si vide',
  tagLabel: 'Tag / catégorie',
  tagPlaceholder: 'general, tournoi, announcement...',
  tagHint: 'Utilisé pour filtrer les news par catégorie (slug simple).',
  imageLabel: 'Image',
  imageHint: 'PNG, JPEG ou WebP, max 2 Mo.',
  statusLabel: 'Statut',
  statusDraft: 'Brouillon',
  statusPublished: 'Publié',
  publishDateLabel: 'Date de publication (si publiée)',
  excerptLabel: 'Résumé',
  contentLabel: 'Contenu (markdown ou texte)',
  saving: 'Enregistrement…',
  submit: 'Mettre à jour',
  back: 'Retour',
  errorGeneric: 'Erreur inattendue.',
});
