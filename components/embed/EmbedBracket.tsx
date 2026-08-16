// components/embed/EmbedBracket.tsx
// Lightweight, chrome-less wrapper around the existing BracketTreeView for the
// iframe-embeddable read-only bracket page. No Navbar/Footer/Toast — this is a
// self-contained, responsive surface meant to be framed by third parties.

import { BracketTreeView } from '@/components/admin/bracket';
import type { BracketRound } from '@/components/admin/bracket/types';
import { useT, format } from '@/lib/i18n/useT';
import nsEmbedBracket from '@/lib/i18n/locales/fr/embedBracket';

export type EmbedTheme = 'light' | 'dark';

type EmbedBracketProps = {
  tournamentName: string;
  /** Winners-bracket (or single-elim / swiss) rounds. */
  rounds: BracketRound[];
  /** Loser-bracket rounds (double-elim only). Empty otherwise. */
  loserRounds: BracketRound[];
  isDoubleElim: boolean;
  theme: EmbedTheme;
  /** Sanitized hex accent (brand bar). Null → no accent bar. */
  accent?: string | null;
  /** Optional canonical public URL for a discreet "Voir sur le site" link. */
  publicUrl?: string | null;
  siteLabel?: string;
};

export default function EmbedBracket({
  tournamentName,
  rounds,
  loserRounds,
  isDoubleElim,
  theme,
  accent,
  publicUrl,
  siteLabel = 'le site',
}: EmbedBracketProps) {
  const t = useT(nsEmbedBracket);
  const isLight = theme === 'light';
  // `accent` is already sanitized to strict hex upstream (utils/embed) — safe
  // to interpolate into an inline style. CSP allows inline styles.
  const accentStyle = accent ? { borderTop: `3px solid ${accent}` } : undefined;

  // The underlying BracketTreeView is styled for a dark surface (white text,
  // translucent borders). In light mode we keep the same component but place it
  // on a light background and gently invert via a wrapping filter-less scheme:
  // we simply give a light page chrome and let the cards keep their accent
  // colors, which read fine on white. Text contrast is preserved because the
  // cards carry their own dark card backgrounds (#12121a) regardless of theme.
  return (
    <div
      style={accentStyle}
      className={
        isLight
          ? 'min-h-screen w-full bg-neutral-100 text-neutral-900'
          : 'min-h-screen w-full bg-neutral-950 text-white'
      }
    >
      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-5 sm:py-6">
        <header className="mb-4 flex items-baseline justify-between gap-3">
          <h1
            className={
              isLight
                ? 'text-base font-semibold text-neutral-900 sm:text-lg'
                : 'text-base font-semibold text-white sm:text-lg'
            }
          >
            {tournamentName}
          </h1>
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={
                isLight
                  ? 'shrink-0 text-[11px] text-neutral-500 underline-offset-2 hover:underline'
                  : 'shrink-0 text-[11px] text-neutral-400 underline-offset-2 hover:underline'
              }
            >
              {format(t.viewOn, { site: siteLabel })} ↗
            </a>
          )}
        </header>

        {rounds.length === 0 ? (
          <p
            className={
              isLight
                ? 'rounded-lg border border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500'
                : 'rounded-lg border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-neutral-400'
            }
          >
            {t.empty}
          </p>
        ) : (
          <div className="space-y-8">
            <section>
              {isDoubleElim && (
                <p
                  className={
                    isLight
                      ? 'mb-2 text-[11px] font-bold uppercase tracking-wider text-purple-600'
                      : 'mb-2 text-[11px] font-bold uppercase tracking-wider text-purple-300'
                  }
                >
                  Winners Bracket
                </p>
              )}
              <BracketTreeView rounds={rounds} />
            </section>

            {isDoubleElim && loserRounds.length > 0 && (
              <section>
                <p
                  className={
                    isLight
                      ? 'mb-2 text-[11px] font-bold uppercase tracking-wider text-rose-600'
                      : 'mb-2 text-[11px] font-bold uppercase tracking-wider text-rose-300'
                  }
                >
                  Losers Bracket
                </p>
                <BracketTreeView rounds={loserRounds} />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
