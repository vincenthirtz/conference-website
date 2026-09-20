// components/Home/HomeClips.tsx
//
// LES CLIPS DU MOMENT — ce que la chaîne a produit ces dernières semaines,
// juste au-dessus des prochaines rencontres.
//
// Ce qu'ils remplacent : un panneau Twitch qui, hors direct, n'affichait qu'une
// promesse (« le lecteur s'ouvre ici quand la chaîne est en direct »). Un bloc
// vide 95 % du temps, à l'endroit le plus visible de la page. Les clips, eux,
// existent toujours — et ils montrent le tournoi en mouvement.
//
// Fenêtre glissante (cf. `fetchTwitchClips`) : les plus vus des 30 derniers
// jours, pas le palmarès de tous les temps. Un bloc « du moment » qui ne change
// jamais ne veut plus rien dire.
//
// Chaque vignette ouvre le clip SUR TWITCH (nouvel onglet) : pas de lecteur
// embarqué, qui chargerait un script tiers sur la home pour une vidéo que
// personne n'a demandée.

import type { JSX } from 'react';
import Image from 'next/image';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';
import type { HomeClip } from '@/utils/home/loadHomeData';

/** « 1 min 12 s » / « 34 s » — la durée brute de Twitch est en secondes. */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

export default function HomeClips({
  clips,
  channelUrl,
}: {
  clips: HomeClip[];
  channelUrl: string;
}): JSX.Element | null {
  const t = useT(nsHomeV2);
  const locale = useLocale();
  if (clips.length === 0) return null;

  return (
    <div className="border-b border-white/10 bg-black/20 px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
          {t.clipsTitle}
        </p>
        <a
          href={channelUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full text-xs font-semibold text-[var(--color-violet-light)] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
        >
          {t.clipsChannel} <span aria-hidden>↗</span>
        </a>
      </div>

      <ul className="grid list-none grid-cols-2 gap-3 lg:grid-cols-4">
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
                  {format(
                    clip.viewCount > 1 ? t.clipsViews_other : t.clipsViews_one,
                    { count: clip.viewCount.toLocaleString(locale) }
                  )}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
