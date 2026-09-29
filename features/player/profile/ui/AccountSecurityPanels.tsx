// features/player/profile/ui/AccountSecurityPanels.tsx — « Changer mon
// email » et « Changer mon mot de passe » (lot P9).
//
// RÉ-AUTHENTIFICATION CONSERVÉE : chaque changement exige le mot de passe
// actuel avant d'appeler Supabase Auth (une session détournée ne doit ni
// remplacer l'e-mail ni verrouiller la propriétaire dehors). Après un nouveau
// mot de passe, toutes les sessions sont révoquées et la joueuse est renvoyée
// à la connexion.
//
// Formulaires sur schéma (`useSchemaForm`) : l'ordre des contrôles et les
// messages sont ceux d'avant (mot de passe actuel requis → 8 caractères →
// confirmation identique), sous le champ en faute.

import { useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerProfile from '@/lib/i18n/locales/fr/playerProfile';
import { logger } from '@/utils/logger';
import { useSchemaForm } from '@/hooks/forms/useSchemaForm';
import { Button, FicheSection } from '@/features/ruban';
import FormField, { FormError, inputClass } from '@/features/ruban/FormField';
import { makeEmailChangeForm, makePasswordChangeForm } from '../schemas';
import {
  WrongCurrentPasswordError,
  useAccountSecurity,
} from '../hooks/useProfile';

const successClass = 'mb-4 text-[13px] text-[var(--ok,#30d07e)]';
const helpClass = 'mt-3 text-[12.5px] text-[var(--t4,#807984)]';

export function EmailChangePanel({ email }: { email: string }) {
  const t = useT(nsPlayerProfile);
  const security = useAccountSecurity(email);
  const [success, setSuccess] = useState<string | null>(null);
  const schema = useMemo(() => makeEmailChangeForm(t), [t]);

  const form = useSchemaForm({
    schema,
    initialValues: { current_password: '', new_email: '' },
    errorFallback: t.emailChangeError,
    describeError: (err, fallback) =>
      err instanceof WrongCurrentPasswordError
        ? t.wrongCurrentPassword
        : (err as Error)?.message || fallback,
    onSubmit: async ({ current_password, new_email }) => {
      setSuccess(null);
      if (new_email === email) return;
      try {
        await security.changeEmail(current_password, new_email);
      } catch (err) {
        if (!(err instanceof WrongCurrentPasswordError))
          logger.error('[player] email change error:', err);
        throw err;
      }
      setSuccess(t.emailConfirmSent);
      form.reset({ current_password: '', new_email: '' });
    },
  });

  const { current_password, new_email } = form.values;
  return (
    <FicheSection title={t.changeEmail}>
      {success && (
        <p role="status" aria-live="polite" className={successClass}>
          {success}
        </p>
      )}
      <form onSubmit={form.handleSubmit} noValidate className="space-y-4">
        <FormError message={form.formError} />
        <FormField
          form={form}
          name="current_password"
          label={t.currentPasswordLabel}
          required
        >
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="current-password"
              placeholder={t.currentPasswordPlaceholder}
              className={inputClass}
            />
          )}
        </FormField>
        <FormField
          form={form}
          name="new_email"
          label={t.newEmailLabel}
          required
        >
          {(p) => (
            <input
              {...p}
              type="email"
              placeholder={t.newEmailPlaceholder}
              className={inputClass}
            />
          )}
        </FormField>
        <Button
          type="submit"
          variant="primary"
          disabled={
            form.isSubmitting ||
            !new_email ||
            new_email === email ||
            !current_password
          }
        >
          {form.isSubmitting ? t.sending : t.changeEmailBtn}
        </Button>
      </form>
      <p className={helpClass}>{t.emailHelp}</p>
    </FicheSection>
  );
}

export function PasswordChangePanel({ email }: { email: string }) {
  const t = useT(nsPlayerProfile);
  const security = useAccountSecurity(email);
  const [success, setSuccess] = useState<string | null>(null);
  const schema = useMemo(() => makePasswordChangeForm(t), [t]);

  const form = useSchemaForm({
    schema,
    initialValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
    errorFallback: t.passwordChangeError,
    describeError: (err, fallback) =>
      err instanceof WrongCurrentPasswordError
        ? t.wrongCurrentPassword
        : (err as Error)?.message || fallback,
    onSubmit: async ({ current_password, new_password }) => {
      setSuccess(null);
      try {
        await security.changePassword(current_password, new_password);
      } catch (err) {
        if (!(err instanceof WrongCurrentPasswordError))
          logger.error('[player] password change error:', err);
        throw err;
      }
      form.reset({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      setSuccess(t.signedOutAfterPasswordChange);
      // Reconnexion avec le nouveau mot de passe.
      security.backToLogin();
    },
  });

  const { current_password, new_password, confirm_password } = form.values;
  return (
    <FicheSection title={t.changePassword}>
      {success && (
        <p role="status" aria-live="polite" className={successClass}>
          {success}
        </p>
      )}
      <form onSubmit={form.handleSubmit} noValidate className="space-y-4">
        <FormError message={form.formError} />
        <FormField
          form={form}
          name="current_password"
          label={t.currentPasswordLabel}
          required
        >
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="current-password"
              placeholder={t.currentPasswordPlaceholder}
              className={inputClass}
            />
          )}
        </FormField>
        <FormField
          form={form}
          name="new_password"
          label={t.newPasswordLabel}
          required
        >
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              className={inputClass}
            />
          )}
        </FormField>
        <FormField
          form={form}
          name="confirm_password"
          label={t.confirmPasswordLabel}
          required
        >
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              className={inputClass}
            />
          )}
        </FormField>
        <Button
          type="submit"
          variant="primary"
          disabled={
            form.isSubmitting ||
            !current_password ||
            !new_password ||
            !confirm_password
          }
        >
          {form.isSubmitting ? t.updatingPassword : t.changePasswordBtn}
        </Button>
      </form>
      <p className={helpClass}>{t.passwordHelp}</p>
      <p className="mt-1 text-[12.5px] text-[var(--t4,#807984)]">
        {t.reauthHelp}
      </p>
    </FicheSection>
  );
}
