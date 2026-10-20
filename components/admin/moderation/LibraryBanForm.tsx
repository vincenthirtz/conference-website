// components/admin/moderation/LibraryBanForm.tsx — « Bannir une joueuse » de
// l'onglet « Library » (/admin/moderation?tab=library).
//
// La joueuse se désigne par son identifiant de compte OU par son pseudo de la
// Library : le ticket de signalement d'un avatar porte les deux (« Avatar
// signalé : « pseudo » (compte <uuid>) », cf. conference-api
// features/player/library/service/report.ts). Un bannissement expulse sur-le-
// champ : il passe par une confirmation, comme toute action destructive.
//
// Formulaire sur schéma (`useSchemaForm`) : valeurs, erreurs par champ et
// focus sur le premier champ fautif viennent du socle. Le schéma valide avec
// le contrat (`buildBanBody` → `LibraryBanCreateBody`) et rattache chaque
// refus à SON champ, avec le texte traduit.

import { useId, useMemo, useRef } from 'react';
import * as z from 'zod';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { errorDomId, useSchemaForm } from '@/hooks/forms/useSchemaForm';
import { format } from '@/lib/i18n/useAdminT';
import type nsAdminModerationLibrary from '@/lib/i18n/locales/admin-fr/adminModerationLibrary';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { useBanFromLibrary } from '@/features/admin/library/hooks/useLibraryBans';
import { LIBRARY_BAN_CODES } from '@/features/admin/library/model';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import {
  BAN_DURATION_PRESETS,
  buildBanBody,
  LIBRARY_BAN_REASON_MAX,
  type BanDurationPreset,
  type BanFormValues,
} from './libraryBans';

type Dict = typeof nsAdminModerationLibrary.fr;

const FIELD_CLASS =
  'w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] border bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm';
const BORDER_OK = 'border-[var(--line2,rgba(194,196,201,.2))]';
const BORDER_ERR = 'border-[rgba(255,107,107,.6)]';

const INITIAL_VALUES: BanFormValues = {
  mode: 'userId',
  target: '',
  reason: '',
  preset: '24h',
};

/** Code métier d'un refus de la route (`player_not_found`, …), s'il y en a un. */
function errorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

export function durationLabel(preset: BanDurationPreset, t: Dict): string {
  const labels: Record<BanDurationPreset, string> = {
    '24h': t.libDuration24h,
    '7d': t.libDuration7d,
    '30d': t.libDuration30d,
    permanent: t.libDurationPermanent,
  };
  return labels[preset];
}

/**
 * Les valeurs des CHAMPS, validées par le contrat. La sortie reste ces
 * valeurs : le corps (et son échéance `until`) n'est construit qu'à la
 * confirmation, l'échéance part de cet instant-là, pas de la saisie.
 */
function banFormSchema(t: Dict) {
  return z
    .object({
      mode: z.enum(['userId', 'nickname']),
      target: z.string(),
      reason: z.string(),
      preset: z.enum(BAN_DURATION_PRESETS),
    })
    .superRefine((values, ctx) => {
      const checked = buildBanBody(values, Date.now());
      if (checked.ok) return;
      // `buildBanBody` rend les fautes dans l'ordre du formulaire : le
      // premier champ fautif reçoit le focus.
      for (const e of checked.errors) {
        ctx.addIssue({
          code: 'custom',
          path: [e.field],
          message:
            e.field === 'target'
              ? values.mode === 'userId'
                ? t.libUserIdInvalid
                : t.libNicknameInvalid
              : e.kind === 'required'
                ? t.libReasonRequired
                : format(t.libReasonTooLong, { max: LIBRARY_BAN_REASON_MAX }),
        });
      }
    });
}

export default function LibraryBanForm({ t }: { t: Dict }) {
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const ban = useBanFromLibrary();
  const uid = useId();
  const ids = {
    heading: `${uid}-heading`,
    help: `${uid}-help`,
    targetHelp: `${uid}-target-help`,
    reasonHelp: `${uid}-reason-help`,
    reasonCount: `${uid}-reason-count`,
  };
  const targetRef = useRef<HTMLInputElement>(null);
  const schema = useMemo(() => banFormSchema(t), [t]);

  const form = useSchemaForm({
    schema,
    initialValues: INITIAL_VALUES,
    errorFallback: t.libErrorBan,
    // Joueuse introuvable : le refus de la route se pose sur la cible.
    fieldErrorsOf: (err) =>
      errorCode(err) === LIBRARY_BAN_CODES.playerNotFound
        ? { target: t.libErrorNotFound }
        : null,
    onSubmit: async (values) => {
      if (ban.isPending) return;
      const target = values.target.trim();
      const ok = await confirm({
        title: t.libConfirmBanTitle,
        subtitle: format(t.libConfirmBanSubtitle, {
          target,
          duration: durationLabel(values.preset, t),
        }),
        variant: 'danger',
        confirmLabel: t.libConfirmBanLabel,
      });
      if (!ok) return;

      // L'échéance part de l'instant de la confirmation, pas de la saisie.
      const confirmed = buildBanBody(values, Date.now());
      if (!confirmed.ok) {
        addToast(t.libErrorBan, 'error');
        return;
      }
      try {
        const res = await ban.mutateAsync(confirmed.body);
        addToast(
          format(t.libBanned, { name: res.ban.nickname ?? target }),
          'success'
        );
        // Formulaire vidé, mode de désignation conservé.
        form.reset({ ...INITIAL_VALUES, mode: values.mode });
        targetRef.current?.focus();
      } catch (err) {
        const code = errorCode(err);
        // Relancée : `fieldErrorsOf` la rattache au champ et y met le focus.
        if (code === LIBRARY_BAN_CODES.playerNotFound) throw err;
        addToast(
          code === LIBRARY_BAN_CODES.untilInPast
            ? t.libErrorUntilPast
            : adminErrorMessage(err, t.libErrorBan),
          'error'
        );
      }
    },
  });

  const { values, errors } = form;
  const targetError = errors.target;
  const reasonError = errors.reason;
  const targetField = form.field('target');
  const reasonField = form.field('reason');
  const targetDescribedBy = [
    ids.targetHelp,
    targetError ? errorDomId(form.formId, 'target') : null,
  ]
    .filter(Boolean)
    .join(' ');
  const reasonDescribedBy = [
    ids.reasonHelp,
    ids.reasonCount,
    reasonError ? errorDomId(form.formId, 'reason') : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      aria-labelledby={ids.heading}
      className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-5 mb-6"
    >
      {dialog}
      <h3
        id={ids.heading}
        className="text-sm font-semibold text-neutral-200 mb-2"
      >
        {t.libFormHeading}
      </h3>
      <p id={ids.help} className="text-xs text-neutral-400 mb-4">
        {t.libFormHelp}
      </p>

      <form
        aria-labelledby={ids.heading}
        aria-describedby={ids.help}
        noValidate
        onSubmit={(e) => void form.handleSubmit(e)}
        className="space-y-4"
      >
        <fieldset>
          <legend className="block text-xs text-neutral-400 uppercase tracking-wide mb-2">
            {t.libTargetLegend}
          </legend>
          <div className="flex flex-wrap gap-4 text-sm text-neutral-200">
            {(['userId', 'nickname'] as const).map((value) => (
              <label key={value} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name={`${uid}-mode`}
                  value={value}
                  checked={values.mode === value}
                  onChange={() => {
                    form.setValue('mode', value);
                    // Le message d'erreur de la cible dépend du mode : re-poser
                    // la cible l'efface.
                    if (targetError) form.setValue('target', values.target);
                  }}
                />
                {value === 'userId'
                  ? t.libTargetByUserId
                  : t.libTargetByNickname}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor={targetField.id}
            className="block text-xs text-neutral-400 uppercase tracking-wide mb-1"
          >
            {values.mode === 'userId'
              ? t.libTargetByUserId
              : t.libTargetByNickname}
          </label>
          <input
            {...targetField}
            ref={targetRef}
            type="text"
            required
            autoComplete="off"
            spellCheck={false}
            maxLength={values.mode === 'userId' ? 64 : 40}
            aria-describedby={targetDescribedBy}
            className={`${FIELD_CLASS} ${values.mode === 'userId' ? 'font-mono' : ''} ${targetError ? BORDER_ERR : BORDER_OK}`}
          />
          <p id={ids.targetHelp} className="text-xs text-neutral-500 mt-1">
            {values.mode === 'userId' ? t.libUserIdHelp : t.libNicknameHelp}
          </p>
          {targetError && (
            <p
              id={errorDomId(form.formId, 'target')}
              className="text-xs text-[#ffc2c2] mt-1"
            >
              {targetError}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={reasonField.id}
            className="block text-xs text-neutral-400 uppercase tracking-wide mb-1"
          >
            {t.libReasonLabel}
          </label>
          <textarea
            {...reasonField}
            rows={3}
            required
            maxLength={LIBRARY_BAN_REASON_MAX}
            aria-describedby={reasonDescribedBy}
            className={`${FIELD_CLASS} ${reasonError ? BORDER_ERR : BORDER_OK}`}
          />
          <div className="flex flex-wrap justify-between gap-2 mt-1">
            <p id={ids.reasonHelp} className="text-xs text-neutral-500">
              {t.libReasonHelp}
            </p>
            <p id={ids.reasonCount} className="text-xs text-neutral-500">
              {format(t.libReasonCount, {
                count: values.reason.length,
                max: LIBRARY_BAN_REASON_MAX,
              })}
            </p>
          </div>
          {reasonError && (
            <p
              id={errorDomId(form.formId, 'reason')}
              className="text-xs text-[#ffc2c2] mt-1"
            >
              {reasonError}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="block text-xs text-neutral-400 uppercase tracking-wide mb-2">
            {t.libDurationLegend}
          </legend>
          <div className="flex flex-wrap gap-4 text-sm text-neutral-200">
            {BAN_DURATION_PRESETS.map((value) => (
              <label key={value} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name={`${uid}-duration`}
                  value={value}
                  checked={values.preset === value}
                  onChange={() => form.setValue('preset', value)}
                />
                {durationLabel(value, t)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end">
          <AdminButton
            type="submit"
            variant="danger"
            size="sm"
            disabled={ban.isPending}
          >
            {ban.isPending ? t.libSubmitting : t.libSubmit}
          </AdminButton>
        </div>
      </form>
    </section>
  );
}
