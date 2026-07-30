// components/overlay/caster/CasterStandingsOverlay.tsx
//
// Overlay OBS de la scène `standings` — port FIDÈLE de womenscup-caster
// src/overlays/standings.html : classement FINAL d'un tournoi (rang + médaille
// pour le podium, équipe, prize) dans un tableau 1300px. Scène PLEIN ÉCRAN,
// fond opaque var(--bg).
//
// scene.data ne porte qu'une RÉFÉRENCE (`tournamentId`, id OU slug) : les
// lignes viennent de `GET /api/public/v1/tournaments/:id/standings` en
// SAME-ORIGIN (le desktop tape owwomenscup.fr en dur). L'endpoint renvoie `[]`
// tant que le tournoi n'est pas finalisé (table `final_rankings` vide) → état
// « Tournoi non finalisé », comme le desktop.
//
// Robustesse d'antenne :
//  - poll 30 s (le classement final se remplit pendant le show, à la
//    finalisation du tournoi ; le desktop ne refetch qu'à l'édition) ;
//  - garde `fetchToken` porté du desktop ;
//  - erreur API sur la MÊME référence : dernier rendu conservé (pas de trou
//    noir). Erreur après changement de tournoi : état vide plutôt que le
//    classement du tournoi précédent.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CasterSocials, StandingsSceneData } from '@/types/caster';
import {
  SITE_DATA_POLL_MS,
  fetchTournamentStandingRows,
  nameInitials,
  type StandingRow,
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

/** Médailles du podium — identiques au desktop. */
const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

type StandingsConfig = {
  brand: string;
  title: string;
  tournamentId: string | null;
  tournamentName: string;
  hashtag: string;
  socials: CasterSocials;
  /** Lignes déjà résolues dans `data` (mock / snapshot desktop) — pas de fetch. */
  inlineRows: StandingRow[] | null;
};

/** `data` tolérante : accepte aussi des lignes résolues inline (`data.rows`). */
export function normalizeStandingsData(
  raw: Record<string, unknown> | null | undefined
): StandingsConfig {
  const d = (raw || {}) as Partial<StandingsSceneData> & {
    brand?: string;
    rows?: unknown;
  };
  const inline = Array.isArray(d.rows) ? d.rows : null;
  return {
    brand: typeof d.brand === 'string' ? d.brand : "Women's Cup",
    title: (typeof d.title === 'string' && d.title) || 'Classement final',
    tournamentId:
      typeof d.tournamentId === 'string' && d.tournamentId
        ? d.tournamentId
        : null,
    tournamentName:
      typeof d.tournamentName === 'string' ? d.tournamentName : '',
    hashtag: typeof d.hashtag === 'string' ? d.hashtag : '',
    socials: normalizeSocials(d.socials),
    inlineRows: inline
      ? inline.map((r, i) => {
          const row = (r || {}) as Partial<StandingRow>;
          return {
            key: String(row.key ?? i),
            rank: row.rank != null ? Number(row.rank) : null,
            name: String(row.name ?? '—'),
            prize: row.prize || null,
            logoUrl: row.logoUrl || null,
          };
        })
      : null,
  };
}

/** Logo d'équipe : image si URL (onerror ⇒ initiales). */
function StandingLogo({ url, name }: { url: string | null; name: string }) {
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

export function CasterStandingsOverlay({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const cfg = useMemo(() => normalizeStandingsData(data), [data]);

  const dataKey = cfg.tournamentId ?? '';
  const [board, setBoard] = useState<{
    key: string;
    rows: StandingRow[];
  } | null>(null);
  const tokenRef = useRef(0);

  const useInline = cfg.inlineRows !== null;

  const refresh = useCallback(async () => {
    const mine = ++tokenRef.current;
    const key = dataKey;
    if (!key) {
      // Référence absente ⇒ état vide, comme le desktop.
      setBoard({ key, rows: [] });
      return;
    }
    try {
      const rows = await fetchTournamentStandingRows(key);
      if (mine !== tokenRef.current) return;
      setBoard({ key, rows });
    } catch {
      if (mine !== tokenRef.current) return;
      setBoard((prev) => (prev && prev.key === key ? prev : { key, rows: [] }));
    }
  }, [dataKey]);

  useEffect(() => {
    if (useInline) return undefined;
    void refresh();
    const timer = setInterval(() => void refresh(), SITE_DATA_POLL_MS);
    return () => clearInterval(timer);
  }, [useInline, refresh]);

  const rows = cfg.inlineRows ?? board?.rows ?? null;
  // `null` = premier fetch en cours ⇒ tableau vide SANS message (DOM initial du
  // desktop), pas de flash « Tournoi non finalisé » au démarrage.
  const showEmpty = rows !== null && rows.length === 0;

  return (
    <div className="caster-standings-overlay">
      <div className="mesh" />
      <div className="scanlines" />

      <HashtagBadge hashtag={cfg.hashtag} />

      <div className="container">
        <div className="brand">{cfg.brand}</div>
        <div className="section-title">{cfg.title}</div>
        {cfg.tournamentName ? (
          <div className="subtitle">{cfg.tournamentName}</div>
        ) : null}

        <div className="board">
          <div className="tbody">
            {showEmpty ? (
              <div className="empty">Tournoi non finalisé</div>
            ) : null}
            {(rows ?? []).map((r) => {
              const medal = r.rank != null ? MEDALS[r.rank] : undefined;
              const podium = r.rank != null && r.rank <= 3;
              return (
                <div className={`row ${podium ? 'podium' : ''}`} key={r.key}>
                  <div className="rank">
                    {medal ? <span className="medal">{medal}</span> : null}
                    <span>{r.rank != null ? r.rank : ''}</span>
                  </div>
                  <div className="who">
                    <StandingLogo url={r.logoUrl} name={r.name} />
                    <span className="name">{r.name || '—'}</span>
                  </div>
                  {r.prize ? (
                    <div className="prize">{r.prize}</div>
                  ) : (
                    <div className="prize empty-prize">—</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <SocialsFooter socials={cfg.socials} />

      {/* CSS = valeurs EXACTES de standings.html + tokens shared.css. */}
      <style jsx global>{`
        ${overlayRootCss('caster-standings-overlay')}
        ${scanlinesCss('caster-standings-overlay')}
        ${socialsFooterCss('caster-standings-overlay')}
        ${hashtagCss('caster-standings-overlay')}

        .caster-standings-overlay .mesh {
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
          animation: caster-st-meshShift 22s ease-in-out infinite alternate;
        }
        @keyframes caster-st-meshShift {
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
        .caster-standings-overlay .container {
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
        .caster-standings-overlay .brand {
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
        .caster-standings-overlay .section-title {
          font-size: calc(44px * var(--font-scale));
          font-weight: 900;
          letter-spacing: 6px;
          text-transform: uppercase;
          color: var(--accent1);
          margin-bottom: 8px;
        }
        .caster-standings-overlay .subtitle {
          font-size: calc(24px * var(--font-scale));
          color: var(--text-muted);
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 28px;
        }

        .caster-standings-overlay .board {
          width: 1300px;
          max-width: 100%;
          background: color-mix(in srgb, var(--bg-card) 78%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent1) 30%, transparent);
          border-radius: 24px;
          padding: 20px 32px;
          box-shadow: 0 0 60px
            color-mix(in srgb, var(--accent1) 18%, transparent);
        }
        .caster-standings-overlay .row {
          display: grid;
          grid-template-columns: 120px 1fr 260px;
          align-items: center;
          gap: 20px;
          padding: 18px 20px;
          border-bottom: 1px solid
            color-mix(in srgb, var(--text-muted) 12%, transparent);
        }
        .caster-standings-overlay .row:last-child {
          border-bottom: none;
        }
        .caster-standings-overlay .row.podium {
          background: color-mix(in srgb, var(--accent1) 10%, transparent);
          border-radius: 12px;
        }
        .caster-standings-overlay .rank {
          font-size: calc(46px * var(--font-scale));
          font-weight: 900;
          color: var(--accent2);
          line-height: 1;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .caster-standings-overlay .medal {
          font-size: calc(48px * var(--font-scale));
        }
        .caster-standings-overlay .who {
          display: flex;
          align-items: center;
          gap: 18px;
          min-width: 0;
        }
        .caster-standings-overlay .logo {
          width: 60px;
          height: 60px;
          border-radius: 12px;
          flex: 0 0 auto;
          overflow: hidden;
          background: linear-gradient(135deg, var(--accent1), var(--accent3));
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: calc(24px * var(--font-scale));
          color: var(--bg);
        }
        .caster-standings-overlay .logo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .caster-standings-overlay .name {
          font-size: calc(38px * var(--font-scale));
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .caster-standings-overlay .prize {
          font-size: calc(30px * var(--font-scale));
          font-weight: 800;
          color: var(--accent2);
          text-align: right;
        }
        /* .prize.empty côté desktop — renommé pour ne pas collider avec le
           message d'état .empty du tableau. */
        .caster-standings-overlay .prize.empty-prize {
          color: var(--text-muted);
          font-weight: 400;
        }
        .caster-standings-overlay .empty {
          padding: 40px;
          text-align: center;
          color: var(--text-muted);
          font-size: calc(28px * var(--font-scale));
        }
      `}</style>
    </div>
  );
}
