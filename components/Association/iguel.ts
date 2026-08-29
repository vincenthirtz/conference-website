// components/Association/iguel.ts
//
// Coordonnées de l'ambassadeur mis en avant dans la carte du pôle Communauté.
// Extraites de la page pour la même raison que `components/Association/ribbit`
// et `components/Production/pogtv` : si l'encart est repris ailleurs, un seul
// endroit à mettre à jour.
//
// Pas de logo en local : l'encart affiche l'avatar Twitch résolu au build par
// `fetchTwitchProfileImages`, et retombe sur l'initiale si Helix ne répond pas
// (cf. `PolePartner`).

export const IGUEL_NAME = 'Iguel';
/** Login Twitch en minuscules : c'est la clé des maps renvoyées par Helix. */
export const IGUEL_CHANNEL = 'gf_iguel';
export const IGUEL_TWITCH = `https://www.twitch.tv/${IGUEL_CHANNEL}`;
