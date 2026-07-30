// components/overlay/caster/CasterPlayerOverlay.tsx
//
// Overlay OBS de la scène `player` (Player Spotlight) — port FIDÈLE de
// womenscup-caster src/overlays/player.html : carte 1400px avec avatar, rang,
// 4 tuiles de stats (Rating / Peak / Bilan / Winrate) puis 3 lignes optionnelles
// (forme récente, meilleur H2H, palmarès en chips). Scène PLEIN ÉCRAN, fond
// opaque var(--bg).
//
// scene.data ne porte qu'une RÉFÉRENCE (`userId`) : le profil est fetché ici
// sur `GET /api/public/v1/players/:userId` — en SAME-ORIGIN (le desktop tape
// https://owwomenscup.fr en dur). Shaping dans ./casterSiteData.
//
// Robustesse d'antenne :
//  - garde `fetchToken` (port du desktop) : une réponse obsolète est ignorée
//    quand le caster change de joueuse en cours de requête ;
//  - PAS de poll (comme le desktop) — un profil ne bouge pas pendant un show,
//    et le refetch est déclenché par tout changement de `userId` (Realtime) ;
//  - erreur API : seul le NOM passe à « Profil indisponible », le reste du
//    dernier rendu est conservé (jamais de trou noir, aucun détail technique).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CasterSocials, PlayerSceneData } from '@/types/caster';
import type { PlayerProfileResponse } from '@/types/rating';
import {
  EMPTY_PLAYER_PROFILE,
  fetchPlayerProfile,
  nameInitials,
  shapePlayerProfile,
  type PlayerProfileView,
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

type PlayerConfig = {
  brand: string;
  title: string;
  userId: string | null;
  hashtag: string;
  socials: CasterSocials;
  /** Profil déjà résolu dans `data` (mock / snapshot desktop) — pas de fetch. */
  inlineProfile: PlayerProfileView | null;
};

/** `data` tolérante : accepte aussi un profil résolu inline (`data.player`). */
export function normalizePlayerData(
  raw: Record<string, unknown> | null | undefined
): PlayerConfig {
  const d = (raw || {}) as Partial<PlayerSceneData> & {
    brand?: string;
    player?: unknown;
  };
  const hasInline = !!d.player && typeof d.player === 'object';
  return {
    brand: typeof d.brand === 'string' ? d.brand : "Women's Cup",
    title: (typeof d.title === 'string' && d.title) || 'Player Spotlight',
    userId: typeof d.userId === 'string' && d.userId ? d.userId : null,
    hashtag: typeof d.hashtag === 'string' ? d.hashtag : '',
    socials: normalizeSocials(d.socials),
    inlineProfile: hasInline
      ? shapePlayerProfile(raw as unknown as Partial<PlayerProfileResponse>)
      : null,
  };
}

/** Avatar : image si URL (onerror ⇒ initiales), sinon initiales. */
function PlayerAvatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (url && !failed) {
    return (
      <div className="avatar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" onError={() => setFailed(true)} />
      </div>
    );
  }
  return <div className="avatar">{nameInitials(name)}</div>;
}

export function CasterPlayerOverlay({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const cfg = useMemo(() => normalizePlayerData(data), [data]);

  const [fetched, setFetched] = useState<PlayerProfileView | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>(
    'idle'
  );
  // Port du `fetchToken` desktop : ignore les réponses dépassées.
  const tokenRef = useRef(0);

  const userId = cfg.inlineProfile ? null : cfg.userId;

  const load = useCallback(async (id: string) => {
    const mine = ++tokenRef.current;
    setStatus('loading');
    try {
      const profile = await fetchPlayerProfile(id);
      if (mine !== tokenRef.current) return;
      setFetched(profile);
      setStatus('ok');
    } catch {
      if (mine !== tokenRef.current) return;
      // On CONSERVE `fetched` : seul le nom signalera l'indisponibilité.
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      tokenRef.current++;
      setStatus('idle');
      return;
    }
    void load(userId);
  }, [userId, load]);

  const profile = cfg.inlineProfile ?? fetched ?? EMPTY_PLAYER_PROFILE;
  // Le desktop n'écrase QUE le nom pendant le chargement / en erreur : les
  // autres champs gardent leur dernière valeur rendue.
  const name = cfg.inlineProfile
    ? profile.name
    : !cfg.userId
      ? 'Sélectionnez une joueuse'
      : status === 'loading'
        ? 'Chargement…'
        : status === 'error'
          ? 'Profil indisponible'
          : profile.name;

  return (
    <div className="caster-player-overlay">
      <div className="mesh" />
      <div className="scanlines" />

      <HashtagBadge hashtag={cfg.hashtag} />

      <div className="container">
        <div className="brand">{cfg.brand}</div>
        <div className="section-title">{cfg.title}</div>

        <div className="card">
          <div className="head">
            {/* Initiales dérivées du PROFIL, pas du nom affiché : sinon un
                état transitoire produirait « CH » (Chargement…) à l'antenne. */}
            <PlayerAvatar url={profile.avatarUrl} name={profile.name} />
            <div className="id">
              <div className="name">{name}</div>
              {profile.tag ? <div className="tag">{profile.tag}</div> : null}
            </div>
            {profile.rank ? (
              <div className="rank">
                <div className="k">Rang</div>
                <div className="v">{profile.rank}</div>
              </div>
            ) : null}
          </div>

          <div className="stats">
            <div className="stat accent">
              <div className="k">Rating</div>
              <div className="v">{profile.rating}</div>
              <div className="sub">{profile.rd}</div>
            </div>
            <div className="stat">
              <div className="k">Peak</div>
              <div className="v">{profile.peak}</div>
            </div>
            <div className="stat">
              <div className="k">Bilan</div>
              <div className="v">{profile.record}</div>
              <div className="sub">{profile.games}</div>
            </div>
            <div className="stat">
              <div className="k">Winrate</div>
              <div className="v">{profile.winrate}</div>
            </div>
          </div>

          <div className="rows">
            {profile.form.length > 0 ? (
              <div className="row">
                <div className="lbl">Forme récente</div>
                <div className="val form">
                  {profile.form.map((f, i) => (
                    <span className={`dot ${f.cls}`} key={i}>
                      {f.char}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {profile.h2h ? (
              <div className="row">
                <div className="lbl">Meilleur H2H</div>
                <div className="val">{profile.h2h}</div>
              </div>
            ) : null}
            {profile.chips.length > 0 ? (
              <div className="row">
                <div className="lbl">Palmarès</div>
                <div className="val chips">
                  {profile.chips.map((c, i) => (
                    <span className="chip" key={`${c}-${i}`}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <SocialsFooter socials={cfg.socials} />

      {/* CSS = valeurs EXACTES de player.html + tokens shared.css. */}
      <style jsx global>{`
        ${overlayRootCss('caster-player-overlay')}
        ${scanlinesCss('caster-player-overlay')}
        ${socialsFooterCss('caster-player-overlay')}
        ${hashtagCss('caster-player-overlay')}

        .caster-player-overlay .mesh {
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
          animation: caster-player-meshShift 22s ease-in-out infinite alternate;
        }
        @keyframes caster-player-meshShift {
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
        .caster-player-overlay .container {
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
        .caster-player-overlay .brand {
          font-size: calc(30px * var(--font-scale));
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
          margin-bottom: 8px;
        }
        .caster-player-overlay .section-title {
          font-size: calc(40px * var(--font-scale));
          font-weight: 900;
          letter-spacing: 6px;
          text-transform: uppercase;
          color: var(--accent1);
          margin-bottom: 40px;
        }

        /* ---- Carte joueuse ----
           backdrop-filter: none neutralise le .card global du site. */
        .caster-player-overlay .card {
          backdrop-filter: none;
          width: 1400px;
          max-width: 100%;
          background: color-mix(in srgb, var(--bg-card) 78%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent1) 30%, transparent);
          border-radius: 24px;
          padding: 48px 56px;
          box-shadow: 0 0 60px
            color-mix(in srgb, var(--accent1) 18%, transparent);
        }
        .caster-player-overlay .head {
          display: flex;
          align-items: center;
          gap: 32px;
          margin-bottom: 40px;
        }
        .caster-player-overlay .avatar {
          width: 140px;
          height: 140px;
          border-radius: 24px;
          object-fit: cover;
          background: linear-gradient(135deg, var(--accent1), var(--accent3));
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: calc(54px * var(--font-scale));
          font-weight: 900;
          color: var(--bg);
          flex: 0 0 auto;
          overflow: hidden;
          border: 2px solid color-mix(in srgb, var(--accent1) 40%, transparent);
        }
        .caster-player-overlay .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .caster-player-overlay .id {
          flex: 1 1 auto;
          min-width: 0;
        }
        .caster-player-overlay .name {
          font-size: calc(72px * var(--font-scale));
          font-weight: 900;
          line-height: 1.05;
          color: var(--text);
          letter-spacing: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .caster-player-overlay .tag {
          font-size: calc(28px * var(--font-scale));
          color: var(--text-muted);
          font-weight: 500;
          margin-top: 6px;
        }
        .caster-player-overlay .rank {
          flex: 0 0 auto;
          text-align: center;
          padding: 14px 28px;
          border-radius: 16px;
          background: color-mix(in srgb, var(--accent2) 22%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent2) 45%, transparent);
        }
        .caster-player-overlay .rank .k {
          font-size: calc(16px * var(--font-scale));
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .caster-player-overlay .rank .v {
          font-size: calc(52px * var(--font-scale));
          font-weight: 900;
          color: var(--accent2);
          line-height: 1;
        }

        .caster-player-overlay .stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 36px;
        }
        .caster-player-overlay .stat {
          background: color-mix(in srgb, var(--bg) 40%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent1) 18%, transparent);
          border-radius: 16px;
          padding: 24px;
          text-align: center;
        }
        .caster-player-overlay .stat .k {
          font-size: calc(18px * var(--font-scale));
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .caster-player-overlay .stat .v {
          font-size: calc(56px * var(--font-scale));
          font-weight: 900;
          color: var(--text);
          line-height: 1;
        }
        .caster-player-overlay .stat .sub {
          font-size: calc(20px * var(--font-scale));
          color: var(--text-muted);
          margin-top: 6px;
        }
        .caster-player-overlay .stat.accent .v {
          color: var(--accent1);
        }

        .caster-player-overlay .rows {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .caster-player-overlay .row {
          display: flex;
          align-items: center;
          gap: 20px;
          font-size: calc(26px * var(--font-scale));
        }
        .caster-player-overlay .row .lbl {
          flex: 0 0 260px;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: var(--text-muted);
          font-size: calc(20px * var(--font-scale));
        }
        .caster-player-overlay .row .val {
          flex: 1 1 auto;
          color: var(--text);
          font-weight: 600;
        }
        .caster-player-overlay .form {
          display: flex;
          gap: 12px;
        }
        .caster-player-overlay .dot {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: calc(20px * var(--font-scale));
          color: var(--bg);
        }
        .caster-player-overlay .dot.w {
          background: var(--accent1);
        }
        .caster-player-overlay .dot.l {
          background: color-mix(in srgb, var(--text-muted) 60%, var(--bg));
        }
        .caster-player-overlay .dot.d {
          background: var(--accent3);
        }
        .caster-player-overlay .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        .caster-player-overlay .chip {
          padding: 8px 18px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent2) 18%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent2) 40%, transparent);
          font-size: calc(20px * var(--font-scale));
          font-weight: 700;
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
