// components/Production/pogtv.ts
//
// Coordonnées du studio qui produit la diffusion de l'édition 2026.
// Extraites du composant pour que la bande « soutiens » de l'accueil et
// l'encart complet pointent vers les MÊMES URLs — un lien mis à jour d'un côté
// seulement passerait inaperçu.
//
// Le logo est servi en local : une URL distante casse `next/image`
// (remotePatterns), comme pour les logos d'équipes.

export const POGTV_NAME = 'POGTV';
export const POGTV_LOGO = '/img/logos/pogtv.png';
export const POGTV_TWITCH = 'https://www.twitch.tv/pogtv_lol';
export const POGTV_INSTAGRAM = 'https://www.instagram.com/_pogtv/';
