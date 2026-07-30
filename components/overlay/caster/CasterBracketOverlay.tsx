// components/overlay/caster/CasterBracketOverlay.tsx
//
// Overlay OBS de la scène `bracket` — port FIDÈLE de womenscup-caster
// src/overlays/bracket.html : titre + nom du tournoi, puis un viewport qui
// héberge l'embed chrome-less du site (pages/embed/tournament/[id]/bracket).
// Scène PLEIN ÉCRAN à fond opaque var(--bg).
//
// Le desktop construit l'URL sur `apiBase` (https://owwomenscup.fr par défaut)
// et n'affiche l'iframe QUE dans la vraie Browser Source — ses moniteurs
// in-app (`preview: true`) restent hors ligne et montrent un placeholder.
// Ici, la page overlay EST l'antenne (pas de mode preview) et l'embed est
// SAME-ORIGIN : URL relative, donc ni CORS ni base à configurer. `/embed/*`
// est servi avec `frame-ancestors *`, l'embarquement est autorisé.
//
// Sans tournoi sélectionné, on rend le même placeholder que le desktop
// (🏆 « Sélectionnez un tournoi ») plutôt qu'un écran noir.

import { useMemo } from 'react';
import type { BracketSceneData } from '@/types/caster';
import { overlayRootCss, scanlinesCss } from './overlayChrome';

type BracketView = {
  title: string;
  tournamentId: string | null;
  tournamentName: string;
  theme: 'dark' | 'light';
};

/** `data` tolérante (scène créée côté app desktop peut omettre des clés). */
export function normalizeBracketData(
  raw: Record<string, unknown> | null | undefined
): BracketView {
  const d = (raw || {}) as Partial<BracketSceneData>;
  return {
    // `title` vide ⇒ défaut 'BRACKET', comme `d.title || 'BRACKET'`.
    title: (typeof d.title === 'string' && d.title) || 'BRACKET',
    tournamentId:
      typeof d.tournamentId === 'string' && d.tournamentId
        ? d.tournamentId
        : null,
    tournamentName:
      typeof d.tournamentName === 'string' ? d.tournamentName : '',
    theme: d.theme === 'light' ? 'light' : 'dark',
  };
}

/** URL de l'embed du site (relative = same-origin). Accepte un id OU un slug. */
export function bracketEmbedUrl(view: {
  tournamentId: string;
  theme: 'dark' | 'light';
}): string {
  return `/embed/tournament/${encodeURIComponent(view.tournamentId)}/bracket?theme=${view.theme}`;
}

export function CasterBracketOverlay({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const d = useMemo(() => normalizeBracketData(data), [data]);
  const src = d.tournamentId
    ? bracketEmbedUrl({ tournamentId: d.tournamentId, theme: d.theme })
    : null;

  return (
    <div className="caster-bracket-overlay">
      <div className="mesh" />
      <div className="scanlines" />

      <div className="container">
        <div className="header">
          <div className="bracket-title">{d.title}</div>
          {d.tournamentName ? (
            <div className="tournament-name">{d.tournamentName}</div>
          ) : null}
        </div>
        <div className="viewport">
          {src ? (
            <iframe
              className="bracket-frame"
              src={src}
              title="Bracket"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="placeholder">
              <div className="ph-icon">🏆</div>
              <div className="ph-main">Sélectionnez un tournoi</div>
            </div>
          )}
        </div>
      </div>

      {/* CSS = valeurs EXACTES de bracket.html + tokens shared.css. */}
      <style jsx global>{`
        ${overlayRootCss('caster-bracket-overlay')}
        ${scanlinesCss('caster-bracket-overlay')}

        .caster-bracket-overlay .mesh {
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
          animation: caster-bracket-meshShift 18s ease-in-out infinite alternate;
        }
        @keyframes caster-bracket-meshShift {
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

        /* max-width/margin explicites : neutralisent le .container global du
           site (max-width 1200px + centrage) qui fuirait ici. */
        .caster-bracket-overlay .container {
          position: absolute;
          inset: 0;
          max-width: none;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 28px;
          padding: 64px 80px;
        }

        .caster-bracket-overlay .header {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 0 0 auto;
        }
        .caster-bracket-overlay .bracket-title {
          font-size: calc(48px * var(--font-scale));
          font-weight: 800;
          letter-spacing: 6px;
          text-transform: uppercase;
          color: var(--accent1);
          text-shadow: 0 0 24px
            color-mix(in srgb, var(--accent1) 50%, transparent);
        }
        .caster-bracket-overlay .tournament-name {
          font-size: calc(30px * var(--font-scale));
          font-weight: 600;
          color: var(--text-muted);
          letter-spacing: 1px;
        }

        /* Viewport du bracket — héberge l'iframe d'embed du site. */
        .caster-bracket-overlay .viewport {
          position: relative;
          flex: 1 1 auto;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--accent1) 24%, transparent);
          background: color-mix(in srgb, var(--bg-card) 70%, transparent);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        }
        .caster-bracket-overlay .bracket-frame {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          background: transparent;
        }

        .caster-bracket-overlay .placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          text-align: center;
          color: var(--text-muted);
          padding: 40px;
        }
        .caster-bracket-overlay .placeholder .ph-icon {
          font-size: calc(84px * var(--font-scale));
          opacity: 0.6;
        }
        .caster-bracket-overlay .placeholder .ph-main {
          font-size: calc(34px * var(--font-scale));
          font-weight: 700;
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
