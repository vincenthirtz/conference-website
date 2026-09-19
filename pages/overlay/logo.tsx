// pages/overlay/logo.tsx
//
// LA SOURCE NAVIGATEUR « LOGO QUI PULSE » — le logo de la Cup entouré du pulse
// violet de la charte, à coller une fois dans OBS.
//
// URL :
//   /overlay/logo
//
// Paramètres (tous optionnels) :
//   size    taille du logo en px, 64 → 720 (256 par défaut)
//   gap     silence entre deux battements en ms, 0 → 60000 (3600 par défaut) ;
//           `0` enchaîne les battements sans pause
//   logo    URL d'une autre image (même origine : /img/…), pour un espace qui
//           n'est pas la Cup
//   glow    `off` retire le halo violet sous le logo
//
// CE QUI LA DISTINGUE DE LA NAVBAR. Le pulse de la navbar ne s'allume QUE
// quand la chaîne est en direct — c'est son rôle, signaler l'antenne. Ici il
// tourne toujours : une source d'habillage n'a pas à deviner l'état du stream,
// c'est OBS qui décide quand la scène est à l'écran.
//
// Rendue sans chrome par `_app.tsx` (préfixe `/overlay`), fond transparent,
// `noindex`. Aucune donnée, aucun appel réseau : elle marche hors ligne, ce qui
// est exactement ce qu'on veut d'un habillage un soir de diffusion.

import Head from 'next/head';
import { useRouter } from 'next/router';
import PulseCanvas from '@/components/brand/PulseCanvas';

const DEFAULT_LOGO = '/img/logos/2026-logo.png';
const DEFAULT_SIZE = 256;
const DEFAULT_GAP_MS = 3_600;

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseSize(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_SIZE;
  return Math.min(720, Math.max(64, n));
}

export function parseGap(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_GAP_MS;
  return Math.min(60_000, Math.max(0, n));
}

/**
 * Image du logo. Une URL EXTERNE est refusée : une source OBS qui accepte
 * n'importe quelle adresse en paramètre affiche n'importe quoi à l'antenne, et
 * la page est publique.
 */
export function parseLogo(raw: string | undefined): string {
  if (!raw) return DEFAULT_LOGO;
  return /^\/(img|uploads)\/[\w\-./]+\.(png|jpg|jpeg|webp|svg)$/i.test(raw)
    ? raw
    : DEFAULT_LOGO;
}

export default function LogoOverlayPage() {
  const router = useRouter();

  const size = parseSize(firstParam(router.query.size));
  const gapMs = parseGap(firstParam(router.query.gap));
  const logo = parseLogo(firstParam(router.query.logo));
  const glow = firstParam(router.query.glow) !== 'off';

  // Le pulse encadre le logo : la même proportion que dans la navbar (crochets
  // à ~1,4 × la largeur du logo, hauteur ~1,4 ×), pour que le cadrage reste le
  // même quelle que soit la taille demandée.
  const pulseW = Math.round(size * 2);
  const pulseH = Math.round(size * 1.38);

  return (
    <>
      <Head>
        <title>Logo — habillage</title>
        <meta name="robots" content="noindex" />
      </Head>
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }
      `}</style>

      <div className="flex h-screen w-screen items-center justify-center overflow-hidden">
        <div
          className="relative flex items-center justify-center"
          style={{ width: pulseW, height: pulseH }}
        >
          {glow && (
            <span
              aria-hidden
              className="absolute rounded-full"
              style={{
                width: size * 1.15,
                height: size * 1.15,
                background:
                  'radial-gradient(circle, rgba(166,46,219,0.35) 0%, rgba(166,46,219,0) 70%)',
              }}
            />
          )}
          {/* biome-ignore lint/performance/noImgElement: l'optimiseur d'images
              est une dépendance de plus à l'antenne, pour une image locale de
              taille fixe — une source OBS doit tenir sans lui. */}
          <img
            src={logo}
            alt=""
            width={size}
            height={size}
            className="relative object-contain"
            style={{ width: size, height: size }}
          />
          <PulseCanvas
            testId="overlay-logo-pulse"
            gapMs={gapMs}
            style={{ width: pulseW, height: pulseH }}
          />
        </div>
      </div>
    </>
  );
}
