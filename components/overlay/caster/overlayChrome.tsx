// components/overlay/caster/overlayChrome.tsx
//
// Chrome PARTAGÉ des overlays caster plein écran (starting / pause / results /
// end / mvp / scrim) — port des blocs communs de womenscup-caster
// src/overlays/*.html + shared.css (tokens :root, footer socials, badge
// hashtag, scanlines). Module NOUVEAU : CasterMatchOverlay (lot 1) garde ses
// tokens inline et n'est pas modifié.
//
// Chaque overlay compose son <style jsx global> en interpolant ces builders
// CSS, préfixés par sa classe racine — même technique que le lot 1.

import type { CasterSocials } from '@/types/caster';
import { formatHashtag } from '@/utils/caster/matchScene';

export const SOCIAL_KEYS = [
  'site',
  'discord',
  'twitch',
  'youtube',
  'instagram',
  'tiktok',
] as const;

/** Émojis du footer socials — identiques aux overlays desktop. */
const SOCIAL_ICONS: Record<(typeof SOCIAL_KEYS)[number], string> = {
  site: '🌐',
  discord: '💬',
  twitch: '🟣',
  youtube: '📺',
  instagram: '📷',
  tiktok: '🎵',
};

/** `socials` tolérant (scène créée côté app peut omettre des clés). */
export function normalizeSocials(raw: unknown): CasterSocials {
  const s = (raw || {}) as Partial<CasterSocials>;
  return {
    site: s.site || '',
    discord: s.discord || '',
    twitch: s.twitch || '',
    youtube: s.youtube || '',
    instagram: s.instagram || '',
    tiktok: s.tiktok || '',
  };
}

/**
 * Footer socials (bas centre) — équivalent du bloc `.footer` + `.social` des
 * overlays desktop ; les réseaux vides sont omis (au lieu de `.hidden`).
 */
export function SocialsFooter({ socials }: { socials: CasterSocials }) {
  const entries = SOCIAL_KEYS.filter((key) => socials[key]);
  if (entries.length === 0) return null;
  return (
    <div className="footer">
      {entries.map((key) => (
        <div className="social" key={key}>
          <span className="social-icon">{SOCIAL_ICONS[key]}</span>
          <span>{socials[key]}</span>
        </div>
      ))}
    </div>
  );
}

/** Badge hashtag (haut droite) — masqué si vide, `#` ajouté si absent. */
export function HashtagBadge({ hashtag }: { hashtag: string }) {
  const h = formatHashtag(hashtag);
  if (!h) return null;
  return <div className="hashtag">{h}</div>;
}

/**
 * Tokens de shared.css + base du canvas 1920×1080. `--bg-card` = #1b1130
 * OPAQUE (scènes plein écran) — match.html seul l'override en translucide.
 */
export function overlayRootCss(
  root: string,
  opts: { background?: string } = {}
): string {
  const background = opts.background ?? 'var(--bg)';
  return `
    .${root} {
      --bg: #0f0820;
      --bg-card: #1b1130;
      --accent1: #00f0ff;
      --accent2: #ff2ec8;
      --accent3: #bb00ff;
      --text: #ffffff;
      --text-muted: #8888aa;
      --font: 'Segoe UI', system-ui, sans-serif;
      --font-heading: var(--font);
      --font-weight: 400;
      --font-scale: 1;
      --winner: #10b981;
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
      --r-xl: 24px;
      --r-pill: 999px;
      --shadow-card: 0 4px 24px rgba(0, 0, 0, 0.5);
      --shadow-card-lg: 0 12px 48px rgba(0, 0, 0, 0.4);
      --glow: 0 0 20px color-mix(in srgb, var(--accent1) 12%, transparent);

      position: absolute;
      top: 0;
      left: 0;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: ${background};
      color: var(--text);
      font-family: var(--font);
      font-weight: var(--font-weight);
    }
    .${root},
    .${root} * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    .${root} h1,
    .${root} h2,
    .${root} h3,
    .${root} .title,
    .${root} .team-name,
    .${root} .score,
    .${root} .headline,
    .${root} .countdown,
    .${root} .big {
      font-family: var(--font-heading);
    }
  `;
}

/** Texture scan lines — identique dans tous les overlays plein écran. */
export function scanlinesCss(root: string): string {
  return `
    .${root} .scanlines {
      position: absolute;
      inset: 0;
      background-image: repeating-linear-gradient(
        0deg,
        transparent 0,
        transparent 3px,
        rgba(255, 255, 255, 0.02) 3px,
        rgba(255, 255, 255, 0.02) 4px
      );
      pointer-events: none;
    }
  `;
}

/**
 * CSS du footer socials. Défauts = starting/pause/end/scrim ; results passe
 * ses valeurs légèrement réduites (bottom 40, texte 16, icône 26…).
 */
export function socialsFooterCss(
  root: string,
  opts: {
    bottom?: number;
    fontSize?: number;
    opacity?: number;
    iconSize?: number;
    iconFontSize?: number;
    iconBgPct?: number;
  } = {}
): string {
  const {
    bottom = 50,
    fontSize = 18,
    opacity = 0.85,
    iconSize = 28,
    iconFontSize = 15,
    iconBgPct = 20,
  } = opts;
  return `
    .${root} .footer {
      position: absolute;
      bottom: ${bottom}px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 36px;
      align-items: center;
      z-index: 10;
    }
    .${root} .social {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: calc(${fontSize}px * var(--font-scale));
      color: var(--text);
      opacity: ${opacity};
    }
    .${root} .social-icon {
      width: ${iconSize}px;
      height: ${iconSize}px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: color-mix(in srgb, var(--accent1) ${iconBgPct}%, transparent);
      color: var(--accent1);
      font-weight: 900;
      font-size: calc(${iconFontSize}px * var(--font-scale));
    }
  `;
}

/**
 * CSS du badge hashtag. Défauts = starting/pause/scrim ; results passe
 * fontSize 20 / padding réduit.
 */
export function hashtagCss(
  root: string,
  opts: { fontSize?: number; padding?: string } = {}
): string {
  const { fontSize = 22, padding = '10px 22px' } = opts;
  return `
    .${root} .hashtag {
      position: absolute;
      top: 40px;
      right: 60px;
      font-size: calc(${fontSize}px * var(--font-scale));
      font-weight: 800;
      letter-spacing: 2px;
      color: var(--accent2);
      text-transform: uppercase;
      background: color-mix(in srgb, var(--bg-card) 60%, transparent);
      padding: ${padding};
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--accent2) 40%, transparent);
      z-index: 10;
    }
  `;
}
