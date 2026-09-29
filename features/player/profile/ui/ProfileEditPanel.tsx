// features/player/profile/ui/ProfileEditPanel.tsx — « Modifier mon profil »
// (lot P9) : nom affiché, BattleTag, poste, SR, chaîne Twitch, avatar.
//
// FORMULAIRE SUR SCHÉMA : les valeurs vivent dans `useSchemaForm`, le schéma
// `.pipe()` celui de la route (mêmes règles, mêmes messages). Le corps envoyé
// est celui d'avant la migration (`buildProfilePatch`) : Twitch n'est envoyé
// que s'il a CHANGÉ, pour ne jamais transformer en silence la saisie de la
// capitaine en déclaration de la joueuse.

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerProfile from '@/lib/i18n/locales/fr/playerProfile';
import nsOverwatchRank from '@/lib/i18n/locales/fr/overwatchRank';
import nsSpecialty from '@/lib/i18n/locales/fr/specialty';
import { TWITCH_HANDLE_MAX } from '@/utils/social/profileHandles';
import { ApiHttpError } from '@/utils/http/authedRequest';
import { useSchemaForm, fieldDomId } from '@/hooks/forms/useSchemaForm';
import { Button, FicheSection } from '@/features/ruban';
import FormField, { FormError, inputClass } from '@/features/ruban/FormField';
import {
  ProfileEditForm,
  buildProfilePatch,
  type ProfileEditValues,
} from '../schemas';
import { useTwitchSource, useUpdateProfile } from '../hooks/useProfile';

type Notice = { tone: 'ok' | 'warn'; text: string } | null;

export default function ProfileEditPanel({
  userId,
  displayName,
  meta,
  needsBattleTagSetup,
}: {
  userId: string;
  displayName: string;
  meta: Record<string, unknown>;
  /** Arrivée depuis la liaison Discord sans BattleTag (`?setup=battletag`). */
  needsBattleTagSetup: boolean;
}) {
  const t = useT(nsPlayerProfile);
  const tRank = useT(nsOverwatchRank);
  const tSpec = useT(nsSpecialty);
  const twitchSource = useTwitchSource(userId);
  const update = useUpdateProfile(userId);
  const [notices, setNotices] = useState<Notice[]>([]);

  // Valeur provisoire tant que la lecture serveur n'a pas répondu.
  const declaredTwitch = typeof meta.twitch === 'string' ? meta.twitch : '';
  const twitchInitial = twitchSource.data
    ? (twitchSource.data.twitch ?? '')
    : declaredTwitch;
  const twitchOrigin = twitchSource.data
    ? twitchSource.data.twitchOrigin
    : declaredTwitch.trim()
      ? 'self'
      : null;
  const fromRoster = twitchOrigin === 'roster' && twitchInitial.trim() !== '';

  /** Message d'une erreur d'enregistrement (texte serveur, hôte d'avatar traduit). */
  const describe = (err: unknown, fallback: string) =>
    err instanceof ApiHttpError && err.code === 'AVATAR_HOST_UNSUPPORTED'
      ? t.avatarHostUnsupported
      : (err as Error)?.message || fallback;

  const afterSave = (rosterSynced: boolean | undefined, text: string) =>
    setNotices([
      { tone: 'ok', text },
      rosterSynced === false
        ? { tone: 'warn', text: t.rosterSyncWarning }
        : null,
    ]);

  const form = useSchemaForm({
    schema: ProfileEditForm,
    initialValues: {
      display_name: displayName,
      battle_tag: typeof meta.battle_tag === 'string' ? meta.battle_tag : '',
      specialty: typeof meta.specialty === 'string' ? meta.specialty : '',
      skill_rating: meta.skill_rating != null ? String(meta.skill_rating) : '',
      twitch: declaredTwitch,
      avatar_url: typeof meta.avatar_url === 'string' ? meta.avatar_url : '',
    } satisfies ProfileEditValues,
    errorFallback: t.genericError,
    describeError: describe,
    onSubmit: async (payload) => {
      setNotices([]);
      const res = await update.mutateAsync(
        buildProfilePatch(payload, twitchInitial)
      );
      afterSave(res?.rosterSynced, t.profileUpdated);
    },
  });
  const { setValue } = form;

  // La valeur PUBLIÉE remplace la valeur provisoire dès qu'elle est lue.
  const served = twitchSource.data?.twitch;
  useEffect(() => {
    if (served !== undefined) setValue('twitch', served ?? '');
  }, [served, setValue]);

  // Arrivée par `?setup=battletag` : le champ en avant, focus posé.
  const battleTagId = fieldDomId(form.formId, 'battle_tag');
  useEffect(() => {
    if (!needsBattleTagSetup) return;
    const field = document.getElementById(battleTagId);
    field?.scrollIntoView({ block: 'center' });
    field?.focus();
  }, [needsBattleTagSetup, battleTagId]);

  // Retire le lien Twitch PUBLIÉ, y compris celui saisi par la capitaine.
  const [removeError, setRemoveError] = useState<string | null>(null);
  const removeTwitch = async () => {
    setNotices([]);
    setRemoveError(null);
    try {
      const res = await update.mutateAsync({ clear_twitch: true });
      setValue('twitch', '');
      afterSave(res?.rosterSynced, t.twitchRemoved);
    } catch (err) {
      setRemoveError(describe(err, t.genericError));
    }
  };

  const saving = form.isSubmitting;
  const removing = update.isPending && !saving;

  return (
    <FicheSection title={t.editProfile}>
      <div className="mb-4 flex flex-col gap-2">
        {notices.map((n) =>
          n ? (
            <p
              key={n.text}
              role="status"
              aria-live="polite"
              className={
                n.tone === 'ok'
                  ? 'text-[13px] text-[var(--ok,#30d07e)]'
                  : 'text-[13px] text-[var(--warn,#f5a524)]'
              }
            >
              {n.text}
            </p>
          ) : null
        )}
        <FormError message={form.formError ?? removeError} />
        {needsBattleTagSetup && (
          <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--warn,#f5a524)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
              {t.setupBattleTagTitle}
            </p>
            <p className="mt-1 text-[12.5px] text-[var(--t3,#a39ba6)]">
              {t.setupBattleTagBody}
            </p>
          </div>
        )}
      </div>

      <form onSubmit={form.handleSubmit} noValidate className="space-y-4">
        <FormField form={form} name="display_name" label={t.displayNameLabel}>
          {(p) => (
            <input
              {...p}
              type="text"
              maxLength={50}
              placeholder={t.displayNamePlaceholder}
              className={inputClass}
            />
          )}
        </FormField>
        <FormField form={form} name="battle_tag" label={t.battleTag}>
          {(p) => (
            <input
              {...p}
              type="text"
              placeholder={t.battleTagPlaceholder}
              className={`${inputClass} font-mono ${
                needsBattleTagSetup ? 'border-[var(--warn,#f5a524)]' : ''
              }`}
            />
          )}
        </FormField>
        <FormField
          form={form}
          name="specialty"
          label={tSpec.fieldLabel}
          hint={tSpec.fieldHint}
        >
          {(p) => (
            <select {...p} className={inputClass}>
              <option value="">{tSpec.none}</option>
              <option value="tank">{tSpec.tank}</option>
              <option value="dps">{tSpec.dps}</option>
              <option value="support">{tSpec.support}</option>
              <option value="flex">{tSpec.flex}</option>
            </select>
          )}
        </FormField>
        <FormField
          form={form}
          name="skill_rating"
          label={tRank.fieldLabel}
          hint={tRank.fieldHint}
        >
          {(p) => (
            <input
              {...p}
              type="number"
              inputMode="numeric"
              min={0}
              max={5000}
              step={50}
              placeholder={tRank.fieldPlaceholder}
              className={inputClass}
            />
          )}
        </FormField>
        <FormField
          form={form}
          name="twitch"
          label={t.twitchLabel}
          hint={
            <>
              {fromRoster && (
                <span className="mb-1 block text-[var(--warn,#f5a524)]">
                  {t.twitchFromRoster}
                </span>
              )}
              {t.twitchHelp}
            </>
          }
        >
          {(p) => (
            <input
              {...p}
              type="text"
              maxLength={TWITCH_HANDLE_MAX}
              placeholder={t.twitchPlaceholder}
              className={inputClass}
            />
          )}
        </FormField>
        {twitchSource.isError && (
          <p role="alert" className="text-[12.5px] text-[var(--err,#ff6b6b)]">
            {t.twitchSourceError}
          </p>
        )}
        {twitchInitial.trim() ? (
          <Button
            variant="danger"
            size="xs"
            onClick={() => void removeTwitch()}
            disabled={removing || saving}
          >
            {removing ? t.twitchRemoving : t.twitchRemove}
          </Button>
        ) : null}
        <FormField
          form={form}
          name="avatar_url"
          label={t.avatarLabel}
          hint={t.avatarHelp}
        >
          {(p) => (
            <input
              {...p}
              type="url"
              placeholder={t.avatarPlaceholder}
              className={inputClass}
            />
          )}
        </FormField>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? t.saving : t.save}
        </Button>
      </form>
    </FicheSection>
  );
}
