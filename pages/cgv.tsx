// pages/cgv.tsx
//
// Conditions générales de vente des offres d'espace organisateur.
//
// Page PUBLIQUE et accessible sans compte : le client doit pouvoir lire ce
// qu'il accepte AVANT de commander, et le lien présenté dans le tunnel doit
// s'ouvrir sans le faire sortir de son parcours ni se reconnecter.
//
// Le texte vit dans le namespace i18n `cgvPage` — pas ici. Ce fichier ne fait
// que le mettre en page : un contrat qu'on relit dans du JSX est un contrat
// qu'on relit mal.
//
// La version affichée en tête vient de `CGV_VERSION` : c'est la même constante
// qui est enregistrée avec chaque acceptation, donc le lecteur voit exactement
// la référence qui sera consignée s'il commande.

import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useSiteSetting } from '@/hooks/useSiteSettings';
import { useT } from '@/lib/i18n/useT';
import nsCgvPage from '@/lib/i18n/locales/fr/cgvPage';
import { CGV_VERSION } from '@/utils/billing/cgv';

type CgvDict = typeof nsCgvPage.fr;

/**
 * Les articles, dans l'ordre. Un tableau plutôt que vingt blocs JSX : l'ordre
 * et la numérotation d'un contrat se lisent alors d'un coup d'œil, et il
 * devient impossible d'en oublier un en cours de route.
 */
const getArticles = (t: CgvDict) => [
  { title: t.a1Title, body: [t.a1p1, t.a1p2, t.a1p3] },
  { title: t.a2Title, body: [t.a2p1], rows: [t.a2rna, t.a2siren, t.a2siret], after: [t.a2p2] },
  { title: t.a3Title, body: [t.a3p1, t.a3p2, t.a3p3] },
  { title: t.a4Title, body: [t.a4p1, t.a4p2, t.a4p3, t.a4p4] },
  { title: t.a5Title, body: [t.a5p1], steps: [t.a5s1, t.a5s2, t.a5s3, t.a5s4], after: [t.a5p2] },
  { title: t.a6Title, body: [t.a6p1, t.a6p2, t.a6p3] },
  { title: t.a7Title, body: [t.a7p1, t.a7p2, t.a7p3] },
  { title: t.a8Title, body: [t.a8p1, t.a8p2, t.a8p3, t.a8p4] },
  { title: t.a9Title, body: [t.a9p1, t.a9p2, t.a9p3, t.a9p4] },
  { title: t.a10Title, body: [t.a10p1, t.a10p2, t.a10p3] },
  { title: t.a11Title, body: [t.a11p1, t.a11p2] },
  { title: t.a12Title, body: [t.a12p1, t.a12p2, t.a12p3] },
  { title: t.a13Title, body: [t.a13p1, t.a13p2, t.a13p3] },
  { title: t.a14Title, body: [t.a14p1, t.a14p2, t.a14p3] },
  { title: t.a15Title, body: [t.a15p1, t.a15p2] },
  { title: t.a16Title, body: [t.a16p1, t.a16p2, t.a16p3] },
  { title: t.a17Title, body: [t.a17p1, t.a17p2, t.a17p3] },
  { title: t.a18Title, body: [t.a18p1, t.a18p2] },
  { title: t.a19Title, body: [t.a19p1, t.a19p2] },
  { title: t.a20Title, body: [t.a20p1] },
];

function CgvPage() {
  const t = useT(nsCgvPage);
  const { value: contactEmail } = useSiteSetting('contact_email');
  const articles = getArticles(t);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 pb-14 pt-32 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight text-brand-gradient sm:text-5xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-gray-300">
            {t.heroSubtitle}
          </p>

          {/* La version, en évidence. Le lecteur doit savoir quel texte il lit :
              c'est cette référence-là qui sera consignée s'il commande. */}
          <div className="mx-auto mt-6 max-w-xl rounded-xl border border-purple-400/30 bg-purple-500/[0.07] px-4 py-3">
            <p className="text-sm font-semibold text-purple-100">
              {t.versionLabel} : {CGV_VERSION}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-300">
              {t.versionNote}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/organisateurs"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-gray-100 transition hover:border-white/40"
            >
              {t.backToOffers}
            </Link>
            {contactEmail && (
              <a
                href={`mailto:${contactEmail}?subject=Question%20CGV`}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-gray-100 transition hover:border-white/40"
              >
                {t.contactUs}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-24">
        {articles.map((a) => (
          <section key={a.title} className="mb-10">
            <h2 className="text-lg font-semibold text-white">{a.title}</h2>
            {a.body.map((p) => (
              <p key={p} className="mt-3 text-sm leading-relaxed text-gray-300">
                {p}
              </p>
            ))}
            {a.rows && (
              <ul className="mt-3 space-y-1 text-sm text-gray-200">
                {a.rows.map((r) => (
                  <li key={r} className="font-mono text-xs">
                    {r}
                  </li>
                ))}
              </ul>
            )}
            {a.steps && (
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-gray-300">
                {a.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
            {a.after?.map((p) => (
              <p key={p} className="mt-3 text-sm leading-relaxed text-gray-300">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

const cgvSeo: SeoProps = {
  title: 'Conditions générales de vente',
  description:
    "Conditions générales de vente des offres d'espace organisateur de l'association Women's Cup : commande, prix, durée, rétractation et garanties.",
};

CgvPage.seo = cgvSeo;

export default CgvPage;
