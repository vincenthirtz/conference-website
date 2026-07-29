// components/overlay/caster/CasterScrimOverlay.tsx
//
// Overlay OBS de la scène `scrim` — port FIDÈLE de womenscup-caster
// src/overlays/scrim.html avec ses 3 modes (matchup / next / list). Scène
// PLEIN ÉCRAN à fond opaque var(--bg).
//
// scene.data ne porte que la CONFIG (mode, scrimId, titre, marque) ; les
// données live (équipes, score de série, horaires) sont fetchées ici en
// same-origin sur l'API publique du site (/api/scrims*), shaping répliqué de
// src/main/scrim.js + utils/scrimData.js (voir ./scrimLive.ts). Poll 20 s —
// même cadence que le desktop. Pas de Realtime ici (le desktop ne s'en sert
// que comme signal de refetch en matchup ; le poll reste le filet).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CasterSocials, ScrimSceneData } from '@/types/caster';
import { fetchScrimDetail, fetchUpcoming, type ScrimView } from './scrimLive';
import {
  HashtagBadge,
  SocialsFooter,
  hashtagCss,
  normalizeSocials,
  overlayRootCss,
  scanlinesCss,
  socialsFooterCss,
} from './overlayChrome';

/** Même cadence que le poller du caster desktop (src/main/scrim.js). */
const SCRIM_POLL_MS = 20_000;

type ScrimConfig = {
  mode: ScrimSceneData['mode'];
  scrimId: string | null;
  title: string;
  hashtag: string;
  socials: CasterSocials;
  countdownLabel: string;
};

function normalizeScrimConfig(
  raw: Record<string, unknown> | null | undefined
): ScrimConfig {
  const d = (raw || {}) as Partial<ScrimSceneData>;
  const mode =
    d.mode === 'next' || d.mode === 'list' ? d.mode : ('matchup' as const);
  return {
    mode,
    scrimId: typeof d.scrimId === 'string' && d.scrimId ? d.scrimId : null,
    title: typeof d.title === 'string' ? d.title : 'SCRIM',
    hashtag: typeof d.hashtag === 'string' ? d.hashtag : '',
    socials: normalizeSocials(d.socials),
    countdownLabel: d.countdownLabel || 'début dans',
  };
}

type LiveState = {
  status: 'loading' | 'ok' | 'empty' | 'error';
  scrim: ScrimView | null;
  scrims: ScrimView[];
};

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function teamInitialScrim(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Logo d'équipe : image si URL (onerror ⇒ initiale), sinon initiale. */
function ScrimLogo({ team }: { team: ScrimView['team1'] }) {
  const url = team.logo;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="logo" src={url} alt="" onError={() => setFailed(true)} />
    );
  }
  return <div className="logo empty">{teamInitialScrim(team.name)}</div>;
}

export function CasterScrimOverlay({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const cfg = useMemo(() => normalizeScrimConfig(data), [data]);

  const [live, setLive] = useState<LiveState>({
    status: 'loading',
    scrim: null,
    scrims: [],
  });

  const refresh = useCallback(async () => {
    try {
      if (cfg.mode === 'list') {
        const rows = await fetchUpcoming(8);
        setLive({
          status: rows.length ? 'ok' : 'empty',
          scrim: null,
          scrims: rows,
        });
      } else if (cfg.mode === 'next') {
        const rows = await fetchUpcoming(20);
        const next = rows[0] || null;
        setLive({ status: next ? 'ok' : 'empty', scrim: next, scrims: [] });
      } else {
        if (!cfg.scrimId) {
          setLive({ status: 'empty', scrim: null, scrims: [] });
          return;
        }
        const scrim = await fetchScrimDetail(cfg.scrimId);
        setLive({ status: scrim ? 'ok' : 'empty', scrim, scrims: [] });
      }
    } catch {
      setLive({ status: 'error', scrim: null, scrims: [] });
    }
  }, [cfg.mode, cfg.scrimId]);

  // Premier fetch + poll 20 s (le mode/scrimId peut changer via Realtime sur
  // la scène → refetch immédiat).
  useEffect(() => {
    setLive({ status: 'loading', scrim: null, scrims: [] });
    void refresh();
    const timer = setInterval(() => void refresh(), SCRIM_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Compte à rebours du mode next : tick 1 s vers scheduledDate.
  const cdTargetIso =
    cfg.mode === 'next' ? (live.scrim?.scheduledDate ?? null) : null;
  const cdTarget = cdTargetIso ? Date.parse(cdTargetIso) : NaN;
  const hasCountdown = !isNaN(cdTarget);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasCountdown) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasCountdown, cdTarget]);

  const scrim = live.scrim;
  const stateText =
    live.status === 'loading'
      ? 'Chargement…'
      : live.status === 'error'
        ? 'Scrims indisponibles'
        : cfg.mode === 'matchup'
          ? 'Aucun scrim sélectionné'
          : 'Aucun scrim à venir';

  const showCard =
    live.status === 'ok' && cfg.mode !== 'list' && scrim !== null;
  const showList = live.status === 'ok' && cfg.mode === 'list';

  const meta: string[] = [];
  if (showCard && scrim) {
    if (scrim.game) meta.push(scrim.game);
    if (scrim.bestOf) meta.push(`BO${scrim.bestOf}`);
    const when =
      cfg.mode === 'next'
        ? fmtDateTime(scrim.scheduledDate)
        : fmtTime(scrim.scheduledDate);
    if (when) meta.push(when);
  }

  return (
    <div className="caster-scrim-overlay">
      <div className="mesh" />
      <div className="scanlines" />

      <HashtagBadge hashtag={cfg.hashtag} />

      <div className="container">
        <div className="scrim-title">{cfg.title}</div>

        {showCard && scrim ? (
          <div className="card">
            <div className={`status-badge ${scrim.statusKey}`}>
              {scrim.statusLabel}
            </div>
            <div className="matchup">
              <div className="team">
                <ScrimLogo team={scrim.team1} />
                <div className="tname">{scrim.team1.name || '—'}</div>
              </div>
              <div className="score-block">
                {cfg.mode === 'next' ? (
                  <span className="sep">VS</span>
                ) : (
                  <>
                    <span className="score">{scrim.score1 ?? 0}</span>
                    <span className="sep">—</span>
                    <span className="score">{scrim.score2 ?? 0}</span>
                  </>
                )}
              </div>
              <div className="team">
                <ScrimLogo team={scrim.team2} />
                <div className="tname">{scrim.team2.name || '—'}</div>
              </div>
            </div>
            <div className="meta">{meta.join('  ·  ')}</div>
            {cfg.mode === 'next' && hasCountdown ? (
              <div className="countdown-row">
                <span className="cd-label">{cfg.countdownLabel}</span>
                <span className="cd">{fmtCountdown(cdTarget - now)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {showList ? (
          <div className="list">
            {live.scrims.slice(0, 6).map((s) => {
              const isLive = s.statusKey === 'live';
              return (
                <div key={s.id} className={`list-row ${isLive ? 'live' : ''}`}>
                  <div className="lr-time">
                    {fmtTime(s.scheduledDate) || '—'}
                  </div>
                  <div className="lr-teams">
                    {s.team1.name || 'TBD'}
                    <span className="lr-vs">vs</span>
                    {s.team2.name || 'TBD'}
                  </div>
                  <div className={`lr-status ${isLive ? 'live' : ''}`}>
                    {s.statusLabel}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {!showCard && !showList ? (
          <div className="state">{stateText}</div>
        ) : null}
      </div>

      <SocialsFooter socials={cfg.socials} />

      {/* CSS = valeurs EXACTES de scrim.html + tokens shared.css. */}
      <style jsx global>{`
        ${overlayRootCss('caster-scrim-overlay')}
        ${scanlinesCss('caster-scrim-overlay')}
        ${socialsFooterCss('caster-scrim-overlay')}
        ${hashtagCss('caster-scrim-overlay')}

        .caster-scrim-overlay .mesh {
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
          animation: caster-scrim-meshShift 18s ease-in-out infinite alternate;
        }
        @keyframes caster-scrim-meshShift {
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
        .caster-scrim-overlay .container {
          position: absolute;
          inset: 0;
          max-width: none;
          margin: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 40px;
          padding: 80px;
        }

        .caster-scrim-overlay .scrim-title {
          font-size: calc(40px * var(--font-scale));
          font-weight: 800;
          letter-spacing: 8px;
          text-transform: uppercase;
          color: var(--accent1);
          text-shadow: 0 0 24px
            color-mix(in srgb, var(--accent1) 50%, transparent);
        }

        /* ---------- Carte simple (matchup / next) ----------
           backdrop-filter: none neutralise le .card global du site. */
        .caster-scrim-overlay .card {
          backdrop-filter: none;
          width: 1400px;
          background: color-mix(in srgb, var(--bg-card) 80%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent1) 30%, transparent);
          border-radius: 24px;
          padding: 56px 64px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 36px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
          position: relative;
        }

        .caster-scrim-overlay .status-badge {
          position: absolute;
          top: -22px;
          left: 50%;
          transform: translateX(-50%);
          font-size: calc(20px * var(--font-scale));
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          padding: 8px 22px;
          border-radius: 999px;
          background: var(--bg-card);
          border: 1px solid var(--text-muted);
          color: var(--text-muted);
          display: inline-flex;
          align-items: center;
          gap: 10px;
          transition:
            color 0.3s ease,
            border-color 0.3s ease;
        }
        .caster-scrim-overlay .status-badge::before {
          content: '';
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: currentColor;
        }
        .caster-scrim-overlay .status-badge.live {
          color: var(--accent2);
          border-color: var(--accent2);
          animation: caster-scrim-livePulse 1.6s ease-in-out infinite;
        }
        .caster-scrim-overlay .status-badge.upcoming {
          color: var(--accent1);
          border-color: var(--accent1);
        }
        .caster-scrim-overlay .status-badge.done {
          color: var(--winner);
          border-color: var(--winner);
        }
        .caster-scrim-overlay .status-badge.cancelled {
          color: var(--danger);
          border-color: var(--danger);
        }
        @keyframes caster-scrim-livePulse {
          0%,
          100% {
            box-shadow: 0 0 0 0
              color-mix(in srgb, var(--accent2) 60%, transparent);
          }
          50% {
            box-shadow: 0 0 0 12px transparent;
          }
        }

        .caster-scrim-overlay .matchup {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          width: 100%;
          gap: 40px;
        }
        .caster-scrim-overlay .team {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
          min-width: 0;
        }
        .caster-scrim-overlay .logo {
          width: 200px;
          height: 200px;
          object-fit: contain;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.04);
        }
        .caster-scrim-overlay .logo.empty {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: calc(84px * var(--font-scale));
          font-weight: 800;
          color: var(--accent3);
        }
        .caster-scrim-overlay .tname {
          font-size: calc(52px * var(--font-scale));
          font-weight: 800;
          text-align: center;
          max-width: 460px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .caster-scrim-overlay .score-block {
          display: flex;
          align-items: center;
          gap: 24px;
          font-variant-numeric: tabular-nums;
        }
        .caster-scrim-overlay .score {
          font-size: calc(120px * var(--font-scale));
          font-weight: 900;
          line-height: 1;
        }
        .caster-scrim-overlay .sep {
          font-size: calc(64px * var(--font-scale));
          font-weight: 700;
          color: var(--text-muted);
        }

        .caster-scrim-overlay .meta {
          font-size: calc(28px * var(--font-scale));
          font-weight: 600;
          color: var(--text-muted);
          letter-spacing: 1px;
        }
        .caster-scrim-overlay .countdown-row {
          display: flex;
          align-items: baseline;
          gap: 18px;
        }
        .caster-scrim-overlay .cd-label {
          font-size: calc(24px * var(--font-scale));
          text-transform: uppercase;
          letter-spacing: 3px;
          color: var(--text-muted);
        }
        .caster-scrim-overlay .cd {
          font-size: calc(64px * var(--font-scale));
          font-weight: 900;
          color: var(--accent1);
          font-variant-numeric: tabular-nums;
          text-shadow: 0 0 24px
            color-mix(in srgb, var(--accent1) 50%, transparent);
        }

        /* ---------- Liste (agenda) ---------- */
        .caster-scrim-overlay .list {
          width: 1300px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .caster-scrim-overlay .list-row {
          display: grid;
          grid-template-columns: 200px 1fr 200px;
          align-items: center;
          gap: 24px;
          background: color-mix(in srgb, var(--bg-card) 70%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent1) 18%, transparent);
          border-left: 6px solid var(--accent1);
          border-radius: 14px;
          padding: 22px 32px;
        }
        .caster-scrim-overlay .list-row.live {
          border-left-color: var(--accent2);
        }
        .caster-scrim-overlay .lr-time {
          font-size: calc(34px * var(--font-scale));
          font-weight: 800;
          color: var(--accent1);
          font-variant-numeric: tabular-nums;
        }
        .caster-scrim-overlay .lr-teams {
          font-size: calc(36px * var(--font-scale));
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .caster-scrim-overlay .lr-vs {
          color: var(--text-muted);
          margin: 0 14px;
          font-weight: 600;
        }
        .caster-scrim-overlay .lr-status {
          text-align: right;
          font-size: calc(22px * var(--font-scale));
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-muted);
        }
        .caster-scrim-overlay .lr-status.live {
          color: var(--accent2);
        }

        /* ---------- Message d'état ---------- */
        .caster-scrim-overlay .state {
          font-size: calc(34px * var(--font-scale));
          font-weight: 600;
          color: var(--text-muted);
          letter-spacing: 1px;
        }
      `}</style>
    </div>
  );
}
