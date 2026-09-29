// features/player/_shared/shell/PlayerShell.tsx — la coquille de l'espace
// joueuse (lot P8, docs/PLAN-industrialisation-joueur.md ; pendant de
// features/admin/_shared/shell/AdminShell.tsx).
//
// Ce qu'elle porte :
//   * la SESSION (`usePlayerSession`) et la redirection d'une visiteuse non
//     connectée — vers la MÊME adresse que l'écran migré (`redirectTo`), pour
//     que le comportement ne bouge pas ; `null` : la page garde sa propre
//     redirection (pages pas encore migrées, qui en ont chacune une) ;
//   * l'ÉQUIPE ACTIVE (ActiveTeamContext, posé par _app) — affichée par le
//     rail desktop ; le sélecteur reste dans les écrans qui en ont un ;
//   * la NAVIGATION : barre basse en PWA mobile, rail latéral en desktop
//     (PlayerNav) ;
//   * la CLOCHE : components/Navbar/PlayerTopBarBell, rendue une seule fois par la
//     barre du haut (globale, cf. _app → navbar) — la coquille n'en ajoute pas.
//
// Ce qu'elle ne fait PAS : s'afficher en inspection. Les écrans joueuse rendus
// sous l'admin (player-view, captain-view) ont la coquille ADMIN ; une page
// joueuse montée dans un PlayerAreaProvider d'inspection ne reçoit que son
// contenu.

import { useRouter } from 'next/router';
import type { ComponentType, ReactNode } from 'react';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import PlayerNav from './PlayerNav';

/** Adresse de connexion : fixe, calculée depuis `asPath`, ou aucune (`null`). */
export type ShellRedirect = string | ((asPath: string) => string) | null;

export type PlayerShellProps = {
  redirectTo?: ShellRedirect;
  children: ReactNode;
};

export default function PlayerShell({
  redirectTo = null,
  children,
}: PlayerShellProps) {
  const router = useRouter();
  const { isInspecting } = usePlayerArea();
  const target =
    typeof redirectTo === 'function' ? redirectTo(router.asPath) : redirectTo;
  const { ready } = usePlayerSession({
    redirectTo: target ?? undefined,
    // Jamais de redirection en inspection : l'appelante est le staff.
    redirect: target !== null && !isInspecting,
  });

  if (isInspecting) return <>{children}</>;

  return (
    <>
      {children}
      {/* Nav montrée à une joueuse CONNECTÉE seulement : pendant la
          résolution de la session, ou pour une visiteuse redirigée, la page
          reste telle qu'elle était. */}
      {ready && <PlayerNav />}
    </>
  );
}

/**
 * Enveloppe une page joueuse dans la coquille. Comme `withPlayerQuery`, les
 * propriétés statiques de la page (`seo`, lue par `_app`) sont recopiées.
 */
export function withPlayerShell<C extends ComponentType<never>>(
  Page: C,
  options: { redirectTo?: ShellRedirect } = {}
): C {
  const Inner = Page as unknown as ComponentType<Record<string, unknown>>;
  function WithPlayerShell(props: Record<string, unknown>) {
    return (
      <PlayerShell redirectTo={options.redirectTo ?? null}>
        <Inner {...props} />
      </PlayerShell>
    );
  }
  Object.assign(WithPlayerShell, Page);
  WithPlayerShell.displayName = `withPlayerShell(${Page.displayName ?? Page.name ?? 'Page'})`;
  return WithPlayerShell as unknown as C;
}
