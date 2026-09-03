// components/admin/tenants/TenantLifecyclePanel.tsx
//
// L'état d'un espace : actif, suspendu, archivé, purge programmée.
//
// Le bouton « Archiver » existait déjà, seul, sans motif ni conséquence
// écrite : on cliquait, `is_active` passait à false, et personne ne savait
// vraiment ce que ça coupait. Ici l'état se choisit, se motive, et l'écran dit
// ce que chacun produit — pour le client comme pour le bot.
//
// Le motif n'est pas décoratif : il est repris tel quel dans le refus que le
// client recevra (« Espace suspendu. Motif : … »). Écrire « test » là-dedans se
// paie en appel au support la semaine suivante.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTenantDetail from '@/lib/i18n/locales/admin-fr/adminTenantDetail';

type State = 'active' | 'suspended' | 'archived' | 'purge_scheduled' | 'purged';

type Tenant = {
  lifecycle_state: State | null;
  lifecycle_reason: string | null;
  purge_after: string | null;
};

const TONE: Record<string, string> = {
  active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  suspended: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  archived: 'border-neutral-500/40 bg-neutral-500/10 text-neutral-300',
  purge_scheduled: 'border-red-500/40 bg-red-500/10 text-red-300',
  purged: 'border-red-500/40 bg-red-500/10 text-red-300',
};

export default function TenantLifecyclePanel({
  tenantId,
  onChanged,
}: {
  tenantId: string;
  onChanged?: () => void;
}) {
  const t = useAdminT(nsAdminTenantDetail);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();

  const [state, setState] = useState<Tenant | null>(null);
  const [target, setTarget] = useState<State>('suspended');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminFetchJson<{ tenant: Tenant }>(
        `/api/admin/tenants/${tenantId}`
      );
      setState(data.tenant);
    } catch {
      setState(null);
    }
  }, [adminFetchJson, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = state?.lifecycle_state ?? 'active';

  const apply = async () => {
    setBusy(true);
    try {
      const resp = await mutateJson<{ tenant: Tenant }>(
        `/api/admin/tenants/${tenantId}/lifecycle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: target,
            reason: reason.trim() || undefined,
          }),
        }
      );
      setState(resp.tenant);
      setReason('');
      addToast(t.lifecycleChanged, 'success');
      onChanged?.();
    } catch (err) {
      addToast((err as Error)?.message || t.lifecycleError, 'error');
    } finally {
      setBusy(false);
    }
  };

  const label = (s: string) =>
    s === 'active'
      ? t.lifecycleActive
      : s === 'suspended'
        ? t.lifecycleSuspended
        : s === 'archived'
          ? t.lifecycleArchived
          : s === 'purge_scheduled'
            ? t.lifecyclePurgeScheduled
            : t.lifecyclePurged;

  return (
    <section
      className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4"
      data-testid="tenant-lifecycle"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-400">
          {t.lifecycleHeading}
        </h2>
        <span
          className={`rounded-full border px-3 py-1 text-xs ${TONE[current]}`}
          data-testid="tenant-lifecycle-state"
        >
          {label(current)}
        </span>
      </div>

      {state?.lifecycle_reason && (
        <p className="mt-2 text-xs text-neutral-300">
          {format(t.lifecycleReasonShown, { reason: state.lifecycle_reason })}
        </p>
      )}
      {state?.purge_after && (
        <p className="mt-1 text-xs text-red-300">
          {format(t.lifecyclePurgeAt, {
            date: new Date(state.purge_after).toLocaleDateString('fr-FR'),
          })}
        </p>
      )}

      <p className="mt-3 text-xs text-neutral-500">{t.lifecycleEffects}</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="lifecycle-target"
            className="block text-xs font-medium text-neutral-400 mb-1"
          >
            {t.lifecycleTargetLabel}
          </label>
          <select
            id="lifecycle-target"
            value={target}
            onChange={(e) => setTarget(e.target.value as State)}
            className="px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 text-sm"
          >
            <option value="active">{t.lifecycleActive}</option>
            <option value="suspended">{t.lifecycleSuspended}</option>
            <option value="archived">{t.lifecycleArchived}</option>
            <option value="purge_scheduled">{t.lifecyclePurgeScheduled}</option>
          </select>
        </div>
        <div className="flex-1 min-w-[240px]">
          <label
            htmlFor="lifecycle-reason"
            className="block text-xs font-medium text-neutral-400 mb-1"
          >
            {t.lifecycleReasonLabel}
          </label>
          <input
            id="lifecycle-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.lifecycleReasonPlaceholder}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={busy || target === current}
          className="px-4 py-2 rounded-lg border border-amber-500/50 text-amber-200 hover:bg-amber-500/10 text-sm font-medium disabled:opacity-40"
          data-testid="tenant-lifecycle-apply"
        >
          {busy ? t.lifecycleApplying : t.lifecycleApply}
        </button>
      </div>
    </section>
  );
}
