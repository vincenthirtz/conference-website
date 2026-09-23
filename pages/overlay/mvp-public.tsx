// pages/overlay/mvp-public.tsx
//
// LA SOURCE NAVIGATEUR « COUP DE CŒUR DU PUBLIC » — le vote des viewers Twitch
// et des supporters Discord, en direct, sur fond transparent.
//
// URL :
//   /overlay/mvp-public
//
// Paramètres :
//   position  top · center (défaut) · bottom
//   scale   0.5 → 2
//   accent  RRGGBB (défaut : le violet du scrutin public)
//   limit   nombre de candidates affichées (défaut 10)
//   tenant  slug d'espace, pour les sources d'un autre organisateur
//
// À COLLER UNE FOIS POUR LA SOIRÉE. La source rend le scrutin OUVERT du
// moment, quel que soit le match : entre deux matchs, on ne recolle pas une
// URL dans OBS. Quand aucun vote n'est en cours, elle n'affiche RIEN — la
// scène peut donc la garder en permanence.
//
// LE RÉSULTAT RESTE TROIS MINUTES après la clôture, le temps de l'annoncer.
// Ensuite l'écran se vide tout seul.
//
// RAFRAÎCHI TOUTES LES 3 SECONDES, plus vite que les autres sources (5 à 15 s).
// Un vote qui dure dix minutes et qu'on commente en direct doit monter à l'œil ;
// un décompte en retard de quinze secondes ferait dire une bêtise au
// commentaire. Le compte à rebours, lui, est LOCAL et ne coûte aucune requête.
//
// Taille conseillée de la source OBS : 1920×1080. Rendue sans chrome par
// `_app.tsx`, `noindex`.

import Head from 'next/head';
import { useRouter } from 'next/router';

import { useT } from '@/lib/i18n/useT';
import { LIVE_OVERLAY_POLL_MS, useOverlayPoll } from '@/hooks/useOverlayPoll';
import { PublicMvpSource } from '@/components/overlay/match/PublicMvpSource';
import type { OverlayPublicMvpResponse } from '@/pages/api/overlay/mvp-public';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';

/** Le violet du scrutin public, le même que l'embed Discord. */
const DEFAULT_ACCENT = '#ba18ff';

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseScale(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.5, n));
}

function parseAccent(raw: string | undefined): string {
  if (!raw) return DEFAULT_ACCENT;
  const value = raw.startsWith('#') ? raw.slice(1) : raw;
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value}` : DEFAULT_ACCENT;
}

function parsePosition(raw: string | undefined): 'top' | 'center' | 'bottom' {
  return raw === 'top' || raw === 'bottom' ? raw : 'center';
}

function parseLimit(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return 10;
  return Math.min(25, Math.max(2, n));
}

export default function PublicMvpOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlay);
  const tenant = firstParam(router.query.tenant);

  const url = router.isReady
    ? `/api/overlay/mvp-public${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''}`
    : null;

  const { data, fatal } = useOverlayPoll<OverlayPublicMvpResponse>(url, {
    intervalMs: LIVE_OVERLAY_POLL_MS,
  });

  return (
    <>
      <Head>
        <title>{t.publicMvpDocTitle}</title>
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
          <PublicMvpSource
            poll={data?.poll ?? null}
            scale={parseScale(firstParam(router.query.scale))}
            accent={parseAccent(firstParam(router.query.accent))}
            limit={parseLimit(firstParam(router.query.limit))}
            position={parsePosition(firstParam(router.query.position))}
          />
        )}
      </div>
    </>
  );
}
