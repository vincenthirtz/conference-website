// utils/castersRedirect.ts
//
// Les anciennes adresses de la liste des casteuses — `/admin/cast-members` et
// l'onglet `/admin/association?tab=cast` — redirigent (308) vers
// Diffusion › Casteuses, en conservant les paramètres (`?new=1` ouvre la
// modale de création). UN SEUL SAUT : `cast-members/new` en faisait deux
// (liste legacy, puis hub), et le test e2e attendait l'adresse du milieu.

import type { GetServerSidePropsResult } from 'next';
import type { ParsedUrlQuery } from 'querystring';

export const CASTERS_PATH = '/admin/diffusion/casteuses';

export function castersRedirect(
  query: ParsedUrlQuery
): GetServerSidePropsResult<never> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // `tab` désignait l'onglet du hub Association : il n'a plus de sens ici.
    if (key === 'tab') continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  const qs = params.toString();
  return {
    redirect: {
      destination: qs ? `${CASTERS_PATH}?${qs}` : CASTERS_PATH,
      permanent: true,
    },
  };
}
