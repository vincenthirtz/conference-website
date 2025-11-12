/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
import { useState, useRef } from 'react';
import Head from 'next/head';
import { useMediaQuery } from 'react-responsive';
import Header from '../components/Header/header';
import Sponsors from '../components/Sponsors/sponsors';
import About from '../components/About/about';
import Tickets from '../components/Tickets/tickets';
import Heading from '../components/Typography/heading';
import Paragraph from '../components/Typography/paragraph';
import Subscription from '../components/Form/subscription';
import Speaker from '../components/Speaker/speaker';
import cities from '../config/city-lists.json';
import teams from '../config/teams.json';
import speakers from '../config/speakers.json';
import Link from 'next/link';
import Button from '../components/Buttons/button';
import Dropdown from '../components/Dropdown/dropdown';
import { City } from '../types/types';
import Popup from '../components/Popup/popup';

function encode(data: Record<string, string>) {
  return new URLSearchParams(data).toString();
}

export default function Home() {
  const isTablet = useMediaQuery({ maxWidth: '1118px' });
  const [speakersList, setSpeakersList] = useState(speakers);
  const [teamsList, setTeamsList] = useState(teams);
  const [currentCity, setCurrentCity] = useState<Partial<City>>({
    name: 'All',
  });

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<null | 'ok' | 'err'>(null);
  const [errMsg, setErrMsg] = useState('');
  const [msgCount, setMsgCount] = useState(0);
  const confettiRef = useRef<HTMLCanvasElement | null>(null);

  const handleSpeakers = (city: string) => {
    if (city && city !== 'all') {
      const citySpeaker = speakers.filter((speaker) => speaker.city.includes(city));
      setSpeakersList(citySpeaker);
    } else if (city === 'all') {
      setSpeakersList(speakers);
    } else {
      setSpeakersList([]);
    }
  };

  const handleTeams = (city: string) => {
    if (city && city !== 'all') {
      const cityTeam = teams.filter((team) => team.city.includes(city));
      setTeamsList(cityTeam);
    } else if (city === 'all') {
      setTeamsList(teams);
    } else {
      setTeamsList([]);
    }
  };

  function fireConfetti(durationMs = 1600, particleCount = 160) {
    if (typeof window === 'undefined') return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = confettiRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const parent = canvas.parentElement as HTMLElement;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.opacity = '1';

    const colors = ['#60a5fa','#a78bfa','#f472b6','#22d3ee','#e879f9'];
    const gravity = 0.12 * dpr;
    const drag = 0.005;
    const particles = Array.from({ length: particleCount }, () => {
      const angle = Math.random() * Math.PI - Math.PI / 2;
      const speed = (6 + Math.random() * 6) * dpr;
      return {
        x: (Math.random() * rect.width) * dpr,
        y: (rect.height * 0.15 * dpr),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3 * dpr,
        w: (6 + Math.random() * 6) * dpr,
        h: (10 + Math.random() * 12) * dpr,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
        color: colors[(Math.random() * colors.length) | 0],
      } as any;
    });

    let start = performance.now();
    let raf = 0 as any;

    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      (particles as any[]).forEach((p) => {
        p.vy += gravity;
        p.vx *= (1 - drag);
        p.vy *= (1 - drag);
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (t < durationMs) {
        raf = requestAnimationFrame(tick);
      } else {
        canvas.style.opacity = '0';
        setTimeout(() => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }, 200);
        cancelAnimationFrame(raf);
      }
    };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setSent(null);
    setErrMsg('');
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const payload: Record<string, string> = {
      'form-name': (form.getAttribute('name') as string) || 'contact',
      consent: 'on'
    };
    formData.forEach((value, key) => (payload[key] = String(value)));

    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encode(payload),
      });
      if (res.ok) {
        form.reset();
        setMsgCount(0);
        setSent('ok');
        fireConfetti();
      } else {
        setSent('err');
        setErrMsg('Soumission non acceptée.');
      }
    } catch (err: any) {
      setSent('err');
      setErrMsg('Erreur réseau.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <Head>
        <title>OW WOMEN'S CUP 2025</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <img src="/img/illustra.png" className="color-effect" alt="background-illustration" />
      <Header />
      {/* <Popup /> */}
      <div id="about" className="mt-20">
        <About />
      </div>

      {/* SPEAKERS */}
      <div id="register" className="container mt-20 lg:mt-0">
        <div className="flex items-center flex-col justify-center">
          <div id="speakers" className="relative flex flex-col items-center justify-center pt-20 lg:pt-8">
            <div className="text-center">
              <div className="flex items-center justify-center">
                <div className="text-lg sm:text-sm text-white font-semi-bold border-b-2 border-blue-400 mb-1">Cast</div>
              </div>
            </div>
            <Heading typeStyle="heading-md" className="text-gradient text-center lg:mt-10">
              Un cast 100% féminin
            </Heading>
            <div className="max-w-3xl sm:w-full text-center">
              <Paragraph typeStyle="body-lg" className="mt-6" textColor="text-gray-200">
                Joueuses et streameuses récurrentes de la scène francophone
              </Paragraph>
            </div>
            <div className="lg:py-20 w-[1130px] lg:w-full">
              <div className="mt-[64px] pb-[181px] lg:pb-[80px]">
                {speakersList.length > 0 ? (
                  <div className="w-full grid grid-cols-3 lg:grid-cols-2 sm:grid-cols-1 gap-4">
                    {speakersList.map((speaker) => (
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
                    ))}
                  </div>
                ) : (
                  <div className="mt-[64px] pb-[181px] flex items-center justify-center text-center">
                    <div className="w-[720px] lg:w-full">
                      {typeof currentCity !== 'string' && (currentCity as any).cfp ? (
                        <div>
                          <Paragraph className="text-gray-200">
                            We are actively accepting speaker applications, and you can start your journey by clicking the button below. Join us on stage and share your valuable insights with our enthusiastic audience!
                          </Paragraph>
                          <Link legacyBehavior href={(currentCity as any).cfp as string}>
                            <a className="flex justify-center" target="_blank">
                              <Button type="button" className="mt-[80px] w-[244px] border border-gray">
                                Apply as a speaker
                              </Button>
                            </a>
                          </Link>
                        </div>
                      ) : (
                        <div>
                          <Heading typeStyle="heading-md-semibold" className="text-gray-200">
                            {typeof currentCity !== 'string' && currentCity.name} Speakers Coming Soon - Stay Tuned!
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

      {/* TEAMS */}
      <div id="register" className="container mt-20 lg:mt-0">
        <div className="flex items-center flex-col justify-center">
          <div id="teams" className="relative flex flex-col items-center justify-center pt-20 lg:pt-8">
            <div className="text-center">
              <div className="flex items-center justify-center">
                <div className="text-lg sm:text-sm text-white font-semi-bold border-b-2 border-blue-400 mb-1">Equipes</div>
              </div>
            </div>
            <Heading typeStyle="heading-md" className="text-gradient text-center lg:mt-10">
              Des équipes au rendez-vous
            </Heading>
            <div className="max-w-3xl sm:w-full text-center">
              <Paragraph typeStyle="body-lg" className="mt-6" textColor="text-gray-200">
                Tout niveau et de plusieurs nationalités
              </Paragraph>
            </div>
            <div className="lg:py-20 w-[1130px] lg:w-full">
              <div className="mt-[64px] pb-[181px] lg:pb-[80px]">
                {teamsList.length > 0 ? (
                  <div className="w-full grid grid-cols-3 lg:grid-cols-2 sm:grid-cols-1 gap-4">
                    {teamsList.map((team) => (
                      <Speaker
                        key={team.id}
                        details={team}
                        location={
                          currentCity.name !== 'All'
                            ? `${currentCity.name}, ${currentCity.country}`
                            : team.city[1]
                            ? `${team.city[0]} & ${team.city[1]}`
                            : `${team.city[0]}`
                        }
                        className="mt-10"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-[64px] pb-[181px] flex items-center justify-center text-center">
                    <div className="w-[720px] lg:w-full">
                      {typeof currentCity !== 'string' && (currentCity as any).cfp ? (
                        <div>
                          <Paragraph className="text-gray-200">
                            We are actively accepting speaker applications, and you can start your journey by clicking the button below. Join us on stage and share your valuable insights with our enthusiastic audience!
                          </Paragraph>
                          <Link legacyBehavior href={(currentCity as any).cfp as string}>
                            <a className="flex justify-center" target="_blank">
                              <Button type="button" className="mt-[80px] w-[244px] border border-gray">
                                Apply as a speaker
                              </Button>
                            </a>
                          </Link>
                        </div>
                      ) : (
                        <div>
                          <Heading typeStyle="heading-md-semibold" className="text-gray-200">
                            {typeof currentCity !== 'string' && currentCity.name} Speakers Coming Soon - Stay Tuned!
                          </Heading>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TICKETS */}
          <div id="tickets" className="flex items-center flex-col justify-center pt-20 lg:pt-0">
            <div className="text-lg sm:text-sm text-white font-semi-bold border-b-2 border-blue-400 mb-1">Tickets</div>
            <div data-test="ticket-section" className="flex flex-col items-center ">
              <Heading typeStyle="heading-md" className="text-gradient text-center lg:mt-10">
                Suivre la compétition
              </Heading>
              <div className="max-w-3xl sm:w-full text-center">
                <Paragraph typeStyle="body-lg" className="mt-6" textColor="text-gray-200">
                  A suivre prochainement sur Twitch gratuitement
                </Paragraph>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SPONSORS */}
      <div id="sponsors" className="mt-20">
        <Sponsors
          eventSponsors={[
            { image: '/img/logos/apidays.png', websiteUrl: 'https://www.apidays.global/' },
            { image: '/img/logos/APICONF-LOGO-White.png', websiteUrl: 'https://apiconf.net/' },
          ]}
          financialSponsor={[
            { image: '/img/logos/IBM.png', websiteUrl: 'https://www.ibm.com/' },
            { image: '/img/logos/graviteeio-logo.webp', websiteUrl: 'https://www.gravitee.io/' },
          ]}
        />
      </div>

      {/* CONTACT — Netlify + fun + confettis */}
      <div id="contact" className="container mt-24">
        <div className="flex items-center flex-col justify-center">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 bg-blue-500/10 border border-blue-400/30 text-blue-200 text-xs uppercase tracking-wide">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
            Contact
          </div>
          <Heading typeStyle="heading-md" className="text-center lg:mt-6 text-gradient">
            Dis-nous bonjour <span className="inline-block">👋</span>
          </Heading>
          <p className="text-gray-300 mt-3 text-center max-w-xl">
            Une question sur le tournoi, un partenariat, ou juste un coucou ? On lit tout, promis.
          </p>

          <div className="relative mt-10 w-full max-w-2xl">
            {/* glow dégradé */}
            <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-blue-500 via-fuchsia-500 to-violet-500 blur opacity-30"></div>

            {/* Canvas confettis (overlay) */}
            <canvas
              ref={confettiRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 w-full h-full transition-opacity duration-300 opacity-0"
            />
    {/* requis pour Netlify */}
              <form name="contact" data-netlify="true" data-netlify-honeypot="bot-field" hidden>
  <input type="hidden" name="form-name" value="contact" />
  <input type="text" name="name" />
  <input type="email" name="email" />
  <textarea name="message" />
</form>
            <form
              name="contact"
  method="POST"
  data-netlify="true"
  data-netlify-honeypot="bot-field"
  onSubmit={handleSubmit}
  className="relative bg-gray-900/80 backdrop-blur rounded-2xl border border-white/10 p-6 sm:p-8 space-y-6"
            >
          
              <p className="hidden">
                <label>
                  Ne pas remplir : <input name="bot-field" />
                </label>
              </p>

              {/* rangée nom + email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 max-[380px]:grid-cols-1 gap-4">
                {/* Nom - label flottant */}
                <div className="relative">
                  <input
                    type="text"
                    name="name"
                    required
                    className="peer w-full px-3 pt-6 pb-2 max-[380px]:px-2 max-[380px]:pt-5 max-[380px]:pb-2 rounded-lg bg-gray-800/70 border border-white/10 text-white placeholder-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Votre nom"
                  />
                  <label className="pointer-events-none absolute left-3 top-2 text-xs tracking-wide text-gray-400 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-xs">
                    Nom
                  </label>
                </div>

                {/* Email - label flottant */}
                <div className="relative">
                  <input
                    type="email"
                    name="email"
                    required
                    className="peer w-full px-3 pt-6 pb-2 max-[380px]:px-2 max-[380px]:pt-5 max-[380px]:pb-2 rounded-lg bg-gray-800/70 border border-white/10 text-white placeholder-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Votre email"
                  />
                  <label className="pointer-events-none absolute left-3 top-2 text-xs tracking-wide text-gray-400 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-xs">
                    Email
                  </label>
                </div>
              </div>

              {/* Sujet */}
              <div className="relative">
                <select
                  name="subject"
                  defaultValue="Info tournoi"
                  className="w-full appearance-none px-3 py-3 pr-10 max-[380px]:px-2 max-[380px]:py-2 rounded-lg bg-gray-800/70 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option>Info tournoi</option>
                  <option>Partenariat / Sponsor</option>
                  <option>Presse / Média</option>
                  <option>Autre</option>
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-70">▾</span>
              </div>

              {/* Message + compteur */}
              <div className="relative">
                <textarea
                  name="message"
                  rows={5}
                  maxLength={1000}
                  onChange={(e) => setMsgCount(e.currentTarget.value.length)}
                  className="w-full px-3 pt-4 pb-3 max-[380px]:px-2 max-[380px]:pt-3 max-[380px]:pb-2 rounded-lg bg-gray-800/70 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Votre message..."
                  required
                />
                <div className="mt-1 text-right text-xs text-gray-400">{msgCount}/1000</div>
              </div>

              {/* Consentement */}
              <label className="flex items-start gap-3 text-gray-300 text-sm">
                <input
                  type="checkbox"
                  name="consent"
                  required
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-gray-800 text-blue-500 focus:ring-blue-500"
                />
                J’accepte que mes informations soient utilisées pour me répondre. Aucune newsletter non sollicitée.
              </label>

              {/* Bouton */}
              <button
                type="submit"
                disabled={sending}
                className={`group inline-flex items-center justify-center gap-2 w-full px-6 py-3 max-[380px]:px-4 max-[380px]:py-2 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-fuchsia-600 enabled:hover:from-blue-500 enabled:hover:to-fuchsia-500 transition-all shadow-lg shadow-fuchsia-800/20 ${sending ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <span>{sending ? 'Envoi…' : 'Envoyer le message'}</span>
                <svg aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 12h14m0 0-4-4m4 4-4 4M21 5v14" opacity=".3" />
                  <path d="M17 12l-4-4v8l4-4z" />
                </svg>
              </button>

              {/* États */}
              {sent === 'ok' && (
                <div className="rounded-lg border border-green-400/30 bg-green-500/10 text-green-200 px-4 py-3 max-[380px]:px-3 max-[380px]:py-2 text-sm">
                  Merci 💙 Votre message a bien été envoyé. On revient vite vers vous !
                </div>
              )}
              {sent === 'err' && (
                <div className="rounded-lg border border-red-400/30 bg-red-500/10 text-red-200 px-4 py-3 max-[380px]:px-3 max-[380px]:py-2 text-sm">
                  Oups 😥 Échec de l’envoi : {errMsg}. Réessayez dans un instant.
                </div>
              )}

            </form>
          </div>
        </div>
      </div>
      <div className="mt-5">
        <Subscription />
      </div>
    </div>
  );
}
