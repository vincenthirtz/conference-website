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
  tournamentLabel: 'Tournoi',
  noTournament:
    'Aucun tournoi dans cet espace : les sources de match apparaîtront avec le premier.',
  elsewhereTitle: 'Overlays réglés ailleurs',
  elsewhereIntro:
    'Ces sources dépendent d’un réglage qui vit sur son propre écran : l’URL s’y copie.',
  runOverlay: 'Overlay du run en direct',
  runOverlayDesc: 'Scène, bandeau et PiP pilotés depuis la console live.',
  sceneOverlays: 'Scènes caster',
  sceneOverlaysDesc: 'Tableau de score et habillage, une URL par scène.',
  tcgOverlay: 'Annonces TCG',
  tcgOverlayDesc: 'Les cartes tirées pendant le direct, par jeton privé.',
  open: 'Ouvrir',
});
