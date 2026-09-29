// pages/admin/pilotage.tsx — pilotage du jour du tournoi en cours (planche
// « Admin », Le Ruban). La page ne fait que câbler le module
// `features/admin/pilotage` : données rafraîchies toutes les 30 s.

import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminPilotage from '@/lib/i18n/locales/admin-fr/adminPilotage';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { usePilotage } from '@/features/admin/pilotage/hooks/usePilotage';
import PilotageView from '@/features/admin/pilotage/ui/PilotageView';
import { FormError } from '@/components/admin/form/FormField';
import LoadingSpinner from '@/components/admin/LoadingSpinner';

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function AdminPilotagePage() {
  const t = useAdminT(nsAdminPilotage);
  const pilotage = usePilotage();
  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        {pilotage.isError ? (
          <FormError message={adminErrorMessage(pilotage.error, t.loadError)} />
        ) : pilotage.data ? (
          <PilotageView data={pilotage.data} />
        ) : (
          <LoadingSpinner />
        )}
      </div>
    </>
  );
}

export default withAdminQuery(AdminPilotagePage);
