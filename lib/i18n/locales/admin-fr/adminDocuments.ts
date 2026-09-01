// lib/i18n/locales/admin-fr/adminDocuments.ts
//
// Traductions FRANCAISES du namespace `adminDocuments` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts`.
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDocuments', {
  headTitle: 'Admin · Documents de l’asso',
  eyebrow: 'Admin · Association',
  heading: 'Documents de l’asso',
  intro:
    'Le Drive de l’association, en lecture seule. Les fichiers restent chez Google : cette page dit ce qu’il y a dedans, et ouvre le document dans Drive.',

  loadError: 'La liste n’a pas pu être chargée.',
  retry: 'Réessayer',
  empty: 'Ce dossier est vide.',
  count: '{count} élément(s)',
  searchPlaceholder: 'Rechercher un document…',

  // Fil d'Ariane
  breadcrumbAria: 'Fil d’Ariane du Drive',
  openInDrive: 'Ouvrir dans Drive',

  // Colonnes
  colName: 'Nom',
  colType: 'Type',
  colSize: 'Taille',
  colModified: 'Modifié le',
  colModifiedBy: 'Par',
  colActions: '',

  typeFolder: 'Dossier',
  typePdf: 'PDF',
  typeDoc: 'Document',
  typeSheet: 'Tableur',
  typeSlides: 'Présentation',
  typeImage: 'Image',
  typeOther: 'Fichier',
  sizeUnknown: '—',
  modifiedByUnknown: '—',

  // Etat « pas encore branché »
  setupTitle: 'Le Drive n’est pas encore branché',
  setupIntro:
    'Deux variables d’environnement suffisent. Rien à installer, rien à migrer.',
  setupStep1:
    '1. Créer un compte de service Google Cloud et télécharger sa clé JSON.',
  setupStep2:
    '2. Partager le dossier Drive de l’asso avec l’adresse du compte de service (accès Lecteur suffit).',
  setupStep3:
    '3. Renseigner GOOGLE_DRIVE_SA_KEY (la clé JSON, en clair ou en base64) et GOOGLE_DRIVE_FOLDER_ID (l’identifiant du dossier, visible dans son URL).',
  setupWhy:
    'Pourquoi un compte de service plutôt qu’une connexion Google personnelle : un accès personnel disparaît avec la personne qui l’a donné. Un compte de service appartient à l’association.',

  // Dépôt / corbeille — visibles seulement avec le droit d'écriture
  uploadCta: 'Déposer un fichier',
  uploading: 'Dépôt en cours…',
  uploaded: '« {name} » déposé.',
  uploadError: 'Le dépôt a échoué.',
  uploadTypeError: 'Ce type de fichier n’est pas accepté.',
  uploadSizeError: 'Fichier trop volumineux (25 Mo maximum).',
  uploadHint:
    'PDF, images, bureautique. 25 Mo maximum. Le fichier part directement dans le Drive.',
  readOnlyNote:
    'Vous consultez le Drive en lecture seule. Le dépôt demande le droit « Déposer des documents ».',
  trash: 'Corbeille',
  trashing: 'Envoi…',
  trashed: '« {name} » est dans la corbeille de Drive.',
  trashError: 'La mise à la corbeille a échoué.',
  confirmTrashTitle: 'Mettre à la corbeille ?',
  confirmTrashBody:
    '« {name} » part à la corbeille de Drive, d’où il reste récupérable pendant 30 jours. Rien n’est supprimé définitivement.',
  confirmTrashCta: 'Mettre à la corbeille',
  cancel: 'Annuler',
});
