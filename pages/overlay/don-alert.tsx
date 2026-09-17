// pages/overlay/don-alert.tsx
//
// LA SOURCE NAVIGATEUR « ALERTE DON » — « Merci pour ce don de 10 € ! » à
// chaque don HelloAsso reçu, sur fond transparent. Streamlabs n'a pas
// d'intégration HelloAsso : cette source se pose à côté, dans la même scène.
//
// URL :
//   /overlay/don-alert                     → alertes seules
//   /overlay/don-alert?goal=500            → alertes + jauge « 123 € / 500 € »
//   /overlay/don-alert?goal=500&gauge=only → la jauge seule
//   /overlay/don-alert?demo=1              → faux dons, pour régler la scène
//
// Paramètres :
//   goal      objectif en euros (1 → 1 000 000), affiche la jauge
//   from      AAAA-MM-JJ, début du total de la jauge (défaut : aujourd'hui,
//             heure de Paris)
//   gauge     `only` : la jauge sans les alertes
//   duration  secondes d'affichage d'une alerte (8 par défaut, 3 → 30)
//   demo      `1` : AUCUN appel réseau, un faux don toutes les ~10 s
//   accent    RRGGBB, sinon la couleur de l'espace, sinon le jaune de la Coupe
//   scale     0.5 → 2
//   tenant    slug d'espace, pour les sources d'un autre organisateur
//
// Les dons déjà reçus quand la source s'ouvre ne sont PAS rejoués (sinon
// chaque changement de scène OBS relancerait une rafale d'alertes). Relevé
// toutes les 5 s. Jamais le nom du donateur : le montant seulement.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { useOverlayPoll } from '@/hooks/useOverlayPoll';
import { DEFAULT_OVERLAY_ACCENT } from '@/components/overlay/match/MatchSources';
import {
  DonationAlertSource,
  type DonationAlertFeed,
} from '@/components/overlay/match/DonationAlertSource';
import type { OverlayDonationsResponse } from '@/pages/api/overlay/donations';
import {
  DEMO_INTERVAL_MS,
  demoDonation,
  demoTotalCents,
  parseAlertDurationMs,
  parseGoalCents,
} from '@/utils/overlay/donAlert';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';

/** Logo de l'association, pour son propre espace (branding nul). */
const DEFAULT_LOGO_SRC = '/img/logos/2026-logo.png';
/** Premier faux don peu après l'ouverture, pour ne pas attendre 10 s. */
const DEMO_FIRST_MS = 2000;

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseAccent(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.startsWith('#') ? raw.slice(1) : raw;
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value}` : null;
}

function parseScale(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.5, n));
}

/**
 * MODE DÉMO — flux fabriqué, aucun réseau. Tenu à part du flux réel : la page
 * choisit l'un OU l'autre, jamais un mélange.
 */
function useDemoFeed(
  enabled: boolean,
  goalCents: number | null
): DonationAlertFeed | null {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const first = setTimeout(
      () => setCount((n) => Math.max(n, 1)),
      DEMO_FIRST_MS
    );
    const timer = setInterval(() => setCount((n) => n + 1), DEMO_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) return null;
    const nowMs = Date.now();
    const donations = [];
    for (let i = count - 1; i >= Math.max(0, count - 20); i -= 1) {
      donations.push(demoDonation(i, nowMs));
    }
    return {
      donations,
      totalCents: demoTotalCents(count, goalCents),
      serverTime: new Date(nowMs).toISOString(),
    };
  }, [enabled, count, goalCents]);
}

export default function DonationAlertOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlay);

  const demo = firstParam(router.query.demo) === '1';
  const gaugeOnly = firstParam(router.query.gauge) === 'only';
  const goalCents = parseGoalCents(firstParam(router.query.goal));
  const durationMs = parseAlertDurationMs(firstParam(router.query.duration));

  const params = new URLSearchParams();
  for (const key of ['from', 'tenant'] as const) {
    const v = firstParam(router.query[key]);
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  // Démo : pas d'URL, donc pas de polling du tout.
  const url =
    router.isReady && !demo
      ? `/api/overlay/donations${qs ? `?${qs}` : ''}`
      : null;

  const { data, fatal } = useOverlayPoll<OverlayDonationsResponse>(url, {
    intervalMs: 5000,
  });
  const demoFeed = useDemoFeed(router.isReady && demo, goalCents);
  const feed: DonationAlertFeed | null = demo ? demoFeed : data;

  const accent =
    parseAccent(firstParam(router.query.accent)) ??
    (demo ? null : data?.branding?.accent) ??
    DEFAULT_OVERLAY_ACCENT;
  // Branding nul = l'espace de la Coupe elle-même (cf. readTenantBranding).
  const logoSrc =
    !demo && data?.branding ? data.branding.logoUrl : DEFAULT_LOGO_SRC;

  const configError =
    !fatal && gaugeOnly && goalCents == null ? t.donAlertMissingGoal : null;
  const message = fatal ?? configError;

  return (
    <>
      <Head>
        <title>{t.donAlertDocTitle}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }
      `}</style>

      <div className="relative h-screen w-screen overflow-hidden text-white">
        {message ? (
          <div className="flex h-full w-full items-center justify-center p-16">
            <p className="max-w-3xl rounded-2xl border border-red-500/40 bg-black/85 px-10 py-8 text-center text-2xl font-semibold text-red-200">
              {message}
            </p>
          </div>
        ) : router.isReady ? (
          <DonationAlertSource
            feed={feed}
            accent={accent}
            scale={parseScale(firstParam(router.query.scale))}
            durationMs={durationMs}
            goalCents={goalCents}
            gaugeOnly={gaugeOnly}
            logoSrc={logoSrc}
            demo={demo}
          />
        ) : null}
      </div>
    </>
  );
}
