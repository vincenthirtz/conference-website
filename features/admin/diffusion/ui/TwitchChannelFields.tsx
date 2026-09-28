// features/admin/diffusion/ui/TwitchChannelFields.tsx — les champs d'une
// chaîne Twitch, communs à la création (modale) et à l'édition (page).
// Présentationnel : il reçoit le formulaire, il ne charge ni n'envoie rien.

import FormField, { inputClass } from '@/components/admin/form/FormField';
import type { AdminFormHandle } from '@/hooks/admin/useAdminForm';
import type { TwitchChannelFormValues } from '../schemas';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTwitchChannelsNew from '@/lib/i18n/locales/admin-fr/adminTwitchChannelsNew';

export default function TwitchChannelFields({
  form,
}: {
  form: AdminFormHandle<keyof TwitchChannelFormValues & string>;
}) {
  const t = useAdminT(nsAdminTwitchChannelsNew);
  const active = form.checkbox('isActive');

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        <FormField
          form={form}
          name="channel"
          label={t.channelLabel}
          hint={t.channelHint}
          required
        >
          {(p) => (
            <input
              type="text"
              placeholder="ex: crocheh"
              className={inputClass}
              {...p}
            />
          )}
        </FormField>
        <FormField form={form} name="label" label={t.labelLabel} required>
          {(p) => (
            <input
              type="text"
              placeholder="ex: Crocheh"
              className={inputClass}
              {...p}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <FormField form={form} name="badge" label={t.badgeLabel}>
          {(p) => (
            <input
              type="text"
              placeholder={t.badgePlaceholder}
              className={inputClass}
              {...p}
            />
          )}
        </FormField>
        <FormField form={form} name="sortOrder" label={t.sortOrderLabel}>
          {(p) => (
            <input
              type="number"
              min="0"
              placeholder={t.sortOrderPlaceholder}
              className={inputClass}
              {...p}
            />
          )}
        </FormField>
      </div>

      <FormField
        form={form}
        name="backgroundUrl"
        label={t.avatarLabel}
        hint={t.avatarHint}
      >
        {(p) => (
          <input
            type="url"
            placeholder="https://static-cdn.jtvnw.net/..."
            className={`${inputClass} font-mono`}
            {...p}
          />
        )}
      </FormField>

      <FormField form={form} name="description" label={t.descriptionLabel}>
        {(p) => (
          <textarea
            rows={3}
            placeholder={t.descriptionPlaceholder}
            className={`${inputClass} resize-y`}
            {...p}
          />
        )}
      </FormField>

      <div className="flex items-center gap-3">
        <label
          htmlFor={active.id}
          className="relative inline-flex items-center cursor-pointer"
        >
          <input type="checkbox" className="sr-only peer" {...active} />
          <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
          <span className="sr-only">{t.activeLabel}</span>
        </label>
        <span aria-hidden="true" className="text-sm text-neutral-300">
          {t.activeLabel}
        </span>
      </div>
    </>
  );
}
