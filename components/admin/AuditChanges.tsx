// components/admin/AuditChanges.tsx — ce qu'un geste staff a changé, lisible
// (lot L8, docs/PLAN-industrialisation-admin.md).
//
// Le journal affichait le payload en JSON brut ; depuis L8, les routes
// déclaratives y écrivent `changes` (mise à jour), `after` (création) ou
// `before` (suppression). On les rend en « champ : avant → après ». Le reste
// du payload reste consultable, replié, sous « Détails bruts ».

import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminEntityHistory from '@/lib/i18n/locales/admin-fr/adminEntityHistory';
import type { AuditChanges } from '@/utils/admin/auditDiff';

type Payload = Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isChanges(v: unknown): v is AuditChanges {
  return (
    isRecord(v) &&
    Object.values(v).every((c) => isRecord(c) && 'from' in c && 'to' in c)
  );
}

export default function AuditChangesView({ payload }: { payload: Payload }) {
  const t = useAdminT(nsAdminEntityHistory);

  const show = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return t.emptyValue;
    if (v === true) return t.yes;
    if (v === false) return t.no;
    return typeof v === 'string' ? v : JSON.stringify(v);
  };

  const { changes, before, after, ...rest } = payload;
  const hasStructured =
    isChanges(changes) || isRecord(before) || isRecord(after);

  return (
    <div className="space-y-2 border-t border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3 text-xs text-[var(--t2,#c7bfca)]">
      {isChanges(changes) && Object.keys(changes).length > 0 && (
        <section aria-label={t.changesTitle}>
          <p className="mb-1 font-semibold text-neutral-400">
            {t.changesTitle}
          </p>
          <dl className="space-y-1">
            {Object.entries(changes).map(([field, c]) => (
              <div key={field} className="flex flex-wrap gap-x-2">
                <dt className="font-mono text-neutral-500">{field}</dt>
                <dd>
                  <del className="text-red-300/80">{show(c.from)}</del>
                  <span aria-hidden="true"> → </span>
                  <ins className="text-emerald-300 no-underline">
                    {show(c.to)}
                  </ins>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {[
        { key: 'after', title: t.createdTitle, value: after },
        { key: 'before', title: t.deletedTitle, value: before },
      ].map(
        (s) =>
          isRecord(s.value) && (
            <section key={s.key} aria-label={s.title}>
              <p className="mb-1 font-semibold text-neutral-400">{s.title}</p>
              <dl className="space-y-1">
                {Object.entries(s.value).map(([field, v]) => (
                  <div key={field} className="flex flex-wrap gap-x-2">
                    <dt className="font-mono text-neutral-500">{field}</dt>
                    <dd>{show(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )
      )}
      {(!hasStructured || Object.keys(rest).length > 0) && (
        <details open={!hasStructured}>
          <summary className="cursor-pointer text-neutral-500">
            {t.rawDetails}
          </summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px]">
            {JSON.stringify(hasStructured ? rest : payload, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
