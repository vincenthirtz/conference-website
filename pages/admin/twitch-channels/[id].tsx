// pages/admin/twitch-channels/[id].tsx — fiche d'une chaîne Twitch
// (archétype Fiche « Le Ruban »). La page charge ; la fiche vit dans le module
// `features/admin/diffusion/TwitchChannelFiche`.

import Head from 'next/head';
import { useRouter } from 'next/router';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import { FormError } from '@/components/admin/form/FormField';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTwitchChannelEdit from '@/lib/i18n/locales/admin-fr/adminTwitchChannelEdit';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useTwitchChannel } from '@/features/admin/diffusion/hooks/useTwitchChannel';
import TwitchChannelFiche from '@/features/admin/diffusion/TwitchChannelFiche';

function AdminTwitchChannelEditPage() {
  const t = useAdminT(nsAdminTwitchChannelEdit);
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const query = useTwitchChannel(id);

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <DiffusionTabsNav active="twitch" />
        {query.isError ? (
          <FormError message={adminErrorMessage(query.error, t.errorLoad)} />
        ) : query.data ? (
          // `key` : une autre chaîne = une autre fiche, valeurs fraîches.
          <TwitchChannelFiche key={query.data.id} channel={query.data} />
        ) : (
          <LoadingSpinner />
        )}
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_broadcast',
});

export default withAdminQuery(AdminTwitchChannelEditPage);
