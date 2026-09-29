// features/player/_shared/shell/PlayerNav.tsx — navigation de la coquille
// joueuse (lot P8) : barre BASSE sous `lg` (pouce, PWA), rail LATÉRAL à partir
// de `lg`. Mobile d'abord : 375 px de référence, cibles ≥ 56 px de haut.
//
// La barre du haut (components/Navbar/PlayerTopBar) garde ses onglets, son
// menu « Site », la déconnexion et la cloche : cette navigation n'en recopie
// AUCUN libellé (pas de doublon « Mes matchs », pas de seconde cloche).
//
// `data-player-nav` réserve la place de la barre (styles/player-ruban.css :
// marge basse sous `lg`, marge gauche au-dessus) — le pied de page et le
// dernier bloc d'une page ne passent jamais dessous.

import Link from 'next/link';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import { useT, format } from '@/lib/i18n/useT';
import nsPlayerTopBar from '@/lib/i18n/locales/fr/playerTopBar';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import {
  PLAYER_NAV_ITEMS,
  isPlayerNavItemActive,
  type PlayerNavKey,
} from './playerNavItems';

export type PlayerNavVariant = 'responsive' | 'bottom' | 'rail';

const ICON_PATHS: Record<PlayerNavKey, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5',
  team: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 8v-1.5a3.5 3.5 0 0 0-2.5-3.35M15 4.15a3.5 3.5 0 0 1 0 6.7',
  matches: 'M4 5h16v14H4zM4 10h16M9 3v4M15 3v4',
  tcg: 'M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm5 5 1.5 3 3 .5-2.25 2 .5 3L12 16l-2.75 1.5.5-3-2.25-2 3-.5z',
};

function NavIcon({ name }: { name: PlayerNavKey }) {
  return (
    <svg
      aria-hidden
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const FRAME: Record<PlayerNavVariant, string> = {
  responsive:
    'fixed inset-x-0 bottom-0 z-[110] border-t pb-[env(safe-area-inset-bottom)] lg:inset-x-auto lg:left-0 lg:top-[var(--app-header-h,44px)] lg:w-[88px] lg:border-t-0 lg:border-r lg:pb-0',
  bottom: 'relative border-t',
  rail: 'relative w-[88px] border-r',
};

const LIST: Record<PlayerNavVariant, string> = {
  responsive: 'grid grid-cols-4 lg:flex lg:flex-col lg:gap-1 lg:px-2 lg:pt-4',
  bottom: 'grid grid-cols-4',
  rail: 'flex flex-col gap-1 px-2 pt-4 pb-4',
};

export default function PlayerNav({
  variant = 'responsive',
  pathname: pathnameOverride,
}: {
  variant?: PlayerNavVariant;
  /** Aperçu (/dev/player-kit) : page « courante » simulée. */
  pathname?: string;
}): ReactNode {
  const t = useT(nsPlayerTopBar);
  const router = useRouter();
  const pathname = pathnameOverride ?? router.pathname;
  const { managedTeams, activeTeamId } = useActiveTeam();
  const activeTeam =
    managedTeams.find((team) => team.id === activeTeamId) ??
    (managedTeams.length === 1 ? managedTeams[0] : null);
  const showRailExtras = variant !== 'bottom';

  return (
    <nav
      aria-label={t.shell.navAria}
      data-player-nav={variant === 'responsive' ? '' : undefined}
      className={`${FRAME[variant]} border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)]/95 backdrop-blur-xl print:hidden`}
    >
      <ul className={LIST[variant]}>
        {PLAYER_NAV_ITEMS.map((item) => {
          const active = isPlayerNavItemActive(pathname, item);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                data-testid={`player-nav-${item.key}`}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[var(--r-ctrl,4px)] px-1 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors ${
                  active
                    ? 'text-[var(--t1,#f4edf7)] shadow-[inset_0_2px_0_var(--or,#b467d1)]'
                    : 'text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
                }`}
              >
                <NavIcon name={item.key} />
                <span>{t.shell[item.key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {showRailExtras && activeTeam && (
        <p
          className={`${variant === 'responsive' ? 'hidden lg:block' : 'block'} mt-4 break-words px-2 text-center text-[10px] leading-tight text-[var(--t4,#807984)]`}
        >
          {format(t.shell.activeTeam, {
            name: activeTeam.short_name || activeTeam.name,
          })}
        </p>
      )}
    </nav>
  );
}
