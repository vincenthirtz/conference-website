// lib/i18n/locales/admin-fr/adminDiffusionOverlays.ts
//
// Traductions FRANCAISES du namespace `adminDiffusionOverlays` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/adminDiffusionOverlays.ts`
// (garde-fou : `../admin-parity.ts`).
//
// La page Overlays de l'espace Diffusion (`pages/admin/diffusion/overlays.tsx`).

import { adminNs } from '../../ns';

export default adminNs('adminDiffusionOverlays', {
  pageTitle: 'Overlays — Diffusion',
  heading: 'Overlays',
  subtitle:
    'Toutes les sources à coller dans OBS, au même endroit. Choisissez le tournoi : les sources de match suivent la rencontre du moment.',
  tabsAriaLabel: 'Sections de la page Overlays',
  tabSources: 'Sources & overlays',
  tabMvpPublic: 'MVP du public',
  tournamentLabel: 'Tournoi',
  noTournament:
    'Aucun tournoi dans cet espace : les sources de match apparaîtront avec le premier.',
  elsewhereTitle: 'Overlays réglés ailleurs',
  elsewhereIntro:
    'Ces sources dépendent d’un réglage qui vit sur son propre écran : l’URL s’y copie.',
  twitchInteractions: 'Twitch & interactions',
  twitchInteractionsDesc:
    'Prédictions, points de chaîne et commandes Twitch : ce qui déclenche les annonces à l’écran.',
  sceneOverlays: 'Scènes caster',
  sceneOverlaysDesc: 'Tableau de score et habillage, une URL par scène.',
  tcgOverlay: 'Annonces TCG',
  tcgOverlayDesc: 'Les cartes tirées pendant le direct, par jeton privé.',
  tcgOverlayNoAccess:
    'Son jeton se règle avec le droit TCG : demandez-le à un·e admin.',
  open: 'Ouvrir',
});
