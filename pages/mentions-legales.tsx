import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useSiteSetting } from '@/hooks/useSiteSettings';
import { CookieSettingsButton } from '@/components/CookieBanner';
import { useT } from '@/lib/i18n/useT';

type MentionsDict = ReturnType<typeof useT<'mentionsLegales'>>;

const getDataUses = (t: MentionsDict) => [t.use1, t.use2, t.use3, t.use4];

const getRights = (t: MentionsDict) => [t.right1, t.right2, t.right3, t.right4];

function MentionsLegalesPage() {
  const t = useT('mentionsLegales');
  const dataUses = getDataUses(t);
  const rights = getRights(t);
  const { value: contactEmail } = useSiteSetting('contact_email');

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-14 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            {t.heroSubtitle}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <a
              href={`mailto:${contactEmail}?subject=Question%20mentions%20l%C3%A9gales`}
              className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              {t.writeUs}
            </a>
            <a
              href="#donnees"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.yourData}
            </a>
            <a
              href="#cookies"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.cookies}
            </a>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-12 px-4 pb-20 sm:px-6">
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.18em] text-purple-200">
              {t.editorEyebrow}
            </p>
            <h2 className="mt-2 text-xl font-semibold">{t.editorTitle}</h2>
            <p className="mt-2 text-sm text-gray-200">{t.editorDesc}</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-200">
              <li>{t.rnaNumber}</li>
              <li>{t.pubResponsible}</li>
              <li>
                {t.contactPrincipalLabel}{' '}
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-purple-200 underline decoration-purple-400/60 underline-offset-4 hover:text-white"
                >
                  {contactEmail}
                </a>
                .
              </li>
              <li>{t.postalLabel}</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.18em] text-purple-200">
              {t.hostingEyebrow}
            </p>
            <h2 className="mt-2 text-xl font-semibold">{t.hostingTitle}</h2>
            <p className="mt-2 text-sm text-gray-200">{t.hostingDesc}</p>
            <p className="mt-2 text-xs text-gray-300">{t.hostingServices}</p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#140a24] via-[#1c0f33] to-[#2a0d3d] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-200">
                {t.respEyebrow}
              </p>
              <h3 className="text-2xl font-bold">{t.respTitle}</h3>
            </div>
            <p className="text-sm text-gray-200">{t.respIntro}</p>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-gray-100">
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                aria-hidden
              />
              <span>{t.resp1}</span>
            </li>
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                aria-hidden
              />
              <span>{t.resp2}</span>
            </li>
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                aria-hidden
              />
              <span>
                {t.resp3Before}
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
              </span>
            </li>
          </ul>
        </section>

        <section
          id="donnees"
          className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 sm:p-8 shadow-xl shadow-black/20"
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              {t.dataEyebrow}
            </p>
            <h3 className="text-2xl font-bold text-white">{t.dataTitle}</h3>
            <p className="text-sm text-gray-300">{t.dataDesc}</p>
          </div>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-semibold text-white">
                {t.finalitesTitle}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-gray-200">
                {dataUses.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      className="mt-[6px] h-2 w-2 rounded-full bg-emerald-400"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-semibold text-white">
                {t.droitsTitle}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-gray-200">
                {rights.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      className="mt-[6px] h-2 w-2 rounded-full bg-emerald-400"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-gray-300">
                {t.rightsHelpBefore}
                <a
                  href={`mailto:${contactEmail}`}
                  className="underline decoration-purple-400/60 underline-offset-4 hover:text-white"
                >
                  {contactEmail}
                </a>
                {t.rightsHelpAfter}
              </p>
            </div>
          </div>
          <div
            id="cookies"
            className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-200"
          >
            <p className="font-semibold text-white text-base">
              {t.cookiesTitle}
            </p>
            <p className="mt-2">{t.cookiesIntro}</p>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="font-medium text-white flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                  {t.essentialTitle}
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-purple-500/30 text-purple-200">
                    {t.requiredBadge}
                  </span>
                </p>
                <p className="mt-1 text-gray-300 text-xs">{t.essentialDesc}</p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="font-medium text-white flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                  {t.functionalTitle}
                </p>
                <p className="mt-1 text-gray-300 text-xs">{t.functionalDesc}</p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="font-medium text-white flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  {t.analyticsTitle}
                </p>
                <p className="mt-1 text-gray-300 text-xs">{t.analyticsDesc}</p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="font-medium text-white flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-pink-400" />
                  {t.marketingTitle}
                </p>
                <p className="mt-1 text-gray-300 text-xs">
                  {t.marketingDescBefore}{' '}
                  <strong>{t.marketingDescStrong}</strong>
                  {t.marketingDescAfter}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-white/10">
              <p className="text-xs text-gray-400">{t.cookiesPrefsNote}</p>
              <CookieSettingsButton />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 sm:p-8 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              {t.ipEyebrow}
            </p>
            <h3 className="text-2xl font-bold text-white">{t.ipTitle}</h3>
            <p className="text-sm text-gray-300">{t.ipDesc}</p>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-gray-200">
            <li>{t.ip1}</li>
            <li>{t.ip2}</li>
            <li>
              {t.ip3Before}
              <a
                href={`mailto:${contactEmail}`}
                className="underline decoration-purple-400/60 underline-offset-4 hover:text-white"
              >
                {contactEmail}
              </a>
              .
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}

const mentionsSeo: SeoProps = {
  title: {
    fr: 'Mentions légales',
    en: 'Legal notice',
  },
  description: {
    fr: "Mentions légales de l'association Women's Cup : éditeur du site, hébergement, données personnelles et droits des utilisatrices.",
    en: "Legal notice for the Women's Cup association: site publisher, hosting, personal data and user rights.",
  },
};

MentionsLegalesPage.seo = mentionsSeo;

export default MentionsLegalesPage;
