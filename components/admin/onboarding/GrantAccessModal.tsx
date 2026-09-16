// components/admin/onboarding/GrantAccessModal.tsx
//
// Ouvrir l'accès d'un espace à quelqu'un, depuis le hub d'onboarding.
//
// POURQUOI UN SEUL GESTE POUR DEUX CHEMINS. Rattacher une personne à un espace
// demandait jusqu'ici de savoir laquelle des deux situations on était :
//
//   - elle a déjà un compte → `POST /tenants/[id]/staff`, avec son `staff_id`,
//     un UUID qui n'apparaît NULLE PART dans l'interface (on a vu un
//     `auth_user_id` collé à sa place : 404, sans indice sur la différence) ;
//   - elle n'en a pas → invitation nominative, qu'elle ne peut accepter qu'une
//     fois connectée à l'adresse invitée — donc une impasse pour qui n'a pas
//     encore de compte.
//
// L'opérateur n'a pas à savoir laquelle : il a une ADRESSE EMAIL. On tente le
// rattachement, et le 404 `STAFF_NOT_FOUND` — qui renvoie l'adresse cherchée —
// bascule sur l'invitation. Les deux issues sont annoncées distinctement :
// « rattachée » et « invitée » ne demandent pas la même chose ensuite.

import { useCallback, useEffect, useState } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import {
  TENANT_STAFF_ROLES,
  TENANT_STAFF_ROLE_HINTS,
} from '@/utils/tenants/tenantStaffRoles';
import nsAdminOnboarding from '@/lib/i18n/locales/admin-fr/adminOnboarding';

type Props = {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
  onDone: () => void;
};

/** Ce qu'il s'est passé, une fois le geste abouti. */
type Outcome =
  | { kind: 'attached'; email: string; role: string }
  | { kind: 'invited'; email: string; role: string };

/**
 * `owner` par défaut, et c'est délibéré.
 *
 * La première personne d'un espace doit pouvoir ouvrir l'accès aux suivantes
 * sans repasser par l'opérateur — sinon chaque arrivée dans l'équipe cliente
 * redevient un ticket.
 */
const DEFAULT_ROLE = 'owner';

export default function GrantAccessModal({
  tenantId,
  tenantName,
  onClose,
  onDone,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const t = useAdminT(nsAdminOnboarding);
  const { adminFetchJson } = useAdminFetch();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>(DEFAULT_ROLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const address = email.trim().toLowerCase();
      if (!address) {
        setError(t.grantAccessErrorNoEmail);
        return;
      }

      setBusy(true);
      try {
        // 1) La personne a-t-elle déjà un compte ? Si oui, le rattachement est
        //    immédiat et elle n'a rien à faire.
        await adminFetchJson(`/api/admin/tenants/${tenantId}/staff`, {
          method: 'POST',
          body: JSON.stringify({ email: address, role }),
        });
        setOutcome({ kind: 'attached', email: address, role });
        onDone();
        return;
      } catch (err) {
        const code = (err as { payload?: { code?: unknown } })?.payload?.code;
        if (code !== 'STAFF_NOT_FOUND') {
          setError(err instanceof Error ? err.message : t.grantAccessError);
          setBusy(false);
          return;
        }
      }

      try {
        // 2) Pas de compte : invitation nominative, valable 14 jours.
        await adminFetchJson(`/api/admin/tenants/${tenantId}/invitations`, {
          method: 'POST',
          body: JSON.stringify({ email: address, role }),
        });
        setOutcome({ kind: 'invited', email: address, role });
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.grantAccessError);
      } finally {
        setBusy(false);
      }
    },
    [
      adminFetchJson,
      email,
      onDone,
      role,
      t.grantAccessError,
      t.grantAccessErrorNoEmail,
      tenantId,
    ]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grant-access-title"
    >
      <div
        ref={trapRef}
        className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl"
      >
        <h2
          id="grant-access-title"
          className="text-lg font-semibold text-white"
        >
          {format(t.grantAccessTitle, { tenant: tenantName })}
        </h2>

        {outcome ? (
          <>
            <p className="mt-3 text-sm text-neutral-200">
              {outcome.kind === 'attached'
                ? format(t.grantAccessAttached, { email: outcome.email })
                : format(t.grantAccessInvited, { email: outcome.email })}
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              {outcome.kind === 'attached'
                ? t.grantAccessAttachedHint
                : t.grantAccessInvitedHint}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
              >
                {t.grantAccessClose}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-400">
              {t.grantAccessIntro}
            </p>

            <AlertBanner message={error} variant="error" className="mt-3" />

            <form onSubmit={submit} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="grant-access-email"
                  className="mb-1 block text-xs font-medium text-neutral-400"
                >
                  {t.grantAccessEmailLabel}
                </label>
                <input
                  id="grant-access-email"
                  type="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  maxLength={254}
                  autoComplete="off"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="grant-access-role"
                  className="mb-1 block text-xs font-medium text-neutral-400"
                >
                  {t.grantAccessRoleLabel}
                </label>
                <select
                  id="grant-access-role"
                  value={role}
                  onChange={(ev) => setRole(ev.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                >
                  {TENANT_STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r} — {TENANT_STAFF_ROLE_HINTS[r]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  {t.grantAccessRoleHint}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  {t.grantAccessCancel}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  data-testid="grant-access-submit"
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {busy ? t.grantAccessBusy : t.grantAccessSubmit}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
