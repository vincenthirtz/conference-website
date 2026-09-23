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
// pied, en petit : il renseigne sans diviser l'écran.
//
// LE CLASSEMENT EST STABLE, et ce n'est pas un détail : l'API rend un ordre
// TOTAL (voix décroissantes, puis memberId). Sans lui, deux joueuses à égalité
// permuteraient à chaque rafraîchissement, sous les yeux du public — trois
// secondes de sautillement toutes les trois secondes.
//
// AUCUNE ANIMATION D'ENTRÉE. Une source OBS rafraîchie toutes les trois
// secondes qui rejouerait une animation à chaque fois serait épuisante à
// regarder. Seules les LARGEURS de barres sont animées, ce qui donne la
// sensation d'un vote qui monte.
//
// APRÈS LA CLÔTURE, l'élue passe en avant et les autres s'effacent à demi. Le
// même écran sert donc au vote et à son résultat : la régie n'a pas de source
// à changer au moment le plus occupé de la soirée.

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
  /** Combien de candidates afficher. Dix tiennent à l'écran, pas vingt. */
  limit?: number;
  /**
   * Où poser la carte dans la source. Une carte figée au centre oblige à
   * recadrer la source dans OBS ; les autres overlays du dépôt acceptent tous
   * ce réglage, celui-ci doit faire pareil.
   */
  position?: 'top' | 'center' | 'bottom';
};

/** Largeur « de conception » de la carte, à l'échelle 1. */
const CARD_W = 620;

/** Le compte à rebours, en mm:ss. Rend `null` quand la fenêtre est passée. */
function useCountdown(closesAt: string | null, isOpen: boolean): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!closesAt || !isOpen) {
      setLabel(null);
      return undefined;
    }
    const fin = new Date(closesAt).getTime();
    const tick = () => {
      const reste = Math.max(0, fin - Date.now());
      const s = Math.floor(reste / 1000);
      setLabel(
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
      );
    };
    tick();
    // Une seconde : c'est un compte à rebours, il doit descendre à l'œil. Il
    // est LOCAL et ne coûte aucune requête — l'heure de clôture est connue.
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [closesAt, isOpen]);

  return label;
}

export function PublicMvpSource({
  poll,
  scale = 1,
  accent = '#ba18ff',
  limit = 10,
  position = 'center',
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

  return (
    <div
      className="flex h-full w-full justify-center"
      style={{
        alignItems:
          position === 'top'
            ? 'flex-start'
            : position === 'bottom'
              ? 'flex-end'
              : 'center',
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{ width, fontSize: 16 * scale }}
        className="rounded-2xl border border-white/10 bg-black/70 p-4 text-white backdrop-blur-sm"
      >
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span
            className="font-extrabold uppercase tracking-wide"
            style={{ color: accent, fontSize: 18 * scale }}
          >
            {clos ? t.publicMvpTitleClosed : t.publicMvpTitleOpen}
          </span>
          {countdown && (
            <span
              className="rounded-full bg-white/10 px-2 py-0.5 font-bold tabular-nums"
              style={{ fontSize: 14 * scale }}
            >
              {countdown}
            </span>
          )}
        </div>

        <div
          className="mb-3 truncate text-white/70"
          style={{ fontSize: 14 * scale }}
        >
          {poll.team1Name ?? '?'} vs {poll.team2Name ?? '?'}
        </div>

        <div className="space-y-1.5">
          {rows.map((row) => {
            const gagnante = clos && row.memberId === poll.winnerMemberId;
            // Après la clôture, l'élue passe en avant et les autres s'effacent
            // à demi : le même écran sert au vote et à son résultat.
            const attenue = clos && !gagnante;
            return (
              <div
                key={row.memberId}
                className="relative overflow-hidden rounded-lg bg-white/5"
                style={{ opacity: attenue ? 0.45 : 1 }}
              >
                <div
                  className="absolute inset-y-0 left-0 transition-[width] duration-500"
                  style={{
                    width: `${(row.votes / max) * 100}%`,
                    background: gagnante ? accent : `${accent}55`,
                  }}
                />
                <div className="relative flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="truncate font-semibold">
                    {gagnante ? '👑 ' : ''}
                    {row.label}
                  </span>
                  <span
                    className="shrink-0 font-bold tabular-nums"
                    style={{ fontSize: 14 * scale }}
                  >
                    {row.votes}
                    <span className="ml-1 font-normal text-white/60">
                      {Math.round(row.share * 100)}%
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="mt-2.5 flex items-center justify-between text-white/50"
          style={{ fontSize: 12 * scale }}
        >
          <span>
            {format(t.publicMvpTotals, {
              total: poll.total,
              twitch: poll.bySource.twitch,
              discord: poll.bySource.discord,
            })}
          </span>
          {!clos && <span>{t.publicMvpHowTo}</span>}
        </div>
      </div>
    </div>
  );
}
