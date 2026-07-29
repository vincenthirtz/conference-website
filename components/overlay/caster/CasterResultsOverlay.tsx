// components/overlay/caster/CasterResultsOverlay.tsx
//
// Overlay OBS de la scène `results` — port FIDÈLE de womenscup-caster
// src/overlays/results.html : scores avec mise en avant du vainqueur
// (scale + couleur --winner), résultats par map, MVP optionnel, logos avec
// initiale de repli, socials/hashtag. Scène PLEIN ÉCRAN à fond var(--bg).

import { useEffect, useMemo, useState } from 'react';
import type { ResultsSceneData } from '@/types/caster';
import { teamInitial } from '@/utils/caster/matchScene';
import {
  HashtagBadge,
  SocialsFooter,
  hashtagCss,
  normalizeSocials,
  overlayRootCss,
  scanlinesCss,
  socialsFooterCss,
} from './overlayChrome';

type ResultsView = ResultsSceneData & {
  brand: string;
  resultLabel: string;
  mvpLabel: string;
};

function normalizeResultsData(
  raw: Record<string, unknown> | null | undefined
): ResultsView {
  const d = (raw || {}) as Partial<ResultsSceneData> & {
    brand?: string;
    resultLabel?: string;
    mvpLabel?: string;
  };
  const mapResults = Array.isArray(d.mapResults)
    ? d.mapResults
        .filter((m) => m && typeof m === 'object')
        .map((m) => ({
          map: m.map || '',
          score1: Number(m.score1) || 0,
          score2: Number(m.score2) || 0,
        }))
    : [];
  return {
    team1: d.team1 || '',
    team2: d.team2 || '',
    score1: Number(d.score1) || 0,
    score2: Number(d.score2) || 0,
    bestOf: Number(d.bestOf) || undefined,
    mvp: typeof d.mvp === 'string' ? d.mvp : '',
    mapResults,
    team1Logo: d.team1Logo || '',
    team2Logo: d.team2Logo || '',
    hashtag: typeof d.hashtag === 'string' ? d.hashtag : '',
    socials: normalizeSocials(d.socials),
    brand: typeof d.brand === 'string' ? d.brand : "Women's Cup",
    resultLabel: d.resultLabel || 'Match terminé',
    mvpLabel: d.mvpLabel || 'MVP',
  };
}

/**
 * Logo de bloc équipe : image si URL (onerror ⇒ initiale, comme setLogo()),
 * initiale si nom seul, rien sinon (les deux restent hidden côté desktop).
 */
function ResultTeamLogo({ url, name }: { url: string; name: string }) {
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
  if (!name) return null;
  return <div className="team-logo-fallback">{teamInitial(name)}</div>;
}

export function CasterResultsOverlay({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const d = useMemo(() => normalizeResultsData(data), [data]);

  const s1 = d.score1;
  const s2 = d.score2;
  const block1 = s1 > s2 ? 'winner' : s1 < s2 ? 'loser' : '';
  const block2 = s2 > s1 ? 'winner' : s2 < s1 ? 'loser' : '';
  const winnerName = s1 > s2 ? d.team1 : s2 > s1 ? d.team2 : '';

  return (
    <div className="caster-results-overlay">
      <div className="mesh" />
      <div className="scanlines" />

      <HashtagBadge hashtag={d.hashtag} />

      <div className="container">
        <div className="header">
          <div className="brand">{d.brand}</div>
          <div className="results-title">{d.resultLabel}</div>
          {d.bestOf ? <div className="bo-badge">Best of {d.bestOf}</div> : null}
        </div>

        <div className="result-card">
          <div className={`team-block ${block1}`}>
            <ResultTeamLogo url={d.team1Logo} name={d.team1} />
            <div className="team-name">{d.team1 || 'ÉQUIPE 1'}</div>
            <div className="team-score">{s1}</div>
          </div>
          <div className="vs-divider">—</div>
          <div className={`team-block ${block2}`}>
            <ResultTeamLogo url={d.team2Logo} name={d.team2} />
            <div className="team-name">{d.team2 || 'ÉQUIPE 2'}</div>
            <div className="team-score">{s2}</div>
          </div>
        </div>

        {d.mapResults.length > 0 ? (
          <div className="map-breakdown">
            {d.mapResults.map((m, i) => {
              const w1 = m.score1 > m.score2;
              const w2 = m.score2 > m.score1;
              return (
                <div
                  key={i}
                  className={`map-card ${w1 ? 't1-win' : w2 ? 't2-win' : ''}`}
                >
                  <div className="map-name">{m.map || '—'}</div>
                  <div className="map-score">
                    <span className={m.score1 >= m.score2 ? 'w' : 'l'}>
                      {m.score1}
                    </span>
                    {' - '}
                    <span className={m.score2 >= m.score1 ? 'w' : 'l'}>
                      {m.score2}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {d.mvp ? (
          <div className="mvp">
            <span className="mvp-trophy">🏆</span>
            <span className="mvp-label">{d.mvpLabel}</span>
            <span className="mvp-name">{d.mvp}</span>
          </div>
        ) : null}

        {winnerName ? (
          <div className="winner-banner">{winnerName} remporte le match</div>
        ) : null}
      </div>

      <SocialsFooter socials={d.socials} />

      {/* CSS = valeurs EXACTES de results.html + tokens shared.css. */}
      <style jsx global>{`
        ${overlayRootCss('caster-results-overlay')}
        ${scanlinesCss('caster-results-overlay')}
        ${socialsFooterCss('caster-results-overlay', {
          bottom: 40,
          fontSize: 16,
          opacity: 0.75,
          iconSize: 26,
          iconFontSize: 14,
          iconBgPct: 18,
        })}
        ${hashtagCss('caster-results-overlay', {
          fontSize: 20,
          padding: '10px 20px',
        })}

        .caster-results-overlay .mesh {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              circle at 25% 30%,
              color-mix(in srgb, var(--accent1) 25%, transparent) 0%,
              transparent 45%
            ),
            radial-gradient(
              circle at 75% 70%,
              color-mix(in srgb, var(--accent2) 25%, transparent) 0%,
              transparent 45%
            ),
            linear-gradient(135deg, var(--bg) 0%, var(--bg-card) 100%);
        }

        /* width/max-width/margin explicites : neutralisent le .container
           global du site (max-width 1200px + centrage) qui fuirait ici. */
        .caster-results-overlay .container {
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
          padding: 40px 80px;
        }

        .caster-results-overlay .header {
          text-align: center;
          margin-bottom: 30px;
        }

        .caster-results-overlay .brand {
          font-size: calc(28px * var(--font-scale));
          font-weight: 800;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 6px;
          margin-bottom: 8px;
        }
        .caster-results-overlay .results-title {
          font-size: calc(60px * var(--font-scale));
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
        }
        .caster-results-overlay .bo-badge {
          display: inline-block;
          margin-top: 12px;
          font-size: calc(16px * var(--font-scale));
          color: var(--accent2);
          font-weight: 700;
          letter-spacing: 4px;
          text-transform: uppercase;
          padding: 6px 18px;
          border: 1px solid color-mix(in srgb, var(--accent2) 50%, transparent);
          border-radius: 4px;
        }

        .caster-results-overlay .result-card {
          display: flex;
          align-items: center;
          gap: 60px;
          background: color-mix(in srgb, var(--bg-card) 60%, transparent);
          backdrop-filter: blur(8px);
          padding: 50px 80px;
          border-radius: 24px;
          border: 1px solid color-mix(in srgb, var(--accent1) 15%, transparent);
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
          margin-bottom: 40px;
        }

        .caster-results-overlay .team-block {
          text-align: center;
          min-width: 320px;
          transition: transform 0.4s ease;
        }

        .caster-results-overlay .team-logo,
        .caster-results-overlay .team-logo-fallback {
          width: 100px;
          height: 100px;
          margin: 0 auto 18px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.06);
        }
        .caster-results-overlay .team-logo {
          object-fit: contain;
        }
        .caster-results-overlay .team-logo-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text);
          font-size: calc(44px * var(--font-scale));
          font-weight: 800;
          text-transform: uppercase;
        }

        .caster-results-overlay .team-name {
          font-size: calc(38px * var(--font-scale));
          font-weight: 800;
          color: var(--text);
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 14px;
          transition: color 0.35s ease;
        }
        .caster-results-overlay .team-score {
          font-size: calc(140px * var(--font-scale));
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          line-height: 1;
          transition:
            color 0.35s ease,
            text-shadow 0.35s ease;
        }

        .caster-results-overlay .team-block.winner {
          transform: scale(1.05);
        }
        .caster-results-overlay .team-block.winner .team-score {
          color: var(--winner);
          text-shadow: 0 0 60px
            color-mix(in srgb, var(--winner) 50%, transparent);
        }
        .caster-results-overlay .team-block.winner .team-name {
          color: var(--winner);
        }
        .caster-results-overlay .team-block.loser .team-score {
          color: var(--muted-2);
        }
        .caster-results-overlay .team-block.loser .team-name {
          color: var(--text-muted);
        }

        .caster-results-overlay .vs-divider {
          font-size: calc(28px * var(--font-scale));
          color: var(--muted-2);
          font-weight: 700;
          letter-spacing: 4px;
        }

        .caster-results-overlay .map-breakdown {
          display: flex;
          gap: 14px;
          margin-bottom: 40px;
          flex-wrap: wrap;
          justify-content: center;
          max-width: 1400px;
        }
        .caster-results-overlay .map-card {
          background: color-mix(in srgb, var(--bg-card) 70%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent1) 20%, transparent);
          border-radius: 12px;
          padding: 14px 22px;
          min-width: 200px;
          text-align: center;
          transition: border-color 0.35s ease;
        }
        .caster-results-overlay .map-card.t1-win {
          border-color: color-mix(in srgb, var(--winner) 60%, transparent);
        }
        .caster-results-overlay .map-card.t2-win {
          border-color: color-mix(in srgb, var(--accent2) 60%, transparent);
        }
        .caster-results-overlay .map-name {
          font-size: calc(13px * var(--font-scale));
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 6px;
        }
        .caster-results-overlay .map-score {
          font-size: calc(28px * var(--font-scale));
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .caster-results-overlay .map-score .w {
          color: var(--winner);
        }
        .caster-results-overlay .map-score .l {
          color: var(--muted-2);
        }

        .caster-results-overlay .mvp {
          display: flex;
          align-items: center;
          gap: 14px;
          background: color-mix(in srgb, var(--bg-card) 70%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent2) 35%, transparent);
          padding: 14px 28px;
          border-radius: 12px;
          margin-bottom: 20px;
        }
        .caster-results-overlay .mvp-label {
          font-size: calc(13px * var(--font-scale));
          color: var(--accent2);
          text-transform: uppercase;
          letter-spacing: 4px;
          font-weight: 700;
        }
        .caster-results-overlay .mvp-name {
          font-size: calc(24px * var(--font-scale));
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        .caster-results-overlay .mvp-trophy {
          font-size: calc(28px * var(--font-scale));
        }

        .caster-results-overlay .winner-banner {
          margin-top: 8px;
          font-size: calc(26px * var(--font-scale));
          color: var(--winner);
          text-transform: uppercase;
          letter-spacing: 6px;
          font-weight: 800;
          animation: caster-results-glow 2s ease-in-out infinite;
        }
        @keyframes caster-results-glow {
          0%,
          100% {
            text-shadow: 0 0 10px
              color-mix(in srgb, var(--winner) 30%, transparent);
          }
          50% {
            text-shadow: 0 0 40px
              color-mix(in srgb, var(--winner) 80%, transparent);
          }
        }
      `}</style>
    </div>
  );
}
