// pages/newsletter/merci.tsx
// Public landing for the double opt-in confirmation link sent by email.
// The confirmation email points here. `?status=invalid` means the token was
// invalid or expired; otherwise we show the confirmed message.

import Link from 'next/link';
import { useRouter } from 'next/router';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';

function NewsletterMerciPage() {
  const t = useT('newsletterMerci');
  const router = useRouter();
  const isInvalid = router.query.status === 'invalid';

  const title = isInvalid ? t.invalidTitle : t.confirmedTitle;
  const body = isInvalid ? t.invalidBody : t.confirmedBody;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <main className="mx-auto flex max-w-2xl flex-col items-center px-4 pt-32 pb-24 text-center">
        <div
          className={`w-full rounded-2xl border px-6 py-10 sm:px-10 ${
            isInvalid
              ? 'border-red-500/30 bg-red-500/10'
              : 'border-emerald-500/30 bg-emerald-500/10'
          }`}
        >
          <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
          <span className="brand-rule mx-auto mt-4" aria-hidden />
          <p className="mx-auto mt-4 max-w-lg text-base text-gray-200">
            {body}
          </p>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full bg-[var(--color-green)] px-6 py-3 text-sm font-semibold text-black transition hover:bg-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
            >
              {t.backHome}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

const newsletterMerciSeo: SeoProps = {
  title: {
    fr: 'Confirmation newsletter',
    en: 'Newsletter confirmation',
  },
  description: {
    fr: "Confirmation de votre inscription à la newsletter de l'OW Women's Cup.",
    en: "Confirmation of your subscription to the OW Women's Cup newsletter.",
  },
  // Utility landing page reached from an email link — no SEO value.
  noindex: true,
};

NewsletterMerciPage.seo = newsletterMerciSeo;

export default NewsletterMerciPage;
