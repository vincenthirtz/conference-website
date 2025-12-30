/* eslint-disable react/no-unescaped-entities */
import React, { JSX, useEffect, useState } from 'react';
import Heading from '../Typography/heading';
import Paragraph from '../Typography/paragraph';
import Button from '../Buttons/button';

function About(): JSX.Element {
  const aboutVideoUrl =
    process.env.NEXT_PUBLIC_ABOUT_VIDEO_URL ||
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

  const [showMedia, setShowMedia] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowMedia(true), 900);
    return () => clearTimeout(timer);
  }, []);

  const isYouTube = /youtu\.?be/.test(aboutVideoUrl);
  const youtubeId =
    aboutVideoUrl.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]+)/
    )?.[1] || null;
  const youtubeEmbedUrl = youtubeId
    ? `https://www.youtube.com/embed/${youtubeId}?autoplay=0&mute=1&loop=1&playlist=${youtubeId}&rel=0`
    : null;

  return (
    <div
      className="container w-full px-4 py-16 md:py-20"
      data-test="about-section"
    >
      <div className="w-full max-w-[1120px] mx-auto flex flex-col items-center justify-between gap-10 min-[1024px]:flex-row min-[1024px]:items-start min-[1024px]:gap-12">
        <div className="relative w-full max-w-[480px] h-[320px] md:h-[420px] min-[1100px]:h-[550px] rounded-[30px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/fourplayers.png"
            alt="Joueuses Overwatch"
            className="absolute inset-0 h-full w-full object-cover md:hidden"
            loading="lazy"
            draggable={false}
          />
          <div className="absolute inset-0 w-full h-full hidden md:block">
            {!mediaLoaded && (
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/10 via-white/5 to-white/0" />
            )}
            {showMedia &&
              (isYouTube && youtubeEmbedUrl ? (
                <iframe
                  className="absolute inset-0 w-full h-full object-cover"
                  src={youtubeEmbedUrl}
                  title="OW Women's Cup vidéo"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                  onLoad={() => setMediaLoaded(true)}
                />
              ) : (
                <video
                  className="absolute inset-0 w-full h-full object-cover"
                  src={aboutVideoUrl}
                  poster="/img/fourplayers.png"
                  autoPlay
                  loop
                  muted
                  playsInline
                  onLoadedData={() => setMediaLoaded(true)}
                />
              ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/25 pointer-events-none" />
        </div>
        <div className="w-full max-w-[620px] text-center min-[1024px]:text-left min-[1024px]:mt-6 min-[1024px]:ml-4">
          <div className="flex items-center justify-center min-[1024px]:justify-start">
            <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
              A propos du tournoi
            </div>
          </div>
          <Heading typeStyle="heading-md" className="text-gradient lg:mt-10">
            OW WOMEN'S CUP
          </Heading>
          <Paragraph
            typeStyle="body-lg"
            className="mt-6"
            textColor="text-gray-200"
          >
            Le but étant de promouvoir l’esport féminin et francophone à travers
            une compétition 100% féminine. Le cast sera aussi composé uniquement
            de femmes.
          </Paragraph>
          <Paragraph
            typeStyle="body-lg"
            className="mt-6"
            textColor="text-gray-200"
          >
            Nous sommes à le recherche d'un super sponsor sur le long terme.
            Nous avons déjà deux partenaires pour l'édition 2026.
          </Paragraph>
          <div
            className="mt-10 flex flex-col gap-4 md:flex-row md:justify-center min-[1024px]:justify-start"
            data-test="prospectus-download"
          >
            <a
              className="flex justify-center"
              href="/partenaires"
              target="_blank"
              rel="noreferrer"
            >
              <Button type="button" className="w-[200px]">
                Devenir sponsor
              </Button>
            </a>
            <a
              className="flex justify-center "
              href="/pdf/conf-2025.pdf"
              download={`conf ${new Date().getFullYear()}.pdf`}
            >
              {/* <Button type="button" overlay={true} className="w-[240px] border">
                <div className="flex gap-2 justify-center items-center">
                  <Image
                    src="/img/Download_icon.png"
                    height={20}
                    width={20}
                    alt="Download-icon"
                    objectFit="contain"
                  />
                  <div>Sponsorship prospectus</div>
                </div>
              </Button> */}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default About;
