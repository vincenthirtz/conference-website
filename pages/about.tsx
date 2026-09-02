import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { useT, format } from '@/lib/i18n/useT';
import nsAboutPage from '@/lib/i18n/locales/fr/aboutPage';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import RegisterTeamCta from '@/components/RegisterTeamCta';

type AboutDict = typeof nsAboutPage.fr;

const DEFAULT_VIDEO_URL = 'https://www.youtube.com/watch?v=3j6w7CjXne8';

type AboutPageProps = {
  videoUrl: string;
};

export const getStaticProps: GetStaticProps<AboutPageProps> = async () => {
  let videoUrl = DEFAULT_VIDEO_URL;

  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('key', 'about_video_url')
      .single();
    if (data?.value) videoUrl = data.value;
  }

  return {
    props: { videoUrl },
    revalidate: 900,
  };
};

const getStats = (t: AboutDict) => [
  { value: '3', label: t.statEditions },
  { value: '50+', label: t.statPlayers },
  { value: '10+', label: t.statVolunteers },
  { value: '100%', label: t.statFeminine },
  { value: '200+', label: t.statViewers },
];

const getSteps = (t: AboutDict) => [
  {
    step: '01',
    title: t.step1Title,
    desc: t.step1Desc,
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
    title: t.step2Title,
    desc: t.step2Desc,
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
    title: t.step3Title,
    desc: t.step3Desc,
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

const getValues = (t: AboutDict) => [
  {
    title: t.value1Title,
    desc: t.value1Desc,
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
    title: t.value2Title,
    desc: t.value2Desc,
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
    title: t.value3Title,
    desc: t.value3Desc,
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
    title: t.value4Title,
    desc: t.value4Desc,
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

function AboutPage({ videoUrl }: AboutPageProps) {
  const t = useT(nsAboutPage);
  const stats = getStats(t);
  const steps = getSteps(t);
  const values = getValues(t);
  const [showVideo, setShowVideo] = useState(false);

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
                {t.since2025}
              </p>
              <h1 className="mt-5 text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-6xl">
                {t.heroTitleLine1}
                <span className="block text-brand-gradient">
                  {t.heroTitleLine2}
                </span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-gray-300 mx-auto lg:mx-0">
                {t.heroSubtitle}
              </p>
              <div className="mt-8 flex flex-wrap gap-4 justify-center lg:justify-start">
                <RegisterTeamCta
                  label={t.ctaRegister}
                  className="rounded-full bg-[var(--color-violet)] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all hover:bg-[var(--color-violet-deep)] hover:shadow-xl hover:shadow-purple-900/50 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
                />
                <Link
                  href="/association"
                  className="rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-7 py-3.5 text-sm font-semibold text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
                >
                  {t.ctaDiscoverAsso}
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
                    aria-label={t.videoPlayAria}
                  >
                    {youtubeId ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`}
                        alt={t.videoPreviewAlt}
                        width={1280}
                        height={720}
                        loading="eager"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <Image
                        src="/img/brand-cover.png"
                        alt={t.videoPreviewAlt}
                        fill
                        sizes="(max-width: 768px) 100vw, 720px"
                        className="object-cover"
                      />
                    )}
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
                    title={t.videoTitle}
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
        <section className="section-brand-bg">
          <div className="card-brand rounded-3xl bg-gradient-to-br from-[#140a24] via-[#1c0f33] to-[#2a0d3d] p-8 sm:p-12">
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-purple-300">
                {t.missionEyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-bold text-brand-gradient sm:text-4xl">
                {t.missionTitle}
              </h2>
              <span className="brand-rule mx-auto mt-3" aria-hidden />
              <p className="mt-5 text-gray-300 leading-relaxed">
                {t.missionP1}
              </p>
              <p className="mt-4 text-gray-300 leading-relaxed">
                {t.missionP2}
              </p>
            </div>
          </div>
        </section>

        {/* ── Comment ca marche ──────────────────────────── */}
        <section>
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.18em] text-pink-300">
              {t.howEyebrow}
            </p>
            <h2 className="mt-2 text-3xl font-bold text-brand-gradient sm:text-4xl">
              {t.howTitle}
            </h2>
            <span className="brand-rule mx-auto mt-3" aria-hidden />
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((item) => (
              <div
                key={item.step}
                className="group card-brand relative rounded-2xl bg-white/[0.04] p-6 transition hover:-translate-y-1 hover:bg-white/[0.06] hover:shadow-xl hover:shadow-black/20"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center text-purple-300 group-hover:text-white transition-colors">
                    {item.icon}
                  </div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                    {format(t.stepLabel, { step: item.step })}
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
              {t.valuesEyebrow}
            </p>
            <h2 className="mt-2 text-3xl font-bold text-brand-gradient sm:text-4xl">
              {t.valuesTitle}
            </h2>
            <span className="brand-rule mx-auto mt-3" aria-hidden />
            <p className="mt-3 mx-auto max-w-xl text-sm text-gray-400">
              {t.valuesIntro}
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
        <section className="card-brand rounded-3xl bg-white/[0.03] overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="flex-1 p-8 sm:p-12 flex flex-col justify-center">
              <p className="text-xs uppercase tracking-[0.18em] text-purple-300">
                {t.teamEyebrow}
              </p>
              <h2 className="mt-2 text-2xl font-bold text-brand-gradient sm:text-3xl">
                {t.teamTitle}
              </h2>
              <span className="brand-rule mt-3" aria-hidden />
              <p className="mt-4 text-gray-400 leading-relaxed">{t.teamDesc}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  t.poleDirection,
                  t.poleTournament,
                  t.poleProduction,
                  t.poleCommunity,
                ].map((pole) => (
                  <span
                    key={pole}
                    className="rounded-full border border-[var(--color-violet)]/40 bg-[var(--color-violet)]/10 px-3 py-1.5 text-xs text-[var(--color-violet-light)]"
                  >
                    {pole}
                  </span>
                ))}
              </div>
              <div className="mt-8">
                <Link
                  href="/association"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
                >
                  {t.discoverAssoLink}
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
              <Image
                src="/img/brand-cover.png"
                alt={t.teamImgAlt}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/80 via-neutral-950/30 to-transparent md:bg-gradient-to-r md:from-neutral-950 md:via-neutral-950/40 md:to-transparent" />
            </div>
          </div>
        </section>

        {/* ── Partenaires teaser ──────────────────────────── */}
        <section className="text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-400">
            {t.partnersEyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-bold text-brand-gradient sm:text-3xl">
            {t.partnersTitle}
          </h2>
          <span className="brand-rule mx-auto mt-3" aria-hidden />
          <p className="mt-3 mx-auto max-w-md text-sm text-gray-400">
            {t.partnersDesc}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/partenaires"
              className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
            >
              {t.viewPartners}
            </Link>
            <Link
              href="/partenaires#devenir-partenaire"
              className="rounded-full bg-[var(--color-violet)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all hover:bg-[var(--color-violet-deep)] hover:shadow-xl hover:shadow-purple-900/50 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
            >
              {t.becomeSponsor}
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
            <h2 className="text-3xl font-bold text-brand-gradient sm:text-4xl">
              {t.ctaTitle}
            </h2>
            <span className="brand-rule mx-auto mt-3" aria-hidden />
            <p className="mt-4 mx-auto max-w-lg text-gray-300 leading-relaxed">
              {t.ctaDesc}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/register"
                className="rounded-full bg-[var(--color-violet)] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all hover:bg-[var(--color-violet-deep)] hover:shadow-xl hover:shadow-purple-900/50 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
              >
                {t.ctaCreateTeam}
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-8 py-4 text-sm font-semibold text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
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
                {t.ctaContact}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const aboutSeo: SeoProps = {
  title: {
    fr: '\u00c0 propos \u2014 notre mission',
    en: 'About us \u2014 our mission',
  },
  description: {
    fr: "D\u00e9couvrez l'OW Women's Cup, tournoi Overwatch 100% f\u00e9minin : notre mission, nos valeurs et comment participer.",
    en: "Discover OW Women's Cup, the 100% women's Overwatch tournament: our mission, our values and how to take part.",
  },
};

AboutPage.seo = aboutSeo;

export default AboutPage;
