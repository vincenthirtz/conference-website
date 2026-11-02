// pages/admin/connexion.tsx — « Comptes et connexion » : la page owner de Better Auth
// (features/admin/identity). La page ne fait que câbler ; tout vit dans le module.
//
// OWNER GLOBAL seul (`staff.role`, portée plateforme) : les comptes sont ceux de toute la
// plateforme, et un owner d'espace n'a rien à y voir. L'API pose la même garde.

import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminIdentity from '@/lib/i18n/locales/admin-fr/adminIdentity';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useIdentityOverview } from '@/features/admin/identity/hooks/useIdentity';
import IdentityView from '@/features/admin/identity/ui/IdentityView';
import { FormError } from '@/components/admin/form/FormField';
import LoadingSpinner from '@/components/admin/LoadingSpinner';

export const getServerSideProps = withStaffPage({
  role: 'owner',
  scope: 'platform',
});

function AdminIdentityPage() {
  const t = useAdminT(nsAdminIdentity);
  const overview = useIdentityOverview();
  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        {overview.isError ? (
          <FormError message={adminErrorMessage(overview.error, t.loadError)} />
        ) : overview.data ? (
          <IdentityView overview={overview.data} />
        ) : (
          <LoadingSpinner />
        )}
      </div>
    </>
  );
}

export default withAdminQuery(AdminIdentityPage);
