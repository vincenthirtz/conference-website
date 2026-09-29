// pages/dev/fiche-preview.tsx — aperçu de développement de l'archétype Fiche
// (chaîne Twitch) : la VRAIE fiche sur une chaîne d'exemple. 404 en production.

import type { GetServerSideProps } from 'next';
import { ToastProvider } from '@/components/Toast';
import AdminShell from '@/features/admin/_shared/shell/AdminShell';
import { ADMIN_LINKS, filterAdminLinks } from '@/components/Navbar/adminLinks';
import { withAdminQuery } from '@/features/admin/_shared/query';
import TwitchChannelFiche from '@/features/admin/diffusion/TwitchChannelFiche';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} };

const CHANNEL = {
  id: '4f2a1c9e-0000-4000-8000-000000009c17',
  tenant_id: 'demo',
  channel: 'crocheh',
  label: 'Crocheh',
  badge: 'Cast',
  description: 'Cast officiel de la Cup, en français.',
  background_url: null,
  is_active: true,
  sort_order: 2,
  created_at: '2026-08-30T10:00:00Z',
  updated_at: '2026-09-28T18:12:00Z',
};

function FichePreview() {
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
            <DiffusionTabsNav active="twitch" />
            <TwitchChannelFiche channel={CHANNEL} />
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}

export default withAdminQuery(FichePreview);
