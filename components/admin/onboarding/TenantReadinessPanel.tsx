// components/admin/onboarding/TenantReadinessPanel.tsx
//
// Onglet « Espaces » du hub d'onboarding : l'état de mise en service de
// chaque espace.
//
// La liste des tenants dit ce qu'ils SONT. Celle-ci dit ce qui leur MANQUE —
// et chaque manque est un lien vers l'écran qui le règle. C'est la différence
// entre un inventaire et un plan d'action : un espace créé il y a trois
// semaines peut n'avoir jamais rien fait, sans que rien ne le signale, jusqu'au
// jour d'un match.
//
// Les manques sont classés du plus bloquant au plus secondaire (l'API les
// renvoie déjà dans cet ordre) : un espace sans serveur Discord ne fait rien du
// tout, un espace sans compte d'envoi fait presque tout.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import nsAdminOnboarding from '@/lib/i18n/locales/admin-fr/adminOnboarding';

type Dict = typeof nsAdminOnboarding.fr;

type TenantReadiness = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  plan: string;
  effectivePlan: string;
  planStatus: string;
  planExpiresAt: string | null;
  isTrial: boolean;
  daysRemaining: number | null;
  guildCount: number;
  configuredKeys: number;
  ownerCount: number;
  staffCount: number;
  hasBotSecrets: boolean;
  hasEmailSender: boolean;
  botEnabled: boolean;
  blockers: string[];
};

/** Libellé + destination de chaque manque. La destination compte autant que le libellé. */
function blockerMeta(
  blocker: string,
  tenantId: string,
  t: Dict
): { label: string; href: string | null } {
  switch (blocker) {
    case 'inactive':
      return { label: t.blockerInactive, href: `/admin/tenants/${tenantId}` };
    case 'plan_sans_bot':
      return { label: t.blockerNoPlan, href: `/admin/tenants/${tenantId}` };
    case 'aucun_serveur':
      return {
        label: t.blockerNoGuild,
        href: '/admin/onboarding?tab=guild-links',
      };
    case 'personne_rattache':
      return { label: t.blockerNoStaff, href: `/admin/tenants/${tenantId}` };
    case 'discord_non_configure':
      return { label: t.blockerNoConfig, href: `/admin/tenants/${tenantId}` };
    case 'emails_non_configures':
      return {
        label: t.blockerNoEmail,
        href: '/admin/site-settings?tab=email-sender',
      };
    default:
      return { label: blocker, href: null };
  }
}

function Pill({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
        ok
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          : 'border-neutral-600/50 bg-neutral-700/20 text-neutral-400'
      }`}
    >
      <span aria-hidden>{ok ? '✓' : '·'}</span>
      {label}
    </span>
  );
}

export default function TenantReadinessPanel() {
  const t = useAdminT(nsAdminOnboarding);
  const { adminFetchJson } = useAdminFetch();

  const [rows, setRows] = useState<TenantReadiness[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyBlocked, setOnlyBlocked] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await adminFetchJson<{ tenants: TenantReadiness[] }>(
        '/api/admin/tenants/readiness'
      );
      setRows(data.tenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.readinessLoadError);
      setRows([]);
    }
  }, [adminFetchJson, t.readinessLoadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => (rows ?? []).filter((r) => !onlyBlocked || r.blockers.length > 0),
    [rows, onlyBlocked]
  );

  const blockedCount = (rows ?? []).filter(
    (r) => r.blockers.length > 0
  ).length;

  if (rows === null) {
    return <p className="text-sm text-neutral-400">{t.readinessLoading}</p>;
  }

  return (
    <div>
      <AlertBanner message={error} variant="error" className="mb-4" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-400">
          {blockedCount === 0
            ? t.readinessAllReady
            : format(t.readinessBlockedCount, { count: blockedCount })}
        </p>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={onlyBlocked}
            onChange={(e) => setOnlyBlocked(e.target.checked)}
            className="rounded border-neutral-600 bg-neutral-900"
          />
          {t.readinessOnlyBlocked}
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          {t.readinessEmpty}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => {
            // Un essai qui se termine dans la semaine mérite d'être vu avant
            // qu'il se termine, pas après.
            const trialSoon =
              r.isTrial &&
              r.daysRemaining !== null &&
              r.daysRemaining <= 7 &&
              r.daysRemaining >= 0;

            return (
              <li
                key={r.id}
                className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-4"
                data-testid="tenant-readiness-row"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/tenants/${r.id}`}
                        className="text-base font-semibold text-white hover:text-violet-300"
                      >
                        {r.name}
                      </Link>
                      <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-400">
                        {r.slug}
                      </code>
                      {r.isTrial && (
                        <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs text-sky-200">
                          {r.daysRemaining !== null
                            ? format(t.readinessTrialDays, {
                                days: Math.max(0, r.daysRemaining),
                              })
                            : t.readinessTrial}
                        </span>
                      )}
                      {trialSoon && (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-100">
                          {t.readinessTrialEndingSoon}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Pill ok={r.botEnabled} label={t.criterionBot} />
                      <Pill
                        ok={r.guildCount > 0}
                        label={format(t.criterionGuilds, {
                          count: r.guildCount,
                        })}
                      />
                      <Pill
                        ok={r.configuredKeys > 0}
                        label={format(t.criterionConfig, {
                          count: r.configuredKeys,
                        })}
                      />
                      <Pill
                        ok={r.ownerCount > 0}
                        label={format(t.criterionOwners, {
                          count: r.ownerCount,
                        })}
                      />
                      <Pill ok={r.hasEmailSender} label={t.criterionEmail} />
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      r.blockers.length === 0
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'bg-amber-500/15 text-amber-100'
                    }`}
                  >
                    {r.blockers.length === 0
                      ? t.readinessReady
                      : format(t.readinessBlockers, {
                          count: r.blockers.length,
                        })}
                  </span>
                </div>

                {r.blockers.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {r.blockers.map((b) => {
                      const meta = blockerMeta(b, r.id, t);
                      return (
                        <li key={b}>
                          {meta.href ? (
                            <Link
                              href={meta.href}
                              className="inline-block rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1 text-xs text-amber-100 hover:border-amber-400/60"
                            >
                              {meta.label} →
                            </Link>
                          ) : (
                            <span className="inline-block rounded-lg border border-neutral-600/50 px-2.5 py-1 text-xs text-neutral-300">
                              {meta.label}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
