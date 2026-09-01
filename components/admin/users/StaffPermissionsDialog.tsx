// components/admin/users/StaffPermissionsDialog.tsx
//
// Accorder des permissions À L'UNITÉ à un membre du staff, sans lui donner un
// rôle entier. Extrait de `/admin/users/manage` — lot A7 : tout lot qui touche
// un god-component en sort un morceau, et cet écran est gelé à 2 450 lignes.
//
// Trois états par case, et c'est le cœur de l'écran :
//   - COUVERT PAR LE RÔLE : coché, verrouillé. On ne « retire » pas un droit du
//     rôle, on change de rôle. Décocher donnerait l'illusion du contraire.
//   - ACCORDABLE          : la case utile. L'appelant détient ce droit.
//   - HORS DE PORTÉE      : désactivé, avec la raison. Masquer un droit qu'on
//     ne peut pas donner ferait croire qu'il n'existe pas.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminStaffPermissions from '@/lib/i18n/locales/admin-fr/adminStaffPermissions';
import { STAFF_PERMISSION_CATALOG } from '@/utils/staffPermissions';

type Payload = {
  displayName: string | null;
  email: string | null;
  role: string;
  rolePermissions: string[];
  extraPermissions: string[];
  grantable: string[];
};

export default function StaffPermissionsDialog({
  userId,
  userName,
  onClose,
  onSaved,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const t = useAdminT(nsAdminStaffPermissions);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const [data, setData] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await adminFetchJson<Payload>(
        `/api/admin/users/${encodeURIComponent(userId)}/permissions`
      );
      setData(payload);
      setSelected(payload.extraPermissions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, userId, t.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await adminFetchJson(
        `/api/admin/users/${encodeURIComponent(userId)}/permissions`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extraPermissions: selected }),
        }
      );
      addToast(format(t.saved, { name: userName }), 'success');
      onSaved?.();
      onClose();
    } catch (err) {
      // Le serveur explique les refus qui se corrigent (droit non détenu) :
      // les remplacer par un message générique ferait chercher au mauvais
      // endroit.
      const message = err instanceof Error ? err.message : '';
      addToast(message || t.saveError, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (value: string) =>
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950 p-6">
        <h2 className="text-lg font-semibold text-white">
          {format(t.title, { name: userName })}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">{t.intro}</p>

        {loading && (
          <p className="mt-6 text-sm text-neutral-400">{t.loading}</p>
        )}
        {error && <p className="mt-6 text-sm text-red-300">{error}</p>}

        {data && !loading && !error && (
          <>
            <p className="mt-4 text-xs text-neutral-500">
              {format(t.roleNote, { role: data.role })}
            </p>

            <ul className="mt-4 space-y-2">
              {STAFF_PERMISSION_CATALOG.map((perm) => {
                const fromRole = data.rolePermissions.includes(perm.value);
                const grantable = data.grantable.includes(perm.value);
                const checked = fromRole || selected.includes(perm.value);
                const disabled = fromRole || !grantable;

                return (
                  <li
                    key={perm.value}
                    className={`rounded-xl border p-3 ${
                      disabled
                        ? 'border-white/5 bg-white/[0.02]'
                        : 'border-white/10 bg-white/[0.04]'
                    }`}
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(perm.value)}
                        className="mt-1 h-4 w-4 accent-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-white">
                          {perm.label}
                        </span>
                        <span className="block text-xs text-neutral-400">
                          {perm.description}
                        </span>
                        {fromRole && (
                          <span className="mt-1 block text-xs text-emerald-300">
                            {t.fromRole}
                          </span>
                        )}
                        {!fromRole && !grantable && (
                          <span className="mt-1 block text-xs text-amber-300">
                            {t.notGrantable}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white/5"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading || !!error}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50"
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
