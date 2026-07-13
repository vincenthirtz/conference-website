// components/overlay/OverlayRenderer.tsx
//
// Feature: Production broadcast automatisée (roadmap #07) — the visual layer
// of the OBS browser-source overlay. Given a single overlay payload it renders
// a different scene layout (starting / match / pause / results / end / custom)
// plus the cross-scene furniture: LIVE indicator, lower-third banner, PiP frame
// placeholder and the rotating sponsor slot.
//
// Design: matches the draft spectator overlay — dark, neon-accented (brand
// yellow `#f0e63c` / green `#7bc96a`), 1920×1080-oriented. Intermission scenes
// (starting/pause/end/custom) paint a full dark gradient; live scenes
// (match/results) keep the centre transparent so the video composites through.
//
// All user-visible copy is routed through i18n (`useT('overlay')` + `format`),
// like every other public surface. The overlay is chrome-less with no locale
// toggle, so it defaults to FR via the app's default locale.

import type {
  OverlayMatch,
  OverlayScene,
  OverlaySponsor,
} from '@/hooks/useOverlayState';
import { useT, format } from '@/lib/i18n/useT';
import { SponsorRotator } from './SponsorRotator';

export type OverlayBranding = {
  name: string;
  logoUrl: string | null;
} | null;

type Props = {
  scene: OverlayScene;
  onAir: boolean;
  lowerThird: string | null;
  pipEnabled: boolean;
  match: OverlayMatch;
  sponsors: OverlaySponsor[];
  branding: OverlayBranding;
};

const INTERMISSION: ReadonlySet<OverlayScene> = new Set<OverlayScene>([
  'starting',
  'pause',
  'end',
  'custom',
]);

function formatBadge(format: string | null): string | null {
  if (!format) return null;
  const trimmed = format.trim();
  if (!trimmed) return null;
  // "bo3" → "BO3", already-nice strings pass through uppercased.
  return trimmed.toUpperCase();
}

/* ── Cross-scene furniture ─────────────────────────────────────────────── */

function LiveBadge() {
  const t = useT('overlay');
  return (
    <div className="fixed right-8 top-8 flex items-center gap-2 rounded-full border border-red-500/40 bg-black/60 px-4 py-1.5 backdrop-blur-sm">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      <span className="text-sm font-bold uppercase tracking-widest text-white">
        {t.live}
      </span>
    </div>
  );
}

function LowerThird({ text }: { text: string }) {
  return (
    <div className="fixed bottom-28 left-8 z-20 max-w-[52rem]">
      <div className="flex items-stretch overflow-hidden rounded-r-lg rounded-l-sm border-l-4 border-yellow bg-black/75 shadow-2xl backdrop-blur-sm">
        <div className="px-6 py-3">
          <p className="text-2xl font-bold leading-tight text-white drop-shadow">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

function PipFrame() {
  // Placeholder region only — OBS composites the real camera/video here.
  const t = useT('overlay');
  return (
    <div className="fixed bottom-8 right-8 z-10 aspect-video w-80">
      <div className="flex h-full w-full items-center justify-center rounded-xl border-2 border-white/20 bg-black/20 shadow-2xl backdrop-blur-[1px]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">
          {t.camera}
        </span>
      </div>
    </div>
  );
}

function TeamLogo({
  logoUrl,
  name,
  size = 'md',
}: {
  logoUrl: string | null;
  name: string;
  size?: 'md' | 'lg';
}) {
  const t = useT('overlay');
  const logoLabel = format(t.logoAlt, { name });
  const dim = size === 'lg' ? 'h-24 w-24' : 'h-14 w-14';
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={logoLabel}
        className={`${dim} rounded-lg object-contain`}
        loading="lazy"
      />
    );
  }
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div
      className={`${dim} flex items-center justify-center rounded-lg bg-white/10 text-lg font-black text-white/80`}
      aria-label={logoLabel}
    >
      {initials}
    </div>
  );
}

/* ── Scenes ────────────────────────────────────────────────────────────── */

function Scoreboard({ match }: { match: NonNullable<OverlayMatch> }) {
  const { team1, team2 } = match;
  const badge = formatBadge(match.format);
  return (
    <div className="fixed left-1/2 top-8 z-20 -translate-x-1/2">
      <div className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-black/70 shadow-2xl backdrop-blur-md">
        {/* Team 1 */}
        <div className="flex items-center gap-3 py-3 pl-5 pr-4">
          <TeamLogo
            logoUrl={team1?.logoUrl ?? null}
            name={team1?.name ?? '—'}
          />
          <span className="max-w-[16rem] truncate text-2xl font-bold text-white">
            {team1?.name ?? '—'}
          </span>
        </div>
        {/* Score */}
        <div className="flex flex-col items-center justify-center bg-black/40 px-6">
          <div className="flex items-center gap-3 text-4xl font-black tabular-nums text-yellow">
            <span>{team1?.score ?? 0}</span>
            <span className="text-white/40">·</span>
            <span>{team2?.score ?? 0}</span>
          </div>
          {badge ? (
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">
              {badge}
            </span>
          ) : null}
        </div>
        {/* Team 2 */}
        <div className="flex items-center gap-3 py-3 pl-4 pr-5">
          <span className="max-w-[16rem] truncate text-right text-2xl font-bold text-white">
            {team2?.name ?? '—'}
          </span>
          <TeamLogo
            logoUrl={team2?.logoUrl ?? null}
            name={team2?.name ?? '—'}
          />
        </div>
      </div>
    </div>
  );
}

function MatchScene({ match }: { match: OverlayMatch }) {
  if (!match) return null;
  return <Scoreboard match={match} />;
}

function ResultsScene({ match }: { match: OverlayMatch }) {
  const t = useT('overlay');
  if (!match) {
    return (
      <CenterCard
        eyebrow={t.resultTitle}
        title={t.resultNoMatchTitle}
        accent="green"
      />
    );
  }
  const s1 = match.team1?.score ?? 0;
  const s2 = match.team2?.score ?? 0;
  const winner: 1 | 2 | null = s1 > s2 ? 1 : s2 > s1 ? 2 : null;
  const badge = formatBadge(match.format);
  const eyebrow = badge
    ? format(t.resultWithFormat, { format: badge })
    : t.resultTitle;

  const TeamResult = ({
    team,
    isWinner,
  }: {
    team: NonNullable<OverlayMatch>['team1'];
    isWinner: boolean;
  }) => (
    <div
      className={`flex flex-1 flex-col items-center gap-4 rounded-2xl border px-8 py-8 transition ${
        isWinner
          ? 'border-yellow/70 bg-yellow/10 shadow-[0_0_40px_rgba(240,230,60,0.35)]'
          : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      {isWinner ? (
        <span className="text-xs font-black uppercase tracking-[0.3em] text-yellow">
          {t.winner}
        </span>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/30">
          &nbsp;
        </span>
      )}
      <TeamLogo
        logoUrl={team?.logoUrl ?? null}
        name={team?.name ?? '—'}
        size="lg"
      />
      <span className="max-w-[18rem] truncate text-center text-3xl font-bold text-white">
        {team?.name ?? '—'}
      </span>
      <span
        className={`text-7xl font-black tabular-nums ${
          isWinner ? 'text-yellow' : 'text-white/70'
        }`}
      >
        {team === match.team1 ? s1 : s2}
      </span>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center px-16">
      <span className="mb-2 text-sm font-bold uppercase tracking-[0.5em] text-green">
        {eyebrow}
      </span>
      <div className="flex w-full max-w-5xl items-stretch gap-8">
        <TeamResult team={match.team1} isWinner={winner === 1} />
        <div className="flex items-center text-4xl font-black text-white/30">
          {t.vs}
        </div>
        <TeamResult team={match.team2} isWinner={winner === 2} />
      </div>
    </div>
  );
}

function CenterCard({
  eyebrow,
  title,
  subtitle,
  branding,
  accent = 'yellow',
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  branding?: OverlayBranding;
  accent?: 'yellow' | 'green';
}) {
  const accentText = accent === 'green' ? 'text-green' : 'text-yellow';
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center px-16 text-center">
      {branding?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoUrl}
          alt={branding.name}
          className="mb-10 h-28 w-auto object-contain drop-shadow-[0_0_24px_rgba(240,230,60,0.25)]"
        />
      ) : null}
      <span
        className={`mb-4 text-sm font-black uppercase tracking-[0.5em] ${accentText}`}
      >
        {eyebrow}
      </span>
      <h1 className="max-w-4xl text-6xl font-black leading-tight text-white drop-shadow-lg">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-6 text-2xl font-medium text-white/70">{subtitle}</p>
      ) : null}
      {branding?.name && !branding.logoUrl ? (
        <p className="mt-10 text-lg font-semibold uppercase tracking-[0.3em] text-white/40">
          {branding.name}
        </p>
      ) : null}
    </div>
  );
}

/* ── Root ──────────────────────────────────────────────────────────────── */

export function OverlayRenderer({
  scene,
  onAir,
  lowerThird,
  pipEnabled,
  match,
  sponsors,
  branding,
}: Props) {
  const t = useT('overlay');
  const isIntermission = INTERMISSION.has(scene);
  const brandName = branding?.name ?? t.brandFallback;
  // Full-frame dark backdrop for standalone graphics (intermission cards +
  // the results screen). The `match` scene stays transparent so OBS composites
  // the gameplay/video underneath the scoreboard.
  const showBackdrop = isIntermission || scene === 'results';

  return (
    <div className="relative min-h-screen w-full overflow-hidden font-sans text-white">
      {showBackdrop ? (
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_#1a1030_0%,_#0a0a12_55%,_#050509_100%)]" />
      ) : null}

      {/* Scene content */}
      {scene === 'match' ? <MatchScene match={match} /> : null}
      {scene === 'results' ? <ResultsScene match={match} /> : null}
      {scene === 'starting' ? (
        <CenterCard
          eyebrow={t.startingEyebrow}
          title={t.startingTitle}
          subtitle={t.startingSubtitle}
          branding={branding}
        />
      ) : null}
      {scene === 'pause' ? (
        <CenterCard
          eyebrow={t.pauseEyebrow}
          title={t.pauseTitle}
          subtitle={t.pauseSubtitle}
          branding={branding}
          accent="green"
        />
      ) : null}
      {scene === 'end' ? (
        <CenterCard
          eyebrow={t.endEyebrow}
          title={t.endTitle}
          subtitle={brandName}
          branding={branding}
        />
      ) : null}
      {scene === 'custom' ? (
        <CenterCard
          eyebrow={t.customEyebrow}
          title={brandName}
          branding={branding}
        />
      ) : null}

      {/* Cross-scene furniture */}
      {pipEnabled ? <PipFrame /> : null}
      {lowerThird ? <LowerThird text={lowerThird} /> : null}
      {onAir ? <LiveBadge /> : null}

      <SponsorRotator sponsors={sponsors} className="fixed left-8 top-8 z-20" />
    </div>
  );
}
