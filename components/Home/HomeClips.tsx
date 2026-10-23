// components/Home/HomeClips.tsx
//
// LES CLIPS DU MOMENT — ce que la chaîne a produit ces dernières semaines,
// juste au-dessus des prochaines rencontres.
//
// L'ACCUEIL NE LE MONTE PLUS (2026-10-23) : un soir de finales, il passait
// avant les affiches. Les clips vivent désormais dans l'onglet Clips de
// chaque tournoi (pages/tournament/[id]/clips), qui partage la même grille
// (ClipGrid). Le bloc reste prêt à resservir.
//
// Ce qu'il avait remplacé : un panneau Twitch qui, hors direct, n'affichait
// qu'une promesse (« le lecteur s'ouvre ici quand la chaîne est en direct »).
//
// Fenêtre glissante (cf. `fetchTwitchClips`) : les plus vus des 30 derniers
// jours, pas le palmarès de tous les temps. Un bloc « du moment » qui ne change
// jamais ne veut plus rien dire.

import type { JSX } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';
import ClipGrid, {
  type ClipCard,
} from '@/components/tournament/clips/ClipGrid';

export default function HomeClips({
  clips,
  channelUrl,
}: {
  clips: ClipCard[];
  channelUrl: string;
}): JSX.Element | null {
  const t = useT(nsHomeV2);
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

      <ClipGrid clips={clips} />
    </div>
  );
}
