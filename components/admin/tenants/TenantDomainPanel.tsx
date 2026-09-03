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

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTenantDetail from '@/lib/i18n/locales/admin-fr/adminTenantDetail';

type DomainRecord = {
  type: string;
  name: string;
  value: string;
  why: string;
};

type DomainState = {
  domain: string | null;
  state: 'pending' | 'verified' | 'failed' | null;
  checkedAt: string | null;
  error: string | null;
  records: DomainRecord[];
};

export default function TenantDomainPanel({ tenantId }: { tenantId: string }) {
  const t = useAdminT(nsAdminTenantDetail);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();

  const [data, setData] = useState<DomainState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(
        await adminFetchJson<DomainState>(
          `/api/admin/tenants/${tenantId}/domain`
        )
      );
    } catch {
      setData(null);
    }
  }, [adminFetchJson, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = async () => {
    setBusy(true);
    try {
      const resp = await mutateJson<DomainState>(
        `/api/admin/tenants/${tenantId}/domain`,
        { method: 'POST' }
      );
      setData(resp);
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

  const badge =
    data.state === 'verified'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : data.state === 'failed'
        ? 'border-red-500/40 bg-red-500/10 text-red-300'
        : 'border-amber-500/40 bg-amber-500/10 text-amber-200';

  return (
    <section
      className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4"
      data-testid="tenant-domain"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-400">
            {t.domainHeading}
          </h2>
          <p className="mt-1 font-mono text-sm text-white">{data.domain}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${badge}`}>
          {data.state === 'verified'
            ? t.domainStateVerified
            : data.state === 'failed'
              ? t.domainStateFailed
              : t.domainStatePending}
        </span>
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
            className="rounded-lg bg-neutral-900/50 px-3 py-2 text-xs"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-neutral-700/60 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200">
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
        <button
          type="button"
          onClick={verify}
          disabled={busy}
          className="rounded-lg border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-400 disabled:opacity-50"
          data-testid="tenant-domain-verify"
        >
          {busy ? t.domainChecking : t.domainCheckCta}
        </button>
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
