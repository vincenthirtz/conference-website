// pages/overlay/don.tsx
//
// LA SOURCE NAVIGATEUR « FAIRE UN DON » — le QR code HelloAsso de
// l'association, à poser dans une scène OBS (pause, attente, fin de stream).
//
// C'est le MÊME QR que la page /don (`public/images/qr.png`) : un seul fichier
// à remplacer si la campagne HelloAsso change. Page statique, sans API ni
// polling — rien à mettre à jour pendant un direct.
//
// URL :
//   /overlay/don
//
// Paramètres :
//   layout  card (défaut, panneau centré) · corner (encart bas-droite, à
//           laisser pendant le jeu)
//   title   accroche (80 caractères max.), sinon « Soutenez l'association »
//   accent  RRGGBB, sinon le jaune de la Coupe
//   scale   0.5 → 2
//
// Le QR est TOUJOURS posé sur fond blanc : un QR sur fond sombre ou
// transparent ne se scanne pas depuis un téléphone pointé sur un écran.

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import { DEFAULT_OVERLAY_ACCENT } from '@/components/overlay/match/MatchSources';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';

const QR_SRC = '/images/qr.png';
const LOGO_SRC = '/img/logos/2026-logo.png';
/** Lisible à l'antenne, et tapable par qui ne peut pas scanner. */
const DONATION_URL_LABEL = 'owwomenscup.fr/don';

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

/** Cadre de conception : tout est dessiné en 1920×1080 puis mis à l'échelle. */
const STAGE_W = 1920;
const STAGE_H = 1080;

/**
 * Facteur qui fait tenir le cadre 1920×1080 dans la fenêtre de la source.
 *
 * Une source navigateur OBS n'a pas forcément la taille du stream (800×600 par
 * défaut). Mise en page en pixels dans une fenêtre plus petite, le panneau
 * débordait et `overflow-hidden` coupait l'accroche. On dessine donc toujours
 * sur le même cadre, qu'on réduit en bloc : rien ne se déforme ni ne se coupe.
 */
function useStageFit(): number {
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const update = () =>
      setFit(
        Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
      );
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return fit;
}

export default function DonationOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlay);

  const corner = firstParam(router.query.layout) === 'corner';
  const accent =
    parseAccent(firstParam(router.query.accent)) ?? DEFAULT_OVERLAY_ACCENT;
  const scale = parseScale(firstParam(router.query.scale));
  const title =
    firstParam(router.query.title)?.trim().slice(0, 80) || t.donTitle;
  const fit = useStageFit();

  return (
    <>
      <Head>
        <title>{t.donDocTitle}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }
      `}</style>

      <div className="relative h-screen w-screen overflow-hidden text-white">
        <div
          className="absolute left-1/2 top-1/2 origin-center"
          style={{
            width: STAGE_W,
            height: STAGE_H,
            // Centré dans la fenêtre : quand ses proportions ne sont pas 16:9
            // (800×600), le cadre réduit laisse une marge des deux côtés
            // plutôt que tout en bas.
            transform: `translate(-50%, -50%) scale(${fit})`,
          }}
        >
          {corner ? (
            <div
              className="absolute bottom-10 right-10 flex origin-bottom-right items-center gap-5 rounded-2xl border border-white/10 bg-black/85 p-4 pr-6 shadow-2xl"
              style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}
            >
              <div className="shrink-0 rounded-xl bg-white p-2">
                {/* biome-ignore lint/performance/noImgElement: source OBS — pas de next/image */}
                <img
                  src={QR_SRC}
                  alt={t.donQrAlt}
                  width={144}
                  height={144}
                  className="block aspect-square h-36 w-36 object-contain [image-rendering:pixelated]"
                />
              </div>
              <div className="w-[18rem]">
                <div
                  className="text-sm font-bold uppercase tracking-[0.2em]"
                  style={{ color: accent }}
                >
                  {t.donEyebrow}
                </div>
                <div className="mt-1 text-2xl font-black leading-snug [text-wrap:balance]">
                  {title}
                </div>
                <div className="mt-2 text-base font-semibold text-white/70">
                  {DONATION_URL_LABEL}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div
                className="flex origin-center items-center gap-14 rounded-3xl border border-white/10 bg-black/85 p-12 shadow-2xl"
                style={{
                  transform: scale !== 1 ? `scale(${scale})` : undefined,
                }}
              >
                {/* `shrink-0` + carré imposé : un QR déformé par la flexbox ne
                  se scanne plus. */}
                <div className="shrink-0 rounded-2xl bg-white p-5">
                  {/* biome-ignore lint/performance/noImgElement: source OBS — pas de next/image */}
                  <img
                    src={QR_SRC}
                    alt={t.donQrAlt}
                    width={384}
                    height={384}
                    className="block aspect-square h-96 w-96 object-contain [image-rendering:pixelated]"
                  />
                </div>
                <div className="w-[36rem] shrink-0">
                  {/* biome-ignore lint/performance/noImgElement: source OBS — pas de next/image */}
                  <img src={LOGO_SRC} alt="" className="mb-8 h-24 w-auto" />
                  <div
                    className="text-xl font-bold uppercase tracking-[0.3em]"
                    style={{ color: accent }}
                  >
                    {t.donEyebrow}
                  </div>
                  <h1 className="mt-3 text-6xl font-black leading-[1.15] [text-wrap:balance]">
                    {title}
                  </h1>
                  <p className="mt-6 text-3xl text-white/75">{t.donBody}</p>
                  <p
                    className="mt-8 text-3xl font-bold"
                    style={{ color: accent }}
                  >
                    {DONATION_URL_LABEL}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
