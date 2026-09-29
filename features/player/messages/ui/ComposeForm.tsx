// features/player/messages/ui/ComposeForm.tsx — rédaction d'un message
// (lot P15) : premier message d'une conversation (zone de texte, équipe
// choisie au-dessus) ou réponse dans un fil (ligne unique).
//
// Formulaire sur schéma (`useSchemaForm`, corps partagé `SendMessageBody`) :
// aucun `useState` de champ. Le bouton reste inactif tant que le message est
// vide ou l'équipe non choisie — comme avant, l'erreur de schéma n'est qu'un
// filet ; un refus serveur s'affiche sous le formulaire, traduit.

import { useEffect, type ReactNode, type Ref } from 'react';
import { useSchemaForm } from '@/hooks/forms/useSchemaForm';
import { FormError } from '@/features/ruban/FormField';
import { Button, rubanFormInput } from '@/features/ruban';
import { ComposeForm as ComposeSchema } from '../schemas';

type Texts = {
  composeLabel: string;
  composePlaceholder: string;
  replyLabel: string;
  replyPlaceholder: string;
  send: string;
  sending: string;
  sendingShort: string;
  sendError: string;
};

export default function ComposeForm({
  variant,
  targetTeamId,
  onSend,
  describe,
  texts,
  inputRef,
  renderPicker,
}: {
  variant: 'new' | 'reply';
  /**
   * Équipe destinataire : celle du fil (réponse) ; vide pour un premier
   * message, choisie alors par `renderPicker` — c'est un CHAMP du formulaire.
   */
  targetTeamId: string;
  /** Sélecteur d'équipe (premier message), branché sur le champ. */
  renderPicker?: (value: string, onChange: (id: string) => void) => ReactNode;
  onSend: (targetTeamId: string, content: string) => Promise<void>;
  describe: (err: unknown, fallback: string) => string;
  texts: Texts;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const form = useSchemaForm({
    schema: ComposeSchema,
    initialValues: { content: '', targetTeamId },
    onSubmit: async (body) => {
      await onSend(body.targetTeamId, body.content);
      form.reset({ content: '', targetTeamId: body.targetTeamId });
    },
    errorFallback: texts.sendError,
    describeError: describe,
  });

  // Réponse : l'équipe du fil peut arriver après le montage.
  const { setValue } = form;
  useEffect(() => {
    if (targetTeamId) setValue('targetTeamId', targetTeamId);
  }, [setValue, targetTeamId]);

  const content = form.field('content');
  const target = String(form.values.targetTeamId ?? '');
  const blank = !String(form.values.content ?? '').trim();
  const disabled = form.isSubmitting || blank || !target;
  const error =
    form.formError ?? form.errors.content ?? form.errors.targetTeamId ?? null;

  if (variant === 'new') {
    return (
      <form onSubmit={form.handleSubmit} noValidate className="space-y-3">
        {renderPicker?.(target, (id) => setValue('targetTeamId', id))}
        <div className="mt-4" />
        <textarea
          {...content}
          rows={3}
          aria-label={texts.composeLabel}
          placeholder={texts.composePlaceholder}
          maxLength={2000}
          className={`${rubanFormInput} resize-none`}
        />
        <FormError message={error} />
        <Button
          type="submit"
          variant="primary"
          disabled={disabled}
          className="w-full"
        >
          {form.isSubmitting ? texts.sending : texts.send}
        </Button>
      </form>
    );
  }

  return (
    <>
      <form
        onSubmit={form.handleSubmit}
        noValidate
        className="flex gap-3 border-t border-[var(--line,rgba(194,196,201,.12))] px-4 py-3"
      >
        <input
          {...content}
          ref={inputRef}
          type="text"
          aria-label={texts.replyLabel}
          placeholder={texts.replyPlaceholder}
          maxLength={2000}
          className={`${rubanFormInput} flex-1`}
        />
        <Button type="submit" variant="primary" disabled={disabled}>
          {form.isSubmitting ? texts.sendingShort : texts.send}
        </Button>
      </form>
      <div className="mx-4 mb-3 empty:hidden">
        <FormError message={error} />
      </div>
    </>
  );
}
