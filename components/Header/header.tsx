import React, { JSX } from 'react';
import Heading from '../Typography/heading';
import Paragraph from '../Typography/paragraph';
import ReactSlider from '../Slider/slider';
import Announcement from '../announcement';
import Link from 'next/link';

function Header(): JSX.Element {
  const currentYear = new Date().getFullYear();

  return (
    <div className="relative">
      <div className="container w-full flex items-center justify-center">
        <div className="">
          <div className="flex justify-center w-full mt-32">
            <div className="flex flex-col justify-center items-center w-full">
              <div className="my-10">{/*     <Announcement /> */}</div>
              <div
                className="w-full max-w-[640px] px-4 text-center"
                data-test="landing-heading"
              >
                <Heading
                  className="leading-normal sm:leading-38px tracking-[-3px] sm:tracking-[-0.02em] font-extrabold text-gradient"
                  level="h1"
                  typeStyle="heading-lg"
                >
                  OW WOMEN&apos;S CUP {currentYear}
                </Heading>
              </div>
              <div className="w-full max-w-[640px] px-4 text-center">
                <Paragraph className="mt-[16px] text-lg" textColor="text-gray-300">
                  Le tournoi Overwatch 100&nbsp;% féminin et francophone.
                  <br />
                  <span className="text-white font-medium">
                    Rejoins la communauté et montre ton niveau&nbsp;!
                  </span>
                </Paragraph>
              </div>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/team/create">
                  <button
                    type="button"
                    className="esport-cta group relative flex items-center gap-3 px-8 py-4 rounded-xl text-white font-extrabold text-lg uppercase tracking-wider shadow-2xl transition-all duration-300 hover:scale-105 overflow-hidden"
                  >
                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:translate-x-full transition-transform duration-700" />
                    <svg
                      className="relative w-6 h-6 transition-transform duration-300 group-hover:rotate-12"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M5 4h14a1 1 0 0 1 1 1v2a5 5 0 0 1-4 4.9 6 6 0 0 1-3 3.95V18h3a1 1 0 0 1 0 2H8a1 1 0 0 1 0-2h3v-2.15a6 6 0 0 1-3-3.95A5 5 0 0 1 4 7V5a1 1 0 0 1 1-1Zm1 3a3 3 0 0 0 2 2.83V6H6v1Zm10 2.83A3 3 0 0 0 18 7V6h-2v3.83Z" />
                    </svg>
                    <span className="relative">Inscrire mon équipe</span>
                    <svg
                      className="relative w-5 h-5 transition-transform duration-300 group-hover:translate-x-1"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </Link>
                <Link href="https://discord.gg/gERSsjC3Vd" target="_blank">
                  <button
                    type="button"
                    className="group flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/25 text-white font-medium text-base backdrop-blur transition-all duration-300 hover:scale-105"
                  >
                    <svg
                      className="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                    Discord
                  </button>
                </Link>
                <Link href="/inscription-2026#faq">
                  <button
                    type="button"
                    className="group flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/25 text-white font-medium text-base backdrop-blur transition-all duration-300 hover:scale-105"
                  >
                    <svg
                      className="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <path d="M12 17h.01" />
                    </svg>
                    FAQ
                  </button>
                </Link>
                <Link href="/timeline-2026">
                  <button
                    type="button"
                    className="group flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/25 text-white font-medium text-base backdrop-blur transition-all duration-300 hover:scale-105"
                  >
                    <svg
                      className="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 12h4l3-9 4 18 3-9h4" />
                    </svg>
                    Roadmap
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* <div className="mt-24">
        <ReactSlider>
          {cities.map((city) => {
            return <Venue key={city.name} city={city} />;
          })}
        </ReactSlider>
      </div> */}
    </div>
  );
}

export default Header;
