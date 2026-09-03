// components/admin/tenants/TenantInvitationsPanel.tsx
//
// Inviter quelqu'un dans un espace — et voir où en sont les invitations.
//
// L'onglet Staff ne savait que RATTACHER un compte déjà existant : il fallait
// coller un `staff_id`, donc connaître un UUID, donc que la personne existe
// déjà en base. Pour tout le reste — la majorité des cas — il fallait créer le
// compte à la main ailleurs et revenir. C'est la friction la plus quotidienne
// de la gestion d'un espace.
//
// L'état d'une invitation est CALCULÉ côté serveur (en attente, acceptée,
// annulée, expirée) : pas de colonne à tenir à jour, pas de cron à écrire pour
// une information qu'une date suffit à donner.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTenantDetail from '@/lib/i18n/locales/admin-fr/adminTenantDetail';

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  created_at: string;
};

export default function TenantInvitationsPanel({
  tenantId,
  onAccepted,
}: {
  tenantId: string;
  /** Rafraîchit la liste du staff : une invitation acceptée y ajoute quelqu'un. */
  onAccepted?: () => void;
}) {
  const t = useAdminT(nsAdminTenantDetail);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();

  const [rows, setRows] = useState<Invitation[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('caster');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminFetchJson<{ invitations: Invitation[] }>(
        `/api/admin/tenants/${tenantId}/invitations`
      );
      setRows(data.invitations ?? []);
    } catch {
      setRows([]);
    }
  }, [adminFetchJson, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const resp = await mutateJson<{ emailSent: boolean }>(
        `/api/admin/tenants/${tenantId}/invitations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), role }),
        }
      );
      setEmail('');
      // L'invitation existe même si l'email n'est pas parti : le dire évite
      // d'attendre un message qui ne viendra jamais.
      addToast(
        resp.emailSent ? t.inviteSent : t.inviteCreatedNoEmail,
        resp.emailSent ? 'success' : 'error'
      );
      await load();
    } catch (err) {
      addToast((err as Error)?.message || t.inviteError, 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (row: Invitation) => {
    try {
      await mutateJson(
        `/api/admin/tenants/${tenantId}/invitations/${row.id}`,
        { method: 'DELETE' }
      );
      addToast(t.inviteRevoked, 'success');
      await load();
      onAccepted?.();
    } catch (err) {
      addToast((err as Error)?.message || t.inviteError, 'error');
    }
  };

  const statusLabel = (s: Invitation['status']) =>
    s === 'pending'
      ? t.inviteStatusPending
      : s === 'accepted'
        ? t.inviteStatusAccepted
        : s === 'revoked'
          ? t.inviteStatusRevoked
          : t.inviteStatusExpired;

  return (
    <section
      className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4"
      data-testid="tenant-invitations"
    >
      <h2 className="text-sm font-semibold text-neutral-400">
        {t.inviteHeading}
      </h2>
      <p className="mt-1 text-xs text-neutral-500">{t.inviteDesc}</p>

      <form onSubmit={invite} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label
            htmlFor="invite-email"
            className="block text-xs font-medium text-neutral-400 mb-1"
          >
            {t.inviteEmailLabel}
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom@exemple.fr"
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="invite-role"
            className="block text-xs font-medium text-neutral-400 mb-1"
          >
            {t.staffRoleLabel}
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
          >
            <option value="caster">caster</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-semibold text-white disabled:opacity-50"
          data-testid="tenant-invite-submit"
        >
          {busy ? t.inviting : t.inviteCta}
        </button>
      </form>

      {rows && rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-neutral-900/50 px-3 py-2 text-xs"
            >
              <span className="text-neutral-200">
                {row.email}
                <span className="ml-2 text-neutral-500">{row.role}</span>
              </span>
              <span className="flex items-center gap-3">
                <span
                  className={
                    row.status === 'pending'
                      ? 'text-amber-300'
                      : row.status === 'accepted'
                        ? 'text-emerald-300'
                        : 'text-neutral-500'
                  }
                >
                  {statusLabel(row.status)}
                  {row.status === 'pending' &&
                    ` · ${format(t.inviteUntil, {
                      date: new Date(row.expires_at).toLocaleDateString(
                        'fr-FR'
                      ),
                    })}`}
                </span>
                {row.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => void revoke(row)}
                    className="underline text-neutral-400 hover:text-white"
                  >
                    {t.inviteRevoke}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
