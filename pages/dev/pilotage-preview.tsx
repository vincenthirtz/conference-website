// pages/dev/pilotage-preview.tsx — aperçu de développement du pilotage du
// jour : la VRAIE vue (PilotageView) nourrie par la VRAIE file d'attente
// (buildPilotage) sur des données d'exemple. 404 en production.

import type { GetServerSideProps } from 'next';
import { ToastProvider } from '@/components/Toast';
import AdminShell from '@/features/admin/_shared/shell/AdminShell';
import { ADMIN_LINKS, filterAdminLinks } from '@/components/Navbar/adminLinks';
import PilotageView from '@/features/admin/pilotage/ui/PilotageView';
import { buildPilotage } from '@/features/admin/pilotage/build';
import type { DashboardData } from '@/utils/dashboard/buildTournamentDashboard';

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} };

const NOW = new Date('2026-09-25T19:40:00+02:00');
const at = (min: number) =>
  new Date(NOW.getTime() + min * 60_000).toISOString();
const match = (
  id: string,
  round: string,
  t1: string,
  t2: string,
  min: number
) => ({
  id,
  stage_id: null,
  stage_name: null,
  round_number: null,
  round_name: round,
  scheduled_at: at(min),
  team1_name: t1,
  team2_name: t2,
  stream_url: null,
});

const SAMPLE = {
  tournament: {
    id: 'demo',
    name: 'OW Women’s Cup 2026',
    start_date: null,
    end_date: null,
  },
  summary: {
    totalMatches: 28,
    finishedMatches: 4,
    pendingMatches: 22,
    ongoingMatches: 1,
  },
  upcomingMatches: [
    match('m2', 'J2-M2', 'Eclypse', 'Noname', -24),
    match('m3', 'J2-M3', 'Team Positivité', 'LVN Embers', 50),
    match('m4', 'J2-M4', 'Shujaa Angel’s', 'Chocomates', 50),
    match('m5', 'J3-M1', 'Hinode Sparkles', 'Eclypse', 60 * 48),
  ],
  signals: {
    disputesOpen: {
      count: 1,
      matches: [
        {
          id: 'm0',
          team1Name: 'Chocomates',
          team2Name: 'Hinode Sparkles',
          reason: 'Scores contradictoires · preuve reçue',
          openedAt: at(-12),
        },
      ],
    },
    liveMatches: [
      {
        id: 'm1',
        team1Name: 'Hinode Sparkles',
        team2Name: 'Eclypse',
        team1Score: 1,
        team2Score: 0,
        streamUrl: null,
        scheduledAt: at(-40),
        roundName: 'J2-M1',
        stageName: null,
        matchFormat: null,
        currentMap: { name: 'Ilios', type: null, index: 1 },
      },
    ],
    checkinNext24h: {
      upcoming: 8,
      bothCheckedIn: 6,
      oneSide: 1,
      missing: 1,
      forfeited: 0,
    },
    recentActivity: [
      ['Vincent', 'a validé la composition de Sparkles', -6],
      ['Système', 'a ouvert le check-in de J2-M2', -18],
      ['Alicia', 'a converti le signalement #218 en blacklist', -22],
      ['Vincent', 'a assigné Crocheh au cast de J2-M1', -49],
    ].map(([staffName, readableAction, min], i) => ({
      id: `a${i}`,
      staffName,
      action: 'x',
      readableAction,
      entityType: null,
      entityId: null,
      createdAt: at(min as number),
    })),
  },
  generatedAt: NOW.toISOString(),
} as unknown as DashboardData;

export default function PilotagePreviewPage() {
  const data = buildPilotage(SAMPLE, NOW);
  return (
    <ToastProvider>
      <div
        data-surface="admin"
        style={{ ['--app-header-h' as string]: '60px' }}
      >
        <AdminShell
          staffName="Vincent"
          staffRole="owner"
          links={filterAdminLinks('owner', ADMIN_LINKS)}
          height={60}
          onLogout={() => {}}
        />
        <main id="main-content">
          <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
            <PilotageView data={data} />
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
