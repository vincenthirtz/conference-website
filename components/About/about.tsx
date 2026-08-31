/* eslint-disable react/no-unescaped-entities */
import React, { JSX, useEffect, useState } from 'react';
import Image from 'next/image';
import Heading from '../Typography/heading';
import Paragraph from '../Typography/paragraph';
import Button from '../Buttons/button';
import { useT } from '@/lib/i18n/useT';
import nsAboutPage from '@/lib/i18n/locales/fr/aboutPage';

const DEFAULT_VIDEO_URL = 'https://www.youtube.com/watch?v=3j6w7CjXne8';

function About(): JSX.Element {
  const t = useT(nsAboutPage);
  const [aboutVideoUrl, setAboutVideoUrl] = useState(DEFAULT_VIDEO_URL);
  const [showMedia, setShowMedia] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);

  useEffect(() => {
    // Fetch video URL from site settings
    fetch('/api/site-settings?key=about_video_url')
      .then((res) => res.json())
      .then((data) => {
        if (data.value) {
          setAboutVideoUrl(data.value);
        }
      })
      .catch(() => {
        // Keep default on error
      });
  }, []);

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
          <Image
            src="/img/brand-cover.png"
            alt={t.playersAlt}
            fill
            sizes="(max-width: 768px) 100vw, 480px"
            className="object-cover md:hidden"
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
                  title={t.videoTitle}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                  onLoad={() => setMediaLoaded(true)}
                />
              ) : (
                <video
                  className="absolute inset-0 w-full h-full object-cover"
                  src={aboutVideoUrl}
                  poster="/img/brand-cover.png"
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
              {t.sectionBadge}
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
            {t.compP1}
          </Paragraph>
          <Paragraph
            typeStyle="body-lg"
            className="mt-6"
            textColor="text-gray-200"
          >
            {t.compP2}
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
                {t.becomeSponsor}
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
