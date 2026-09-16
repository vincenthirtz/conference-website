// lib/i18n/locales/fr/tcgFanart.ts
//
// Traductions FRANCAISES du namespace `tcgFanart` — SOURCE DE VERITE.
// Toute cle ajoutee ici doit l'etre aussi dans `../en/tcgFanart.ts`
// (garde-fou de compilation : `locales/parity.ts`).
//
// Les cartes FAN ART : page de credits publique (`pages/tcg/fan-art.tsx`) et
// formulaire de proposition (`components/tcg/FanartSubmitPanel.tsx`).
// Regle d'ecriture : on NOMME toujours l'autrice. Aucune formulation ne parle
// d'une carte « de la communaute » sans dire de qui elle est.

import { ns } from '@/lib/i18n/ns';

export default ns('tcgFanart', {
  creditsBadge: 'Cartes fan art',
  creditsTitle: 'Elles ont dessiné les cartes',
  creditsIntro:
    'Chaque carte fan art du TCG est l’œuvre d’une personne de la communauté. Elle est validée par le staff, tirée dans les paquets, et créditée ici comme sur la carte.',
  creditsSubmitCta: 'Proposer une carte',
  creditsGuideCta: 'Comprendre le TCG',
  creditsEmpty:
    'Aucune carte fan art n’est encore validée. La première peut être la tienne.',
  creditsCount_one: '{count} carte validée',
  creditsCount_other: '{count} cartes validées',
  creditsBy: 'par {artist}',
  creditsArtistLink: 'Voir son travail',
  creditsImageAlt: '{title}, par {artist}',

  panelTitle: 'Proposer une carte fan art',
  panelIntro:
    'Dessine une carte, propose-la : le staff la relit, puis elle entre dans les paquets. Ton nom d’artiste apparaît sur la carte et sur la page des crédits.',
  panelSeeCredits: 'Voir les cartes déjà validées',
  labelImage: 'Ton image',
  // « Mio », pas « Mo » : le plafond est 2 × 1024 × 1024 octets
  // (`IMAGE_MAX_BYTES`), et un fichier de 2,05 Mo refusé contredirait l'écran.
  hintImage:
    'PNG, JPEG ou WebP, {max} Mio au maximum. Format portrait conseillé.',
  labelTitle: 'Titre de la carte',
  labelArtistName: 'Nom à créditer',
  hintArtistName:
    'Le nom sous lequel tu veux être reconnue — pas forcément ton pseudo de compte.',
  labelArtistUrl: 'Lien vers ton travail (facultatif)',
  labelLicence:
    'Cette œuvre est la mienne, et j’accepte qu’elle soit diffusée en carte du TCG, avec mon crédit.',
  submit: 'Proposer',
  submitting: 'Envoi…',
  submitted: 'Proposition envoyée : le staff la relit.',
  withdraw: 'Retirer',
  withdrawn: 'Proposition retirée.',
  mineTitle: 'Mes propositions',
  mineEmpty: 'Tu n’as encore rien proposé.',
  statusPending: 'En relecture',
  statusApproved: 'Validée',
  statusRejected: 'Refusée',
  statusRevoked: 'Retirée',
  rejectedReason: 'Motif : {reason}',
  errorTooManyPending:
    'Tu as déjà {max} propositions en attente. Attends une relecture avant d’en envoyer une autre.',
  errorLicence:
    'Il faut confirmer que l’œuvre est la tienne et accepter sa diffusion.',
  // Un refus DÉFINITIF dit quoi changer, jamais « réessaie » : renvoyer le même
  // fichier échouerait pareil (cf. `utils/tcg/fanartUploadErrors.ts`).
  errorMissingImage: 'Choisis l’image à proposer.',
  errorUnsupportedType:
    'Format non accepté : utilise un PNG, un JPEG ou un WebP.',
  errorTooLarge:
    'Image trop lourde : {max} Mio au maximum. Réduis-la ou exporte-la en JPEG ou WebP.',
  errorContentMismatch:
    'Ce fichier n’est pas une image PNG, JPEG ou WebP valide. Réexporte-la depuis ton logiciel.',
  errorTitle: 'Le titre doit faire entre 2 et {max} caractères.',
  errorArtistName: 'Le nom à créditer doit faire entre 2 et {max} caractères.',
  errorArtistUrl:
    'Lien invalide : colle l’adresse complète, commençant par https://.',
  errorGeneric: 'Envoi impossible pour le moment. Réessaie.',
  loadError: 'Impossible de charger tes propositions.',
});
