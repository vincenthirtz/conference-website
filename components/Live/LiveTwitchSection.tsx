/* eslint-disable @next/next/no-img-element */
import { useMemo } from 'react';
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
          'Joueuse Overwatch 2 avec bonne humeur, scrims avec la team Sparkles.',
        background:
          'https://static-cdn.jtvnw.net/jtv_user_pictures/6324195a-0d2a-4966-93e5-3970ef1af174-profile_image-150x150.png',
      },
    ],
    []
  );

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
          {twitchChannels.map(
            ({ channel, label, badge, description, background }) => (
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
            )
          )}
        </div>
      </div>
    </div>
  );
}
