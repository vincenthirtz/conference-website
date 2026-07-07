import { createContext, useContext, useState, type ReactNode } from 'react';
import type { TenantBranding } from '@/utils/tenant';

/**
 * WHITELABEL — contexte de branding par tenant (couche d'OVERRIDE).
 *
 * Le branding est résolu au SSR dans `pages/_document.tsx` (via le host de la
 * requête → `resolveTenantIdByHost` → `readTenantBranding`) puis :
 *   1. injecté comme prop `branding` de `<App>` par `enhanceApp` (rendu
 *      serveur), et
 *   2. sérialisé dans une île JSON `<script id="__tenant_branding">` du HTML.
 *
 * Côté client, `_app` n'est PAS ré-enveloppé par `enhanceApp` : la prop
 * `branding` est donc `undefined` à l'hydratation. Le provider relit alors
 * l'île JSON — QUI CONTIENT LA MÊME VALEUR que celle utilisée au SSR — de sorte
 * que le premier rendu client est identique au HTML serveur (zéro mismatch
 * d'hydratation) tout en affichant le bon branding dès la première peinture.
 *
 * Tenant par défaut : ni prop, ni île → `null` → chaque consommateur retombe
 * sur sa constante historique. Rendu byte-identique au single-tenant.
 */

export const TENANT_BRANDING_ISLAND_ID = '__tenant_branding';

const TenantBrandingContext = createContext<TenantBranding | null>(null);

/**
 * Relit l'île JSON injectée par `_document`. Sur le serveur (`document`
 * indéfini) ou en son absence → `null`. Ne throw jamais : un JSON corrompu
 * retombe silencieusement sur le défaut.
 */
function readBrandingIsland(): TenantBranding | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(TENANT_BRANDING_ISLAND_ID);
  const raw = el?.textContent;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TenantBranding> | null;
    if (!parsed || typeof parsed.name !== 'string') return null;
    return {
      name: parsed.name,
      slug: typeof parsed.slug === 'string' ? parsed.slug : '',
      logoUrl: typeof parsed.logoUrl === 'string' ? parsed.logoUrl : null,
      primaryColor:
        typeof parsed.primaryColor === 'string' ? parsed.primaryColor : null,
      accentColor:
        typeof parsed.accentColor === 'string' ? parsed.accentColor : null,
    };
  } catch {
    return null;
  }
}

export function TenantBrandingProvider({
  branding,
  children,
}: {
  /** Injecté au SSR par `enhanceApp` ; `undefined` à l'hydratation client. */
  branding?: TenantBranding | null;
  children: ReactNode;
}) {
  // `useState(initializer)` : l'initializer ne s'exécute qu'une fois, au 1er
  // rendu. Serveur → `branding` (prop enhanceApp). Client → `readBrandingIsland`
  // (même valeur, sérialisée dans le HTML). Les deux coïncident → hydratation
  // sûre. Le branding est immuable pour la durée de vie de la page.
  const [value] = useState<TenantBranding | null>(
    () => branding ?? readBrandingIsland()
  );

  return (
    <TenantBrandingContext.Provider value={value}>
      {children}
    </TenantBrandingContext.Provider>
  );
}

/**
 * Branding du tenant courant, ou `null` (tenant par défaut → chaque
 * consommateur applique sa constante historique).
 */
export function useTenantBranding(): TenantBranding | null {
  return useContext(TenantBrandingContext);
}
