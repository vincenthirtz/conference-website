// features/admin/identity/ui/IdentityAccountsSection.tsx — « Un compte » de la page owner
// « Comptes et connexion » : chercher une personne, voir sa sécurité, fermer ses sessions, retirer
// sa double authentification (téléphone perdu), renvoyer la vérification. Chaque geste est
// confirmé : il touche quelqu'un d'autre.

import { type FormEvent, useState } from 'react';
import { useToast } from '@/components/Toast';
import { Button, Card, Chip, FicheSection } from '@/features/ruban';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminIdentity from '@/lib/i18n/locales/admin-fr/adminIdentity';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import type { IdentityAccount, IdentityAccountAction } from '../client';
import {
  IDENTITY_SEARCH_MIN,
  useIdentityAccountAction,
  useIdentityAccounts,
} from '../hooks/useIdentity';

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

export default function IdentityAccountsSection() {
  const t = useAdminT(nsAdminIdentity);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const accounts = useIdentityAccounts(query);
  const act = useIdentityAccountAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setQuery(draft.trim());
  };

  const providerLabel = (id: string) =>
    id === 'credential'
      ? t.providerCredential
      : id === 'discord'
        ? t.providerDiscord
        : id;

  const run = async (
    account: IdentityAccount,
    action: IdentityAccountAction
  ) => {
    const texts = {
      revoke_sessions: [t.confirmRevokeTitle, t.confirmRevokeBody],
      remove_two_factor: [t.confirmRemoveTitle, t.confirmRemoveBody],
      resend_verification: [t.confirmResendTitle, t.confirmResendBody],
    }[action];
    const ok = await confirm({
      title: format(texts[0], { email: account.email }),
      subtitle: texts[1],
      variant: action === 'resend_verification' ? 'info' : 'danger',
      confirmLabel: t.confirmAction,
    });
    if (!ok) return;
    try {
      const result = await act.mutateAsync({ userId: account.id, action });
      if (result.action === 'revoke_sessions') {
        addToast(format(t.doneRevoke, { count: result.revoked }), 'success');
      } else if (result.action === 'remove_two_factor') {
        addToast(
          result.hadTwoFactor ? t.doneRemove : t.doneRemoveNone,
          'success'
        );
      } else {
        addToast(
          result.sent ? t.doneResend : t.doneResendFailed,
          result.sent ? 'success' : 'warning'
        );
      }
    } catch (err) {
      addToast(
        format(t.actionError, { error: adminErrorMessage(err, t.loadError) }),
        'error'
      );
    }
  };

  const found = accounts.data?.accounts ?? [];

  return (
    <FicheSection title={t.accountsTitle}>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <label
            htmlFor="identity-account-search"
            className="mb-1 block text-[12px] text-[var(--t3,#a39ba6)]"
          >
            {t.searchLabel}
          </label>
          <input
            id="identity-account-search"
            type="search"
            value={draft}
            placeholder={t.searchPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            className="h-[38px] w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 text-[13px] text-[var(--t1,#f4edf7)]"
          />
        </div>
        <Button
          size="sm"
          type="submit"
          disabled={draft.trim().length < IDENTITY_SEARCH_MIN}
        >
          {accounts.isFetching ? t.searching : t.search}
        </Button>
      </form>

      {accounts.isError && (
        <p className="mt-3 text-[13px] text-[#ffc2c2]">
          {format(t.accountsError, {
            error: adminErrorMessage(accounts.error, t.loadError),
          })}
        </p>
      )}
      {accounts.isSuccess && found.length === 0 && (
        <p className="mt-3 text-[13px] text-[var(--t3,#a39ba6)]">
          {t.noResult}
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {found.map((account) => (
          <Card as="li" padding="sm" key={account.id}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-1 text-[14.5px] text-[var(--t1,#f4edf7)]">
                {account.email}
              </p>
              {account.displayName && (
                <span className="text-[12.5px] text-[var(--t3,#a39ba6)]">
                  {account.displayName}
                </span>
              )}
              {account.role && <Chip tone="brand">{account.role}</Chip>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip tone={account.emailVerified ? 'ok' : 'warn'}>
                {account.emailVerified ? t.verified : t.unverified}
              </Chip>
              <Chip tone={account.twoFactorEnabled ? 'ok' : 'neutral'}>
                {account.twoFactorEnabled ? t.twoFactorOn : t.twoFactorOff}
              </Chip>
              <Chip>
                {format(t.sessions, { count: account.activeSessions })}
              </Chip>
              {account.bannedUntil &&
                new Date(account.bannedUntil) > new Date() && (
                  <Chip tone="err">
                    {format(t.bannedUntil, { date: when(account.bannedUntil) })}
                  </Chip>
                )}
            </div>
            <p className="mt-2 text-[12.5px] text-[var(--t3,#a39ba6)]">
              {format(t.providers, {
                list: account.providers.length
                  ? account.providers.map(providerLabel).join(', ')
                  : t.providerNone,
              })}
              {' · '}
              {account.lastSignInAt
                ? format(t.lastSignIn, { date: when(account.lastSignInAt) })
                : t.neverSignedIn}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="xs"
                disabled={act.isPending || account.activeSessions === 0}
                onClick={() => void run(account, 'revoke_sessions')}
              >
                {t.actionRevoke}
              </Button>
              {account.twoFactorEnabled && (
                <Button
                  size="xs"
                  variant="danger"
                  disabled={act.isPending}
                  onClick={() => void run(account, 'remove_two_factor')}
                >
                  {t.actionRemoveTwoFactor}
                </Button>
              )}
              {!account.emailVerified && (
                <Button
                  size="xs"
                  disabled={act.isPending}
                  onClick={() => void run(account, 'resend_verification')}
                >
                  {t.actionResend}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </ul>
      {dialog}
    </FicheSection>
  );
}
