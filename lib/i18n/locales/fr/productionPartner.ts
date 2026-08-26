// lib/i18n/locales/fr/productionPartner.ts
//
// Traductions FRANCAISES du namespace `productionPartner` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('productionPartner', {
  eyebrow: 'Production & diffusion',
  title: 'La régie de la Cup 2026, signée POGTV',
  body: "Les matchs de l'édition 2026 sont produits et diffusés par POGTV, un studio spécialisé dans la diffusion d'événements et d'émissions esport inclusifs. Régie, habillage et réalisation passent entre des mains professionnelles — pour que les joueuses n'aient qu'à jouer.",
  role: 'Studio de production partenaire',
  compactLabel: 'Production assurée par',
  logoAlt: 'Logo POGTV',
  twitchCta: 'Chaîne Twitch',
  instagramCta: 'Instagram',
  linkAria: 'POGTV sur {network} (nouvel onglet)',
});
