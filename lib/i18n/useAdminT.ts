import { createEnDictHook } from './lazyLocale';
import type { AdminNs } from './ns';

/**
 * i18n de l'espace ADMIN (staff-only, `pages/admin/*` + `components/admin/*`).
 *
 * Dictionnaire séparé du public (`useT`) pour deux raisons :
 *  - **Bundle** : les milliers de clés admin n'ont rien à faire dans le
 *    dictionnaire des pages publiques.
 *  - **Traduction différée** : on a pu câbler tout l'admin sur `useAdminT`
 *    avant que la traduction EN existe. La parité de structure est garantie
 *    par le garde-fou de compilation (cf. `locales/admin-parity.ts`).
 *
 * Même mécanique que `useT` : un fichier par namespace sous
 * `locales/admin-fr/<ns>.ts` (déclaré via `adminNs()`), importé par le seul
 * composant qui en a besoin ; `admin-en.json` reste un blob unique chargé
 * paresseusement à la bascule FR→EN.
 *
 *   import nsAdminDashboard from '@/lib/i18n/locales/admin-fr/adminDashboard';
 *   const t = useAdminT(nsAdminDashboard);
 *
 * `format()` (ré-exporté) interpole les marqueurs `{nom}`.
 */
const useEnDict = createEnDictHook(() => import('./locales/admin-en.json'));

export function useAdminT<T>(nsDef: AdminNs<string, T>): T {
  const en = useEnDict();
  return ((en?.[nsDef.key] as T | undefined) ?? nsDef.fr) as T;
}

export { format } from './useT';
