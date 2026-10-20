// components/admin/moderation/LibraryChatMuteForm.tsx
// Onglet « Library » du hub /admin/moderation : mettre en sourdine l'autrice
// d'un message du chat de la Women's Library (lot 6), dans la salle du message
// ou partout, pour une durée, avec un motif OBLIGATOIRE (journalisé).
//
//   POST /api/admin/library/mutes → 201 { mute }
//
// Formulaire en ligne, sous la ligne du message : le focus y entre à
// l'ouverture et revient au déclencheur à la fermeture.
//
// Formulaire sur schéma (`useAdminForm`) : le schéma transforme les champs en
// corps du POST validé par le contrat (`buildChatMuteBody` →
// `LibraryChatAdminMuteBody`) ; le refus du motif se pose sur son champ.

import { useEffect, useMemo, useRef } from 'react';
import * as z from 'zod';
import { useToast } from '@/components/Toast';
import { errorDomId, useAdminForm } from '@/hooks/admin/useAdminForm';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminModeration from '@/lib/i18n/locales/admin-fr/adminModeration';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { useMuteFromHub } from '@/features/admin/library/hooks/useLibraryChatModeration';
import type { AdminLibraryChatMessage } from '@/features/admin/library/chatModel';
import { LIBRARY_CHAT_ADMIN_CODES } from '@/features/admin/library/chatModel';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import {
  buildChatMuteBody,
  CHAT_MUTE_PRESETS,
  chatErrorCode,
  type ChatMutePreset,
  type ChatMuteScope,
  LIBRARY_CHAT_ADMIN_MUTE_REASON_MAX,
} from './libraryChat';

type Dict = typeof nsAdminModeration.fr;

const PRESET_LABEL = {
  '1h': 'chatMute1h',
  '24h': 'chatMute24h',
  '7d': 'chatMute7d',
  '30d': 'chatMute30d',
} as const;

const INITIAL_VALUES: {
  scope: ChatMuteScope;
  preset: ChatMutePreset;
  reason: string;
} = { scope: 'room', preset: '24h', reason: '' };

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

/** Champs → corps du POST, validé par le contrat ; le seul champ libre est le motif. */
function muteFormSchema(
  t: Dict,
  message: Pick<AdminLibraryChatMessage, 'userId' | 'roomId'>
) {
  return z
    .object({
      scope: z.enum(['room', 'library']),
      preset: z.enum(CHAT_MUTE_PRESETS),
      reason: z.string(),
    })
    .transform((values, ctx) => {
      const built = buildChatMuteBody({
        ...values,
        userId: message.userId,
        roomId: message.roomId,
      });
      if (built.ok) return built.body;
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message:
          built.error === 'required'
            ? t.chatMuteReasonRequired
            : format(t.chatMuteReasonTooLong, {
                max: LIBRARY_CHAT_ADMIN_MUTE_REASON_MAX,
              }),
      });
      return z.NEVER;
    });
}

export default function LibraryChatMuteForm({
  message,
  onClose,
}: {
  message: AdminLibraryChatMessage;
  onClose: () => void;
}) {
  const t = useAdminT(nsAdminModeration);
  const { addToast } = useToast();
  const mute = useMuteFromHub();
  const firstRef = useRef<HTMLInputElement>(null);
  const name = message.nickname ?? message.userId;
  const schema = useMemo(
    () => muteFormSchema(t, { userId: message.userId, roomId: message.roomId }),
    [t, message.userId, message.roomId]
  );

  const form = useAdminForm({
    schema,
    initialValues: INITIAL_VALUES,
    errorFallback: t.chatErrorMute,
    onSubmit: async (body) => {
      try {
        const res = await mute.mutateAsync(body);
        addToast(
          format(t.chatMuted, { name, until: formatDate(res.mute.until) }),
          'success'
        );
        onClose();
      } catch (err) {
        const code = chatErrorCode(err);
        const fallback =
          code === LIBRARY_CHAT_ADMIN_CODES.playerNotFound
            ? t.chatErrorPlayerNotFound
            : code === LIBRARY_CHAT_ADMIN_CODES.roomNotFound
              ? t.chatErrorRoomNotFound
              : code === LIBRARY_CHAT_ADMIN_CODES.silentRoom
                ? t.chatErrorSilentRoom
                : t.chatErrorMute;
        addToast(
          fallback === t.chatErrorMute
            ? adminErrorMessage(err, fallback)
            : fallback,
          'error'
        );
      }
    },
  });

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    firstRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const { values } = form;
  const reasonError = form.errors.reason;
  const reasonField = form.field('reason');
  const helpId = `${form.formId}-help`;
  const titleId = `${form.formId}-title`;

  return (
    <form
      onSubmit={(e) => void form.handleSubmit(e)}
      aria-labelledby={titleId}
      data-testid="library-chat-mute-form"
      className="mt-3 flex flex-col gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] p-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !mute.isPending) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <p id={titleId} className="font-semibold text-neutral-100">
        {format(t.chatMuteFormHeading, { name })}
      </p>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-xs uppercase tracking-wide text-neutral-400">
          {t.chatMuteScopeLegend}
        </legend>
        {(['room', 'library'] as const).map((value, i) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              ref={i === 0 ? firstRef : undefined}
              type="radio"
              name={`${form.formId}-scope`}
              checked={values.scope === value}
              onChange={() => form.setValue('scope', value)}
            />
            {value === 'room' ? t.chatMuteScopeRoom : t.chatMuteScopeLibrary}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-xs uppercase tracking-wide text-neutral-400">
          {t.chatMuteDurationLegend}
        </legend>
        {CHAT_MUTE_PRESETS.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${form.formId}-preset`}
              checked={values.preset === value}
              onChange={() => form.setValue('preset', value)}
            />
            {t[PRESET_LABEL[value]]}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={reasonField.id} className="text-sm font-medium">
          {t.chatMuteReasonLabel}
        </label>
        <textarea
          {...reasonField}
          rows={2}
          aria-required="true"
          aria-describedby={`${helpId}${reasonError ? ` ${errorDomId(form.formId, 'reason')}` : ''}`}
          className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-2 text-sm"
        />
        <p id={helpId} className="text-xs text-neutral-500">
          {t.chatMuteReasonHelp}
        </p>
        {reasonError && (
          <p
            id={errorDomId(form.formId, 'reason')}
            role="alert"
            className="text-xs text-[var(--err,#ff6b6b)]"
          >
            {reasonError}
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <AdminButton
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={mute.isPending}
        >
          {t.chatMuteCancel}
        </AdminButton>
        <AdminButton
          type="submit"
          variant="danger"
          size="sm"
          disabled={mute.isPending}
          aria-busy={mute.isPending}
        >
          {mute.isPending ? t.chatMuteSubmitting : t.chatMuteSubmit}
        </AdminButton>
      </div>
    </form>
  );
}
