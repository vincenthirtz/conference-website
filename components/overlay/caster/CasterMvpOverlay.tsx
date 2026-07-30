// components/overlay/caster/CasterMvpOverlay.tsx
//
// Overlay OBS de la scène `mvp` — port FIDÈLE de womenscup-caster
// src/overlays/mvp.html : titre, pastille de statut (EN COURS / FERMÉ /
// EN ATTENTE), candidates triées par votes avec barres + numéro d'origine
// (le badge suit l'ordre de saisie pour que `!mvp 1` reste lisible).
//
// Le tally live du chat est publié dans `caster_scenes.data` par le cockpit
// (components/admin/caster/MvpPollPanel, debounce ~1,5 s) : cet overlay le
// reçoit donc via le Realtime de la scène, sans canal séparé. `leaderId` est
// lu du snapshot quand il est présent, sinon déduit (max de votes > 0, poll
// ouvert) pour rester tolérant aux data écrites par l'app desktop.
// Scène PLEIN ÉCRAN à fond opaque var(--bg).

import { useMemo } from 'react';
import { overlayRootCss, scanlinesCss } from './overlayChrome';

type MvpCandidateView = {
  id: string;
  /** Numéro d'origine (1-based) affiché dans le badge de rang. */
  idx: number;
  label: string;
  count: number;
  percent: number;
};

type MvpView = {
  brand: string;
  title: string;
  isOpen: boolean;
  endedAt: string | null;
  total: number;
  candidates: MvpCandidateView[];
  leaderId: string | null;
  liveLabel: string;
  closedLabel: string;
  waitingLabel: string;
};

/**
 * Snapshot tolérant : accepte la shape desktop (`{ id, label }` + tally
 * `count`/`percent`) ET la shape éditeur web (`{ name, team?, votes? }`).
 */
function normalizeMvpData(
  raw: Record<string, unknown> | null | undefined
): MvpView {
  const d = (raw || {}) as {
    brand?: string;
    title?: string;
    isOpen?: boolean;
    endedAt?: string | null;
    total?: number;
    candidates?: unknown;
    leaderId?: string;
    liveLabel?: string;
    closedLabel?: string;
    waitingLabel?: string;
  };
  const rawList = Array.isArray(d.candidates) ? d.candidates : [];
  const base = rawList
    .map((c, i) => {
      const r = (c || {}) as {
        id?: string;
        label?: string;
        name?: string;
        votes?: number;
        count?: number;
        percent?: number;
      };
      const label = String(r.label || r.name || '').trim();
      return {
        id: String(r.id || i + 1),
        idx: i + 1,
        label,
        count: Number(r.count ?? r.votes) || 0,
        rawPercent: r.percent,
      };
    })
    .filter((c) => c.label);
  const sum = base.reduce((acc, c) => acc + c.count, 0);
  const total = Number(d.total) || sum;
  const candidates: MvpCandidateView[] = base.map((c) => ({
    id: c.id,
    idx: c.idx,
    label: c.label,
    count: c.count,
    percent:
      c.rawPercent != null
        ? Number(c.rawPercent) || 0
        : total > 0
          ? Math.round((c.count / total) * 100)
          : 0,
  }));
  // Leader : id fourni par le tally (lot 4), sinon max strict de votes > 0
  // dans l'ordre de saisie — même règle que buildTally côté desktop.
  let leaderId: string | null = d.leaderId || null;
  if (!leaderId) {
    let best = 0;
    for (const c of candidates) {
      if (c.count > best) {
        best = c.count;
        leaderId = c.id;
      }
    }
  }
  return {
    brand: typeof d.brand === 'string' ? d.brand : "Women's Cup",
    title: typeof d.title === 'string' && d.title ? d.title : 'Vote MVP',
    isOpen: d.isOpen === true,
    endedAt: d.endedAt || null,
    total,
    candidates,
    leaderId,
    liveLabel: d.liveLabel || 'EN COURS',
    closedLabel: d.closedLabel || 'FERMÉ',
    waitingLabel: d.waitingLabel || 'EN ATTENTE',
  };
}

export function CasterMvpOverlay({ data }: { data: Record<string, unknown> }) {
  const d = useMemo(() => normalizeMvpData(data), [data]);

  const statusLabel = d.isOpen
    ? d.liveLabel
    : d.endedAt
      ? d.closedLabel
      : d.waitingLabel;

  // Tri par votes desc pour le classement visuel ; le badge garde le numéro
  // d'origine (comme l'overlay desktop).
  const sorted = [...d.candidates].sort((a, b) => b.count - a.count);
  const empty = d.candidates.length === 0;

  return (
    <div className="caster-mvp-overlay">
      <div className="mesh" />
      <div className="scanlines" />

      <div className="container">
        <div className="header">
          <div className="brand">{d.brand}</div>
          <h1 className="title">{d.title}</h1>
          <div className="meta">
            <span className={`status ${d.isOpen ? 'live' : ''}`}>
              <span className="dot" />
              <span>{statusLabel}</span>
            </span>
            <span className="total">
              <span className="total-num">{d.total}</span> votes
            </span>
          </div>
        </div>

        {empty ? (
          <p className="empty">
            Aucun candidat — configurez le poll dans le caster
          </p>
        ) : (
          <div className="candidates">
            {sorted.map((c) => {
              const leader = d.leaderId === c.id && d.isOpen;
              return (
                <div
                  key={c.id}
                  className={`candidate ${leader ? 'leader' : ''}`}
                >
                  <div className="rank">{c.idx}</div>
                  <div className="body">
                    <div className="label">{c.label}</div>
                    <div className="bar-wrap">
                      <div className="bar" style={{ width: `${c.percent}%` }} />
                    </div>
                  </div>
                  <div className="stats">
                    <div className="count">{c.count}</div>
                    <div className="percent">{c.percent}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!empty ? (
        <div className="footer">
          Votez en tapant <code>!mvp &lt;numéro&gt;</code> dans le chat
        </div>
      ) : null}

      {/* CSS = valeurs EXACTES de mvp.html + tokens shared.css. */}
      <style jsx global>{`
        ${overlayRootCss('caster-mvp-overlay')}
        ${scanlinesCss('caster-mvp-overlay')}

        .caster-mvp-overlay .mesh {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              circle at 30% 20%,
              color-mix(in srgb, var(--accent1) 25%, transparent) 0%,
              transparent 45%
            ),
            radial-gradient(
              circle at 70% 80%,
              color-mix(in srgb, var(--accent2) 25%, transparent) 0%,
              transparent 45%
            ),
            linear-gradient(135deg, var(--bg) 0%, var(--bg-card) 100%);
        }

        /* width/max-width/margin explicites : neutralisent le .container
           global du site (max-width 1200px + centrage) qui fuirait ici. */
        .caster-mvp-overlay .container {
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
          padding: 60px 80px;
        }

        .caster-mvp-overlay .header {
          text-align: center;
          margin-bottom: 50px;
        }

        .caster-mvp-overlay .brand {
          font-size: calc(24px * var(--font-scale));
          font-weight: 800;
          letter-spacing: 6px;
          text-transform: uppercase;
          color: var(--accent1);
          margin-bottom: 12px;
        }

        .caster-mvp-overlay .title {
          font-size: calc(88px * var(--font-scale));
          font-weight: 900;
          letter-spacing: 4px;
          text-transform: uppercase;
          background: linear-gradient(
            135deg,
            var(--accent1) 0%,
            var(--accent2) 100%
          );
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 60px
            color-mix(in srgb, var(--accent1) 30%, transparent);
          margin-bottom: 20px;
        }

        .caster-mvp-overlay .meta {
          display: flex;
          gap: 30px;
          justify-content: center;
          align-items: center;
          font-size: calc(22px * var(--font-scale));
          color: var(--text-muted);
        }

        .caster-mvp-overlay .status {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 8px 20px;
          border-radius: 100px;
          font-weight: 700;
          font-size: calc(18px * var(--font-scale));
          text-transform: uppercase;
          letter-spacing: 2px;
          border: 2px solid var(--text-muted);
          color: var(--text-muted);
        }
        .caster-mvp-overlay .status.live {
          border-color: var(--winner);
          color: var(--winner);
          background: color-mix(in srgb, var(--winner) 12%, transparent);
        }
        .caster-mvp-overlay .status .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: currentColor;
        }
        .caster-mvp-overlay .status.live .dot {
          animation: caster-mvp-pulse 1.4s ease-in-out infinite;
        }
        @keyframes caster-mvp-pulse {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.3);
          }
        }

        .caster-mvp-overlay .total {
          font-weight: 700;
          color: var(--text);
        }
        .caster-mvp-overlay .total-num {
          color: var(--accent1);
          font-size: calc(28px * var(--font-scale));
        }

        .caster-mvp-overlay .candidates {
          width: 100%;
          max-width: 1200px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .caster-mvp-overlay .candidate {
          display: grid;
          grid-template-columns: 56px 1fr 160px;
          align-items: center;
          gap: 20px;
          padding: 20px 28px;
          background: color-mix(in srgb, var(--bg-card) 80%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent3) 30%, transparent);
          border-radius: 14px;
          position: relative;
          overflow: hidden;
          transition:
            transform 0.3s ease,
            border-color 0.3s ease;
        }
        .caster-mvp-overlay .candidate.leader {
          border-color: var(--winner);
          box-shadow: 0 0 36px
            color-mix(in srgb, var(--winner) 40%, transparent);
          transform: scale(1.02);
        }
        .caster-mvp-overlay .candidate.leader .rank {
          background: var(--winner);
          color: var(--bg);
        }

        .caster-mvp-overlay .rank {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: color-mix(in srgb, var(--accent3) 40%, transparent);
          color: var(--text);
          font-weight: 900;
          font-size: calc(28px * var(--font-scale));
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-shadow: 0 0 10px rgba(0, 0, 0, 0.6);
        }

        .caster-mvp-overlay .body {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .caster-mvp-overlay .label {
          font-size: calc(30px * var(--font-scale));
          font-weight: 700;
          z-index: 2;
          position: relative;
        }

        .caster-mvp-overlay .bar-wrap {
          position: relative;
          height: 14px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.06);
          overflow: hidden;
        }
        .caster-mvp-overlay .bar {
          position: absolute;
          inset: 0;
          width: 0%;
          background: linear-gradient(90deg, var(--accent1), var(--accent2));
          border-radius: 8px;
          transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
          box-shadow: 0 0 12px
            color-mix(in srgb, var(--accent2) 50%, transparent);
        }
        .caster-mvp-overlay .candidate.leader .bar {
          background: linear-gradient(90deg, var(--winner), var(--accent1));
        }

        .caster-mvp-overlay .stats {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .caster-mvp-overlay .count {
          font-size: calc(40px * var(--font-scale));
          font-weight: 900;
          color: var(--text);
          line-height: 1;
        }
        .caster-mvp-overlay .percent {
          font-size: calc(18px * var(--font-scale));
          color: var(--text-muted);
          margin-top: 4px;
        }

        .caster-mvp-overlay .empty {
          text-align: center;
          padding: 80px;
          font-size: calc(32px * var(--font-scale));
          color: var(--text-muted);
          font-style: italic;
        }

        .caster-mvp-overlay .footer {
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: calc(20px * var(--font-scale));
          color: var(--text-muted);
        }
        .caster-mvp-overlay .footer code {
          background: color-mix(in srgb, var(--bg-card) 90%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent1) 40%, transparent);
          border-radius: 6px;
          padding: 6px 14px;
          font-family: Consolas, monospace;
          color: var(--accent1);
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
