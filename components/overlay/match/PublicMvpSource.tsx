// components/overlay/match/PublicMvpSource.tsx
//
// LE COUP DE CŒUR DU PUBLIC, à l'antenne : les candidates, leurs barres, et le
// temps qu'il reste pour voter.
//
// DEUX PLATEFORMES, UNE SEULE BARRE PAR JOUEUSE. Le chat Twitch et les
// supporters Discord votent en parallèle, et leurs voix s'additionnent
// (cf. `resolvePublicMvp`). Les afficher séparément laisserait croire à deux
// scrutins concurrents — alors que c'est un seul public réparti sur deux
// plateformes par accident de plomberie. Le détail par source est relégué en
// pied, en petit (et masquable depuis Diffusion › Overlays).
//
// LE CLASSEMENT EST STABLE, et ce n'est pas un détail : l'API rend un ordre
// TOTAL (voix décroissantes, puis memberId). Sans lui, deux joueuses à égalité
// permuteraient à chaque rafraîchissement, sous les yeux du public.
//
// AUCUNE ANIMATION D'ENTRÉE. Une source OBS rafraîchie toutes les dix
// secondes qui rejouerait une animation à chaque fois serait épuisante à
// regarder. Seules les LARGEURS de barres sont animées, ce qui donne la
// sensation d'un vote qui monte.
//
// APRÈS LA CLÔTURE, un bandeau annonce l'élue et les autres s'effacent à
// demi. Le même écran sert donc au vote et à son résultat : la régie n'a pas
// de source à changer au moment le plus occupé de la soirée.
//
// TEST (Diffusion › Overlays › « Tester ») : même rendu, badge « TEST » —
// pour régler la scène sur le vrai visuel, sans qu'on puisse le prendre pour
// un vrai vote à l'antenne.

import { useEffect, useState } from 'react';

import { format, useT } from '@/lib/i18n/useT';
import type { OverlayPublicMvpResponse } from '@/pages/api/overlay/mvp-public';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';

type Poll = NonNullable<OverlayPublicMvpResponse['poll']>;

type Props = {
  poll: Poll | null;
  /** Multiplicateur de la régie (`?scale=`). */
  scale?: number;
  accent?: string;
  /** Combien de candidates afficher. Huit tiennent à l'écran, pas vingt. */
  limit?: number;
  /**
   * Où poser la carte. Absent : le réglage de Diffusion › Overlays
   * (`poll.display.position`), sinon en haut. Un paramètre d'URL l'emporte.
   */
  position?: 'top' | 'center' | 'bottom';
};

/** Largeur « de conception » de la carte, à l'échelle 1. */
const CARD_W = 640;

/** Sous ce seuil, le compte à rebours passe en alerte. */
const URGENT_MS = 30_000;

/** Couleurs des trois premières places (or, argent, bronze). */
const PODIUM = ['#f5c542', '#cfd6e0', '#d99a6c'] as const;

/** Le compte à rebours, en mm:ss, et s'il presse. `null` une fois passé. */
function useCountdown(
  closesAt: string | null,
  isOpen: boolean
): { label: string; urgent: boolean } | null {
  const [state, setState] = useState<{ label: string; urgent: boolean } | null>(
    null
  );

  useEffect(() => {
    if (!closesAt || !isOpen) {
      setState(null);
      return undefined;
    }
    const fin = new Date(closesAt).getTime();
    const tick = () => {
      const reste = Math.max(0, fin - Date.now());
      const s = Math.floor(reste / 1000);
      setState({
        label: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`,
        urgent: reste <= URGENT_MS,
      });
    };
    tick();
    // Une seconde : c'est un compte à rebours, il doit descendre à l'œil. Il
    // est LOCAL et ne coûte aucune requête — l'heure de clôture est connue.
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [closesAt, isOpen]);

  return state;
}

export function PublicMvpSource({
  poll,
  scale = 1,
  accent = '#ba18ff',
  limit = 8,
  position,
}: Props) {
  const t = useT(nsOverlay);
  const countdown = useCountdown(poll?.closesAt ?? null, !!poll?.isOpen);

  // Rien à l'écran : la source est TRANSPARENTE, pas vide-avec-un-cadre. Une
  // carte fantôme sur la scène pendant tout un match serait pire que rien.
  if (!poll) return null;

  const rows = poll.candidates.slice(0, limit);
  const max = Math.max(1, ...rows.map((r) => r.votes));
  const width = CARD_W * scale;
  const clos = !poll.isOpen;
  const where = position ?? poll.display?.position ?? 'top';
  const showSources = poll.display?.showSources !== false;
  const px = (n: number) => n * scale;
  const winner = clos
    ? (rows.find((r) => r.memberId === poll.winnerMemberId) ?? null)
    : null;

  return (
    <div
      className="flex h-full w-full justify-center"
      style={{
        alignItems:
          where === 'top'
            ? 'flex-start'
            : where === 'bottom'
              ? 'flex-end'
              : 'center',
        padding: px(24),
      }}
      role="status"
      aria-live="polite"
      data-testid="public-mvp-card"
    >
      <div
        style={{
          width,
          fontSize: px(16),
          borderRadius: px(18),
          padding: px(18),
          background:
            'linear-gradient(160deg, rgba(20,8,28,.92) 0%, rgba(8,4,12,.88) 100%)',
          boxShadow: `0 ${px(12)}px ${px(40)}px rgba(0,0,0,.45), inset 0 0 0 1px ${accent}40`,
        }}
        className="relative overflow-hidden text-white backdrop-blur-md"
      >
        {/* Liseré d'accent en tête : l'identité de la chaîne. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0"
          style={{
            height: px(4),
            background: `linear-gradient(90deg, ${accent}, ${accent}00)`,
          }}
        />

        <div
          className="flex items-center justify-between gap-3"
          style={{ marginBottom: px(4) }}
        >
          <div className="flex min-w-0 items-center" style={{ gap: px(10) }}>
            <span aria-hidden style={{ fontSize: px(26), lineHeight: 1 }}>
              👑
            </span>
            <span
              className="truncate font-black uppercase"
              style={{
                color: accent,
                fontSize: px(20),
                letterSpacing: '.06em',
              }}
            >
              {clos ? t.publicMvpTitleClosed : t.publicMvpTitleOpen}
            </span>
            {poll.isDemo && (
              <span
                className="shrink-0 rounded-md font-black uppercase"
                style={{
                  fontSize: px(12),
                  padding: `${px(2)}px ${px(8)}px`,
                  background: '#f5c542',
                  color: '#1a1205',
                  letterSpacing: '.1em',
                }}
                data-testid="public-mvp-test-badge"
              >
                {t.publicMvpTestBadge}
              </span>
            )}
          </div>
          {countdown && (
            <span
              className="shrink-0 rounded-full font-extrabold tabular-nums"
              style={{
                fontSize: px(16),
                padding: `${px(4)}px ${px(12)}px`,
                background: countdown.urgent
                  ? '#e5484d'
                  : 'rgba(255,255,255,.1)',
                color: '#fff',
              }}
            >
              ⏱ {countdown.label}
            </span>
          )}
        </div>

        <div
          className="truncate text-white/70"
          style={{ fontSize: px(14), marginBottom: px(12) }}
        >
          {poll.roundName ? `${poll.roundName} · ` : ''}
          {poll.team1Name ?? '?'} vs {poll.team2Name ?? '?'}
        </div>

        {clos && (
          <div
            className="flex items-center justify-between rounded-xl"
            style={{
              marginBottom: px(12),
              padding: `${px(10)}px ${px(14)}px`,
              background: winner
                ? `linear-gradient(90deg, ${accent}, ${accent}99)`
                : 'rgba(255,255,255,.06)',
            }}
          >
            {winner ? (
              <>
                <div className="min-w-0">
                  <div
                    className="font-bold uppercase text-white/85"
                    style={{ fontSize: px(11), letterSpacing: '.12em' }}
                  >
                    {t.publicMvpWinner}
                  </div>
                  <div
                    className="truncate font-black"
                    style={{ fontSize: px(26), lineHeight: 1.1 }}
                  >
                    {winner.label}
                  </div>
                  {winner.teamName && (
                    <div
                      className="truncate text-white/80"
                      style={{ fontSize: px(13) }}
                    >
                      {winner.teamName}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className="font-black tabular-nums"
                    style={{ fontSize: px(24) }}
                  >
                    {Math.round(winner.share * 100)}%
                  </div>
                  <div className="text-white/80" style={{ fontSize: px(12) }}>
                    {format(t.publicMvpVotes, { count: winner.votes })}
                  </div>
                </div>
              </>
            ) : (
              <span className="text-white/70" style={{ fontSize: px(14) }}>
                {t.publicMvpNoWinner}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-col" style={{ gap: px(6) }}>
          {rows.map((row, i) => {
            const gagnante = clos && row.memberId === poll.winnerMemberId;
            const attenue = clos && !gagnante;
            const podium = i < 3 && row.votes > 0 ? PODIUM[i] : null;
            return (
              <div
                key={row.memberId}
                className="relative overflow-hidden"
                style={{
                  opacity: attenue ? 0.5 : 1,
                  borderRadius: px(10),
                  background: 'rgba(255,255,255,.05)',
                }}
              >
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
                  style={{
                    width: `${(row.votes / max) * 100}%`,
                    background: gagnante
                      ? `linear-gradient(90deg, ${accent}, ${accent}cc)`
                      : `linear-gradient(90deg, ${accent}66, ${accent}33)`,
                  }}
                />
                <div
                  className="relative flex items-center"
                  style={{ gap: px(10), padding: `${px(7)}px ${px(12)}px` }}
                >
                  <span
                    className="flex shrink-0 items-center justify-center rounded-full font-black tabular-nums"
                    style={{
                      width: px(24),
                      height: px(24),
                      fontSize: px(12),
                      background: podium ?? 'rgba(255,255,255,.12)',
                      color: podium ? '#1a1205' : '#fff',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {row.label}
                    </span>
                    {row.teamName && (
                      <span
                        className="block truncate text-white/55"
                        style={{ fontSize: px(11) }}
                      >
                        {row.teamName}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="font-black" style={{ fontSize: px(17) }}>
                      {Math.round(row.share * 100)}%
                    </span>
                    <span
                      className="ml-2 text-white/60"
                      style={{ fontSize: px(12) }}
                    >
                      {row.votes}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="flex items-center justify-between gap-3 text-white/60"
          style={{ fontSize: px(12), marginTop: px(12) }}
        >
          {!clos ? (
            <span className="font-semibold text-white/85">
              {t.publicMvpHowTo}
            </span>
          ) : (
            <span />
          )}
          {showSources && (
            <span className="shrink-0 tabular-nums">
              {format(t.publicMvpTotals, {
                total: poll.total,
                twitch: poll.bySource.twitch,
                discord: poll.bySource.discord,
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
