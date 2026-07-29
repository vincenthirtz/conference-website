// components/overlay/caster/CasterPauseOverlay.tsx
//
// Overlay OBS de la scène `pause` — port FIDÈLE de womenscup-caster
// src/overlays/pause.html : anneaux pulsés, waveform animée, bandeau
// défilant optionnel (marquee ×4 pour une boucle sans couture), socials +
// hashtag. Scène PLEIN ÉCRAN à fond opaque var(--bg).

import { useMemo } from 'react';
import type { PauseSceneData } from '@/types/caster';
import {
  HashtagBadge,
  SocialsFooter,
  hashtagCss,
  normalizeSocials,
  overlayRootCss,
  scanlinesCss,
  socialsFooterCss,
} from './overlayChrome';

type PauseView = PauseSceneData & { brand: string };

function normalizePauseData(
  raw: Record<string, unknown> | null | undefined
): PauseView {
  const d = (raw || {}) as Partial<PauseSceneData> & { brand?: string };
  return {
    title: typeof d.title === 'string' ? d.title : 'Be Right Back',
    message:
      typeof d.message === 'string'
        ? d.message
        : 'Nous revenons dans un instant',
    marquee: typeof d.marquee === 'string' ? d.marquee : '',
    hashtag: typeof d.hashtag === 'string' ? d.hashtag : '',
    socials: normalizeSocials(d.socials),
    brand: typeof d.brand === 'string' ? d.brand : "Women's Cup",
  };
}

const WAVEFORM_BARS = Array.from(
  { length: 32 },
  (_, i) => `${(i * 0.05) % 1.2}s`
);

export function CasterPauseOverlay({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const d = useMemo(() => normalizePauseData(data), [data]);

  return (
    <div className="caster-pause-overlay">
      <div className="mesh" />
      <div className="scanlines" />

      <div className="rings">
        <div className="ring" />
        <div className="ring" />
        <div className="ring" />
      </div>

      <HashtagBadge hashtag={d.hashtag} />

      <div className="container">
        <div className="brand">{d.brand}</div>
        <div className="title">{d.title}</div>
        <div className="message">{d.message}</div>
        <div className="waveform">
          {WAVEFORM_BARS.map((delay, i) => (
            <div key={i} className="bar" style={{ animationDelay: delay }} />
          ))}
        </div>
      </div>

      {d.marquee ? (
        <div className="marquee">
          <div className="marquee-track">
            <span>
              {/* ×4 comme le desktop : la boucle translateX(-50%) reste
                  sans couture. */}
              {[0, 1, 2, 3].map((i) => (
                <span key={i} style={{ marginRight: 80 }}>
                  {d.marquee}
                </span>
              ))}
            </span>
          </div>
        </div>
      ) : null}

      <SocialsFooter socials={d.socials} />

      {/* CSS = valeurs EXACTES de pause.html + tokens shared.css. */}
      <style jsx global>{`
        ${overlayRootCss('caster-pause-overlay')}
        ${scanlinesCss('caster-pause-overlay')}
        ${socialsFooterCss('caster-pause-overlay')}
        ${hashtagCss('caster-pause-overlay')}

        .caster-pause-overlay .mesh {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              circle at 30% 40%,
              color-mix(in srgb, var(--accent2) 30%, transparent) 0%,
              transparent 45%
            ),
            radial-gradient(
              circle at 70% 60%,
              color-mix(in srgb, var(--accent3) 30%, transparent) 0%,
              transparent 45%
            ),
            linear-gradient(135deg, var(--bg) 0%, var(--bg-card) 100%);
          animation: caster-pause-meshShift 22s ease-in-out infinite alternate;
        }
        @keyframes caster-pause-meshShift {
          0% {
            background-position:
              0% 0%,
              100% 0%,
              0 0;
          }
          100% {
            background-position:
              8% 4%,
              92% 8%,
              0 0;
          }
        }

        /* Anneaux pulsés derrière le titre (nth-child comme le source). */
        .caster-pause-overlay .ring {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          border: 2px solid color-mix(in srgb, var(--accent1) 40%, transparent);
          border-radius: 50%;
          animation: caster-pause-ring 4s ease-out infinite;
          pointer-events: none;
        }
        .caster-pause-overlay .ring:nth-child(2) {
          animation-delay: 1.3s;
          border-color: color-mix(in srgb, var(--accent2) 40%, transparent);
        }
        .caster-pause-overlay .ring:nth-child(3) {
          animation-delay: 2.6s;
          border-color: color-mix(in srgb, var(--accent3) 40%, transparent);
        }
        @keyframes caster-pause-ring {
          0% {
            width: 100px;
            height: 100px;
            opacity: 0.8;
          }
          100% {
            width: 1400px;
            height: 1400px;
            opacity: 0;
          }
        }

        /* width/max-width/margin explicites : neutralisent le .container
           global du site (max-width 1200px + centrage) qui fuirait ici. */
        .caster-pause-overlay .container {
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

        .caster-pause-overlay .brand {
          font-size: calc(36px * var(--font-scale));
          font-weight: 900;
          background: linear-gradient(
            135deg,
            var(--accent1),
            var(--accent2),
            var(--accent3)
          );
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-transform: uppercase;
          letter-spacing: 6px;
          margin-bottom: 24px;
        }

        .caster-pause-overlay .title {
          font-size: calc(200px * var(--font-scale));
          font-weight: 900;
          letter-spacing: 8px;
          line-height: 1;
          color: var(--text);
          text-shadow:
            0 0 40px color-mix(in srgb, var(--accent1) 50%, transparent),
            0 0 80px color-mix(in srgb, var(--accent2) 30%, transparent);
          text-transform: uppercase;
          margin-bottom: 40px;
        }

        .caster-pause-overlay .message {
          font-size: calc(36px * var(--font-scale));
          color: var(--text-muted);
          font-weight: 300;
          margin-bottom: 60px;
          letter-spacing: 1px;
        }

        .caster-pause-overlay .waveform {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          height: 80px;
          margin-bottom: 60px;
        }
        .caster-pause-overlay .bar {
          width: 6px;
          background: linear-gradient(180deg, var(--accent1), var(--accent2));
          border-radius: 3px;
          animation: caster-pause-wave 1.2s ease-in-out infinite;
          transform-origin: bottom;
        }
        @keyframes caster-pause-wave {
          0%,
          100% {
            height: 12%;
            opacity: 0.5;
          }
          50% {
            height: 100%;
            opacity: 1;
          }
        }

        .caster-pause-overlay .marquee {
          position: absolute;
          bottom: 110px;
          left: 0;
          right: 0;
          overflow: hidden;
          height: 32px;
          opacity: 0.55;
        }
        .caster-pause-overlay .marquee-track {
          display: inline-flex;
          gap: 80px;
          animation: caster-pause-scroll 30s linear infinite;
          white-space: nowrap;
          font-size: calc(18px * var(--font-scale));
          letter-spacing: 4px;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        @keyframes caster-pause-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
