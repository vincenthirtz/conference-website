/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';

type TwitchChannel = {
  channel: string;
  label: string;
  badge?: string;
  description: string;
  background: string;
};

export default function LiveTwitchSection() {
  const [liveStatus, setLiveStatus] = useState<Record<string, boolean>>({});
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 6;

  const twitchChannels = useMemo<TwitchChannel[]>(
    () => [
      {
        channel: 'crocheh',
        label: 'Crocheh',
        badge: 'Cast',
        description:
          'Casts francophones et analyses OW2 avec un focus compétitif.',
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/06c2cf74-2197-4f99-b372-618477410b29-profile_image-150x150.png',
      },
      {
        channel: 'gwadael',
        label: 'Gwadael',
        badge: 'Cast',
        description:
          'Cast dynamique, joueuse accomplie et spécialiste du LORE Overwatch.',
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/a7b5e36f-134a-42a2-aa5d-2f8b256ec548-profile_image-150x150.png',
      },
      {
        channel: 'arukdo',
        label: 'Arukdo',
        badge: 'Analyse',
        description:
          'Débriefs stratégiques, review de VOD et pédagogie pour progresser.',
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/25e794ab-fb22-4373-8862-e73ffc670ce3-profile_image-150x150.png',
      },
      {
        channel: 'la_kiiroii',
        label: 'La_Kiiroii',
        badge: 'Communauté',
        description: 'Communauté et ambiance chaleureuse autour des tournois.',
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/ef9103e3-7601-4528-b42e-2e565f4a8a9c-profile_image-150x150.jpeg',
      },
      {
        channel: 'yamatorochii',
        label: 'Yamatorochii',
        badge: 'Player',
        description: `Lives réguliers, gameplay et échanges avec la communauté. Joueuse de l'équipe Avoidgers`,
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/94996092-0ed5-401c-982e-d55a2ea024df-profile_image-150x150.png',
      },
      {
        channel: 'eiaeltv',
        label: 'EiaelTV',
        badge: 'Coach',
        description:
          'Casts et contenus dédiés à la scène Overwatch et Valorant féminine et mixte.',
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/db4b2c5d-38df-4835-a541-48851402b8a0-profile_image-150x150.png',
      },
      {
        channel: 'misskiwiii',
        label: 'MissKiwiii',
        badge: 'Player',
        description:
          'Joueuse Overwatch 2 avec bonne humeur, scrims avec la team Sparkles (tenante du titre 2025).',
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/6324195a-0d2a-4966-93e5-3970ef1af174-profile_image-150x150.png',
      },
      {
        channel: 'imbanshee01',
        label: 'ImBanshee01',
        badge: 'Player',
        description:
          'Equipe des phénix et joueuse occasionnelle console',
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/a37f1f33-2910-4349-b7b5-4b0e0beee14b-profile_image-150x150.jpeg',
      },
      {
        channel: 'eiko_live',
        label: 'Eiko_Live',
        badge: 'Player',
        description:
          `Streams Overwatch 2 avec une ambiance chill et des conseils gameplay. Joueuse de l'équipe Avoidgers`,
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/8e26e1e3-e8d3-4ed1-8a3c-42199cda7741-profile_image-150x150.png',
      },
      {
        channel: 'happy_ow_',
        label: 'Happy_ow_',
        badge: 'Player',
        description:
          'Gameplay OW2, ranked et scrims avec une ambiance positive. Membre des Sparkles',
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/499eb8fc-1e35-4816-a74c-458c837ae32d-profile_image-150x150.png',
      },
      {
        channel: 'zezzdecitron',
        label: 'ZezzDeCitron',
        badge: 'Player',
        description:
          "Ici c'est principalement du Overwatch mais aussi quelques petits jeux indé et sinon ça discute pas mal. Support des Onna Bugeisha",
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/05b93829-6a55-463a-89ec-bd65c33d1d16-profile_image-150x150.jpeg',
      },
      {
        channel: 'ooh_jaz',
        label: 'Ooh_Jaz',
        badge: 'Player',
        description:
          'Casts et parties classées Overwatch 2, avec focus dps et ambiance chill. Joueuse des Onna Bugeisha',
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/5dda95ec-d9d0-4e30-bb3f-6fd0211cdeb0-profile_image-150x150.png',
      },
    ],
    []
  );

  useEffect(() => {
    const fetchStatuses = async () => {
      setLoadingStatus(true);
      try {
        const channelsParam = twitchChannels.map((c) => c.channel).join(',');
        const resp = await fetch(`/api/twitch/live?channels=${channelsParam}`);
        if (!resp.ok) throw new Error('Twitch status error');
        const json = await resp.json();
        const statuses: Record<string, boolean> = {};
        Object.entries(json.statuses || {}).forEach(([ch, info]: any) => {
          statuses[ch] = Boolean((info as any)?.live);
        });
        setLiveStatus(statuses);
      } catch (err) {
        console.error('LiveTwitchSection status fetch error:', err);
      } finally {
        setLoadingStatus(false);
      }
    };

    fetchStatuses();
  }, [twitchChannels]);

  const paginated = useMemo(() => {
    const start = page * pageSize;
    return twitchChannels.slice(start, start + pageSize);
  }, [page, twitchChannels]);

  const hasPrev = page > 0;
  const hasNext = (page + 1) * pageSize < twitchChannels.length;

  return (
    <div
      id="tickets"
      className="flex items-center flex-col justify-center pt-20 lg:pt-0"
    >
      <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
        Live
      </div>
      <div data-test="ticket-section" className="flex flex-col items-center ">
        <Heading
          typeStyle="heading-md"
          className="text-gradient text-center lg:mt-10"
        >
          En attendant la compétition
        </Heading>
        <div className="max-w-3xl sm:w-full text-center">
          <Paragraph
            typeStyle="body-lg"
            className="mt-6"
            textColor="text-gray-200"
          >
            Retrouvez nos chaînes partenaires, casts et analyses en attendant la
            compétition.
          </Paragraph>
        </div>
        <div className="mt-12 grid gap-8 w-full grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {paginated.map(
            ({ channel, label, badge, description, background }) => {
              const isLive = liveStatus[channel] === true;
              return (
                <div
                  key={channel}
                  className="group rounded-2xl border border-white/10 bg-white/5 overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.35)] transition hover:border-purple-400/60 hover:-translate-y-1"
                >
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white font-semibold flex items-center justify-center uppercase"
                          style={{
                            backgroundSize: 'contain',
                            backgroundImage: `url(${background})`,
                          }}
                        ></div>
                        <div className="flex flex-col">
                          <span className="text-[11px] uppercase tracking-[0.16em] text-gray-300"></span>
                          <span className="text-xl text-white font-semibold">
                            {label}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-gray-200">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                isLive
                                  ? 'bg-red-500 animate-pulse'
                                  : 'bg-gray-500'
                              }`}
                              aria-hidden
                            />
                            {isLive ? 'Live en cours' : 'Hors ligne'}
                          </span>
                        </div>
                      </div>
                      {badge && (
                        <span className="text-xs rounded-full bg-white/10 px-3 py-1 text-gray-200 border border-white/10">
                          {badge}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {description ||
                        `Streams OW2, analyses et cast en direct. Suivez ${label}.`}
                    </p>
                    {loadingStatus && (
                      <p className="text-[11px] text-gray-500">
                        Mise à jour du statut…
                      </p>
                    )}
                    <div className="flex justify-end">
                      <a
                        href={`https://twitch.tv/${channel}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full md:w-auto"
                      >
                        <Button
                          type="button"
                          className="w-full md:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-500"
                        >
                          Voir la chaîne
                        </Button>
                      </a>
                    </div>
                  </div>
                </div>
              );
            }
          )}
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={!hasPrev}
            className={`px-4 py-2 rounded-lg border text-sm ${
              hasPrev
                ? 'border-white/30 text-white hover:border-white/60'
                : 'border-white/10 text-gray-500 cursor-not-allowed'
            }`}
          >
            ← Précédent
          </button>
          <span className="text-sm text-gray-300">
            Page {page + 1} /{' '}
            {Math.max(1, Math.ceil(twitchChannels.length / pageSize))}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => (hasNext ? p + 1 : p))}
            disabled={!hasNext}
            className={`px-4 py-2 rounded-lg border text-sm ${
              hasNext
                ? 'border-white/30 text-white hover:border-white/60'
                : 'border-white/10 text-gray-500 cursor-not-allowed'
            }`}
          >
            Suivant →
          </button>
        </div>
      </div>
    </div>
  );
}
