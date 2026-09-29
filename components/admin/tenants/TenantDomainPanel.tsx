// components/admin/tenants/TenantDomainPanel.tsx
//
// Le domaine propre d'un espace, et sa preuve.
//
// Avant ce lot, le champ était un simple texte : on l'écrivait, et soit ça
// marchait, soit — bien plus souvent — rien ne se passait, sans un mot
// d'explication. Deux causes possibles et indiscernables : le DNS ne pointait
// pas ici, ou le nom était faux.
//
// L'écran montre donc les DEUX enregistrements à créer, copiables, dit lequel
// prouve quoi, et rend le verdict de la dernière vérification. Le TXT prouve la
// possession ; le CNAME ne prouve rien mais sans lui rien n'arrive — d'où
// l'avertissement séparé quand la preuve passe et le routage non.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type TenantDomainState,
  tenantsPaths,
} from '@/features/admin/tenants/client';
import {
  tenantsKeys,
  useTenantDomain,
} from '@/features/admin/tenants/hooks/useTenants';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTenantDetail from '@/lib/i18n/locales/admin-fr/adminTenantDetail';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

type DomainState = TenantDomainState;

export default function TenantDomainPanel({ tenantId }: { tenantId: string }) {
  const t = useAdminT(nsAdminTenantDetail);
  const { mutateJson } = useIdempotentMutation();
  const qc = useQueryClient();
  const { addToast } = useToast();

  // Lecture en échec : panneau masqué, comme sans domaine.
  const { data = null } = useTenantDomain(tenantId);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    setBusy(true);
    try {
      const resp = await mutateJson<DomainState>(
        tenantsPaths.domain(tenantId),
        { method: 'POST' }
      );
      qc.setQueryData(tenantsKeys.domain(tenantId), resp);
      addToast(
        resp.state === 'verified' ? t.domainVerified : t.domainFailed,
        resp.state === 'verified' ? 'success' : 'error'
      );
    } catch (err) {
      addToast((err as Error)?.message || t.domainCheckError, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Pas de domaine : rien à dire. Un panneau vide sur une fiche dense est un
  // panneau qu'on apprend à sauter.
  if (!data?.domain) return null;

  const badge: ChipTone =
    data.state === 'verified' ? 'ok' : data.state === 'failed' ? 'err' : 'warn';

  return (
    <section
      className="bg-[var(--s1,#100812)] backdrop-blur border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-card,14px)] p-4"
      data-testid="tenant-domain"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-400">
            {t.domainHeading}
          </h2>
          <p className="mt-1 font-mono text-sm text-white">{data.domain}</p>
        </div>
        <Chip tone={badge}>
          {data.state === 'verified'
            ? t.domainStateVerified
            : data.state === 'failed'
              ? t.domainStateFailed
              : t.domainStatePending}
        </Chip>
      </div>

      {data.state !== 'verified' && (
        <p className="mt-3 text-xs text-neutral-400">{t.domainPendingHelp}</p>
      )}

      {data.error && (
        <p className="mt-2 text-xs text-amber-300" role="status">
          {data.error}
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {data.records.map((r) => (
          <li
            key={`${r.type}-${r.name}`}
            className="rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] px-3 py-2 text-xs"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded-[var(--r-ctrl,4px)] bg-[var(--s3,#2f2732)] px-1.5 py-0.5 font-mono text-[10px] text-neutral-200">
                {r.type}
              </span>
              <span className="font-mono text-neutral-200 break-all">
                {r.name}
              </span>
            </div>
            <div className="mt-1 font-mono text-neutral-400 break-all">
              {r.value}
            </div>
            <div className="mt-0.5 text-neutral-500">{r.why}</div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <AdminButton
          variant="ghost"
          size="xs"
          type="button"
          onClick={verify}
          disabled={busy}
          data-testid="tenant-domain-verify"
        >
          {busy ? t.domainChecking : t.domainCheckCta}
        </AdminButton>
        {data.checkedAt && (
          <span className="text-[11px] text-neutral-500">
            {format(t.domainCheckedAt, {
              date: new Date(data.checkedAt).toLocaleString('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            })}
          </span>
        )}
      </div>
    </section>
  );
}
