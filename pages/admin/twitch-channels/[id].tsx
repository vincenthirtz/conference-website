// pages/admin/twitch-channels/[id].tsx — édition d'une chaîne Twitch.
//
// Pilote de L11 (docs/PLAN-industrialisation-admin.md) : chargement par hook
// de requête, formulaire sur schéma (`useAdminForm`), champs partagés avec la
// modale de création, garde « modifications non enregistrées ».

import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';
import { FormError } from '@/components/admin/form/FormField';
import { useToast } from '@/components/Toast';
import { useAdminForm } from '@/hooks/admin/useAdminForm';
import { useUnsavedChangesGuard } from '@/hooks/admin/useUnsavedChangesGuard';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTwitchChannelEdit from '@/lib/i18n/locales/admin-fr/adminTwitchChannelEdit';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import {
  useTwitchChannel,
  useUpdateTwitchChannel,
} from '@/features/admin/diffusion/hooks/useTwitchChannel';
import {
  TwitchChannelForm,
  twitchChannelToForm,
  type TwitchChannelRow,
} from '@/features/admin/diffusion/schemas';
import TwitchChannelFields from '@/features/admin/diffusion/ui/TwitchChannelFields';

function EditForm({ channel }: { channel: TwitchChannelRow }) {
  const t = useAdminT(nsAdminTwitchChannelEdit);
  const router = useRouter();
  const { addToast } = useToast();
  const update = useUpdateTwitchChannel(channel.id);
  const form = useAdminForm({
    schema: TwitchChannelForm,
    initialValues: twitchChannelToForm(channel),
    errorFallback: t.errorGeneric,
    onSubmit: async (body) => {
      await update.mutateAsync(body);
      addToast(t.updateSuccess, 'success');
    },
  });
  useUnsavedChangesGuard(form.isDirty);

  const { backgroundUrl, label, channel: handle } = form.values;

  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-6 max-w-2xl">
        <FormError message={form.formError} />

        {backgroundUrl && (
          <div className="flex items-center gap-4 p-4 bg-neutral-900/50 rounded-xl border border-neutral-700">
            <Image
              src={backgroundUrl}
              alt={label}
              width={64}
              height={64}
              className="w-16 h-16 rounded-xl object-cover"
            />
            <div>
              <div className="font-semibold text-white">
                {label || t.previewLabelFallback}
              </div>
              <div className="text-sm text-neutral-400">
                twitch.tv/{handle || 'channel'}
              </div>
            </div>
          </div>
        )}

        <TwitchChannelFields form={form} />

        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-700">
          <button
            type="button"
            onClick={() => router.push('/admin/twitch-channels')}
            className="px-5 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={form.isSubmitting || !form.isDirty}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {form.isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.saving}
              </>
            ) : (
              t.submit
            )}
          </button>
        </div>
      </section>
    </form>
  );
}

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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-header pb-12">
          <AdminBreadcrumbs />
          <DiffusionTabsNav active="twitch" />
          <div className="mb-8">
            <Link
              href="/admin/twitch-channels"
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              {t.back}
            </Link>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              {query.data?.label ?? t.loading}
            </p>
          </div>

          {query.isError ? (
            <FormError message={adminErrorMessage(query.error, t.errorLoad)} />
          ) : query.data ? (
            // `key` : une autre chaîne = un autre formulaire, valeurs fraîches.
            <EditForm key={query.data.id} channel={query.data} />
          ) : (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_broadcast',
});

export default withAdminQuery(AdminTwitchChannelEditPage);
