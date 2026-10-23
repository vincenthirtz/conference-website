// lib/i18n/locales/fr/overlayFinals.ts
//
// Traductions FRANCAISES du namespace `overlayFinals` — la source OBS
// « finales » (`/overlay/finales`) — SOURCE DE VERITE. Le pendant anglais vit
// dans `../en/<ns>.ts` ; le garde-fou `../parity.ts` casse le typecheck si
// une cle manque.
//
// A PART du namespace `overlay`, partage par toutes les sources : ces textes
// n'y servent qu'a une page, et chaque cle ajoutee la-bas pese sur toutes
// les autres (bundle-budget, 2026-10-23).

import { ns } from '../../ns';

export default ns('overlayFinals', {
  finalsDocTitle: 'Source de stream — finales',
  finalsMissingTournament:
    'Ajoutez ?tournament=<identifiant ou slug> à l’URL pour afficher les finales.',
  finalsGrand: 'Grande finale',
  finalsSmall: 'Petite finale',
  finalsKickoff: 'Coup d’envoi',
  finalsChampions: 'Championnes',
  finalsRunnersUp: 'Finalistes',
  finalsThird: '3ᵉ place',
  finalsFourth: '4ᵉ place',
  finalsNone:
    'Aucune finale le {date} : la source n’affiche que les matchs nommés « Petite finale » ou « Grande finale ».',
});
