// lib/branding/useSiteLogo.ts
//
// Le logo que la navbar affiche en ce moment, pour les surfaces qui veulent le
// MÊME : logo du tenant en marque blanche, sinon logo d'événement du jour
// (Octobre rose, Noël… cf. useSeasonalLogo), sinon le logo par défaut de la Cup.
//
// L'ordre est celui de la navbar : un espace en marque blanche ne prend jamais
// le logo d'un événement de la Cup.

import { useTenantBranding } from '@/lib/branding/TenantBrandingProvider';
import { useSeasonalLogo } from '@/lib/branding/useSeasonalLogo';

/** Logo de l'espace par défaut, hors événement. */
export const DEFAULT_SITE_LOGO_SRC = '/img/logos/2026-logo.png';

export function useSiteLogo(): string {
  const branding = useTenantBranding();
  const seasonal = useSeasonalLogo(!branding);
  return branding?.logoUrl ?? seasonal?.url ?? DEFAULT_SITE_LOGO_SRC;
}
