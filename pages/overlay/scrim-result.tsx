// pages/overlay/scrim-result.tsx
//
// LA SOURCE NAVIGATEUR « RÉSULTAT DE SCRIM » — les deux équipes, le score et
// le vainqueur, sur fond transparent, à poser dans la scène de fin de scrim.
//
// URL :
//   /overlay/scrim-result                  → le scrim du moment (en cours,
//                                            sinon le dernier clos < 24 h)
//   /overlay/scrim-result?scrim=<slug|id>  → ce scrim précis
//
// Paramètres :
//   scrim   `latest` (défaut), identifiant ou slug
//   accent  RRGGBB, sinon la couleur de l'espace, sinon le jaune de la Coupe
//   scale   0.5 → 2
//   tenant  slug d'espace, pour les sources d'un autre organisateur
//
// Le score vient du site : il apparaît dès que les deux capitaines l'ont
// validé ou que le staff l'a saisi (rafraîchi toutes les 10 s). La carte
// remplit la source : réglez la source OBS aux dimensions de son encart.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import { useOverlayPoll } from '@/hooks/useOverlayPoll';
import { DEFAULT_OVERLAY_ACCENT } from '@/components/overlay/match/MatchSources';
import { ScrimResultSource } from '@/components/overlay/match/ScrimResultSource';
import type { OverlayScrimResultResponse } from '@/pages/api/overlay/scrim-result';
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

export default function ScrimResultOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlay);

  const params = new URLSearchParams();
  for (const key of ['scrim', 'tenant'] as const) {
    const v = firstParam(router.query[key]);
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  const url = router.isReady
    ? `/api/overlay/scrim-result${qs ? `?${qs}` : ''}`
    : null;

  const { data, fatal } = useOverlayPoll<OverlayScrimResultResponse>(url, {
    intervalMs: 10_000,
  });

  const accent =
    parseAccent(firstParam(router.query.accent)) ??
    data?.branding?.accent ??
    DEFAULT_OVERLAY_ACCENT;

  return (
    <>
      <Head>
        <title>{t.scrimResultDocTitle}</title>
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
          <div className="flex h-full w-full items-center justify-center p-16">
            <p className="max-w-3xl rounded-2xl border border-red-500/40 bg-black/85 px-10 py-8 text-center text-2xl font-semibold text-red-200">
              {fatal}
            </p>
          </div>
        ) : (
          <ScrimResultSource
            payload={data}
            accent={accent}
            scale={parseScale(firstParam(router.query.scale))}
          />
        )}
      </div>
    </>
  );
}
