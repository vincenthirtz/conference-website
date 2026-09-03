// utils/tenantPage.ts
//
// Socle des pages publiques préfixées par espace (`pages/[tenantSlug]/...`).
//
// Une page d'espace fait toujours les trois mêmes gestes : lire le slug dans
// l'URL, le résoudre en `tenant_id` (404 si inconnu, désactivé, ou base
// indisponible), puis charger ses données AVEC ce tenant. Les répéter dans
// chaque page, c'est se donner N occasions d'oublier le filtre — et un filtre
// oublié n'échoue pas, il montre le contenu de quelqu'un d'autre.
//
// Le rendu reste SSR : deux espaces ne doivent jamais partager un cache de
// page. Les pages legacy non préfixées gardent leur génération statique pour
// l'espace historique.

import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import { getTenantIdBySlug } from './tenant';

export type TenantPageContext = {
  tenantId: string;
  tenantSlug: string;
  ctx: GetServerSidePropsContext;
};

/**
 * Construit un `getServerSideProps` d'espace.
 *
 * `load` reçoit un tenant déjà résolu et n'a donc aucune décision à prendre
 * sur le sujet. Le slug est renvoyé en prop (`tenantSlug`) pour que les liens
 * et les appels d'API de la page restent dans leur espace.
 */
export function withTenantPage<P extends Record<string, unknown>>(
  load: (input: TenantPageContext) => Promise<P>
): GetServerSideProps<P & { tenantSlug: string }> {
  return async (ctx) => {
    const raw = ctx.params?.tenantSlug;
    const tenantSlug = typeof raw === 'string' ? raw : null;
    if (!tenantSlug) return { notFound: true };

    const tenantId = await getTenantIdBySlug(tenantSlug);
    // Slug inconnu, espace désactivé, ou base indisponible : 404 franc plutôt
    // qu'une page vide qui laisserait croire à un espace sans contenu.
    if (!tenantId) return { notFound: true };

    const props = await load({ tenantId, tenantSlug, ctx });
    return { props: { ...props, tenantSlug } };
  };
}
