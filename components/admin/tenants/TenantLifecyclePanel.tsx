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

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type TenantDetail,
  tenantsPaths,
} from '@/features/admin/tenants/client';
import {
  tenantsKeys,
  useTenantDetail,
} from '@/features/admin/tenants/hooks/useTenants';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTenantDetail from '@/lib/i18n/locales/admin-fr/adminTenantDetail';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

type State = 'active' | 'suspended' | 'archived' | 'purge_scheduled' | 'purged';

type Tenant = {
  lifecycle_state: State | null;
  lifecycle_reason: string | null;
  purge_after: string | null;
};

const TONE: Record<string, ChipTone> = {
  active: 'ok',
  suspended: 'warn',
  archived: 'neutral',
  purge_scheduled: 'err',
  purged: 'err',
};

export default function TenantLifecyclePanel({
  tenantId,
  onChanged,
}: {
  tenantId: string;
  onChanged?: () => void;
}) {
  const t = useAdminT(nsAdminTenantDetail);
  const { mutateJson } = useIdempotentMutation();
  const qc = useQueryClient();
  const { addToast } = useToast();

  // Même clé que la fiche : une seule requête pour les deux.
  const { data: detail } = useTenantDetail(tenantId);
  const state: Tenant | null = detail?.tenant ?? null;
  const [target, setTarget] = useState<State>('suspended');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const current = state?.lifecycle_state ?? 'active';

  const apply = async () => {
    setBusy(true);
    try {
      const resp = await mutateJson<{ tenant: Tenant }>(
        tenantsPaths.lifecycle(tenantId),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: target,
            reason: reason.trim() || undefined,
          }),
        }
      );
      qc.setQueryData<TenantDetail>(tenantsKeys.detail(tenantId), (prev) =>
        prev ? { ...prev, tenant: { ...prev.tenant, ...resp.tenant } } : prev
      );
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
      className="bg-[var(--s1,#100812)] backdrop-blur border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-card,14px)] p-4"
      data-testid="tenant-lifecycle"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-400">
          {t.lifecycleHeading}
        </h2>
        <Chip tone={TONE[current]} data-testid="tenant-lifecycle-state">
          {label(current)}
        </Chip>
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
            className="px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-sm"
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
            className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-sm"
          />
        </div>
        <AdminButton
          variant="danger"
          size="sm"
          type="button"
          onClick={apply}
          disabled={busy || target === current}
          data-testid="tenant-lifecycle-apply"
        >
          {busy ? t.lifecycleApplying : t.lifecycleApply}
        </AdminButton>
      </div>
    </section>
  );
}
