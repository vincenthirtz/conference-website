// components/overlay/caster/CasterLeaderboardOverlay.tsx
//
// Overlay OBS de la scène `leaderboard` — port FIDÈLE de womenscup-caster
// src/overlays/leaderboard.html : tableau 1300px (rang / nom / colonne
// principale / colonne secondaire) avec mise en avant de la 1re ligne.
// Scène PLEIN ÉCRAN, fond opaque var(--bg).
//
// Deux modes, comme le desktop :
//  - `leaderboard` → classement Glicko des joueuses
//    (GET /api/public/v1/leaderboard?limit=topN) : colonnes Joueuse / Rating /
//    Bilan ;
//  - `league` → classement d'une ligue (GET /api/public/v1/leagues/:slug) :
//    colonnes Équipe / Points / Tournois, sous-titre = nom de la ligue.
//
// scene.data ne porte que la config (mode, leagueSlug, topN, marque) : les
// lignes sont fetchées ici en SAME-ORIGIN (le desktop tape owwomenscup.fr en
// dur). Shaping dans ./casterSiteData.
//
// Robustesse d'antenne :
//  - poll 30 s (le desktop ne refetch qu'à l'édition d'une scène ; une Browser
//    Source hébergée tourne des heures) ;
//  - garde `fetchToken` porté du desktop : réponse obsolète ignorée quand le
//    caster change de mode / de ligue en cours de requête ;
//  - erreur API sur la MÊME référence : on garde le dernier rendu (jamais de
//    trou noir). Erreur juste après un changement de référence : on retombe sur
//    l'état vide « Aucune donnée » du desktop, plutôt que d'afficher le
//    classement d'une autre ligue.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CasterSocials, LeaderboardSceneData } from '@/types/caster';
import {
  SITE_DATA_POLL_MS,
  fetchLeaderboardRows,
  fetchLeagueBoard,
  nameInitials,
  type BoardRow,
} from './casterSiteData';
import {
  HashtagBadge,
  SocialsFooter,
  hashtagCss,
  normalizeSocials,
  overlayRootCss,
  scanlinesCss,
  socialsFooterCss,
} from './overlayChrome';

type LeaderboardConfig = {
  brand: string;
  title: string;
  mode: 'leaderboard' | 'league';
  leagueSlug: string | null;
  leagueName: string;
  topN: number;
  hashtag: string;
  socials: CasterSocials;
  /** Lignes déjà résolues dans `data` (mock / snapshot desktop) — pas de fetch. */
  inlineRows: BoardRow[] | null;
};

/** Défaut desktop de `topN`, borné 3..20 comme l'éditeur. */
function clampTopN(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(20, Math.max(3, n));
}

/** `data` tolérante : accepte aussi des lignes résolues inline (`data.rows`). */
export function normalizeLeaderboardData(
  raw: Record<string, unknown> | null | undefined
): LeaderboardConfig {
  const d = (raw || {}) as Partial<LeaderboardSceneData> & {
    brand?: string;
    rows?: unknown;
  };
  const inline = Array.isArray(d.rows) ? d.rows : null;
  return {
    brand: typeof d.brand === 'string' ? d.brand : "Women's Cup",
    title: (typeof d.title === 'string' && d.title) || 'Classement',
    mode: d.mode === 'league' ? 'league' : 'leaderboard',
    leagueSlug:
      typeof d.leagueSlug === 'string' && d.leagueSlug ? d.leagueSlug : null,
    leagueName: typeof d.leagueName === 'string' ? d.leagueName : '',
    topN: clampTopN(d.topN),
    hashtag: typeof d.hashtag === 'string' ? d.hashtag : '',
    socials: normalizeSocials(d.socials),
    inlineRows: inline
      ? inline.map((r, i) => {
          const row = (r || {}) as Partial<BoardRow>;
          return {
            key: String(row.key ?? i),
            rank: row.rank != null ? Number(row.rank) : null,
            name: String(row.name ?? '—'),
            main: row.main != null ? String(row.main) : '—',
            sub: row.sub != null ? String(row.sub) : '',
            logoUrl: row.logoUrl || null,
          };
        })
      : null,
  };
}

/** Logo/pastille d'une ligne : image si URL (onerror ⇒ initiales). */
function BoardLogo({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (url && !failed) {
    return (
      <span className="logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" onError={() => setFailed(true)} />
      </span>
    );
  }
  return <span className="logo">{nameInitials(name)}</span>;
}

export function CasterLeaderboardOverlay({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const cfg = useMemo(() => normalizeLeaderboardData(data), [data]);

  // `key` = référence des données affichées : permet de distinguer « erreur sur
  // la même référence » (on garde) de « erreur après changement » (on vide).
  const dataKey = `${cfg.mode}|${cfg.leagueSlug ?? ''}|${cfg.topN}`;
  const [board, setBoard] = useState<{
    key: string;
    rows: BoardRow[];
    leagueName: string | null;
  } | null>(null);
  const tokenRef = useRef(0);

  const useInline = cfg.inlineRows !== null;

  const refresh = useCallback(async () => {
    const mine = ++tokenRef.current;
    const key = dataKey;
    try {
      if (cfg.mode === 'league') {
        if (!cfg.leagueSlug) {
          // Référence absente ⇒ état vide, comme le desktop.
          setBoard({ key, rows: [], leagueName: null });
          return;
        }
        const res = await fetchLeagueBoard(cfg.leagueSlug, cfg.topN);
        if (mine !== tokenRef.current) return;
        setBoard({ key, rows: res.rows, leagueName: res.leagueName });
      } else {
        const rows = await fetchLeaderboardRows(cfg.topN);
        if (mine !== tokenRef.current) return;
        setBoard({ key, rows, leagueName: null });
      }
    } catch {
      if (mine !== tokenRef.current) return;
      setBoard((prev) =>
        prev && prev.key === key ? prev : { key, rows: [], leagueName: null }
      );
    }
  }, [dataKey, cfg.mode, cfg.leagueSlug, cfg.topN]);

  useEffect(() => {
    if (useInline) return undefined;
    void refresh();
    const timer = setInterval(() => void refresh(), SITE_DATA_POLL_MS);
    return () => clearInterval(timer);
  }, [useInline, refresh]);

  const isLeague = cfg.mode === 'league';
  // Sous-titre : libellé mémorisé dans la scène, à défaut le nom renvoyé par
  // l'API (le desktop n'a que le premier — écart assumé, purement additif).
  const subtitle = isLeague ? cfg.leagueName || board?.leagueName || '' : '';

  const rows = cfg.inlineRows ?? board?.rows ?? null;
  // `rows === null` = premier fetch en cours : tableau sans lignes ET sans
  // message, exactement comme le DOM initial du desktop (pas de flash
  // « Aucune donnée » au démarrage).
  const showEmpty = rows !== null && rows.length === 0;

  return (
    <div className="caster-leaderboard-overlay">
      <div className="mesh" />
      <div className="scanlines" />

      <HashtagBadge hashtag={cfg.hashtag} />

      <div className="container">
        <div className="brand">{cfg.brand}</div>
        <div className="section-title">{cfg.title}</div>
        {subtitle ? <div className="subtitle">{subtitle}</div> : null}

        <div className="board">
          <div className="thead">
            <div className="num">#</div>
            <div>{isLeague ? 'Équipe' : 'Joueuse'}</div>
            <div className="num">{isLeague ? 'Points' : 'Rating'}</div>
            <div className="num">{isLeague ? 'Tournois' : 'Bilan'}</div>
          </div>
          <div className="tbody">
            {showEmpty ? <div className="empty">Aucune donnée</div> : null}
            {(rows ?? []).map((r, i) => (
              <div className={`row ${i === 0 ? 'top1' : ''}`} key={r.key}>
                <div className="rank">{r.rank != null ? r.rank : i + 1}</div>
                <div className="who">
                  <BoardLogo url={r.logoUrl} name={r.name} />
                  <span className="name">{r.name || '—'}</span>
                </div>
                <div className="main">{r.main}</div>
                <div className="sub">{r.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SocialsFooter socials={cfg.socials} />

      {/* CSS = valeurs EXACTES de leaderboard.html + tokens shared.css. */}
      <style jsx global>{`
        ${overlayRootCss('caster-leaderboard-overlay')}
        ${scanlinesCss('caster-leaderboard-overlay')}
        ${socialsFooterCss('caster-leaderboard-overlay')}
        ${hashtagCss('caster-leaderboard-overlay')}

        .caster-leaderboard-overlay .mesh {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              circle at 25% 35%,
              color-mix(in srgb, var(--accent2) 28%, transparent) 0%,
              transparent 45%
            ),
            radial-gradient(
              circle at 75% 65%,
              color-mix(in srgb, var(--accent3) 28%, transparent) 0%,
              transparent 45%
            ),
            linear-gradient(135deg, var(--bg) 0%, var(--bg-card) 100%);
          animation: caster-lb-meshShift 22s ease-in-out infinite alternate;
        }
        @keyframes caster-lb-meshShift {
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

        /* max-width/margin explicites : neutralisent le .container global du
           site (max-width 1200px + centrage) qui fuirait ici. */
        .caster-leaderboard-overlay .container {
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
          padding: 50px 120px;
        }
        .caster-leaderboard-overlay .brand {
          font-size: calc(28px * var(--font-scale));
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
          margin-bottom: 6px;
        }
        .caster-leaderboard-overlay .section-title {
          font-size: calc(44px * var(--font-scale));
          font-weight: 900;
          letter-spacing: 6px;
          text-transform: uppercase;
          color: var(--accent1);
          margin-bottom: 8px;
        }
        .caster-leaderboard-overlay .subtitle {
          font-size: calc(22px * var(--font-scale));
          color: var(--text-muted);
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 28px;
        }

        .caster-leaderboard-overlay .board {
          width: 1300px;
          max-width: 100%;
          background: color-mix(in srgb, var(--bg-card) 78%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent1) 30%, transparent);
          border-radius: 24px;
          padding: 20px 32px;
          box-shadow: 0 0 60px
            color-mix(in srgb, var(--accent1) 18%, transparent);
        }
        .caster-leaderboard-overlay .thead {
          display: grid;
          grid-template-columns: 90px 1fr 200px 200px;
          align-items: center;
          gap: 20px;
          padding: 10px 20px 16px;
          font-size: calc(18px * var(--font-scale));
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--text-muted);
          border-bottom: 1px solid
            color-mix(in srgb, var(--text-muted) 25%, transparent);
        }
        .caster-leaderboard-overlay .thead .num,
        .caster-leaderboard-overlay .row .num {
          text-align: right;
        }
        .caster-leaderboard-overlay .row {
          display: grid;
          grid-template-columns: 90px 1fr 200px 200px;
          align-items: center;
          gap: 20px;
          padding: 16px 20px;
          border-bottom: 1px solid
            color-mix(in srgb, var(--text-muted) 12%, transparent);
        }
        .caster-leaderboard-overlay .row:last-child {
          border-bottom: none;
        }
        .caster-leaderboard-overlay .row.top1 {
          background: color-mix(in srgb, var(--accent1) 12%, transparent);
          border-radius: 12px;
        }
        .caster-leaderboard-overlay .rank {
          font-size: calc(40px * var(--font-scale));
          font-weight: 900;
          color: var(--accent2);
          line-height: 1;
        }
        .caster-leaderboard-overlay .row.top1 .rank {
          color: var(--accent1);
        }
        .caster-leaderboard-overlay .who {
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: 0;
        }
        .caster-leaderboard-overlay .logo {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          flex: 0 0 auto;
          overflow: hidden;
          background: linear-gradient(135deg, var(--accent1), var(--accent3));
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: calc(22px * var(--font-scale));
          color: var(--bg);
        }
        .caster-leaderboard-overlay .logo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .caster-leaderboard-overlay .name {
          font-size: calc(34px * var(--font-scale));
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .caster-leaderboard-overlay .main {
          font-size: calc(38px * var(--font-scale));
          font-weight: 900;
          color: var(--text);
          text-align: right;
        }
        .caster-leaderboard-overlay .row.top1 .main {
          color: var(--accent1);
        }
        .caster-leaderboard-overlay .sub {
          font-size: calc(26px * var(--font-scale));
          color: var(--text-muted);
          text-align: right;
        }
        .caster-leaderboard-overlay .empty {
          padding: 40px;
          text-align: center;
          color: var(--text-muted);
          font-size: calc(28px * var(--font-scale));
        }
      `}</style>
    </div>
  );
}
