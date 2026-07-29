// components/overlay/caster/CasterMatchOverlay.tsx
//
// Overlay OBS de la scène `match` du caster — port FIDÈLE du template
// « default » de womenscup-caster/src/overlays/match.html (styles + logique
// inline) avec les tokens de shared.css. Canvas 1920×1080 en positionnement
// absolu px-exact : ce n'est PAS du responsive, c'est un Browser Source OBS.
//
// Lot 1 : template default uniquement (compact/full/minimal + theme.positions
// = système de thèmes, lot 5). La logique pure (bans, pastilles de série,
// hashtag, ticker casters, initiale de repli) vit dans utils/caster/matchScene
// — déjà testée en Vitest.

import { useEffect, useState } from 'react';
import type { MatchSceneData } from '@/types/caster';
import {
  castersLine,
  formatHashtag,
  normalizeBan,
  seriesDotsModel,
  teamInitial,
} from '@/utils/caster/matchScene';

type Props = {
  /** Data de scène déjà normalisée (normalizeMatchData). */
  data: MatchSceneData;
};

/**
 * Logo d'équipe du scoreboard : image si URL valide, sinon initiale de repli
 * (équivalent de setLogo() dans match.html — onerror ⇒ bascule fallback).
 * Ni URL ni nom ⇒ rien (les deux restent « hidden » côté desktop).
 */
function TeamLogo({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="team-logo"
        src={url}
        alt=""
        onError={() => setFailed(true)}
      />
    );
  }
  if (!url && !name) return null;
  return <div className="team-logo-fallback">{teamInitial(name)}</div>;
}

/**
 * Pilule de ban héros sous le bandeau d'équipe du HUD Overwatch (portrait
 * grisé + label + nom). normalizeBan → null ⇒ pilule masquée ; portrait en
 * erreur ⇒ seul le portrait disparaît, la pilule reste (comme renderOwBan).
 */
function OwBanPill({
  ban,
  label,
}: {
  ban: MatchSceneData['ban1'];
  label: string;
}) {
  const b = normalizeBan(ban);
  const portrait = b?.portrait ?? '';
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [portrait]);
  if (!b) return null;
  return (
    <div className="ow-ban">
      {portrait && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="ow-ban-portrait"
          src={portrait}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : null}
      <div className="ow-ban-text">
        <span className="ow-ban-label">{label}</span>
        <span className="ow-ban-name">{b.name}</span>
      </div>
    </div>
  );
}

/** Logo du bandeau HUD Overwatch (pas de fallback initiale côté desktop). */
function OwTeamLogo({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="ow-team-id-logo"
      src={url}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

export function CasterMatchOverlay({ data }: Props) {
  const dots = seriesDotsModel(data);
  const casters = castersLine(data.casters);
  const hashtag = formatHashtag(data.hashtag);
  const castersLabel = data.castersLabel || 'Casters';
  const banLabel = data.banLabel || 'Ban';

  return (
    <div className="caster-match-overlay">
      <div className="scoreboard">
        <div className="team left">
          <TeamLogo url={data.team1Logo} name={data.team1} />
          <span className="team-name">{data.team1}</span>
        </div>
        <div className="score-block">
          <div className="score left-score">{data.score1}</div>
          <div className="vs">VS</div>
          <div className="score right-score">{data.score2}</div>
        </div>
        <div className="team right">
          <span className="team-name">{data.team2}</span>
          <TeamLogo url={data.team2Logo} name={data.team2} />
        </div>
      </div>

      {dots ? (
        <div className="series-dots">
          <div className="series-side left">
            {dots.t1.map((won, i) => (
              <span key={i} className={won ? 'dot t1-won' : 'dot'} />
            ))}
          </div>
          <div className="series-side right">
            {dots.t2.map((won, i) => (
              <span key={i} className={won ? 'dot t2-won' : 'dot'} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="map-info">{data.map}</div>

      <div className="branding">
        <span className="branding-text">Women&apos;s Cup</span>
      </div>

      {casters ? (
        <div className="casters">
          <span className="casters-label">{castersLabel}</span>
          <span>{casters}</span>
        </div>
      ) : null}

      {hashtag ? <div className="hashtag-ribbon">{hashtag}</div> : null}

      {data.overwatchHud ? (
        <>
          <div className="ow-team left">
            <div className="ow-team-id">
              <OwTeamLogo url={data.team1Logo} />
              <span className="ow-team-id-name">{data.team1}</span>
            </div>
            <OwBanPill ban={data.ban1} label={banLabel} />
          </div>
          <div className="ow-team right">
            <div className="ow-team-id">
              <OwTeamLogo url={data.team2Logo} />
              <span className="ow-team-id-name">{data.team2}</span>
            </div>
            <OwBanPill ban={data.ban2} label={banLabel} />
          </div>
        </>
      ) : null}

      {/* CSS = valeurs EXACTES de match.html (template default) + tokens de
          shared.css, préfixées par la classe racine. Global (pas de scoping
          styled-jsx) car les éléments sont rendus par des sous-composants ;
          la page /overlay/* est chrome-less, aucun risque de fuite. */}
      <style jsx global>{`
        /* ---- Tokens (shared.css :root) portés sur la racine de l'overlay.
           --bg-card reprend l'override translucide de match.html (lower-third
           transparent, vs le #1b1130 opaque des scènes plein écran). */
        .caster-match-overlay {
          --bg: #0f0820;
          --bg-card: rgba(15, 8, 32, 0.92);
          --accent1: #00f0ff;
          --accent2: #ff2ec8;
          --accent3: #bb00ff;
          --text: #ffffff;
          --text-muted: #8888aa;
          --font: 'Segoe UI', system-ui, sans-serif;
          --font-heading: var(--font);
          --font-weight: 400;
          --font-scale: 1;
          --muted-2: color-mix(in srgb, var(--text-muted) 70%, transparent);
          --panel: color-mix(in srgb, var(--bg) 85%, transparent);
          --panel-strong: color-mix(in srgb, var(--bg) 92%, transparent);
          --danger: #ff5b5b;
          --ban: var(--danger);
          --ban-border: rgba(255, 70, 70, 0.45);
          --ban-border-strong: rgba(255, 70, 70, 0.75);
          --r-sm: 8px;
          --r-md: 10px;
          --r-lg: 16px;
          --r-pill: 999px;
          --shadow-card: 0 4px 24px rgba(0, 0, 0, 0.5);
          --glow: 0 0 20px color-mix(in srgb, var(--accent1) 12%, transparent);

          position: absolute;
          top: 0;
          left: 0;
          width: 1920px;
          height: 1080px;
          overflow: hidden;
          background: transparent;
          font-family: var(--font);
          font-weight: var(--font-weight);
        }
        .caster-match-overlay,
        .caster-match-overlay * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        /* Police des titres (shared.css) — scores et noms d'équipes. */
        .caster-match-overlay .team-name,
        .caster-match-overlay .score {
          font-family: var(--font-heading);
        }

        /* ---- Template: default (match.html) ---- */
        .caster-match-overlay .scoreboard {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: stretch;
          height: 64px;
          background: var(--bg-card);
          border-radius: 0 0 var(--r-lg) var(--r-lg);
          overflow: hidden;
          box-shadow: var(--shadow-card), var(--glow);
        }
        .caster-match-overlay .team {
          display: flex;
          align-items: center;
          padding: 0 28px;
          min-width: 260px;
        }
        .caster-match-overlay .team-name {
          font-size: calc(20px * var(--font-scale));
          font-weight: 700;
          color: var(--text);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .caster-match-overlay .team.left {
          justify-content: flex-end;
        }
        .caster-match-overlay .team.right {
          justify-content: flex-start;
        }
        .caster-match-overlay .score-block {
          display: flex;
          align-items: center;
        }
        .caster-match-overlay .score {
          width: 52px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: calc(28px * var(--font-scale));
          font-weight: 900;
          color: var(--text);
        }
        .caster-match-overlay .score.left-score {
          background: linear-gradient(135deg, var(--accent1), #2dccfd);
        }
        .caster-match-overlay .score.right-score {
          background: linear-gradient(135deg, var(--accent2), var(--accent3));
        }
        .caster-match-overlay .vs {
          width: 40px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: calc(14px * var(--font-scale));
          font-weight: 700;
          color: var(--muted-2);
          background: var(--bg-card);
        }
        .caster-match-overlay .map-info {
          position: absolute;
          top: 72px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--panel);
          padding: 6px 24px;
          border-radius: 0 0 var(--r-md) var(--r-md);
          font-size: calc(13px * var(--font-scale));
          color: var(--accent1);
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        .caster-match-overlay .branding {
          position: absolute;
          bottom: 20px;
          right: 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--panel);
          padding: 8px 18px;
          border-radius: var(--r-md);
          border: 1px solid color-mix(in srgb, var(--accent1) 15%, transparent);
        }
        .caster-match-overlay .branding-text {
          font-size: calc(13px * var(--font-scale));
          font-weight: 600;
          background: linear-gradient(90deg, var(--accent1), var(--accent2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        .caster-match-overlay .team-logo {
          width: 44px;
          height: 44px;
          border-radius: var(--r-sm);
          object-fit: contain;
          margin: 0 10px;
          background: rgba(255, 255, 255, 0.05);
        }
        .caster-match-overlay .team-logo-fallback {
          width: 44px;
          height: 44px;
          border-radius: var(--r-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.08);
          color: var(--text);
          font-size: calc(20px * var(--font-scale));
          font-weight: 800;
          margin: 0 10px;
          text-transform: uppercase;
        }

        /* Pastilles de progression de série au-dessus du scoreboard */
        .caster-match-overlay .series-dots {
          position: absolute;
          top: 4px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 6px;
          align-items: center;
          z-index: 2;
        }
        .caster-match-overlay .series-side {
          display: flex;
          gap: 4px;
          padding: 0 6px;
        }
        .caster-match-overlay .series-side.left {
          justify-content: flex-end;
          min-width: 80px;
        }
        .caster-match-overlay .series-side.right {
          justify-content: flex-start;
          min-width: 80px;
        }
        .caster-match-overlay .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.18);
          transition: background 0.3s ease;
        }
        .caster-match-overlay .dot.t1-won {
          background: linear-gradient(135deg, var(--accent1), #2dccfd);
          box-shadow: 0 0 8px var(--accent1);
        }
        .caster-match-overlay .dot.t2-won {
          background: linear-gradient(135deg, var(--accent2), var(--accent3));
          box-shadow: 0 0 8px var(--accent2);
        }

        /* Ticker des casters */
        .caster-match-overlay .casters {
          position: absolute;
          bottom: 20px;
          left: 24px;
          background: var(--panel);
          padding: 8px 16px;
          border-radius: var(--r-md);
          font-size: calc(12px * var(--font-scale));
          color: var(--text-muted);
          border: 1px solid color-mix(in srgb, var(--accent2) 12%, transparent);
          letter-spacing: 1px;
          z-index: 2;
        }
        .caster-match-overlay .casters-label {
          color: var(--accent2);
          text-transform: uppercase;
          font-weight: 700;
          margin-right: 6px;
          letter-spacing: 2px;
        }

        /* Ruban hashtag (bas centre) */
        .caster-match-overlay .hashtag-ribbon {
          position: absolute;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--panel);
          padding: 6px 18px;
          border-radius: var(--r-sm);
          font-size: calc(13px * var(--font-scale));
          font-weight: 800;
          letter-spacing: 2px;
          color: var(--accent2);
          text-transform: uppercase;
          border: 1px solid color-mix(in srgb, var(--accent2) 25%, transparent);
          z-index: 2;
        }

        /* ---- HUD Overwatch natif : bandeaux d'équipe ±430px du centre +
           pilule de ban grisée sous chacun (activé par overwatchHud). ---- */
        .caster-match-overlay .ow-team {
          position: absolute;
          top: 8px;
          left: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          z-index: 3;
        }
        .caster-match-overlay .ow-team.left {
          transform: translateX(-50%) translateX(-430px);
        }
        .caster-match-overlay .ow-team.right {
          transform: translateX(-50%) translateX(430px);
        }
        .caster-match-overlay .ow-team-id {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--bg-card);
          padding: 7px 16px;
          border-radius: 10px;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5);
        }
        /* Logo vers l'extérieur (loin du centre écran) de chaque côté. */
        .caster-match-overlay .ow-team.left .ow-team-id {
          flex-direction: row-reverse;
          border-bottom: 3px solid var(--accent1);
        }
        .caster-match-overlay .ow-team.right .ow-team-id {
          border-bottom: 3px solid var(--accent2);
        }
        .caster-match-overlay .ow-team-id-logo {
          width: 36px;
          height: 36px;
          border-radius: 6px;
          object-fit: contain;
          background: rgba(255, 255, 255, 0.05);
        }
        .caster-match-overlay .ow-team-id-name {
          font-size: calc(18px * var(--font-scale));
          font-weight: 800;
          color: var(--text);
          text-transform: uppercase;
          letter-spacing: 1px;
          white-space: nowrap;
        }
        .caster-match-overlay .ow-ban {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--panel-strong);
          padding: 3px 12px 3px 3px;
          border-radius: var(--r-pill);
          border: 1px solid var(--ban-border);
        }
        .caster-match-overlay .ow-team.left .ow-ban {
          flex-direction: row-reverse;
          padding: 3px 3px 3px 12px;
        }
        .caster-match-overlay .ow-ban-portrait {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
          filter: grayscale(1) brightness(0.65);
          border: 2px solid var(--ban-border-strong);
        }
        .caster-match-overlay .ow-ban-text {
          display: flex;
          flex-direction: column;
          line-height: 1.1;
        }
        .caster-match-overlay .ow-team.left .ow-ban-text {
          align-items: flex-end;
        }
        .caster-match-overlay .ow-ban-label {
          font-size: calc(10px * var(--font-scale));
          font-weight: 800;
          color: var(--ban);
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        .caster-match-overlay .ow-ban-name {
          font-size: calc(13px * var(--font-scale));
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
