 
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';
import Header from '@/components/Header/header';
import About from '@/components/About/about';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Subscription from '@/components/Form/subscription';
import Speaker from '@/components/Speaker/speaker';
import speakers from '@/config/speakers.json';
import Link from 'next/link';
import Button from '@/components/Buttons/button';
import { City } from '../types/types';
import Contact from '@/components/Form/Contact';
import SponsorBanner from '@/components/Banner/SponsorBanner';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import PatchNotesSection from '@/components/News/PatchNotesSection';

function Home() {
  const speakersList = speakers;
  const currentCity: Partial<City> = {
    name: 'All',
  };
  const [twitchParent, setTwitchParent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setTwitchParent(window.location.hostname);
    }
  }, []);

  return (
    <div>
      <img
        src="/img/illustra.png"
        className="color-effect"
        alt="background-illustration"
      />
      <Header />
      {/* <Popup /> */}
      <div id="about" className="mt-20">
        <About />
      </div>
      <PatchNotesSection />
      <div id="register" className="container mt-20 lg:mt-0">
        <div className="flex items-center flex-col justify-center">
          <div
            id="speakers"
            className="relative flex flex-col items-center justify-center pt-20 lg:pt-8"
          >
            <div className="text-center">
              <div className="flex items-center justify-center">
                <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
                  Cast
                </div>
              </div>
            </div>
            <Heading
              typeStyle="heading-md"
              className="text-gradient text-center lg:mt-10"
            >
              Un cast 100% féminin
            </Heading>
            <div className="max-w-3xl sm:w-full text-center">
              <Paragraph
                typeStyle="body-lg"
                className="mt-6"
                textColor="text-gray-200"
              >
                Joueuses et streameuses récurrentes de la scène francophone
              </Paragraph>
            </div>
            <div className="w-full max-w-[1130px] px-4 md:px-0 md:py-12">
              <div className="mt-12 md:mt-16 pb-16 md:pb-[120px]">
                {speakersList.length > 0 ? (
                  <div className="w-full grid grid-cols-1 md:grid-cols-2 min-[1200px]:grid-cols-3 gap-6">
                    {speakersList.map((speaker) => {
                      return (
                        <Speaker
                          key={speaker.id}
                          details={speaker}
                          location={
                            currentCity.name !== 'All'
                              ? `${currentCity.name}, ${currentCity.country}`
                              : speaker.city[1]
                                ? `${speaker.city[0]} & ${speaker.city[1]}`
                                : `${speaker.city[0]}`
                          }
                          className="mt-10"
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-12 md:mt-16 pb-16 md:pb-[120px] flex items-center justify-center text-center">
                    <div className="w-full max-w-[720px] px-4 md:px-0">
                      {typeof currentCity !== 'string' && currentCity.cfp ? (
                        <div>
                          <Paragraph className="text-gray-200">
                            We are actively accepting speaker applications, and
                            you can start your journey by clicking the button
                            below. Join us on stage and share your valuable
                            insights with our enthusiastic audience!
                          </Paragraph>
                          <Link legacyBehavior href={currentCity.cfp}>
                            <a className="flex justify-center" target="_blank">
                              <Button
                                type="button"
                                className="mt-[80px] w-[244px] border border-gray"
                              >
                                Apply as a speaker
                              </Button>
                            </a>
                          </Link>
                        </div>
                      ) : (
                        <div>
                          <Heading
                            typeStyle="heading-md-semibold"
                            className="text-gray-200"
                          >
                            {typeof currentCity !== 'string' &&
                              currentCity.name}{' '}
                            Speakers Coming Soon - Stay Tuned!
                          </Heading>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="register" className="container mt-20 lg:mt-0">
        <div className="flex items-center flex-col justify-center">
          <div
            id="tickets"
            className="flex items-center flex-col justify-center pt-20 lg:pt-0"
          >
            <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
              Tickets
            </div>
            <div
              data-test="ticket-section"
              className="flex flex-col items-center "
            >
              <Heading
                typeStyle="heading-md"
                className="text-gradient text-center lg:mt-10"
              >
                Suivre la compétition
              </Heading>
              <div className="max-w-3xl sm:w-full text-center">
                <Paragraph
                  typeStyle="body-lg"
                  className="mt-6"
                  textColor="text-gray-200"
                >
                  A suivre prochainement sur Twitch gratuitement
                </Paragraph>
              </div>
              {twitchParent && (
                <div className="mt-8 grid gap-6 w-full grid-cols-1 md:grid-cols-2">
                  {[
                    { channel: 'crocheh', label: 'Crocheh' },
                    { channel: 'arukdo', label: 'Arukdo' },
                  ].map(({ channel, label }) => (
                    <div
                      key={channel}
                      className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
                    >
                      <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
                        <div className="flex items-center gap-2 text-base font-semibold text-white">
                          <span
                            className="w-2 h-2 rounded-full bg-red-400 animate-pulse"
                            aria-hidden
                          />
                          <span>Live {label}</span>
                        </div>
                        <span className="text-xs text-gray-300">Twitch</span>
                      </div>
                      <div className="relative w-full pt-[56.25%] bg-black">
                        <iframe
                          title={`Twitch live ${label}`}
                          src={`https://player.twitch.tv/?channel=${channel}&parent=${twitchParent}&muted=true`}
                          allowFullScreen
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          className="absolute inset-0 w-full h-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div id="sponsors" className="mt-20">
        {/* <SponsorBanner /> */}
      </div>
      {/* Formulaire de contact */}
      <div
        id="contact"
        className="flex items-center flex-col justify-center pt-20 lg:pt-0 px-4"
      >
        <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
          Contact
        </div>
        <Heading
          typeStyle="heading-md"
          className="text-gradient text-center lg:mt-10"
        >
          Faites nous un petit message
        </Heading>
        <Contact className="mt-20" />
      </div>

      <div className="mt-5">
        <Subscription />
      </div>
    </div>
  );
}

const homeSeo: SeoProps = {
  title: "OW Women's Cup 2025",
  description:
    "Tournoi Overwatch 100% féminin : cast, équipes, inscriptions et infos clés de l'édition 2025 de l'OW Women's Cup.",
};

Home.seo = homeSeo;

export default Home;
