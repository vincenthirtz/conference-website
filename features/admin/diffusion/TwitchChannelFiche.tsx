// features/admin/diffusion/TwitchChannelFiche.tsx — la fiche d'une chaîne
// Twitch sur l'archétype Fiche « Le Ruban » (planche « AdminFiches ») :
// en-tête d'entité, formulaire à gauche, métadonnées et historique à droite,
// zone sensible en bas. Reçoit la chaîne chargée ; écrit par ses hooks.

import Image from 'next/image';
import { useRouter } from 'next/router';
import { FormError } from '@/components/admin/form/FormField';
import { useToast } from '@/components/Toast';
import { useAdminForm } from '@/hooks/admin/useAdminForm';
import { useUnsavedChangesGuard } from '@/hooks/admin/useUnsavedChangesGuard';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTwitchChannelEdit from '@/lib/i18n/locales/admin-fr/adminTwitchChannelEdit';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import EntityHeader from '../_shared/ui/EntityHeader';
import AdminButton from '../_shared/ui/AdminButton';
import Chip from '../_shared/ui/Chip';
import { FicheLayout, FicheSection, MetaList } from '../_shared/ui/Fiche';
import DangerZone from '../_shared/ui/DangerZone';
import EntityHistoryCard from '../_shared/history/EntityHistoryCard';
import {
  useDeleteTwitchChannel,
  useUpdateTwitchChannel,
} from './hooks/useTwitchChannel';
import {
  TwitchChannelForm,
  twitchChannelToForm,
  type TwitchChannelRow,
} from './schemas';
import TwitchChannelFields from './ui/TwitchChannelFields';

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

export default function TwitchChannelFiche({
  channel,
}: {
  channel: TwitchChannelRow;
}) {
  const t = useAdminT(nsAdminTwitchChannelEdit);
  const tf = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { addToast } = useToast();
  const update = useUpdateTwitchChannel(channel.id);
  const remove = useDeleteTwitchChannel(channel.id);
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
    <>
      <EntityHeader
        crest={(handle || channel.channel).slice(0, 3).toUpperCase()}
        title={label || channel.label}
        meta={`twitch.tv/${handle || channel.channel} · ${tf.metaCreated} ${day(channel.created_at)}`}
        status={form.isDirty && <Chip tone="warn">{tf.dirty}</Chip>}
        actions={
          <>
            <AdminButton
              disabled={!form.isDirty || form.isSubmitting}
              onClick={() => form.reset(twitchChannelToForm(channel))}
            >
              {tf.cancel}
            </AdminButton>
            <AdminButton
              variant="primary"
              type="submit"
              form={form.formId}
              disabled={!form.isDirty || form.isSubmitting}
            >
              {form.isSubmitting ? tf.saving : tf.save}
            </AdminButton>
          </>
        }
      />

      <FicheLayout
        main={
          <>
            <FicheSection title={t.identitySection}>
              <form
                id={form.formId}
                onSubmit={form.handleSubmit}
                noValidate
                className="flex flex-col gap-6"
              >
                <FormError message={form.formError} />
                {backgroundUrl && (
                  <div className="flex items-center gap-4 rounded-[var(--r-ctrl)] border border-[var(--line2)] bg-[var(--s2)] p-4">
                    <Image
                      src={backgroundUrl}
                      alt={label}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-[var(--r-ctrl)] object-cover"
                    />
                    <div>
                      <div className="font-semibold text-[var(--t1)]">
                        {label || t.previewLabelFallback}
                      </div>
                      <div className="font-mono text-sm text-[var(--t3)]">
                        twitch.tv/{handle || 'channel'}
                      </div>
                    </div>
                  </div>
                )}
                <TwitchChannelFields form={form} />
              </form>
            </FicheSection>

            <DangerZone
              confirmName={channel.channel}
              labels={{
                title: tf.dangerTitle,
                intro: tf.dangerIntro,
                typeToConfirm: tf.typeToConfirm,
                cancel: tf.cancel,
              }}
              actions={[
                {
                  id: 'delete',
                  title: t.deleteTitle,
                  description: t.deleteDesc,
                  actionLabel: tf.execute,
                  onConfirm: async () => {
                    try {
                      await remove.mutateAsync();
                      addToast(t.deleteDone, 'success');
                      await router.push('/admin/twitch-channels');
                    } catch (err) {
                      addToast(adminErrorMessage(err, t.errorGeneric), 'error');
                    }
                  },
                },
              ]}
            />
          </>
        }
        aside={
          <>
            <FicheSection eyebrow title={tf.metaTitle}>
              <MetaList
                items={[
                  { label: tf.metaId, value: `${channel.id.slice(0, 8)}…` },
                  { label: tf.metaCreated, value: day(channel.created_at) },
                  { label: tf.metaUpdated, value: day(channel.updated_at) },
                  { label: t.metaOrder, value: channel.sort_order ?? '—' },
                  {
                    label: t.metaActive,
                    value: channel.is_active === false ? t.no : t.yes,
                  },
                ]}
              />
            </FicheSection>
            <EntityHistoryCard
              entityType="twitch_channel"
              entityId={channel.id}
            />
          </>
        }
      />
    </>
  );
}
