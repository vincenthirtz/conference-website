// components/Halloween/HalloweenDecor.tsx
//
// La décoration d'Halloween du site public : toiles d'araignée accrochées
// sous l'en-tête (et leurs araignées qui descendent au bout d'un fil),
// chauves-souris, sorcière sur son balai, momie qui jette un œil depuis le
// bord, fantôme qui s'échappe des citrouilles.
//
// Tout vit dans un calque fixe qui ne capte aucun clic (`pointer-events:
// none`) et ne déborde jamais de l'écran. Les dessins sont des SVG en ligne,
// animés en CSS (styles/globals.css, bloc « Halloween ») : transformations
// seulement, figées sous `prefers-reduced-motion`.
//
// La grosse citrouille est un bouton : elle éteint la décoration (et la
// rallume). Un contenu qui bouge tout seul doit pouvoir être arrêté (WCAG
// 2.2.2). Le choix est mémorisé dans le navigateur pour l'édition en cours.

import { useId, useState } from 'react';
import { halloweenDecor } from '@/config/halloweenDecor';
import { useT } from '@/lib/i18n/useT';
import nsHalloweenDecor from '@/lib/i18n/locales/fr/halloweenDecor';

// La valeur stockée est le début de l'édition : un « éteint » de cette année
// ne s'applique pas à la suivante.
const STORAGE_KEY = 'wc.halloweenDecorOff';
const EDITION = halloweenDecor?.visibleFrom ?? '';

function readOff(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === EDITION;
  } catch {
    return false;
  }
}

function writeOff(off: boolean): void {
  try {
    if (off) window.localStorage.setItem(STORAGE_KEY, EDITION);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Stockage indisponible (navigation privée…) : le choix vaut pour la page.
  }
}

// ── Toile : rayons depuis le coin, fils en arcs qui pendent vers lui ──────

const WEB_SPOKES = [0, 15, 30, 45, 60, 75, 90].map((d) => (d * Math.PI) / 180);
const WEB_RINGS = [26, 54, 86, 122, 162];
// Un fil tendu à la main n'est pas un compas : léger écart par rayon.
const WEB_JITTER = [0, 0.05, -0.04, 0.03, -0.05, 0.04, 0];

function webPoint(r: number, a: number): string {
  return `${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
}

const WEB_PATH = [
  ...WEB_SPOKES.map((a) => `M0 0L${webPoint(205, a)}`),
  ...WEB_RINGS.map((r) => {
    let d = `M${webPoint(r, WEB_SPOKES[0])}`;
    for (let i = 1; i < WEB_SPOKES.length; i++) {
      const sag = ((r * (2 + WEB_JITTER[i - 1] + WEB_JITTER[i])) / 2) * 0.86;
      const mid = (WEB_SPOKES[i - 1] + WEB_SPOKES[i]) / 2;
      d += `Q${webPoint(sag, mid)} ${webPoint(r * (1 + WEB_JITTER[i]), WEB_SPOKES[i])}`;
    }
    return d;
  }),
].join('');

function Spider() {
  return (
    <svg viewBox="0 0 32 32" className="hw-spider-body">
      <g
        fill="none"
        stroke="#1b0f26"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 12L6 6L2 9M11 15L4 12L1 16M11 18L4 19L2 24M12 21L6 25L4 30" />
        <path d="M20 12L26 6L30 9M21 15L28 12L31 16M21 18L28 19L30 24M20 21L26 25L28 30" />
      </g>
      <circle cx="16" cy="11" r="4" fill="#1b0f26" />
      <ellipse cx="16" cy="19.5" rx="6" ry="7" fill="#1b0f26" />
      <ellipse cx="14.2" cy="17" rx="1.6" ry="2.4" fill="#4a2a66" />
      <circle cx="14.6" cy="11" r="1" fill="#ff8a1e" />
      <circle cx="17.4" cy="11" r="1" fill="#ff8a1e" />
    </svg>
  );
}

function Web({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`hw-web hw-web--${side}`}>
      <svg viewBox="0 0 200 200" className="hw-web-threads">
        <path
          d={WEB_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="hw-spider-clip">
        <div className="hw-spider">
          <span className="hw-spider-thread" />
          <Spider />
        </div>
      </div>
    </div>
  );
}

function Bat({ variant }: { variant: 1 | 2 | 3 }) {
  return (
    <div className={`hw-bat hw-bat--${variant}`}>
      {/* Pas de noir : sur le fond du site, une silhouette noire disparaît.
          Violet sombre, liseré néon. */}
      <svg viewBox="0 0 64 32">
        <g
          className="hw-bat-wings"
          fill="#3b1f55"
          stroke="#c77ce9"
          strokeWidth="0.8"
          strokeLinejoin="round"
        >
          <path d="M29 15C24 9 16 6 4 8C7 11 8 13 7 16C10 14.5 13 15 14 18C16 16 19 16.5 21 19.5C23 17.5 26 18 28 20Z" />
          <path d="M35 15C40 9 48 6 60 8C57 11 56 13 57 16C54 14.5 51 15 50 18C48 16 45 16.5 43 19.5C41 17.5 38 18 36 20Z" />
        </g>
        <g fill="#3b1f55" stroke="#c77ce9" strokeWidth="0.8">
          <ellipse cx="32" cy="18" rx="4" ry="6" />
          <circle cx="32" cy="11.5" r="3.6" />
          <path d="M29.2 10L29.5 4.5L31.4 8.4ZM34.8 10L34.5 4.5L32.6 8.4Z" />
        </g>
        <circle cx="30.8" cy="11.2" r="0.8" fill="#ffd54a" />
        <circle cx="33.2" cy="11.2" r="0.8" fill="#ffd54a" />
      </svg>
    </div>
  );
}

function Witch() {
  return (
    <div className="hw-witch">
      <svg viewBox="0 0 180 100" className="hw-witch-body">
        {/* Balai */}
        <path
          d="M18 70L152 57"
          stroke="#8b5a2b"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path d="M32 66L6 57L1 68L5 81L32 74Z" fill="#e0a941" />
        <path
          d="M30 68L6 61M30 70L3 69M30 72L6 77"
          stroke="#b07a22"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M31 64L32 75"
          stroke="#a62edb"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Cape au vent */}
        <path
          d="M80 38C64 40 52 50 38 46C44 52 46 58 56 58C62 60 70 58 76 56Z"
          fill="#751b9d"
        />
        {/* Jambe, bas rayé, bottine */}
        <path
          d="M98 63L112 69"
          stroke="#1a0f24"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M98 63L112 69"
          stroke="#ff8a1e"
          strokeWidth="5"
          strokeDasharray="3 3"
        />
        <path d="M108 66L119 69L124 66L122 73L107 73Z" fill="#1a0f24" />
        {/* Robe */}
        <path
          d="M70 66C68 50 76 36 88 34C98 34 103 46 101 60L106 66Z"
          fill="#4a1a6b"
          stroke="#b551e1"
          strokeWidth="1"
        />
        {/* Bras jusqu'au manche */}
        <path
          d="M93 42C102 48 110 54 120 59"
          stroke="#4a1a6b"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="121" cy="59.5" r="3.2" fill="#8fd16a" />
        {/* Cheveux, visage */}
        <path d="M89 23C78 26 70 32 60 29C68 37 80 35 89 33Z" fill="#ff8a1e" />
        <circle cx="94" cy="28" r="8" fill="#8fd16a" />
        <path d="M101 26L111 30L101 31Z" fill="#7cc057" />
        <circle cx="97" cy="26" r="1.3" fill="#1a0f24" />
        <path
          d="M95 33Q98.5 35.5 101 33"
          stroke="#1a0f24"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
        {/* Chapeau pointu, pointe rabattue en arrière */}
        <path
          d="M84 21L101 19.5C97 12 90 6 72 4C80 8 84 14 84 21Z"
          fill="#1a0f24"
          stroke="#b551e1"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M85 17.8L99.5 16.6"
          stroke="#ff8a1e"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <ellipse
          cx="92"
          cy="21.5"
          rx="15"
          ry="3"
          fill="#1a0f24"
          stroke="#b551e1"
          strokeWidth="1"
          transform="rotate(-5 92 21.5)"
        />
      </svg>
    </div>
  );
}

function Mummy() {
  const clipId = useId();
  return (
    <div className="hw-mummy">
      <svg viewBox="0 0 120 150">
        <defs>
          <clipPath id={clipId}>
            <ellipse cx="62" cy="48" rx="32" ry="34" />
          </clipPath>
        </defs>
        {/* Épaule et bras tendu vers la page */}
        <path d="M36 72C30 100 30 128 32 150H120V72Z" fill="#e2d6b8" />
        <path
          d="M46 112L16 104"
          stroke="#e2d6b8"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M14 103L5 97M12 105L3 105M14 108L6 113"
          stroke="#e9dfc6"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M24 99L21 111M33 102L30 114M44 98C40 110 42 118 40 124M60 82L118 96M50 130L118 122"
          stroke="#b9a988"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        {/* Tête bandée */}
        <ellipse cx="62" cy="48" rx="32" ry="34" fill="#e9dfc6" />
        <g clipPath={`url(#${clipId})`}>
          <path
            d="M24 24L100 16M24 34L100 28M24 64L100 58M24 74L100 70M24 84L100 82M40 14L70 40"
            stroke="#b9a988"
            strokeWidth="2"
            fill="none"
          />
          <path d="M28 44Q62 37 98 41V55Q62 51 28 58Z" fill="#1a0f24" />
        </g>
        <g className="hw-mummy-eyes">
          <circle cx="50" cy="49" r="4.6" fill="#c6ff4d" />
          <circle cx="73" cy="47" r="4.6" fill="#c6ff4d" />
          <circle cx="48.6" cy="49.4" r="1.7" fill="#1a0f24" />
          <circle cx="71.6" cy="47.4" r="1.7" fill="#1a0f24" />
        </g>
        {/* Bout de bandage qui pend */}
        <path
          d="M40 72C34 86 42 94 35 108"
          stroke="#e9dfc6"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function Ghost() {
  return (
    <div className="hw-ghost">
      <svg viewBox="0 0 60 72">
        <path
          d="M30 4C14 4 6 16 6 32V64L13 58L20 66L27 59L34 66L41 59L48 66L54 60V32C54 16 46 4 30 4Z"
          fill="#f4f0ff"
        />
        <ellipse cx="22" cy="28" rx="3" ry="4.5" fill="#1a0f24" />
        <ellipse cx="38" cy="28" rx="3" ry="4.5" fill="#1a0f24" />
        <ellipse cx="30" cy="42" rx="4" ry="5" fill="#1a0f24" />
        <circle cx="15" cy="36" r="3" fill="#d98bff" opacity="0.5" />
        <circle cx="45" cy="36" r="3" fill="#d98bff" opacity="0.5" />
      </svg>
    </div>
  );
}

function Pumpkin({ lit }: { lit: boolean }) {
  return (
    <svg viewBox="0 0 64 56" className="hw-pumpkin">
      <path d="M30 11C30 5 33 2 37 1L39 4C36 5 35 8 35 12Z" fill="#4c6b2a" />
      <path
        d="M35 8C40 4 46 6 47 10"
        stroke="#6f9a3a"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="20" cy="33" rx="16" ry="20" fill="#d2600f" />
      <ellipse cx="44" cy="33" rx="16" ry="20" fill="#d2600f" />
      <ellipse cx="26" cy="33" rx="13" ry="21" fill="#ee7a14" />
      <ellipse cx="38" cy="33" rx="13" ry="21" fill="#ee7a14" />
      <ellipse cx="32" cy="33" rx="10" ry="22" fill="#f68a1f" />
      <path
        className={lit ? 'hw-pumpkin-face' : undefined}
        d="M17 27H26L21.5 19ZM38 27H47L42.5 19ZM30 34H34L32 30ZM14 37Q32 51 50 37L46.5 39L43.5 36L40.5 41L36.5 37L32 42L27.5 37L23.5 41L20.5 36L17.5 39Z"
        fill={lit ? '#ffd54a' : '#5a2a08'}
      />
    </svg>
  );
}

export default function HalloweenDecor() {
  const t = useT(nsHalloweenDecor);
  // Composant client seulement (chargé sans SSR) : lire le stockage dès le
  // premier rendu ne crée pas d'écart d'hydratation.
  const [off, setOff] = useState(readOff);

  const toggle = () => {
    const next = !off;
    setOff(next);
    writeOff(next);
  };
  const label = off ? t.show : t.hide;

  return (
    <div className="hw-layer print:hidden" data-test="halloween-decor">
      {!off && (
        <div aria-hidden="true">
          <Web side="left" />
          <Web side="right" />
          <Bat variant={1} />
          <Bat variant={2} />
          <Bat variant={3} />
          <Witch />
          <Mummy />
          <Ghost />
          <span className="hw-pumpkin-small">
            <Pumpkin lit />
          </span>
        </div>
      )}
      <button
        type="button"
        className="hw-toggle"
        data-off={off ? '' : undefined}
        onClick={toggle}
        aria-label={label}
        title={label}
      >
        <Pumpkin lit={!off} />
      </button>
    </div>
  );
}
