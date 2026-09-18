// components/overlay/match/MatchSources.tsx
//
// Les cinq sources navigateur d'un match, telles qu'elles s'affichent dans OBS.
//
// CE QUI GUIDE CHAQUE CHOIX VISUEL ICI : l'écran est posé PAR-DESSUS une vidéo
// de jeu, regardé de loin, sur un flux compressé. D'où, partout :
//   - du contraste franc (fond sombre opaque, texte blanc, ombres portées)
//     plutôt que des transparences élégantes qui disparaissent sur une map
//     claire ;
//   - de très grosses tailles de texte — un score lisible sur un écran de
//     développeuse est illisible sur un stream à 720p ;
//   - aucune animation continue. Une pulsation coûte du CPU à l'encodeur et se
//     transforme en artefacts de compression ; le seul mouvement toléré est le
//     point rouge « en direct », déjà utilisé par l'overlay de conducteur.
//
// Chaque source se place elle-même dans le cadre 1920×1080 (`fixed`), pour
// qu'une source ajoutée dans OBS tombe au bon endroit sans réglage : le
// tableau de score en haut, les maps en bas à gauche, le reste au centre.

import { useEffect, useState } from 'react';
import { useT, format } from '@/lib/i18n/useT';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import type {
  OverlayMatchView,
  OverlaySource,
  OverlayTeamView,
} from '@/utils/overlay/matchOverlay';
import type { MatchOverlayPayload } from '@/hooks/useMatchOverlay';

type Dict = typeof nsOverlay.fr;

export type MatchSourceProps = {
  source: OverlaySource;
  payload: MatchOverlayPayload | null;
  /** Décalage horloge locale ↔ serveur, en ms (cf. useMatchOverlay). */
  clockSkewMs: number;
  /** Couleur d'accent résolue (branding de l'espace ou `?accent=`). */
  accent: string;
  /** Taille relative, pour caler la source dans une scène OBS (0.5 → 2). */
  scale: number;
};

/** Accent par défaut : le jaune de la Coupe, déjà utilisé par l'overlay run. */
export const DEFAULT_OVERLAY_ACCENT = '#f0e63c';

/* ── Briques communes ──────────────────────────────────────────────────── */

export function TeamLogo({
  team,
  size,
  fallback,
}: {
  team: OverlayTeamView | null;
  size: 'sm' | 'lg';
  fallback: string;
}) {
  const dim = size === 'lg' ? 'h-40 w-40' : 'h-16 w-16';
  const name = team?.name || fallback;
  if (team?.logoUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: source OBS — next/image n'apporte rien et casse sur un logo distant
      <img
        src={team.logoUrl}
        alt=""
        className={`${dim} shrink-0 rounded-xl object-contain drop-shadow-lg`}
      />
    );
  }
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-xl bg-white/10 font-black text-white/80`}
      aria-hidden="true"
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function formatBadge(value: string | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function phaseLabel(match: OverlayMatchView, t: Dict): string {
  if (match.phase === 'live') return t.matchPhaseLive;
  if (match.phase === 'final') return t.matchPhaseFinal;
  return t.matchPhaseUpcoming;
}

function teamName(team: OverlayTeamView | null, t: Dict): string {
  return team?.name?.trim() || t.matchTeamFallback;
}

/** Heure locale « 19:00 », sans dépendre du fuseau du poste de régie. */
export function hourLabel(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(new Date(ms));
}

/* ── 1. Tableau de score (bandeau haut) ────────────────────────────────── */

// RIEN QUE LA LIGNE DU MATCH : logo, nom, score, nom, logo. Ni panneau, ni
// ligne de phase / format, fond entièrement transparent — la régie pose la
// source sur sa propre scène, qui porte déjà l'habillage. Une ombre portée
// garde le texte lisible sur n'importe quel décor. Les noms ne sont jamais
// tronqués : un nom coupé ne se devine pas à l'antenne, il passe à la ligne.
function Scoreboard({ match, t }: { match: OverlayMatchView; t: Dict }) {
  return (
    <div className="flex items-center gap-6 [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
      <TeamSide team={match.team1} align="right" t={t} />
      <div className="flex shrink-0 items-center gap-4 px-2 text-6xl font-black leading-none text-white tabular-nums">
        <span>{match.team1?.score ?? 0}</span>
        <span className="text-white/40">:</span>
        <span>{match.team2?.score ?? 0}</span>
      </div>
      <TeamSide team={match.team2} align="left" t={t} />
    </div>
  );
}

function TeamSide({
  team,
  align,
  t,
}: {
  team: OverlayTeamView | null;
  align: 'left' | 'right';
  t: Dict;
}) {
  const name = teamName(team, t);
  return (
    <div
      className={`flex w-[26rem] items-center gap-4 ${
        align === 'right' ? 'flex-row-reverse text-right' : 'text-left'
      }`}
    >
      <TeamLogo team={team} size="sm" fallback={t.matchTeamFallback} />
      <span className="min-w-0 break-words text-3xl font-bold leading-tight text-white">
        {name}
      </span>
    </div>
  );
}

/* ── 2. Présentation des équipes (centre) ──────────────────────────────── */

function TeamsCard({
  match,
  accent,
  t,
}: {
  match: OverlayMatchView;
  accent: string;
  t: Dict;
}) {
  const bo = formatBadge(match.format);
  const hour = hourLabel(match.scheduledAt);
  return (
    <div className="flex flex-col items-center gap-8 rounded-3xl border border-white/10 bg-black/85 px-16 py-12 shadow-2xl">
      <div
        className="text-sm font-bold uppercase tracking-[0.35em]"
        style={{ color: accent }}
      >
        {[match.roundName, bo].filter(Boolean).join(' · ') ||
          phaseLabel(match, t)}
      </div>
      <div className="flex items-center gap-14">
        <TeamColumn team={match.team1} t={t} />
        <div className="text-5xl font-black text-white/30">{t.vs}</div>
        <TeamColumn team={match.team2} t={t} />
      </div>
      {hour && match.phase === 'upcoming' && (
        <div className="text-2xl font-semibold text-white/70">
          {format(t.matchScheduledAt, { time: hour })}
        </div>
      )}
    </div>
  );
}

function TeamColumn({ team, t }: { team: OverlayTeamView | null; t: Dict }) {
  return (
    <div className="flex w-72 flex-col items-center gap-4 text-center">
      <TeamLogo team={team} size="lg" fallback={t.matchTeamFallback} />
      <span className="text-4xl font-black leading-tight text-white drop-shadow">
        {teamName(team, t)}
      </span>
    </div>
  );
}

/* ── 3. Maps et veto (bas gauche) ──────────────────────────────────────── */

function MapsCard({
  match,
  accent,
  t,
}: {
  match: OverlayMatchView;
  accent: string;
  t: Dict;
}) {
  // Les manches jouées priment : dès qu'une map a un score, elle raconte le
  // match mieux que la liste du veto. Le veto ne s'affiche que tant qu'aucune
  // manche n'existe — sinon l'écran répète deux fois la même information.
  const hasGames = match.maps.length > 0;
  const rows = hasGames
    ? match.maps.map((m) => ({
        key: `map-${m.order}`,
        label: m.name ?? '—',
        detail:
          m.team1Score != null && m.team2Score != null
            ? `${m.team1Score} – ${m.team2Score}`
            : null,
        dim: false,
        side: m.winner,
      }))
    : match.veto.map((v) => ({
        key: `veto-${v.step}`,
        label: v.map ?? '—',
        detail:
          v.action === 'ban'
            ? t.matchMapBanned
            : v.action === 'decider'
              ? t.matchMapDecider
              : t.matchMapPicked,
        dim: v.action === 'ban',
        side: v.action === 'ban' ? null : v.side,
      }));

  if (rows.length === 0) return null;

  return (
    <div className="w-[26rem] overflow-hidden rounded-2xl border border-white/10 bg-black/85 shadow-2xl">
      <div
        className="px-5 py-2 text-xs font-bold uppercase tracking-[0.25em] text-black"
        style={{ backgroundColor: accent }}
      >
        {hasGames ? t.matchMapsTitle : t.matchVetoTitle}
      </div>
      <ul className="divide-y divide-white/5">
        {rows.map((row) => (
          <li
            key={row.key}
            className={`flex items-center justify-between gap-4 px-5 py-3 ${
              row.dim ? 'opacity-40' : ''
            }`}
          >
            <span
              className={`truncate text-xl font-semibold text-white ${
                row.dim ? 'line-through' : ''
              }`}
            >
              {row.label}
            </span>
            {row.detail && (
              <span className="shrink-0 text-lg font-bold tabular-nums text-white/70">
                {row.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── 4. Compte à rebours (centre) ──────────────────────────────────────── */

function Countdown({
  match,
  accent,
  clockSkewMs,
  t,
}: {
  match: OverlayMatchView;
  accent: string;
  clockSkewMs: number;
  t: Dict;
}) {
  const target = match.scheduledAt ? Date.parse(match.scheduledAt) : NaN;
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setRemaining(null);
      return undefined;
    }
    const tick = () => setRemaining(target - (Date.now() + clockSkewMs));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target, clockSkewMs]);

  const label =
    remaining == null
      ? t.matchCountdownNoTime
      : remaining <= 0
        ? t.matchCountdownNow
        : t.matchCountdownLabel;

  return (
    <div className="flex flex-col items-center gap-6 rounded-3xl border border-white/10 bg-black/85 px-20 py-14 shadow-2xl">
      <div
        className="text-sm font-bold uppercase tracking-[0.35em]"
        style={{ color: accent }}
      >
        {label}
      </div>
      {remaining != null && remaining > 0 && (
        <RemainingDisplay ms={remaining} t={t} />
      )}
      <div className="text-3xl font-bold text-white/80">
        {teamName(match.team1, t)}
        <span className="mx-4 text-white/30">{t.vs}</span>
        {teamName(match.team2, t)}
      </div>
    </div>
  );
}

/**
 * Découpe le temps restant en ce qui se LIT sans ambiguïté.
 *
 * `mm:ss` sous l'heure, `h:mm:ss` au-delà, et les jours à part dès qu'il y en
 * a. Sans ce dernier cas, un match à deux jours affichait « 57:01:14 », qu'on
 * lit spontanément comme cinquante-sept minutes — un décompte qui se trompe
 * d'ordre de grandeur est pire que pas de décompte. Au-delà d'un jour, les
 * secondes disparaissent aussi : personne ne les regarde à cette distance.
 */
function RemainingDisplay({ ms, t }: { ms: number; t: Dict }) {
  const { days, clock } = splitRemaining(ms);
  return (
    <div className="text-[7rem] font-black leading-none text-white tabular-nums drop-shadow">
      {days > 0 ? format(t.matchCountdownDays, { days, time: clock }) : clock}
    </div>
  );
}

export function splitRemaining(ms: number): { days: number; clock: string } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  const days = Math.floor(total / 86400);
  if (days > 0) {
    const rest = total % 86400;
    return {
      days,
      clock: `${pad(Math.floor(rest / 3600))}:${pad(Math.floor((rest % 3600) / 60))}`,
    };
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return {
    days: 0,
    clock: h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`,
  };
}

/* ── 5. Écran d'attente (plein cadre) ──────────────────────────────────── */

function WaitingScreen({
  payload,
  accent,
  t,
}: {
  payload: MatchOverlayPayload | null;
  accent: string;
  t: Dict;
}) {
  const brandName =
    payload?.branding?.name ?? payload?.tournament?.name ?? null;
  const logoUrl = payload?.branding?.logoUrl ?? null;
  const next = payload?.match ?? null;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 bg-neutral-950 text-center">
      {logoUrl && (
        // biome-ignore lint/performance/noImgElement: source OBS — next/image n'apporte rien et casse sur un logo distant
        <img src={logoUrl} alt="" className="h-32 w-32 object-contain" />
      )}
      <div
        className="text-sm font-bold uppercase tracking-[0.4em]"
        style={{ color: accent }}
      >
        {brandName ?? t.brandFallback}
      </div>
      <h1 className="text-7xl font-black text-white">{t.matchWaitingTitle}</h1>
      <p className="text-3xl text-white/60">
        {next
          ? `${teamName(next.team1, t)} ${t.vs} ${teamName(next.team2, t)}`
          : t.matchWaitingSubtitle}
      </p>
    </div>
  );
}

/* ── Le dispatcher ─────────────────────────────────────────────────────── */

/**
 * Rend la source demandée, ou l'écran d'attente quand il n'y a pas de match.
 *
 * L'absence de match n'est JAMAIS une erreur ici : entre deux rencontres, une
 * source « tableau de score » doit montrer quelque chose de propre plutôt que
 * de disparaître — sinon la régie voit un trou noir et croit à une panne.
 */
export function MatchSourceSurface({
  source,
  payload,
  clockSkewMs,
  accent,
  scale,
}: MatchSourceProps) {
  const t = useT(nsOverlay);
  const match = payload?.match ?? null;

  if (source === 'waiting' || !match) {
    return <WaitingScreen payload={payload} accent={accent} t={t} />;
  }

  const zoom = { transform: `scale(${scale})` } as const;

  if (source === 'scoreboard') {
    return (
      <div
        className="fixed left-1/2 top-8 -translate-x-1/2 origin-top"
        style={zoom}
      >
        <Scoreboard match={match} t={t} />
      </div>
    );
  }

  if (source === 'maps') {
    return (
      <div className="fixed bottom-10 left-10 origin-bottom-left" style={zoom}>
        <MapsCard match={match} accent={accent} t={t} />
      </div>
    );
  }

  if (source === 'countdown') {
    return (
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 origin-center"
        style={zoom}
      >
        <Countdown
          match={match}
          accent={accent}
          clockSkewMs={clockSkewMs}
          t={t}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 origin-center"
      style={zoom}
    >
      <TeamsCard match={match} accent={accent} t={t} />
    </div>
  );
}
