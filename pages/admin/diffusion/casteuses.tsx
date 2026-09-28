// pages/admin/diffusion/casteuses.tsx
//
// Diffusion › Casteuses — le pôle production (casteuses, commentatrices,
// régie humaine) dans l'espace de la diffusion.
//
// POURQUOI ICI. La liste vivait dans le hub Association, à côté des pôles et
// des adhérents : un voisinage d'annuaire. Mais on l'ouvre pour préparer un
// direct — savoir qui caste, rattacher une fiche à un compte staff pour qu'il
// accède au cockpit — c'est-à-dire depuis les écrans de la diffusion. Le
// panneau est le même (`CastMembersListPanel`), déplacé, pas recopié.
//
// Même droit qu'avant (`manage_communications`) : on déplace un écran, on ne
// l'ouvre pas à plus de monde. Les anciennes adresses
// (`/admin/association?tab=cast`, `/admin/cast-members`) redirigent ici.

import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import type { StaffProps } from '@/types/admin';
import { useAdminT } from '@/lib/i18n/useAdminT';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import CastMembersListPanel from '@/components/admin/association/CastMembersListPanel';
import nsAdminDiffusionNav from '@/lib/i18n/locales/admin-fr/adminDiffusionNav';

export const getServerSideProps = withStaffPage({
  permission: 'manage_communications',
});

export default function DiffusionCasteusesPage(_props: StaffProps) {
  const t = useAdminT(nsAdminDiffusionNav);
  return (
    <>
      <Head>
        <title>{t.castersPageTitle}</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-header pb-12">
          <DiffusionTabsNav active="casters" />
          {/* Titre de PAGE pour les lecteurs d'écran : le panneau, conçu pour
              un onglet du hub Association, ne porte qu'un h2. */}
          <h1 className="sr-only">{t.tabCasters}</h1>
          <CastMembersListPanel />
        </div>
      </div>
    </>
  );
}
