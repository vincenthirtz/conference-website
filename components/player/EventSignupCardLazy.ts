// components/player/EventSignupCardLazy.ts
//
// L'encart d'événement, chargé à la demande. Il ne s'affiche que le temps d'un
// événement, et rien avant sa lecture côté client : son code (formulaire,
// BattleTag, dictionnaire d'inscription) n'a pas à peser dans le JS de premier
// chargement de /player (cf. scripts/bundle-budget.mjs).

import dynamic from 'next/dynamic';

const EventSignupCard = dynamic(() => import('./EventSignupCard'), {
  ssr: false,
});

export default EventSignupCard;
