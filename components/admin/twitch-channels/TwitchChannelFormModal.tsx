// components/admin/twitch-channels/TwitchChannelFormModal.tsx
//
// Création d'une chaîne Twitch dans une modale, ouverte depuis la liste
// (`/admin/twitch-channels`). Formulaire sur schéma (lot L11) : mêmes règles
// que la route, erreurs placées sous leur champ — y compris « cette chaîne
// existe déjà », renvoyée par le serveur.

import { useEffect } from 'react';
import Modal from '@/components/admin/Modal';
import { FormError } from '@/components/admin/form/FormField';
import { useAdminForm } from '@/hooks/admin/useAdminForm';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTwitchChannelsNew from '@/lib/i18n/locales/admin-fr/adminTwitchChannelsNew';
import { twitchChannelsClient } from '@/features/admin/diffusion/client';
import {
  EMPTY_TWITCH_CHANNEL_FORM,
  TwitchChannelForm,
} from '@/features/admin/diffusion/schemas';
import TwitchChannelFields from '@/features/admin/diffusion/ui/TwitchChannelFields';

type TwitchChannelFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a channel is successfully created. */
  onCreated: () => void;
};

export default function TwitchChannelFormModal({
  open,
  onClose,
  onCreated,
}: TwitchChannelFormModalProps) {
  const t = useAdminT(nsAdminTwitchChannelsNew);
  const form = useAdminForm({
    schema: TwitchChannelForm,
    initialValues: EMPTY_TWITCH_CHANNEL_FORM,
    errorFallback: t.errorGeneric,
    onSubmit: async (body) => {
      await twitchChannelsClient.create(body);
      onCreated();
      onClose();
    },
  });

  // Repart d'un formulaire vierge à chaque ouverture.
  const { reset } = form;
  // biome-ignore lint/correctness/useExhaustiveDependencies: réinitialiser à l'OUVERTURE seulement ; `reset` change d'identité à chaque saisie
  useEffect(() => {
    if (open) reset(EMPTY_TWITCH_CHANNEL_FORM);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title={t.heading}
      subtitle={t.subtitle}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            form={form.formId}
            disabled={form.isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {form.isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.creating}
              </>
            ) : (
              t.submit
            )}
          </button>
        </>
      }
    >
      <form
        id={form.formId}
        onSubmit={form.handleSubmit}
        noValidate
        className="space-y-6"
      >
        <FormError message={form.formError} />
        <TwitchChannelFields form={form} />
      </form>
    </Modal>
  );
}
