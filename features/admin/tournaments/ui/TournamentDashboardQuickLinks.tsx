// features/admin/tournaments/ui/TournamentDashboardQuickLinks.tsx — l'accès
// rapide du hub tournoi : uniquement les destinations SANS onglet dédié dans
// TournamentTabsNav (sinon on doublerait la nav). Le filtrage par rôle reste
// dans la page ; ce composant n'affiche que ce qu'on lui donne.

import Link from 'next/link';
import TournamentDashboardCard from './TournamentDashboardCard';
import type { TournamentDashboardDict } from './TournamentDashboardHeader';

export type QuickLink = {
  label: string;
  href: (id: string) => string;
  icon: string;
  description: string;
  /** Rôle minimum requis par la page cible (défaut : admin, comme le dashboard). */
  role?: 'admin';
};

export function getQuickLinks(tx: TournamentDashboardDict): QuickLink[] {
  return [
    {
      label: tx.quickBracketBuilderLabel,
      icon: '🛠️',
      href: (id) => `/admin/tournament/${id}/bracket?tab=builder`,
      description: tx.quickBracketBuilderDesc,
    },
    {
      label: tx.quickMapDrawLabel,
      icon: '🎲',
      href: (id) => `/admin/tournament/${id}/bracket?tab=map-draw`,
      description: tx.quickMapDrawDesc,
    },
    {
      label: tx.quickVetoLabel,
      icon: '🚫',
      href: (id) => `/admin/tournament/${id}/bracket?tab=veto`,
      description: tx.quickVetoDesc,
    },
    {
      label: tx.quickBulkOpsLabel,
      icon: '⚡',
      href: (id) => `/admin/tournament/${id}/bulk-ops`,
      description: tx.quickBulkOpsDesc,
    },
    {
      label: tx.quickAnalyticsLabel,
      icon: '📈',
      href: (id) => `/admin/tournament/${id}/stats?tab=analytics`,
      description: tx.quickAnalyticsDesc,
    },
    {
      label: tx.quickSupportLabel,
      icon: '🛂',
      href: () => `/admin/moderation?tab=support`,
      description: tx.quickSupportDesc,
    },
    {
      label: tx.quickTemplatesLabel,
      icon: '🧬',
      href: () => `/admin/tournament-templates`,
      description: tx.quickTemplatesDesc,
      role: 'admin',
    },
    {
      label: tx.quickSimulatorLabel,
      icon: '🧪',
      href: () => `/admin/tournament-simulator`,
      description: tx.quickSimulatorDesc,
      role: 'admin',
    },
  ];
}

export default function TournamentDashboardQuickLinks({
  tx,
  links,
  tournamentId,
}: {
  tx: TournamentDashboardDict;
  links: QuickLink[];
  tournamentId: string;
}) {
  return (
    <TournamentDashboardCard title={tx.quickAccessTitle}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href(tournamentId)}
            className="group rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-3 transition-colors hover:border-[var(--or,#b467d1)]"
          >
            <div className="flex items-start gap-2">
              <span className="text-lg" aria-hidden>
                {link.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--t1,#f4edf7)] group-hover:text-[var(--or-200,#eec4ff)]">
                  {link.label}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--t3,#a39ba6)]">
                  {link.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </TournamentDashboardCard>
  );
}
