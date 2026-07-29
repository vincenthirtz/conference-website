// components/overlay/caster/CasterStartingOverlay.tsx
//
// Overlay OBS de la scène `starting` — port FIDÈLE de womenscup-caster
// src/overlays/starting.html (styles + logique inline) : mesh animé,
// particules, compte à rebours, bloc « prochain match », socials/hashtag.
// Scène PLEIN ÉCRAN à fond opaque var(--bg), contrairement à match.
//
// Compte à rebours (même logique que le fichier source) :
//  - `--:--` tant qu'aucune valeur n'est arrivée ;
//  - à réception d'un `countdown`, on repart de cette valeur et un timer 1 s
//    décrémente jusqu'à 0. Écart voulu : le re-déclenchement est keyé sur le
//    CHANGEMENT DE VALEUR (pas sur chaque update) — le poll 15 s de la page
//    re-livre la même ligne et ne doit pas remettre le compteur à zéro.

import { useEffect, useMemo, useState } from 'react';
import type { StartingSceneData } from '@/types/caster';
import {
  HashtagBadge,
  SocialsFooter,
  hashtagCss,
  normalizeSocials,
  overlayRootCss,
  scanlinesCss,
  socialsFooterCss,
} from './overlayChrome';

type StartingView = Omit<StartingSceneData, 'countdown'> & {
  countdown: number | null;
  brand: string;
};

function normalizeStartingData(
  raw: Record<string, unknown> | null | undefined
): StartingView {
  const d = (raw || {}) as Partial<StartingSceneData> & { brand?: string };
  const nm = (d.nextMatch || {}) as Partial<StartingSceneData['nextMatch']>;
  const countdown = Number(d.countdown);
  return {
    title: typeof d.title === 'string' ? d.title : 'Le stream commence bientôt',
    brand: typeof d.brand === 'string' ? d.brand : "Women's Cup",
    countdown:
      d.countdown != null && Number.isFinite(countdown)
        ? Math.max(0, Math.floor(countdown))
        : null,
    nextMatch: {
      team1: nm.team1 || '',
      team2: nm.team2 || '',
      bestOf: Number(nm.bestOf) || undefined,
    },
    hashtag: typeof d.hashtag === 'string' ? d.hashtag : '',
    socials: normalizeSocials(d.socials),
    nextLabel: d.nextLabel || "À l'affiche",
    countdownLabel: d.countdownLabel || 'Début dans',
  };
}

function fmtMmSs(total: number): string {
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// Particules : positions/délais tirés UNE FOIS par chargement de page (au
// niveau module — même effet que l'IIFE de starting.html, et conforme à la
// règle react-hooks/purity qui interdit Math.random au rendu).
const PARTICLES = Array.from({ length: 40 }, (_, i) => ({
  left: `${Math.random() * 100}%`,
  top: `${100 + Math.random() * 20}%`,
  delay: `${Math.random() * 12}s`,
  duration: `${8 + Math.random() * 10}s`,
  color:
    i % 3 === 1
      ? 'var(--accent2)'
      : i % 3 === 2
        ? 'var(--accent3)'
        : 'var(--accent1)',
}));

export function CasterStartingOverlay({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const d = useMemo(() => normalizeStartingData(data), [data]);

  // Décompte : repart de la valeur configurée quand ELLE change ; le timer
  // 1 s tourne en continu comme startCountdownTimer() côté desktop.
  const [remaining, setRemaining] = useState<number | null>(d.countdown);
  useEffect(() => {
    setRemaining(d.countdown);
  }, [d.countdown]);
  useEffect(() => {
    const timer = setInterval(
      () => setRemaining((r) => (r != null && r > 0 ? r - 1 : r)),
      1000
    );
    return () => clearInterval(timer);
  }, []);

  const hasNextMatch = !!(d.nextMatch.team1 || d.nextMatch.team2);

  return (
    <div className="caster-starting-overlay">
      <div className="mesh" />
      <div className="scanlines" />
      <div className="particles">
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: p.left,
              top: p.top,
              animationDelay: p.delay,
              animationDuration: p.duration,
              background: p.color,
            }}
          />
        ))}
      </div>

      <HashtagBadge hashtag={d.hashtag} />

      <div className="container">
        <div className="header">
          <div className="brand">{d.brand}</div>
          <div className="subtitle">{d.title}</div>
        </div>

        <div className="countdown-block">
          <div className="countdown-label pulse">{d.countdownLabel}</div>
          <div className="countdown">
            {remaining != null ? fmtMmSs(remaining) : '--:--'}
          </div>
        </div>

        {hasNextMatch ? (
          <div className="next-match">
            <span className="next-label">{d.nextLabel}</span>
            <span className="nm-team">{d.nextMatch.team1 || 'TBD'}</span>
            <span className="nm-vs">VS</span>
            <span className="nm-team">{d.nextMatch.team2 || 'TBD'}</span>
            {d.nextMatch.bestOf ? (
              <span className="nm-bo">BO{d.nextMatch.bestOf}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <SocialsFooter socials={d.socials} />

      {/* CSS = valeurs EXACTES de starting.html + tokens shared.css, préfixées
          par la classe racine (global : sous-composants partagés). */}
      <style jsx global>{`
        ${overlayRootCss('caster-starting-overlay')}
        ${scanlinesCss('caster-starting-overlay')}
        ${socialsFooterCss('caster-starting-overlay')}
        ${hashtagCss('caster-starting-overlay')}

        .caster-starting-overlay .mesh {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              circle at 20% 30%,
              color-mix(in srgb, var(--accent1) 28%, transparent) 0%,
              transparent 40%
            ),
            radial-gradient(
              circle at 80% 20%,
              color-mix(in srgb, var(--accent2) 28%, transparent) 0%,
              transparent 40%
            ),
            radial-gradient(
              circle at 60% 80%,
              color-mix(in srgb, var(--accent3) 28%, transparent) 0%,
              transparent 45%
            ),
            linear-gradient(135deg, var(--bg) 0%, var(--bg-card) 100%);
          animation: caster-starting-meshShift 18s ease-in-out infinite
            alternate;
        }
        @keyframes caster-starting-meshShift {
          0% {
            background-position:
              0% 0%,
              100% 0%,
              50% 100%,
              0 0;
          }
          100% {
            background-position:
              10% 5%,
              90% 10%,
              60% 95%,
              0 0;
          }
        }

        .caster-starting-overlay .particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .caster-starting-overlay .particle {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--accent1);
          opacity: 0;
          animation: caster-starting-float 12s linear infinite;
          filter: blur(0.5px);
        }
        @keyframes caster-starting-float {
          0% {
            transform: translateY(0) scale(0.3);
            opacity: 0;
          }
          10% {
            opacity: 0.8;
          }
          90% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(-1200px) scale(1.2);
            opacity: 0;
          }
        }

        /* width/max-width/margin explicites : neutralisent le .container
           global du site (max-width 1200px + centrage) qui fuirait ici. */
        .caster-starting-overlay .container {
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
          padding: 80px 120px;
        }

        .caster-starting-overlay .header {
          text-align: center;
          margin-bottom: 60px;
        }

        .caster-starting-overlay .brand {
          font-size: calc(88px * var(--font-scale));
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
          line-height: 1;
          filter: drop-shadow(
            0 0 30px color-mix(in srgb, var(--accent2) 40%, transparent)
          );
        }

        .caster-starting-overlay .subtitle {
          font-size: calc(26px * var(--font-scale));
          color: var(--text-muted);
          margin-top: 14px;
          letter-spacing: 4px;
          text-transform: uppercase;
        }

        .caster-starting-overlay .countdown-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 50px;
        }
        .caster-starting-overlay .countdown-label {
          font-size: calc(16px * var(--font-scale));
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 8px;
          margin-bottom: 12px;
        }
        .caster-starting-overlay .countdown {
          font-size: calc(180px * var(--font-scale));
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          line-height: 1;
          background: linear-gradient(
            180deg,
            var(--text),
            color-mix(in srgb, var(--accent1) 60%, var(--text))
          );
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 60px
            color-mix(in srgb, var(--accent1) 30%, transparent);
        }

        .caster-starting-overlay .next-match {
          display: flex;
          align-items: center;
          gap: 32px;
          background: color-mix(in srgb, var(--bg-card) 70%, transparent);
          backdrop-filter: blur(8px);
          padding: 28px 56px;
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--accent1) 25%, transparent);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .caster-starting-overlay .next-label {
          font-size: calc(14px * var(--font-scale));
          color: var(--accent1);
          text-transform: uppercase;
          letter-spacing: 4px;
          margin-right: 8px;
        }
        .caster-starting-overlay .nm-team {
          font-size: calc(32px * var(--font-scale));
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .caster-starting-overlay .nm-vs {
          font-size: calc(18px * var(--font-scale));
          color: var(--text-muted);
          font-weight: 700;
          padding: 6px 14px;
          background: color-mix(in srgb, var(--accent2) 18%, transparent);
          border-radius: 6px;
        }
        .caster-starting-overlay .nm-bo {
          font-size: calc(14px * var(--font-scale));
          color: var(--accent2);
          text-transform: uppercase;
          letter-spacing: 3px;
          font-weight: 700;
          padding: 4px 10px;
          border: 1px solid color-mix(in srgb, var(--accent2) 50%, transparent);
          border-radius: 4px;
        }

        .caster-starting-overlay .pulse {
          animation: caster-starting-pulse 2s ease-in-out infinite;
        }
        @keyframes caster-starting-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.55;
          }
        }
      `}</style>
    </div>
  );
}
