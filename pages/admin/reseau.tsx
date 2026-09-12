// pages/admin/reseau.tsx
//
// L'ENTONNOIR DU RÉSEAU — lot 10 de docs/BACKLOG-reseau-social.md.
//
// Pourquoi cette page existe : on a construit un annuaire opt-in, un graphe de
// suivi, deux marchés et un parcours scrim complet sans jamais pouvoir dire où
// les gens décrochent. Le chiffre décisif — combien de joueuses sont
// réellement découvrables — demandait une requête SQL à la main. Un chiffre
// qu'on ne peut pas voir est un chiffre que personne ne regarde.
//
// Deux partis pris d'affichage :
//   1. `null` n'est pas `0`. Un comptage en échec s'affiche « inconnu », jamais
//      zéro : confondre les deux ferait conclure à un réseau vide sur une
//      panne de lecture.
//   2. Le pourcentage se lit par rapport à l'ÉTAPE PRÉCÉDENTE, pas au total.
//      C'est la marche qu'on cherche à voir, pas un taux global qui écrase
//      tout.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { format } from '@/lib/i18n/useT';
import type { StaffProps } from '@/types/admin';
import type { NetworkFunnel } from '@/pages/api/admin/network-funnel';
import nsAdminNetworkFunnel from '@/lib/i18n/locales/admin-fr/adminNetworkFunnel';

// Garde par PERMISSION et non par rôle : `manage_settings`, la même que les
// journaux et les paramètres du site. L'entonnoir est de l'observabilité, pas
// de la compétition — `manage_tournaments` (garde de /admin/stats) serait un
// contresens. Un garde-fou dédié refuse d'ailleurs les pages admin gardées par
// simple rôle (tests/unit/adminPageGuards).
export const getServerSideProps = withStaffPage({
  permission: 'manage_settings',
});

type Dict = typeof nsAdminNetworkFunnel.fr;

type Step = {
  key: string;
  label: string;
  hint: string;
  value: number | null;
  /** Étape de référence pour le pourcentage (l'étape précédente). */
  base: number | null;
  scope: 'global' | 'tenant';
};

function buildSteps(t: Dict, d: NetworkFunnel): Step[] {
  return [
    {
      key: 'accounts',
      label: t.stepAccounts,
      hint: t.stepAccountsHint,
      value: d.accounts,
      base: null,
      scope: 'global',
    },
    {
      key: 'discord',
      label: t.stepDiscord,
      hint: t.stepDiscordHint,
      value: d.discordLinkedGlobal,
      base: d.accounts,
      scope: 'global',
    },
    {
      key: 'battlenet',
      label: t.stepBattlenet,
      hint: t.stepBattlenetHint,
      value: d.battlenetLinkedGlobal,
      base: d.accounts,
      scope: 'global',
    },
    {
      key: 'profiles',
      label: t.stepProfiles,
      hint: t.stepProfilesHint,
      value: d.discoveryProfilesGlobal,
      base: d.accounts,
      scope: 'global',
    },
    {
      key: 'discoverable',
      label: t.stepDiscoverable,
      hint: t.stepDiscoverableHint,
      value: d.discoverableGlobal,
      base: d.discoveryProfilesGlobal,
      scope: 'global',
    },
    {
      key: 'follows',
      label: t.stepFollows,
      hint: t.stepFollowsHint,
      value: d.followsGlobal,
      base: d.discoverableGlobal,
      scope: 'global',
    },
    {
      key: 'scrims',
      label: t.stepScrims,
      hint: t.stepScrimsHint,
      value: d.scrimRequests,
      base: null,
      scope: 'tenant',
    },
  ];
}

/** Pourcentage par rapport à l'étape précédente, ou null si indéterminable. */
function pctOfBase(value: number | null, base: number | null): number | null {
  if (value === null || base === null || base <= 0) return null;
  return Math.round((value / base) * 100);
}

function Figure({ value, unknown }: { value: number | null; unknown: string }) {
  if (value === null) {
    return (
      <span className="text-2xl font-bold text-neutral-500">{unknown}</span>
    );
  }
  return <span className="text-3xl font-bold text-white">{value}</span>;
}

// La page ne lit pas `staff` : la garde est côté serveur (withStaffPage) et
// côté route. On accepte donc les props sans les destructurer.
export default function AdminNetworkFunnelPage(_props: StaffProps) {
  const t = useAdminT(nsAdminNetworkFunnel);
  const { adminFetchJson } = useAdminFetch({ loginPath: '/admin/login' });

  const [data, setData] = useState<NetworkFunnel | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await adminFetchJson<NetworkFunnel>('/api/admin/network-funnel'));
    } catch {
      setFailed(true);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const steps = data ? buildSteps(t, data) : [];

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="mx-auto max-w-4xl px-4 py-8 text-white">
        <h1 className="text-2xl font-bold">{t.heading}</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">{t.subtitle}</p>

        {!data && !failed && (
          <p className="mt-8 text-sm text-neutral-400">{t.loading}</p>
        )}

        {failed && (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-4"
          >
            <p className="text-sm text-red-200">{t.loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 text-sm font-semibold text-red-100 underline underline-offset-2"
            >
              {t.retry}
            </button>
          </div>
        )}

        {data && (
          <>
            <h2 className="mt-8 text-sm font-semibold uppercase tracking-widest text-neutral-400">
              {t.stepsHeading}
            </h2>
            <ol className="mt-4 space-y-3">
              {steps.map((step) => {
                const pct = pctOfBase(step.value, step.base);
                return (
                  <li
                    key={step.key}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white">{step.label}</p>
                        <p className="mt-1 text-xs text-neutral-400">
                          {step.hint}
                        </p>
                      </div>
                      <div className="text-right">
                        <Figure value={step.value} unknown={t.unknown} />
                        <p className="mt-1 text-xs text-neutral-500">
                          {step.scope === 'global'
                            ? t.scopeGlobal
                            : t.scopeTenant}
                          {pct !== null && (
                            <> · {format(t.ofPrevious, { pct })}</>
                          )}
                        </p>
                      </div>
                    </div>
                    {step.value === null && (
                      <p className="mt-2 text-xs text-amber-300">
                        {t.unknownHint}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>

            <h2 className="mt-10 text-sm font-semibold uppercase tracking-widest text-neutral-400">
              {t.marketsHeading}
            </h2>
            <p className="mt-2 text-xs text-neutral-400">{t.marketsHint}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-neutral-300">
                  {t.marketFreePlayers}
                </p>
                <Figure value={data.freePlayers} unknown={t.unknown} />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-neutral-300">
                  {t.marketTeamOpenings}
                </p>
                <Figure value={data.teamOpenings} unknown={t.unknown} />
              </div>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {t.marketsActiveOnly}
            </p>
          </>
        )}
      </div>
    </>
  );
}
