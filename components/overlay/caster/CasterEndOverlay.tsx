// components/overlay/caster/CasterEndOverlay.tsx
//
// Overlay OBS de la scène `end` — port FIDÈLE de womenscup-caster
// src/overlays/end.html : titre géant dégradé, cœur battant, confettis,
// crédits (label: valeur), rangée partenaires, socials. Scène PLEIN ÉCRAN à
// fond opaque var(--bg). Pas de hashtag sur cette scène (comme le source).

import { useMemo } from 'react';
import type { EndSceneData } from '@/types/caster';
import {
  SocialsFooter,
  normalizeSocials,
  overlayRootCss,
  scanlinesCss,
  socialsFooterCss,
} from './overlayChrome';

type EndView = EndSceneData & { sponsorsLabel: string };

function normalizeEndData(
  raw: Record<string, unknown> | null | undefined
): EndView {
  const d = (raw || {}) as Partial<EndSceneData> & {
    message?: string;
    sponsorsLabel?: string;
  };
  const credits = Array.isArray(d.credits)
    ? d.credits
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({ label: c.label || '', value: c.value || '' }))
    : [];
  const sponsors = Array.isArray(d.sponsors)
    ? d.sponsors.map((s) => String(s ?? '')).filter(Boolean)
    : [];
  return {
    title: typeof d.title === 'string' ? d.title : 'Merci !',
    // Rétro-compat desktop : `message` était le sous-titre de l'ancien design.
    subtitle:
      typeof d.subtitle === 'string'
        ? d.subtitle
        : typeof d.message === 'string'
          ? d.message
          : "À très bientôt sur Women's Cup",
    credits,
    sponsors,
    socials: normalizeSocials(d.socials),
    sponsorsLabel: d.sponsorsLabel || 'Partenaires',
  };
}

// Confettis : positions/délais tirés UNE FOIS par chargement de page (au
// niveau module — même effet que l'IIFE de end.html, et conforme à la règle
// react-hooks/purity qui interdit Math.random au rendu).
const CONF_PALETTE = ['var(--accent1)', 'var(--accent2)', 'var(--accent3)'];
const CONFETTI = Array.from({ length: 60 }, (_, i) => ({
  left: `${Math.random() * 100}%`,
  top: `${-50 - Math.random() * 200}px`,
  background: CONF_PALETTE[i % 3],
  delay: `${Math.random() * 14}s`,
  duration: `${10 + Math.random() * 8}s`,
}));

export function CasterEndOverlay({ data }: { data: Record<string, unknown> }) {
  const d = useMemo(() => normalizeEndData(data), [data]);

  return (
    <div className="caster-end-overlay">
      <div className="mesh" />
      <div className="scanlines" />
      <div className="confetti">
        {CONFETTI.map((c, i) => (
          <div
            key={i}
            className="conf"
            style={{
              left: c.left,
              top: c.top,
              background: c.background,
              animationDelay: c.delay,
              animationDuration: c.duration,
            }}
          />
        ))}
      </div>

      <div className="container">
        <div className="title">{d.title}</div>
        <div className="subtitle">{d.subtitle}</div>
        <div className="heart">&#10084;</div>
        {d.credits.length > 0 ? (
          <div className="credits">
            {d.credits.map((c, i) => (
              <div key={i}>
                <span className="credits-label">{c.label}</span>
                {c.value}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {d.sponsors.length > 0 ? (
        <div className="sponsors">
          <span className="sponsors-label">{d.sponsorsLabel}</span>
          {d.sponsors.map((name, i) => (
            <span className="sponsor-item" key={i}>
              {name}
            </span>
          ))}
        </div>
      ) : null}

      <SocialsFooter socials={d.socials} />

      {/* CSS = valeurs EXACTES de end.html + tokens shared.css. */}
      <style jsx global>{`
        ${overlayRootCss('caster-end-overlay')}
        ${scanlinesCss('caster-end-overlay')}
        ${socialsFooterCss('caster-end-overlay')}

        .caster-end-overlay .mesh {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              circle at 50% 30%,
              color-mix(in srgb, var(--accent2) 30%, transparent) 0%,
              transparent 50%
            ),
            radial-gradient(
              circle at 30% 80%,
              color-mix(in srgb, var(--accent1) 25%, transparent) 0%,
              transparent 45%
            ),
            radial-gradient(
              circle at 80% 70%,
              color-mix(in srgb, var(--accent3) 25%, transparent) 0%,
              transparent 45%
            ),
            linear-gradient(135deg, var(--bg) 0%, var(--bg-card) 100%);
        }

        .caster-end-overlay .confetti {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .caster-end-overlay .conf {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 1px;
          animation: caster-end-confFall 14s linear infinite;
          opacity: 0;
        }
        @keyframes caster-end-confFall {
          0% {
            transform: translateY(-50px) rotate(0);
            opacity: 0;
          }
          8% {
            opacity: 0.9;
          }
          92% {
            opacity: 0.9;
          }
          100% {
            transform: translateY(1200px) rotate(720deg);
            opacity: 0;
          }
        }

        /* width/max-width/margin explicites : neutralisent le .container
           global du site (max-width 1200px + centrage) qui fuirait ici. */
        .caster-end-overlay .container {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: none;
          margin: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 120px;
        }

        .caster-end-overlay .title {
          font-size: calc(200px * var(--font-scale));
          font-weight: 900;
          letter-spacing: 12px;
          line-height: 1;
          background: linear-gradient(
            135deg,
            var(--accent1),
            var(--accent2),
            var(--accent3)
          );
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-transform: uppercase;
          filter: drop-shadow(
            0 0 50px color-mix(in srgb, var(--accent2) 40%, transparent)
          );
          margin-bottom: 20px;
        }

        .caster-end-overlay .subtitle {
          font-size: calc(38px * var(--font-scale));
          color: var(--text);
          font-weight: 300;
          margin-bottom: 60px;
          letter-spacing: 2px;
        }

        .caster-end-overlay .heart {
          font-size: calc(56px * var(--font-scale));
          color: var(--accent2);
          animation: caster-end-heartbeat 1.5s ease-in-out infinite;
          margin-bottom: 60px;
        }
        @keyframes caster-end-heartbeat {
          0%,
          100% {
            transform: scale(1);
          }
          14% {
            transform: scale(1.2);
          }
          28% {
            transform: scale(1);
          }
          42% {
            transform: scale(1.2);
          }
          70% {
            transform: scale(1);
          }
        }

        .caster-end-overlay .credits {
          text-align: center;
          color: var(--text-muted);
          font-size: calc(18px * var(--font-scale));
          line-height: 1.8;
          letter-spacing: 1px;
        }
        .caster-end-overlay .credits-label {
          color: var(--accent1);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 4px;
          font-size: calc(14px * var(--font-scale));
          margin-right: 12px;
        }

        .caster-end-overlay .sponsors {
          position: absolute;
          bottom: 130px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 40px;
          align-items: center;
          z-index: 10;
          opacity: 0.7;
        }
        .caster-end-overlay .sponsors-label {
          font-size: calc(12px * var(--font-scale));
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 4px;
          margin-right: 8px;
        }
        .caster-end-overlay .sponsor-item {
          font-size: calc(16px * var(--font-scale));
          color: var(--text);
          padding: 8px 16px;
          background: color-mix(in srgb, var(--bg-card) 60%, transparent);
          border-radius: 6px;
          letter-spacing: 1px;
          border: 1px solid color-mix(in srgb, var(--accent1) 20%, transparent);
        }
      `}</style>
    </div>
  );
}
