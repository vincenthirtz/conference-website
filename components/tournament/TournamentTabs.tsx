// components/tournament/TournamentTabs.tsx
// Barre d'onglets partagée par toutes les sous-pages publiques d'un tournoi.
// Rendue en tête de chaque page pour offrir une navigation cohérente (Hub,
// Équipes, Matchs, Maps, Stats, MVP, + Podium/FFA conditionnels). Chaque onglet
// est un <Link> Next stylisé (HTML valide + navigation client), avec état actif
// et focus clavier visible. Aucun fetch : présentation pure.

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';

export type TournamentTabKey =
  | 'hub'
  | 'teams'
  | 'matches'
  | 'bracket'
  | 'maps'
  | 'stats'
  | 'mvp'
  | 'podium'
  | 'ffa';

export default function TournamentTabs({
  tournamentPath,
  active,
  showBracket = true,
  showPodium = true,
  showFfa = false,
  className = '',
}: {
  /** Base path du tournoi, ex. `/tournament/${slug || id}`. */
  tournamentPath: string;
  active: TournamentTabKey;
  /** Afficher l'onglet Bracket (par défaut oui ; la page gère l'état vide). */
  showBracket?: boolean;
  /** Afficher l'onglet Podium (par défaut oui). */
  showPodium?: boolean;
  /** Afficher l'onglet FFA (uniquement si le tournoi a une phase FFA). */
  showFfa?: boolean;
  className?: string;
}) {
  const t = useT('tournamentTabs');

  const tabs: { key: TournamentTabKey; label: string; href: string }[] = [
    { key: 'hub', label: t.hub, href: tournamentPath },
    { key: 'teams', label: t.teams, href: `${tournamentPath}/teams` },
    { key: 'matches', label: t.matches, href: `${tournamentPath}/matches` },
    ...(showBracket
      ? [
          {
            key: 'bracket' as TournamentTabKey,
            label: t.bracket,
            href: `${tournamentPath}/bracket`,
          },
        ]
      : []),
    { key: 'maps', label: t.maps, href: `${tournamentPath}/maps` },
    { key: 'stats', label: t.stats, href: `${tournamentPath}/stats` },
    { key: 'mvp', label: t.mvp, href: `${tournamentPath}/mvp` },
    ...(showPodium
      ? [
          {
            key: 'podium' as TournamentTabKey,
            label: t.podium,
            href: `${tournamentPath}/podium`,
          },
        ]
      : []),
    ...(showFfa
      ? [
          {
            key: 'ffa' as TournamentTabKey,
            label: t.ffa,
            href: `${tournamentPath}/ffa`,
          },
        ]
      : []),
  ];

  return (
    <nav
      aria-label={t.navLabel}
      className={`mb-6 overflow-x-auto ${className}`}
    >
      <ul className="inline-flex min-w-full gap-1 border-b border-white/10 pb-px">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <li key={tab.key} className="flex-shrink-0">
              <Link
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-block whitespace-nowrap rounded-t-lg px-3 py-2 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] focus-visible:ring-offset-1 focus-visible:ring-offset-black ${
                  isActive
                    ? 'border-b-2 border-[var(--color-violet)] text-white'
                    : 'border-b-2 border-transparent text-gray-400 hover:text-white hover:border-white/30'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
