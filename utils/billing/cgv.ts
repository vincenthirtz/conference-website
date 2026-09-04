// utils/billing/cgv.ts
//
// La version des conditions générales de vente, et rien d'autre.
//
// Pourquoi une version. Accepter des CGV n'a de valeur que si l'on peut dire
// PLUS TARD quel texte a été accepté. Un site dont les CGV évoluent sans
// versionner ne peut rien opposer : le texte en ligne aujourd'hui n'est pas
// celui que le client a lu il y a six mois, et c'est celui-là qui l'engage.
//
// La version est donc enregistrée avec chaque acceptation (table
// `plan_cgv_acceptances`), et affichée en haut de la page /cgv pour que le
// client sache ce qu'il lit.
//
// RÈGLE : toute modification de fond du texte de /cgv incrémente cette date.
// Une correction de faute n'en est pas une ; un changement de prix, de durée,
// de responsabilité ou de rétractation en est une.

/** Version des CGV en vigueur. Format ISO, c'est aussi sa date d'entrée en vigueur. */
export const CGV_VERSION = '2026-09-04';
