// utils/teams/defaultTeamLogo.ts
//
// Logo par défaut d'une équipe créée AUTOMATIQUEMENT (équipe extérieure d'un
// scrim, sans capitaine pour téléverser le sien).
//
// POURQUOI UN LOGO ET PAS `null`. Les cartes, la page publique du scrim et les
// overlays caster affichent `teams.logo_url` : une équipe sans logo y laisse un
// trou. Le logo de la compétition est un remplissage neutre, et reste
// remplaçable depuis la fiche équipe.
//
// FORME DE L'URL. Chemin racine, comme les logos locaux déjà en base
// (`/img/teams-images/...`) et comme le repli de la barre de navigation
// (`branding?.logoUrl ?? '/img/logos/2026-logo.png'`). Un tenant en marque
// blanche garde son propre logo, exactement comme dans le header.

import { readTenantBranding } from '@/utils/tenant';

/** Logo Women's Cup servi par le site (`public/img/logos/2026-logo.png`). */
export const WOMENS_CUP_LOGO_URL = '/img/logos/2026-logo.png';

/**
 * Logo à poser sur une équipe auto-créée du tenant : celui de la marque
 * blanche du tenant s'il en a une, sinon le logo Women's Cup.
 */
export async function defaultTeamLogoUrl(tenantId: string): Promise<string> {
  try {
    const branding = await readTenantBranding(tenantId);
    return branding?.logoUrl ?? WOMENS_CUP_LOGO_URL;
  } catch {
    return WOMENS_CUP_LOGO_URL;
  }
}

/**
 * Garde le logo fourni s'il est renseigné ; sinon renvoie le logo par défaut
 * du tenant. Ne remplace JAMAIS un logo fourni.
 */
export async function withDefaultTeamLogo(
  provided: string | null | undefined,
  tenantId: string
): Promise<string> {
  const trimmed = typeof provided === 'string' ? provided.trim() : '';
  if (trimmed) return trimmed;
  return defaultTeamLogoUrl(tenantId);
}
