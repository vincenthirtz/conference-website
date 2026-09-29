// features/admin/diffusion/ui/LiveConsoleBlocks.tsx — les blocs d'affichage
// de la console live (`pages/admin/broadcast/live.tsx`) en « Le Ruban » :
// le HUD d'antenne (on-air, segment, match), la liste des casteuses, le cadre
// d'une section du pupitre et le bouton de scène.
//
// Présentationnel : il reçoit l'état déjà lu, il ne charge ni n'envoie rien.
// Écran d'opérations en direct : grands chiffres, et une seule lueur — celle
// de l'antenne quand elle est prise.

import type { ReactNode } from 'react';
import Chip from '../../_shared/ui/Chip';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminBroadcastLive from '@/lib/i18n/locales/admin-fr/adminBroadcastLive';

const CARD =
  'rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] px-5 py-4';
const EYEBROW =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';

/** Champ texte du pupitre (URL d'overlay, lower-third). */
export const liveInputClass =
  'h-[38px] min-w-0 flex-1 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 text-sm text-[var(--t1,#f4edf7)] outline-none focus:border-[var(--or,#b467d1)] disabled:opacity-50';

/** Une section du pupitre : titre étroit en capitales, contenu. */
export function LiveSection({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={`${CARD} mb-6 border-[var(--line2,rgba(194,196,201,.2))]`}
    >
      <h2 className={`${EYEBROW} mb-3`}>{title}</h2>
      {children}
    </section>
  );
}

/** Bouton de scène : bascule (`aria-pressed`), l'active en orchidée pleine. */
export function SceneButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`h-[38px] rounded-[var(--r-ctrl,4px)] border px-[14px] font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.02em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.22)] text-[var(--or-100,#f6e1ff)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--t2,#c7bfca)] hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]'
      }`}
    >
      {children}
    </button>
  );
}

type HudSegment = {
  ord: number;
  title: string;
  type: string;
  duration_min: number | null;
};

type HudMatch = {
  team1: { name: string } | null;
  team2: { name: string } | null;
  team1Score: number | null;
  team2Score: number | null;
  streamUrl: string | null;
};

type HudCaster = {
  castMemberId: string;
  displayName: string | null;
  discordUserId: string | null;
};

/** HUD : antenne, segment en cours, match — puis les casteuses assignées. */
export function LiveHud({
  onAir,
  runSlug,
  segment,
  match,
  casters,
}: {
  onAir: boolean;
  runSlug: string;
  segment: HudSegment | null;
  match: HudMatch | null;
  casters: HudCaster[];
}) {
  const t = useAdminT(nsAdminBroadcastLive);
  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div
          className={`${CARD} ${
            onAir
              ? 'border-[rgba(127,202,101,.55)] shadow-[var(--glow-live)]'
              : 'border-[var(--line2,rgba(194,196,201,.2))]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className={EYEBROW}>{t.onAir}</p>
            {onAir && <Chip tone="live">{t.onAirChip}</Chip>}
          </div>
          <p
            className={`mt-2 font-[family-name:var(--fd)] text-[40px] font-extrabold leading-none [font-stretch:75%] ${
              onAir
                ? 'text-[var(--lf-200,#b3e7a3)]'
                : 'text-[var(--t3,#a39ba6)]'
            }`}
          >
            {onAir ? t.live : t.off}
          </p>
          <p className="mt-2 text-xs text-[var(--t3,#a39ba6)]">
            {t.runLabel} <span className="font-mono">{runSlug}</span>
          </p>
        </div>

        <div className={`${CARD} border-[var(--line2,rgba(194,196,201,.2))]`}>
          <p className={EYEBROW}>{t.segmentHeading}</p>
          {segment ? (
            <>
              <p className="mt-2 text-lg font-bold text-[var(--t1,#f4edf7)]">
                #{segment.ord} · {segment.title}
              </p>
              <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                {format(t.segmentType, {
                  type: segment.type,
                  min: segment.duration_min ?? '?',
                })}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm italic text-[var(--t4,#807984)]">
              {t.segmentNone}
            </p>
          )}
        </div>

        <div className={`${CARD} border-[var(--line2,rgba(194,196,201,.2))]`}>
          <p className={EYEBROW}>{t.matchHeading}</p>
          {match ? (
            <>
              <p className="mt-2 text-base font-semibold text-[var(--t1,#f4edf7)]">
                {match.team1?.name ?? '?'}{' '}
                <span
                  className="font-mono text-[var(--t2,#c7bfca)]"
                  data-numeric
                >
                  {match.team1Score ?? '–'} · {match.team2Score ?? '–'}
                </span>{' '}
                {match.team2?.name ?? '?'}
              </p>
              {match.streamUrl ? (
                <a
                  href={match.streamUrl}
                  target="_blank"
                  rel="noopener"
                  className="mt-1 inline-block text-xs text-[var(--or-200,#eec4ff)] hover:underline"
                >
                  {t.stream}
                </a>
              ) : (
                <p className="mt-1 text-xs text-[var(--t4,#807984)]">
                  {t.noStream}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm italic text-[var(--t4,#807984)]">
              {t.segmentNonMatch}
            </p>
          )}
        </div>
      </div>

      <LiveSection title={t.castersHeading}>
        {casters.length === 0 ? (
          <p className="text-sm italic text-[var(--t4,#807984)]">
            {t.castersEmpty}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {casters.map((c) => (
              <li key={c.castMemberId}>
                <span className="font-medium text-[var(--t1,#f4edf7)]">
                  {c.displayName ?? t.casterNoName}
                </span>
                {c.discordUserId && (
                  <span className="ml-2 font-mono text-xs text-[var(--t4,#807984)]">
                    {c.discordUserId}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </LiveSection>
    </>
  );
}
