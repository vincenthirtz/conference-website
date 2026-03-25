import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

const DEFAULT_VIDEO_URL = 'https://www.youtube.com/watch?v=3j6w7CjXne8';

const stats = [
  { value: '3', label: '\u00c9ditions' },
  { value: '50+', label: 'Joueuses' },
  { value: '10+', label: 'B\u00e9n\u00e9voles' },
  { value: '100%', label: 'F\u00e9minin' },
  { value: '200+', label: 'Viewers' },
];

const steps = [
  {
    step: '01',
    title: 'Inscris ton \u00e9quipe',
    desc: 'Cr\u00e9e ou rejoins une \u00e9quipe de 5 joueuses. Le format est ouvert \u00e0 toutes, d\u00e9butantes comme confirm\u00e9es.',
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
        />
      </svg>
    ),
  },
  {
    step: '02',
    title: 'Joue le tournoi',
    desc: 'Des matchs en ligne au format comp\u00e9titif, avec arbitrage professionnel et lobby s\u00e9curis\u00e9s. Du Swiss au bracket final.',
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-3.52 1.122 6.023 6.023 0 01-3.52-1.122"
        />
      </svg>
    ),
  },
  {
    step: '03',
    title: 'Regarde le cast en direct',
    desc: 'Chaque match est cast\u00e9 en direct sur Twitch par une \u00e9quipe 100\u202f% f\u00e9minine. Overlay pro, replays et interviews.',
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z"
        />
      </svg>
    ),
  },
];

const values = [
  {
    title: 'Safe space',
    desc: 'Mod\u00e9ration active, charte anti-harc\u00e8lement et staff form\u00e9 pour que chaque joueuse se sente en s\u00e9curit\u00e9.',
    accent: 'from-emerald-500/20 to-emerald-600/5',
    border: 'border-emerald-500/20',
    iconColor: 'text-emerald-400',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
        />
      </svg>
    ),
  },
  {
    title: 'Accessibilit\u00e9',
    desc: 'Ouvert \u00e0 tous les niveaux, du d\u00e9butant au semi-pro. L\u2019important c\u2019est de participer et progresser.',
    accent: 'from-purple-500/20 to-purple-600/5',
    border: 'border-purple-500/20',
    iconColor: 'text-purple-400',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    ),
  },
  {
    title: 'Transparence',
    desc: 'R\u00e8glement public, arbitrage clair et communication ouverte avec les joueuses et la communaut\u00e9.',
    accent: 'from-cyan-500/20 to-cyan-600/5',
    border: 'border-cyan-500/20',
    iconColor: 'text-cyan-400',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
  {
    title: 'B\u00e9n\u00e9volat',
    desc: 'Enti\u00e8rement port\u00e9 par des passionn\u00e9es. Chaque don et partenariat finance directement le tournoi.',
    accent: 'from-pink-500/20 to-pink-600/5',
    border: 'border-pink-500/20',
    iconColor: 'text-pink-400',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
        />
      </svg>
    ),
  },
];

function AboutPage() {
  const [videoUrl, setVideoUrl] = useState(DEFAULT_VIDEO_URL);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    fetch('/api/site-settings?key=about_video_url')
      .then((res) => res.json())
      .then((data) => {
        if (data.value) setVideoUrl(data.value);
      })
      .catch(() => {});
  }, []);

  const youtubeId =
    videoUrl.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]+)/
    )?.[1] || null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* ── Hero with video ──────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
          <div className="absolute right-0 top-20 h-[400px] w-[400px] rounded-full bg-pink-500/15 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pt-36 pb-20">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
            {/* Text */}
            <div className="flex-1 text-center lg:text-left">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-300 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                Depuis 2025
              </p>
              <h1 className="mt-5 text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-6xl">
                Le tournoi Overwatch
                <span className="block text-gradient">
                  100&nbsp;% f&eacute;minin
                </span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-gray-300 mx-auto lg:mx-0">
                La Women&apos;s Cup r&eacute;unit des joueuses francophones de
                tous niveaux dans un cadre comp&eacute;titif, bienveillant et
                enti&egrave;rement cast&eacute; par des femmes. Un tournoi par
                et pour la communaut&eacute;.
              </p>
              <div className="mt-8 flex flex-wrap gap-4 justify-center lg:justify-start">
                <Link
                  href="/register"
                  className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all hover:shadow-xl hover:shadow-purple-900/50 hover:-translate-y-0.5"
                >
                  S&apos;inscrire au tournoi
                </Link>
                <Link
                  href="/association"
                  className="rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                >
                  D&eacute;couvrir l&apos;asso
                </Link>
              </div>
            </div>

            {/* Video */}
            <div className="flex-1 max-w-xl mx-auto lg:mx-0 w-full">
              <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-purple-900/20">
                {!showVideo ? (
                  <button
                    type="button"
                    onClick={() => setShowVideo(true)}
                    className="group relative w-full h-full"
                    aria-label="Lancer la vid\u00e9o"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        youtubeId
                          ? `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`
                          : '/img/fourplayers.png'
                      }
                      alt="Aper\u00e7u vid\u00e9o OW Women's Cup"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <svg
                          className="w-7 h-7 text-white ml-1"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </button>
                ) : youtubeId ? (
                  <iframe
                    className="absolute inset-0 w-full h-full"
                    src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
                    title="OW Women's Cup vid\u00e9o"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video
                    className="absolute inset-0 w-full h-full object-cover"
                    src={videoUrl}
                    autoPlay
                    controls
                    playsInline
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-24 px-4 pb-24 sm:px-6">
        {/* ── Stats ──────────────────────────────────────── */}
        <section className="relative -mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm px-4 py-5 text-center"
              >
                <p className="text-3xl font-bold text-gradient">{stat.value}</p>
                <p className="mt-1 text-sm text-gray-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Notre mission ──────────────────────────────── */}
        <section>
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-8 sm:p-12">
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-purple-300">
                Notre mission
              </p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                Promouvoir l&apos;esport f&eacute;minin francophone
              </h2>
              <p className="mt-5 text-gray-300 leading-relaxed">
                L&apos;OW Women&apos;s Cup est n&eacute;e d&apos;un constat
                simple&nbsp;: les femmes sont sous-repr&eacute;sent&eacute;es
                dans l&apos;esport comp&eacute;titif. Notre
                r&eacute;ponse&nbsp;? Un tournoi Overwatch o&ugrave; les
                joueuses sont au centre, o&ugrave; le cast est 100&nbsp;%
                f&eacute;minin, et o&ugrave; chaque participante &mdash;
                d&eacute;butante ou confirm&eacute;e &mdash; trouve sa place.
              </p>
              <p className="mt-4 text-gray-300 leading-relaxed">
                Port&eacute;e par une association loi 1901 enti&egrave;rement
                b&eacute;n&eacute;vole, la comp&eacute;tition grandit chaque
                ann&eacute;e avec de nouvelles &eacute;quipes, des partenaires
                engag&eacute;s et une communaut&eacute; de plus en plus active.
              </p>
            </div>
          </div>
        </section>

        {/* ── Comment ca marche ──────────────────────────── */}
        <section>
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.18em] text-pink-300">
              Comment &ccedil;a marche
            </p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
              Trois &eacute;tapes pour participer
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((item) => (
              <div
                key={item.step}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-1 hover:bg-white/[0.06] hover:shadow-xl hover:shadow-black/20"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center text-purple-300 group-hover:text-white transition-colors">
                    {item.icon}
                  </div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                    \u00c9tape {item.step}
                  </span>
                </div>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Nos valeurs ────────────────────────────────── */}
        <section>
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
              Nos valeurs
            </p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
              Ce qui nous d&eacute;finit
            </h2>
            <p className="mt-3 mx-auto max-w-xl text-sm text-gray-400">
              Plus qu&apos;un tournoi, un espace cr&eacute;&eacute; pour que
              chaque joueuse puisse s&apos;&eacute;panouir et progresser.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {values.map((v) => (
              <div
                key={v.title}
                className={`group flex items-start gap-4 rounded-2xl border ${v.border} bg-gradient-to-b ${v.accent} p-5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/15`}
              >
                <div
                  className={`w-11 h-11 rounded-xl bg-white/[0.08] flex items-center justify-center ${v.iconColor} flex-shrink-0`}
                >
                  {v.icon}
                </div>
                <div>
                  <p className="font-semibold text-white">{v.title}</p>
                  <p className="mt-1 text-sm text-gray-300 leading-relaxed">
                    {v.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── L'equipe / Asso teaser ─────────────────────── */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="flex-1 p-8 sm:p-12 flex flex-col justify-center">
              <p className="text-xs uppercase tracking-[0.18em] text-purple-300">
                L&apos;&eacute;quipe
              </p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
                Une asso port&eacute;e par des passionn&eacute;es
              </h2>
              <p className="mt-4 text-gray-400 leading-relaxed">
                Direction, arbitrage, production, communaut&eacute;&hellip;
                L&apos;OW Women&apos;s Cup est organis&eacute;e par une
                &eacute;quipe de b&eacute;n&eacute;voles r&eacute;parties en 4
                p&ocirc;les. Chacune apporte son expertise pour offrir la
                meilleure exp&eacute;rience aux joueuses et au public.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Direction', 'Tournoi', 'Production', 'Communaut\u00e9'].map(
                  (pole) => (
                    <span
                      key={pole}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300"
                    >
                      {pole}
                    </span>
                  )
                )}
              </div>
              <div className="mt-8">
                <Link
                  href="/association"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 hover:border-white/30"
                >
                  D&eacute;couvrir l&apos;association
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </Link>
              </div>
            </div>
            <div className="flex-1 relative min-h-[280px] md:min-h-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/fourplayers.png"
                alt="L'\u00e9quipe OW Women's Cup"
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/80 via-neutral-950/30 to-transparent md:bg-gradient-to-r md:from-neutral-950 md:via-neutral-950/40 md:to-transparent" />
            </div>
          </div>
        </section>

        {/* ── Partenaires teaser ──────────────────────────── */}
        <section className="text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-400">
            Ils nous soutiennent
          </p>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
            Nos partenaires
          </h2>
          <p className="mt-3 mx-auto max-w-md text-sm text-gray-400">
            Merci aux partenaires qui rendent cette aventure possible. Envie de
            nous rejoindre&nbsp;?
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/partenaires"
              className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 hover:border-white/30"
            >
              Voir nos partenaires
            </Link>
            <Link
              href="/partenaires#devenir-partenaire"
              className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all hover:shadow-xl hover:shadow-purple-900/50 hover:-translate-y-0.5"
            >
              Devenir sponsor
            </Link>
          </div>
        </section>

        {/* ── CTA final ──────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-pink-600/10 to-cyan-600/10 pointer-events-none" />
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -right-20 -top-20 h-[300px] w-[300px] rounded-full bg-purple-500/10 blur-[80px]" />
            <div className="absolute -left-20 -bottom-20 h-[300px] w-[300px] rounded-full bg-pink-500/10 blur-[80px]" />
          </div>
          <div className="relative p-8 sm:p-14 text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">
              Pr&ecirc;te &agrave; rejoindre l&apos;aventure&nbsp;?
            </h2>
            <p className="mt-4 mx-auto max-w-lg text-gray-300 leading-relaxed">
              Que tu sois joueuse, streameuse ou simplement curieuse, il y a une
              place pour toi dans la communaut&eacute; OW Women&apos;s Cup.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/register"
                className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all hover:shadow-xl hover:shadow-purple-900/50 hover:-translate-y-0.5"
              >
                Cr&eacute;er mon &eacute;quipe
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-8 py-4 text-sm font-semibold text-white transition hover:bg-white/10 hover:border-white/30"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
                Nous contacter
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const aboutSeo: SeoProps = {
  title: "\u00c0 propos \u2013 OW Women's Cup 2026",
  description:
    "D\u00e9couvrez l'OW Women's Cup, tournoi Overwatch 100% f\u00e9minin : notre mission, nos valeurs et comment participer.",
};

AboutPage.seo = aboutSeo;

export default AboutPage;
