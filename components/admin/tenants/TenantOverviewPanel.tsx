// components/admin/tenants/TenantOverviewPanel.tsx
//
// « Il se passe quoi, dans cet espace ? »
//
// Les trois onglets existants — Général, Discord, Staff — montrent ce qu'on
// peut CHANGER. Aucun ne dit ce qui se passe : un espace créé il y a trois
// semaines et jamais utilisé présente exactement la même fiche qu'un espace en
// pleine saison.
//
// Trois bandes, dans l'ordre où la question se pose :
//   1. les signes de vie — quatre dates, et ce qu'elles disent ;
//   2. la volumétrie — ce que l'espace contient ;
//   3. la situation — plan, essai, et ce qui manque encore.
//
// Une lecture indisponible s'affiche comme telle. `null` (la requête a échoué)
// et `0` (il n'y a rien) ne sont pas la même information, et confondre les deux
// sur un écran de supervision, c'est annoncer un espace mort qui va très bien.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import nsAdminTenantDetail from '@/lib/i18n/locales/admin-fr/adminTenantDetail';

type Dict = typeof nsAdminTenantDetail.fr;

type Overview = {
  lifeSigns: Record<string, string | null>;
  volumes: Record<string, number | null>;
  plan: {
    plan: string;
    effectivePlan: string;
    status: string;
    expiresAt: string | null;
    isTrial: boolean;
    daysRemaining: number | null;
    botEnabled: boolean;
  };
  readiness: {
    blockers: string[];
    guildCount: number;
    staffCount: number;
    configuredKeys: number;
    hasEmailSender: boolean;
  };
  limits: Array<{ key: string; used: number; max: number | null }>;
  createdAt: string;
};

/** Au-delà, la ligne passe à l'ambre : trente jours sans signe, c'est un signe. */
const STALE_DAYS = 30;
const DAY_MS = 86_400_000;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
}

function relative(iso: string, t: Dict): string {
  const d = daysSince(iso);
  if (d <= 0) return t.overviewToday;
  if (d === 1) return t.overviewYesterday;
  if (d < 30) return format(t.overviewDaysAgo, { n: d });
  if (d < 365) return format(t.overviewMonthsAgo, { n: Math.floor(d / 30) });
  return format(t.overviewYearsAgo, { n: Math.floor(d / 365) });
}

/**
 * Libellé d'un manque. Table explicite plutôt qu'une clé construite : une clé
 * i18n calculée à l'exécution échappe au garde-fou de parité FR/EN, et le jour
 * où un critère s'ajoute, l'écran affiche son slug technique sans que rien ne
 * casse.
 */
function blockerLabel(slug: string, t: Dict): string {
  switch (slug) {
    case 'inactive':
      return t.overviewBlockerInactive;
    case 'plan_sans_bot':
      return t.overviewBlockerNoPlan;
    case 'aucun_serveur':
      return t.overviewBlockerNoGuild;
    case 'personne_rattache':
      return t.overviewBlockerNoStaff;
    case 'discord_non_configure':
      return t.overviewBlockerNoConfig;
    case 'emails_non_configures':
      return t.overviewBlockerNoEmail;
    default:
      return slug;
  }
}

function Card({
  label,
  children,
  tone = 'plain',
}: {
  label: string;
  children: React.ReactNode;
  tone?: 'plain' | 'stale' | 'muted';
}) {
  const border =
    tone === 'stale'
      ? 'border-amber-500/40'
      : tone === 'muted'
        ? 'border-neutral-700/50'
        : 'border-neutral-700/50';
  return (
    <div
      className={`rounded-xl border ${border} bg-neutral-900/40 px-4 py-3 min-w-0`}
    >
      <div className="text-xs text-neutral-500">{label}</div>
      <div
        className={`mt-1 text-sm font-medium ${
          tone === 'stale'
            ? 'text-amber-300'
            : tone === 'muted'
              ? 'text-neutral-500'
              : 'text-white'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default function TenantOverviewPanel({
  tenantId,
  onOpenTab,
}: {
  tenantId: string;
  /** Renvoi vers un autre onglet de la fiche (Discord, Staff). */
  onOpenTab?: (tab: string) => void;
}) {
  const t = useAdminT(nsAdminTenantDetail);
  const { adminFetchJson } = useAdminFetch();

  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(
        await adminFetchJson<Overview>(
          `/api/admin/tenants/${tenantId}/overview`
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t.overviewLoadError);
    }
  }, [adminFetchJson, tenantId, t.overviewLoadError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <AlertBanner message={error} />;
  if (!data) {
    return <p className="text-sm text-neutral-400">{t.overviewLoading}</p>;
  }

  const signLabels: Array<[string, string]> = [
    ['botEvent', t.overviewSignBot],
    ['matchPlayed', t.overviewSignMatch],
    ['staffAction', t.overviewSignStaff],
    ['apiCall', t.overviewSignApi],
  ];
  const volumeLabels: Array<[string, string]> = [
    ['teams', t.overviewVolTeams],
    ['members', t.overviewVolMembers],
    ['tournaments', t.overviewVolTournaments],
    ['matches', t.overviewVolMatches],
    ['openTickets', t.overviewVolTickets],
  ];

  // Un espace qui n'a JAMAIS rien fait mérite une phrase, pas quatre tirets
  // alignés : c'est un diagnostic, pas une absence de données.
  const neverUsed = signLabels.every(([k]) => !data.lifeSigns[k]);

  return (
    <div className="space-y-6" data-testid="tenant-overview">
      <section>
        <h2 className="text-sm font-semibold text-neutral-400 mb-2">
          {t.overviewLifeTitle}
        </h2>
        {neverUsed ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {format(t.overviewNeverUsed, {
              days: daysSince(data.createdAt),
            })}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {signLabels.map(([key, label]) => {
              const iso = data.lifeSigns[key];
              if (iso === null || iso === undefined) {
                return (
                  <Card key={key} label={label} tone="muted">
                    {t.overviewNever}
                  </Card>
                );
              }
              const stale = daysSince(iso) >= STALE_DAYS;
              return (
                <Card key={key} label={label} tone={stale ? 'stale' : 'plain'}>
                  {relative(iso, t)}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-neutral-400 mb-2">
          {t.overviewVolumesTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {volumeLabels.map(([key, label]) => {
            const n = data.volumes[key];
            return (
              <Card
                key={key}
                label={label}
                tone={n === null ? 'muted' : 'plain'}
              >
                {n === null ? t.overviewUnavailable : n.toLocaleString('fr-FR')}
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-neutral-400 mb-2">
          {t.overviewSituationTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card label={t.overviewPlanLabel}>
            {data.plan.plan}
            {data.plan.effectivePlan !== data.plan.plan && (
              // Le plan facturé et le plan appliqué peuvent différer : dire
              // « circuit » sur un espace retombé en discovery serait un
              // mensonge par omission.
              <span className="ml-2 text-xs text-amber-300">
                {format(t.overviewPlanDowngraded, {
                  plan: data.plan.effectivePlan,
                })}
              </span>
            )}
          </Card>
          <Card
            label={t.overviewBotLabel}
            tone={data.plan.botEnabled ? 'plain' : 'stale'}
          >
            {data.plan.botEnabled ? t.overviewBotOn : t.overviewBotOff}
          </Card>
          <Card
            label={t.overviewExpiryLabel}
            tone={
              data.plan.daysRemaining !== null && data.plan.daysRemaining <= 14
                ? 'stale'
                : 'plain'
            }
          >
            {data.plan.daysRemaining === null
              ? t.overviewNoExpiry
              : format(
                  data.plan.isTrial ? t.overviewTrialDays : t.overviewPlanDays,
                  { n: data.plan.daysRemaining }
                )}
          </Card>
          {(data.limits ?? []).map((l) => (
            <Card
              key={l.key}
              label={t.overviewLimitLeagues}
              tone={l.max !== null && l.used >= l.max ? 'stale' : 'plain'}
            >
              {l.max === null
                ? format(t.overviewLimitUnlimited, { used: l.used })
                : format(t.overviewLimitUsed, { used: l.used, max: l.max })}
            </Card>
          ))}
          <Card
            label={t.overviewBlockersLabel}
            tone={data.readiness.blockers.length > 0 ? 'stale' : 'plain'}
          >
            {data.readiness.blockers.length === 0
              ? t.overviewNoBlocker
              : format(t.overviewBlockerCount, {
                  n: data.readiness.blockers.length,
                })}
          </Card>
        </div>

        {data.readiness.blockers.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.readiness.blockers.map((b) => (
              <li
                key={b}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
              >
                {blockerLabel(b, t)}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-neutral-500">
          {onOpenTab ? (
            <>
              <button
                type="button"
                onClick={() => onOpenTab('discord')}
                className="underline hover:text-neutral-300"
              >
                {format(t.overviewGuildCount, { n: data.readiness.guildCount })}
              </button>
              {' · '}
              <button
                type="button"
                onClick={() => onOpenTab('staff')}
                className="underline hover:text-neutral-300"
              >
                {format(t.overviewStaffCount, { n: data.readiness.staffCount })}
              </button>
            </>
          ) : (
            <>
              {format(t.overviewGuildCount, { n: data.readiness.guildCount })}
              {' · '}
              {format(t.overviewStaffCount, { n: data.readiness.staffCount })}
            </>
          )}
          {' · '}
          <Link
            href="/admin/onboarding?tab=espaces"
            className="underline hover:text-neutral-300"
          >
            {t.overviewReadinessLink}
          </Link>
        </p>
      </section>
    </div>
  );
}
