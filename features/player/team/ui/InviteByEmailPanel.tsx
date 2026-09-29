// features/player/team/ui/InviteByEmailPanel.tsx — inviter par e-mail ou par
// lien privé. La capitaine peut confier un rôle de gestion ; un manager peut
// désigner la capitaine tant que l'équipe n'en a pas (le serveur ré-applique
// les deux règles).
//
// Formulaire sur schéma (`useSchemaForm`) : aucun `useState` de champ.

import type { ReactNode } from 'react';
import { z } from 'zod';
import { useSchemaForm } from '@/hooks/forms/useSchemaForm';
import FormField, { FormError } from '@/features/ruban/FormField';
import { Button, Card } from '@/features/ruban';
import type { InvitationSentDto, InviteRoleChoice } from '../schemas';
import { InviteFormSchema } from '../schemas';
import type { ManageTeamTexts } from '../hooks/useManageTeamScreen';

const SELECT =
  'w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white focus:border-purple-400/70 focus:outline-none focus:ring-2 focus:ring-purple-400/60';

export default function InviteByEmailPanel({
  t,
  hasCaptain,
  busy,
  result,
  onInvite,
  copyButton,
}: {
  t: ManageTeamTexts;
  hasCaptain: boolean;
  busy: boolean;
  result: InvitationSentDto | null;
  /** `true` si l'invitation est partie : le formulaire se vide alors. */
  onInvite: (body: {
    email: string;
    role: InviteRoleChoice;
  }) => Promise<boolean>;
  /** Bouton « copier » du lien, fourni par l'écran. */
  copyButton: (url: string) => ReactNode;
}) {
  const form = useSchemaForm({
    schema: InviteFormSchema,
    initialValues: { email: '', role: 'player' } as z.input<
      typeof InviteFormSchema
    >,
    onSubmit: async (body) => {
      // Comme avant : l'adresse se vide, le rôle choisi reste.
      if (await onInvite(body)) form.reset({ ...form.values, email: '' });
    },
    errorFallback: t.inviteError,
  });
  const emailEmpty = !String(form.values.email ?? '').trim();

  return (
    <Card as="section">
      <h2 className="text-lg font-semibold">{t.inviteTitle}</h2>
      <p className="mt-1 text-sm text-gray-400">{t.inviteHelp}</p>

      <form
        onSubmit={form.handleSubmit}
        noValidate
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <FormField
            form={form}
            name="email"
            label={t.inviteEmailLabel}
            required
          >
            {(props) => (
              <input
                {...props}
                type="email"
                required
                autoComplete="email"
                placeholder={t.inviteEmailPlaceholder}
                className={`${SELECT} placeholder:text-gray-500`}
              />
            )}
          </FormField>
        </div>
        <div className="sm:w-52">
          <FormField form={form} name="role" label={t.inviteRoleLabel}>
            {(props) => (
              <select {...props} className={SELECT}>
                <option value="player">{t.optionPlayer}</option>
                <option value="substitute">{t.optionSubstitute}</option>
                <option value="coach">{t.optionCoach}</option>
                {/* Confier un rôle de gestion est ouvert à qui gère l'équipe
                    (2026-08-20) ; retirer ou dégrader un pair reste réservé à
                    la capitaine. */}
                <option value="manager">{t.roleManager}</option>
                {/* Le pendant : désigner la capitaine, s'il n'y en a pas. */}
                {!hasCaptain && <option value="captain">{t.captain}</option>}
              </select>
            )}
          </FormField>
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={busy || form.isSubmitting || emailEmpty}
        >
          {busy ? t.invitePending : t.inviteCta}
        </Button>
      </form>
      <FormError message={form.formError} />

      {result && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-100">
            {result.email_sent ? t.inviteSentEmail : t.inviteEmailFailed}
          </p>
          <p className="mt-1 text-xs text-emerald-100/80">{t.inviteLinkHint}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-black/50 px-3 py-2 text-[11px] text-gray-300">
              {result.invite_url}
            </code>
            {copyButton(result.invite_url)}
          </div>
        </div>
      )}
    </Card>
  );
}
