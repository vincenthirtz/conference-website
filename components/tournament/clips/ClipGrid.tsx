// components/tournament/clips/ClipGrid.tsx
//
// Une grille de clips Twitch : vignette, durée, titre, nombre de vues.
// Partagée par l'onglet Clips du tournoi et le bloc HomeClips (que l'accueil
// ne monte plus depuis le 2026-10-23, mais qui reste prêt à servir).
//
// Chaque vignette ouvre le clip SUR TWITCH (nouvel onglet) : pas de lecteur
// embarqué, qui chargerait un script tiers pour une vidéo que personne n'a
// demandée.

import type { JSX } from 'react';
import Image from 'next/image';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsTournamentClips from '@/lib/i18n/locales/fr/tournamentClips';

/** Un clip Twitch, réduit à ce que la grille affiche (cf. `fetchTwitchClips`). */
export type ClipCard = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  viewCount: number;
  duration: number;
};

/** « 1 min 12 s » / « 34 s » — la durée brute de Twitch est en secondes. */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

export default function ClipGrid({
  clips,
  className = 'grid-cols-2 lg:grid-cols-4',
}: {
  clips: ClipCard[];
  /** Colonnes de la grille (classes Tailwind). */
  className?: string;
}): JSX.Element | null {
  const t = useT(nsTournamentClips);
  const locale = useLocale();
  if (clips.length === 0) return null;

  return (
    <ul className={`grid list-none gap-3 ${className}`}>
      {clips.map((clip) => (
        <li key={clip.id}>
          <a
            href={clip.url}
            target="_blank"
            rel="noreferrer"
            className="group block overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition hover:border-[var(--color-violet-light)]/50 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
          >
            <span className="relative block aspect-video overflow-hidden bg-black/60">
              <Image
                src={clip.thumbnailUrl}
                alt=""
                fill
                sizes="(max-width: 1024px) 50vw, 25vw"
                className="object-cover transition duration-300 group-hover:scale-[1.03]"
              />
              <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                {formatDuration(clip.duration)}
              </span>
            </span>
            <span className="block px-2.5 py-2">
              <span className="line-clamp-2 text-xs font-medium text-gray-100">
                {clip.title}
              </span>
              <span className="mt-1 block text-[11px] text-gray-400">
                {format(clip.viewCount > 1 ? t.views_other : t.views_one, {
                  count: clip.viewCount.toLocaleString(locale),
                })}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
