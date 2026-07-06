import Link from 'next/link';
import Contact from '@/components/Form/Contact';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useSiteSetting } from '@/hooks/useSiteSettings';
import { useT } from '@/lib/i18n/useT';

type ContactChannel = {
  title: string;
  desc: React.ReactNode;
  cta: {
    label: string;
    href: string;
  };
};

function getContactChannels(
  contactEmail: string,
  t: ReturnType<typeof useT<'contactPage'>>
): ContactChannel[] {
  return [
    {
      title: t.channelEmailTitle,
      desc: t.channelEmailDesc,
      cta: {
        label: contactEmail,
        href: `mailto:${contactEmail}?subject=Contact%20OW%20Women%27s%20Cup`,
      },
    },
    {
      title: t.channelDiscordTitle,
      desc: t.channelDiscordDesc,
      cta: {
        label: t.channelDiscordCta,
        href: 'https://discord.gg/gERSsjC3Vd',
      },
    },
    {
      title: t.channelPressTitle,
      desc: (
        <>
          {t.channelPressDescBefore}{' '}
          <Link
            href="/partenaires"
            className="font-medium text-purple-300 underline decoration-purple-400/40 underline-offset-2 hover:text-purple-200 hover:decoration-purple-300"
          >
            {t.channelPressLink}
          </Link>
          {t.channelPressDescAfter}
        </>
      ),
      cta: {
        label: t.channelPressCta,
        href: `mailto:${contactEmail}?subject=Partenariat%20OW%20Women%27s%20Cup`,
      },
    },
  ];
}

function ContactPage() {
  const t = useT('contactPage');
  const { value: contactEmail } = useSiteSetting('contact_email');
  const contactChannels = getContactChannels(contactEmail, t);
  const helpPoints = [t.helpPoint1, t.helpPoint2, t.helpPoint3];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-14 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.badge}
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            {t.title}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            {t.intro}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#formulaire"
              className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              {t.openForm}
            </a>
            <a
              href={`mailto:${contactEmail}?subject=Contact%20OW%20Women%27s%20Cup`}
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.writeEmail}
            </a>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-12 px-4 pb-20 sm:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          {contactChannels.map((channel) => (
            <div
              key={channel.title}
              className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200">
                {channel.title}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                {channel.title}
              </h2>
              <p className="mt-2 text-sm text-gray-200">{channel.desc}</p>
              <a
                href={channel.cta.href}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-purple-200 underline decoration-purple-400/60 underline-offset-4 transition hover:text-white"
              >
                {channel.cta.label} ↗
              </a>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-200">
                {t.supportLabel}
              </p>
              <h3 className="text-2xl font-bold">{t.supportHeading}</h3>
            </div>
            <p className="text-sm text-gray-200">{t.supportDesc}</p>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-gray-100">
            {helpPoints.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span
                  className="mt-[6px] h-2 w-2 rounded-full bg-emerald-400"
                  aria-hidden
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-100">
            <p className="font-semibold text-white">{t.prepareTitle}</p>
            <p className="mt-2">{t.prepareDesc}</p>
          </div>
        </section>

        <section
          id="formulaire"
          className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 sm:p-8 shadow-xl shadow-black/20"
        >
          <div className="flex flex-col gap-2 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              {t.formLabel}
            </p>
            <h3 className="text-2xl font-bold text-white">{t.formHeading}</h3>
          </div>
          <div className="mt-8">
            <Contact />
          </div>
          <div className="mt-4 text-center text-xs text-gray-400">
            {t.formDisclaimerBefore}{' '}
            <Link
              href="/mentions-legales"
              className="text-purple-200 underline decoration-purple-400/60 underline-offset-4 hover:text-white"
            >
              {t.formDisclaimerLink}
            </Link>
            {t.formDisclaimerAfter}
          </div>
        </section>
      </main>
    </div>
  );
}

const contactSeo: SeoProps = {
  title: 'Contact — équipes, staff & partenariats',
  description:
    "Contacte l'association Women's Cup : email, Discord et formulaire pour les demandes d'équipes, de staff ou de partenariats.",
};

ContactPage.seo = contactSeo;

export default ContactPage;
