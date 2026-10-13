// utils/overlay/branding.ts — l'habillage d'espace tel que les sources OBS le
// reçoivent : trois champs, rien de plus. C'est la projection de
// `TenantBranding` (utils/tenant.ts) que chaque route `/api/overlay/*` calcule
// (`accent` = accentColor, sinon primaryColor). Déclaré une fois ici pour que
// les types de réponse de ces routes vivent hors de `pages/api` (lot 4b :
// le site n'importe plus pages/api, même pour un type).

export type OverlayBranding = {
  name: string | null;
  logoUrl: string | null;
  accent: string | null;
};
