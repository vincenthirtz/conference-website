// components/safety/SafetyHarassmentGuides.tsx
//
// Section 2 de /securite : réagir au harcèlement, en jeu, sur Discord et en
// stream. Des gestes génériques et vérifiables — aucun chemin de menu
// inventé : les interfaces changent, et un mauvais chemin fait perdre du
// temps au pire moment.

import { useT } from '@/lib/i18n/useT';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';
import SafetySection from './SafetySection';

export const SAFETY_HARASSMENT_ID = 'harcelement';

/** Centres de sécurité officiels des plateformes. */
export const DISCORD_SAFETY_URL = 'https://discord.com/safety';
export const TWITCH_SAFETY_URL = 'https://safety.twitch.tv';

type Guide = {
  title: string;
  items: string[];
  link?: { href: string; label: string };
};

function GuideCard({ guide, newTab }: { guide: Guide; newTab: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-white/20 bg-white/[0.05] p-5">
      <h3 className="text-lg font-semibold text-white">{guide.title}</h3>
      <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-gray-100">
        {guide.items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span
              className="brand-dot mt-[7px] h-2 w-2 flex-shrink-0 rounded-full"
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {guide.link && (
        <a
          href={guide.link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex w-fit items-center gap-1 rounded text-sm font-semibold text-white underline underline-offset-2 hover:text-[var(--color-yellow-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
        >
          {guide.link.label}
          <span aria-hidden="true">↗</span>
          <span className="sr-only"> {newTab}</span>
        </a>
      )}
    </div>
  );
}

export default function SafetyHarassmentGuides() {
  const t = useT(nsSafetyPage);

  const reflexes: Guide = {
    title: t.reflexTitle,
    items: [t.reflex1, t.reflex2, t.reflex3, t.reflex4, t.reflex5],
  };
  const platforms: Guide[] = [
    {
      title: t.gameTitle,
      items: [t.game1, t.game2, t.game3, t.game4],
    },
    {
      title: t.discordTitle,
      items: [t.discord1, t.discord2, t.discord3, t.discord4],
      link: { href: DISCORD_SAFETY_URL, label: t.discordLink },
    },
    {
      title: t.streamTitle,
      items: [t.stream1, t.stream2, t.stream3, t.stream4],
      link: { href: TWITCH_SAFETY_URL, label: t.twitchLink },
    },
  ];

  return (
    <SafetySection id={SAFETY_HARASSMENT_ID} title={t.harassTitle}>
      <p className="mt-4 text-base leading-relaxed text-gray-100">
        {t.harassIntro}
      </p>
      <div className="mt-6 space-y-4">
        <GuideCard guide={reflexes} newTab={t.newTab} />
        <div className="grid gap-4 lg:grid-cols-3">
          {platforms.map((guide) => (
            <GuideCard key={guide.title} guide={guide} newTab={t.newTab} />
          ))}
        </div>
      </div>
    </SafetySection>
  );
}
