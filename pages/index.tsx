 
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';
import Header from '@/components/Header/header';
import About from '@/components/About/about';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Subscription from '@/components/Form/subscription';
import Contact from '@/components/Form/Contact';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import PatchNotesSection from '@/components/News/PatchNotesSection';

function Home() {
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
