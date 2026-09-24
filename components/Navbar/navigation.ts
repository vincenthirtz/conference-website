// components/Navbar/navigation.ts
//
// LA source des liens de navigation (refonte des menus, plan 6).
//
// Avant, chaque menu refaisait sa liste depuis config/links.json : le menu
// public et le menu mobile masquaient « À propos », « Cast » et « Sponsors »
// chacun avec sa copie de la règle ; les barres admin et joueuse ne les
// masquaient pas du tout, et affichaient les titres en français même en
// anglais. Quatre copies, quatre écarts possibles.
//
// PUR : ni React ni réseau — testable (tests/unit/navigation.test.ts).

import linksConfig from '@/config/links.json';
import type { LinkItem } from '@/types/types';

export { PLAYER_LINKS } from './playerLinks';
export { ADMIN_LINKS, filterAdminLinks } from './adminLinks';

/** Entrées de config/links.json gardées hors des menus. */
export const HIDDEN_PUBLIC_LINKS: ReadonlySet<string> = new Set([
  'À propos',
  'Cast',
  'Sponsors',
]);

/** Le menu du site, tel que tous les menus l'affichent. */
export const PUBLIC_LINKS: LinkItem[] = (linksConfig as LinkItem[]).filter(
  (link) => !HIDDEN_PUBLIC_LINKS.has(link.title)
);

export type FlatLink = { title: string; ref: string };

/**
 * Le menu du site À PLAT (« Communauté – Rejoindre une équipe ») : le sous-menu
 * « Site » des barres admin et joueuse. `label` localise un titre (les titres
 * de config/links.json sont le français canonique).
 */
export function flatPublicLinks(
  label: (title: string) => string = (t) => t
): FlatLink[] {
  const out: FlatLink[] = [];
  for (const link of PUBLIC_LINKS) {
    if (link.subMenu) {
      for (const sub of link.subMenu) {
        if (sub.ref) {
          out.push({
            title: `${label(link.title)} – ${label(sub.title)}`,
            ref: sub.ref,
          });
        }
      }
    } else if (link.ref) {
      out.push({ title: label(link.title), ref: link.ref });
    }
  }
  return out;
}

/** Chemin sans query ni ancre. */
function cleanPath(asPath: string): string {
  const p = asPath.split(/[?#]/)[0] || '/';
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

/**
 * L'entrée du menu du site ACTIVE pour une URL (plan 8).
 *
 * La règle comparait `router.pathname` — le MOTIF de route
 * (`/tournament/[id]`) — au lien réel (`/tournament/ow-womens-cup-2026`) :
 * « Tournoi » n'était jamais surligné sur les pages du tournoi. On compare
 * désormais l'URL réelle, et le lien le plus PRÉCIS gagne : sur
 * `/tournament/ow-womens-cup-2026/teams`, c'est « Équipes », pas « Tournoi ».
 * L'accueil `/` ne l'est qu'en correspondance exacte.
 *
 * Rend le `ref` de l'entrée de premier niveau active (son sous-menu compris),
 * ou null.
 */
export function activePublicLinkRef(
  asPath: string,
  links: LinkItem[] = PUBLIC_LINKS
): string | null {
  const path = cleanPath(asPath);
  let best: { key: string; len: number } | null = null;
  for (const link of links) {
    const refs = link.subMenu
      ? link.subMenu.map((s) => s.ref).filter((r): r is string => !!r)
      : link.ref
        ? [link.ref]
        : [];
    const key = link.ref ?? `menu:${link.title}`;
    for (const ref of refs) {
      const r = cleanPath(ref);
      const hit =
        r === '/' ? path === '/' : path === r || path.startsWith(`${r}/`);
      if (hit && (!best || r.length > best.len)) best = { key, len: r.length };
    }
  }
  return best?.key ?? null;
}

/** Clé d'une entrée de premier niveau, comparable à `activePublicLinkRef`. */
export function publicLinkKey(link: LinkItem): string {
  return link.ref ?? `menu:${link.title}`;
}
