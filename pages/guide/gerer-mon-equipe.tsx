// pages/guide/gerer-mon-equipe.tsx
// Public guide showing what's possible from the captain space.
// The "screenshots" are live JSX previews built from the same Tailwind
// tokens as the real player UI — they stay in sync with the design and
// don't go stale like raster images.

import Link from 'next/link';
import type { JSX, ReactNode } from 'react';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { useT, format } from '@/lib/i18n/useT';

type GuideDict = ReturnType<typeof useT<'guideManageTeam'>>;

const REGISTER_TEAM_HREF = '/team/create';
const PLAYER_HREF = '/player';

type Step = {
  number: string;
  title: string;
  description: string;
  bullets: string[];
  preview: () => JSX.Element;
};

const getSteps = (t: GuideDict): Step[] => [
  {
    number: '01',
    title: t.step1Title,
    description: t.step1Desc,
    bullets: [t.step1Bullet1, t.step1Bullet2, t.step1Bullet3],
    preview: NewTeamPreview,
  },
  {
    number: '02',
    title: t.step2Title,
    description: t.step2Desc,
    bullets: [t.step2Bullet1, t.step2Bullet2, t.step2Bullet3],
    preview: JoinRequestsPreview,
  },
  {
    number: '03',
    title: t.step3Title,
    description: t.step3Desc,
    bullets: [t.step3Bullet1, t.step3Bullet2, t.step3Bullet3],
    preview: RosterPreview,
  },
  {
    number: '04',
    title: t.step4Title,
    description: t.step4Desc,
    bullets: [t.step4Bullet1, t.step4Bullet2, t.step4Bullet3],
    preview: MessagesPreview,
  },
  {
    number: '05',
    title: t.step5Title,
    description: t.step5Desc,
    bullets: [t.step5Bullet1, t.step5Bullet2, t.step5Bullet3],
    preview: NextMatchPreview,
  },
  {
    number: '06',
    title: t.step6Title,
    description: t.step6Desc,
    bullets: [t.step6Bullet1, t.step6Bullet2, t.step6Bullet3],
    preview: ScrimPreview,
  },
];

const getFeatures = (
  t: GuideDict
): { title: string; description: string }[] => [
  { title: t.feature1Title, description: t.feature1Desc },
  { title: t.feature2Title, description: t.feature2Desc },
  { title: t.feature3Title, description: t.feature3Desc },
  { title: t.feature4Title, description: t.feature4Desc },
];

function GuidePage(): JSX.Element {
  const t = useT('guideManageTeam');
  const steps = getSteps(t);
  const features = getFeatures(t);
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-cyan-500/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-16 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <Heading
            level="h1"
            typeStyle="heading-lg"
            className="mt-4 text-gradient font-extrabold leading-tight"
          >
            {t.heroTitle}
          </Heading>
          <Paragraph
            typeStyle="body-lg"
            className="mx-auto mt-4 max-w-3xl"
            textColor="text-gray-200"
          >
            {t.heroSubtitle}
          </Paragraph>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={REGISTER_TEAM_HREF}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              {t.createTeam}
              <span aria-hidden>→</span>
            </Link>
            <Link
              href={PLAYER_HREF}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              {t.goToSpace}
            </Link>
          </div>
        </div>
      </header>

      {/* Steps */}
      <section className="relative mx-auto max-w-6xl px-4 md:px-6 pb-16">
        <ol className="flex flex-col gap-12">
          {steps.map((step, idx) => {
            const reverse = idx % 2 === 1;
            const Preview = step.preview;
            return (
              <li
                key={step.number}
                className={`grid items-center gap-8 md:grid-cols-2 ${
                  reverse ? 'md:[&>*:first-child]:order-2' : ''
                }`}
              >
                <div className="space-y-4">
                  <span className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-blue-200/80">
                    {format(t.stepLabel, { number: step.number })}
                  </span>
                  <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                    {step.title}
                  </h2>
                  <p className="text-base text-gray-300 leading-relaxed">
                    {step.description}
                  </p>
                  <ul className="space-y-2">
                    {step.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 text-sm text-gray-200"
                      >
                        <Bullet />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <FrameDevice>
                  <Preview />
                </FrameDevice>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Features grid */}
      <section className="relative mx-auto max-w-6xl px-4 md:px-6 pb-20">
        <div className="mb-8 text-center">
          <Heading typeStyle="heading-md" className="text-gradient text-center">
            {t.alsoTitle}
          </Heading>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {features.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
            >
              <h3 className="text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-300 leading-relaxed">
                {f.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-white/[0.03] to-cyan-500/10 p-8 md:p-10 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            {t.ctaTitle}
          </h2>
          <p className="mt-3 text-gray-300">{t.ctaDesc}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={REGISTER_TEAM_HREF}
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-neutral-900 shadow transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              {t.createTeam}
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/espace-capitaine#faq"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              {t.readFaq}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

const guideSeo: SeoProps = {
  title: 'Gérer mon équipe — guide capitaine',
  description:
    "Aperçu pas-à-pas de l'espace capitaine OW Women's Cup : inscription d'équipe, candidatures, roster, messagerie, scrims et check-in.",
};

(GuidePage as unknown as { seo: SeoProps }).seo = guideSeo;
export default GuidePage;

/* ------------------------------------------------------------------ */
/* Mock UI previews — rendered live from the same tokens as /player.  */
/* ------------------------------------------------------------------ */

function FrameDevice({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-purple-500/20 via-transparent to-cyan-500/20 blur-2xl pointer-events-none" />
      <div className="relative rounded-2xl border border-white/15 bg-[#0d0a18]/95 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-sm">
        <div className="flex items-center gap-1.5 mb-3 px-1">
          <span className="h-2 w-2 rounded-full bg-rose-400/80" />
          <span className="h-2 w-2 rounded-full bg-amber-400/80" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
          <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-white/30">
            owwomenscup.fr/player
          </span>
        </div>
        <div className="rounded-xl bg-gradient-to-b from-black via-[#0a0815] to-[#0a0815] p-4 md:p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function Bullet() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-4 w-4 shrink-0 text-purple-300"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FieldRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
        {label}
      </div>
      <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white">
        {value}
      </div>
      {hint && <div className="mt-1 text-[10px] text-gray-500">{hint}</div>}
    </div>
  );
}

function NewTeamPreview() {
  const t = useT('guideManageTeam');
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/80">
        {t.previewNewTeamTitle}
      </div>
      <FieldRow label={t.previewFieldName} value="Phenix" />
      <FieldRow label={t.previewFieldTag} value="PHX" hint={t.previewTagHint} />
      <FieldRow label={t.previewFieldCaptain} value="Lina#21834" />
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-gray-400 mb-1">
          {t.previewRosterInitial}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            'Lina#21834',
            'Mei#9912',
            'Yuki#1547',
            'Ava#2090',
            'Naomi#7732',
          ].map((bt) => (
            <div
              key={bt}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white"
            >
              {bt}
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        disabled
        className="w-full rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white opacity-90 cursor-default"
      >
        {t.previewRegisterTeam}
      </button>
    </div>
  );
}

function JoinRequestsPreview() {
  const t = useT('guideManageTeam');
  const requests = [
    {
      name: 'Akira',
      battleTag: 'Akira#4422',
      role: 'DPS',
      message: t.previewReq1Message,
    },
    {
      name: 'Yumi',
      battleTag: 'Yumi#1188',
      role: 'Support',
      message: t.previewReq2Message,
    },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/80">
          {t.previewApplications}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-100">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {t.previewTeamOpen}
        </span>
      </div>
      {requests.map((r) => (
        <div
          key={r.battleTag}
          className="rounded-lg border border-white/10 bg-white/[0.04] p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {r.name}{' '}
                <span className="text-gray-400 text-xs font-normal">
                  · {r.battleTag}
                </span>
              </div>
              <div className="mt-0.5 inline-flex items-center rounded-full border border-orange-300/40 bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-100">
                {r.role}
              </div>
              <p className="mt-1.5 text-xs text-gray-300">{r.message}</p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                type="button"
                disabled
                className="rounded-md bg-emerald-500/80 px-3 py-1 text-[11px] font-semibold text-white"
              >
                {t.previewAccept}
              </button>
              <button
                type="button"
                disabled
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-gray-300"
              >
                {t.previewDecline}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RosterPreview() {
  const t = useT('guideManageTeam');
  const members = [
    { tag: 'Lina#21834', role: 'Tank', captain: true },
    { tag: 'Mei#9912', role: 'DPS', captain: false },
    { tag: 'Yuki#1547', role: 'DPS', captain: false },
    { tag: 'Ava#2090', role: 'Support', captain: false },
    { tag: 'Naomi#7732', role: 'Support', captain: false },
    { tag: 'Sora#0033', role: 'Sub', captain: false },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-white tabular-nums">
          {members.length}
        </span>
        <span className="text-xs text-gray-400">{t.previewMembers}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.12em]">
        <RosterBadge n={1} label="Tank" tone="rose" />
        <RosterBadge n={2} label="DPS" tone="orange" />
        <RosterBadge n={2} label="Support" tone="emerald" />
        <RosterBadge n={1} label="Sub" tone="slate" />
      </div>
      <div className="space-y-1.5">
        {members.map((m) => (
          <div
            key={m.tag}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-[10px] text-gray-400">
                {m.tag.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm text-white">
                  <span className="truncate">{m.tag}</span>
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-300">
                    <CopyIcon />
                  </span>
                </div>
                <div className="text-[10px] text-gray-500">
                  {m.captain ? (
                    <span className="text-purple-300">{t.previewCaptain}</span>
                  ) : (
                    m.role.toLowerCase()
                  )}
                </div>
              </div>
            </div>
            <span className="text-[10px] text-gray-500">{m.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessagesPreview() {
  const t = useT('guideManageTeam');
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/80">
          {t.previewMessaging}
        </span>
        <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
          3
        </span>
      </div>
      {[
        {
          team: 'Avoidgers',
          text: t.previewMsg1,
          time: t.previewTime1,
          unread: true,
        },
        {
          team: 'Sparkles',
          text: t.previewMsg2,
          time: t.previewTime2,
          unread: true,
        },
        {
          team: 'Onna',
          text: t.previewMsg3,
          time: t.previewTime3,
          unread: false,
        },
      ].map((c) => (
        <div
          key={c.team}
          className={`rounded-lg border px-3 py-2.5 ${
            c.unread
              ? 'border-emerald-300/30 bg-emerald-500/5'
              : 'border-white/10 bg-white/[0.03]'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white">{c.team}</span>
            <span className="text-gray-500">{c.time}</span>
          </div>
          <p className="mt-1 text-xs text-gray-300 line-clamp-1">{c.text}</p>
        </div>
      ))}
    </div>
  );
}

function NextMatchPreview() {
  const t = useT('guideManageTeam');
  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-white/[0.03] to-cyan-500/10 p-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-blue-200/80">
        <span className="rounded-full border border-blue-300/40 bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-50">
          {t.previewNextMatch}
        </span>
        <span>OW Women’s Cup 2026</span>
        <span>Round 1</span>
        <span>BO3</span>
      </div>
      <h4 className="mt-2 text-lg font-bold text-white leading-tight">
        Phenix <span className="text-white/50">{t.previewVs}</span> Avoidgers
      </h4>
      <p className="mt-1 text-xs text-gray-300">{t.previewMatchDate}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white">
          {t.previewViewMatch}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] text-fuchsia-100">
          {t.previewLiveCast}
        </span>
        <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-neutral-900 shadow">
          {t.previewCheckinNow}
        </span>
      </div>
    </div>
  );
}

function ScrimPreview() {
  const t = useT('guideManageTeam');
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/80">
        {t.previewProposeScrim}
      </div>
      <FieldRow label={t.previewOpponentTeam} value={t.previewOpponentValue} />
      <FieldRow
        label={t.previewProposedDate}
        value={t.previewProposedDateValue}
      />
      <FieldRow label={t.previewMessage} value={t.previewMessageValue} />
      <button
        type="button"
        disabled
        className="w-full rounded-lg border border-blue-400/40 bg-blue-500/15 px-4 py-2 text-sm font-medium text-blue-100"
      >
        {t.previewSendRequest}
      </button>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-2.5 w-2.5"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  );
}

const ROSTER_TONE = {
  rose: 'border-rose-300/40 bg-rose-500/10 text-rose-100',
  orange: 'border-orange-300/40 bg-orange-500/10 text-orange-100',
  emerald: 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100',
  slate: 'border-slate-300/30 bg-white/5 text-slate-200',
} as const;

function RosterBadge({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: keyof typeof ROSTER_TONE;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${ROSTER_TONE[tone]}`}
    >
      <span className="font-semibold tabular-nums">{n}</span>
      <span>{label}</span>
    </span>
  );
}
