// pages/overlay/scrims.tsx
//
// LA SOURCE NAVIGATEUR « SCRIMS À VENIR » — les prochains scrims publics, une
// ligne par scrim (horaire, logos, équipes) sur fond transparent, à coller une
// fois dans OBS.
//
// URL :
//   /overlay/scrims
//
// Paramètres :
//   days      horizon en jours, 1 → 60 (14 par défaut)
//   limit     1 → 10 lignes (6 par défaut)
//   position  top · center (défaut) · bottom — où les lignes se posent
//   accent    RRGGBB (couleur du jour), sinon la couleur de l'espace, sinon le
//             jaune de la Coupe
//   scale     0.5 → 2
//   tenant    slug d'espace, pour les sources d'un autre organisateur
//
// Le bloc de lignes s'agrandit pour remplir la source, quelle que soit sa
// taille : réglez la source OBS aux dimensions de l'encart où elle s'affiche
// (cf. listFit). Rendue sans chrome par `_app.tsx`, `noindex`. Restrictions :
// cf. `GET /api/overlay/scrims`.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { useOverlayPoll } from '@/hooks/useOverlayPoll';
import { DEFAULT_OVERLAY_ACCENT } from '@/components/overlay/match/MatchSources';
import {
  UpcomingScrimsSource,
  parseScrimsPosition,
} from '@/components/overlay/match/UpcomingScrimsSource';
import type { OverlayScrimsResponse } from '@/pages/api/overlay/scrims';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';

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

export default function ScrimsOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlay);
  const locale = useLocale();

  // Les paramètres de lecture passent tels quels à l'API, qui les borne.
  const params = new URLSearchParams();
  for (const key of ['days', 'limit', 'tenant'] as const) {
    const v = firstParam(router.query[key]);
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  const url = router.isReady
    ? `/api/overlay/scrims${qs ? `?${qs}` : ''}`
    : null;

  const { data, fatal } = useOverlayPoll<OverlayScrimsResponse>(url, {
    intervalMs: 30_000,
  });

  const accent =
    parseAccent(firstParam(router.query.accent)) ??
    data?.branding?.accent ??
    DEFAULT_OVERLAY_ACCENT;

  return (
    <>
      <Head>
        <title>{t.scrimsDocTitle}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }
      `}</style>

      <div className="relative h-screen w-screen overflow-hidden text-white">
        {fatal ? (
          // Erreur de configuration (palier, espace) : visible dans l'aperçu
          // OBS dès qu'on colle l'URL, pas découverte en direct.
          <div className="flex h-full w-full items-center justify-center p-16">
            <p className="max-w-3xl rounded-2xl border border-red-500/40 bg-black/85 px-10 py-8 text-center text-2xl font-semibold text-red-200">
              {fatal}
            </p>
          </div>
        ) : (
          <UpcomingScrimsSource
            payload={data}
            accent={accent}
            scale={parseScale(firstParam(router.query.scale))}
            position={parseScrimsPosition(firstParam(router.query.position))}
            locale={locale}
          />
        )}
      </div>
    </>
  );
}
