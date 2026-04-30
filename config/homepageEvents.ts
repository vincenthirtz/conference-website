export type HomepageEvent = {
  id: string;
  title: string;
  description?: string;
  /** ISO 8601 with timezone offset, e.g. 2026-05-17T14:00:00+02:00 */
  date: string;
  /** Optional end date — used for ranges. Same format as `date`. */
  endDate?: string;
  location: 'twitch' | 'discord' | 'irl' | 'online';
  /** Short kicker shown above the title (e.g. "Stream caritatif"). */
  tag?: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

export const homepageEvents: HomepageEvent[] = [
  {
    id: 'idahot-2026',
    title:
      "Journée internationale contre l'homophobie et la transphobie",
    description:
      "Stream spécial sur la chaîne Twitch de la Women's Cup à l'occasion de la journée IDAHOTB.",
    date: '2026-05-17T14:00:00+02:00',
    location: 'twitch',
    tag: 'Stream caritatif',
    ctaLabel: 'Voir sur Twitch',
    ctaUrl: 'https://www.twitch.tv/womens_cup',
  },
];
