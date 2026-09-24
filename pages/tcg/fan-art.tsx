// pages/tcg/fan-art.tsx
//
// L'ESPACE CRÉDITS des cartes fan art : qui a dessiné quoi.
//
// POURQUOI UNE PAGE, ET PAS SEULEMENT UNE MENTION SUR LA CARTE. Une carte se
// tire au hasard : sans page, une autrice n'aurait aucun endroit où montrer son
// travail, et le crédit ne serait visible que par qui a eu de la chance. Ici,
// toutes les œuvres validées sont réunies, nommées, et reliées à leur autrice
// quand elle a donné un lien.
//
// RENDUE AU BUILD, RAFRAÎCHIE RÉGULIÈREMENT (ISR) : une page de crédits doit
// s'ouvrir vite et rester lisible sans connexion — c'est le contraire d'une
// page d'espace joueuse.
//
// N'AFFICHE QUE LES ŒUVRES `approved`. Une œuvre retirée disparaît d'ici au
// prochain rendu, comme elle disparaît des paquets à venir.

import Image from 'next/image';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { TCG_BUCKET } from '@/utils/tcg/teamCardImage';
import { displayableArtistUrl } from '@/utils/tcg/fanart';
import { logger } from '@/utils/logger';
import { useT, format } from '@/lib/i18n/useT';
import nsTcgFanart from '@/lib/i18n/locales/fr/tcgFanart';

type Credit = {
  id: string;
  title: string;
  artistName: string;
  artistUrl: string | null;
  imageUrl: string | null;
};

type Props = { credits: Credit[] };

export const getStaticProps: GetStaticProps<Props> = async () => {
  const credits: Credit[] = [];
  try {
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('tcg_fanart_cards')
        .select('id, title, artist_name, artist_url, image_path')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as Array<{
        id: string;
        title: string;
        artist_name: string;
        artist_url: string | null;
        image_path: string;
      }>) {
        credits.push({
          id: row.id,
          title: row.title,
          artistName: row.artist_name,
          artistUrl: displayableArtistUrl(row.artist_url),
          imageUrl:
            supabaseAdmin.storage.from(TCG_BUCKET).getPublicUrl(row.image_path)
              .data?.publicUrl ?? null,
        });
      }
    }
  } catch (err) {
    // Une lecture en échec rend une page VIDE, jamais une 500 : la page des
    // crédits doit s'ouvrir même quand la base tousse.
    logger.error('[tcg/fan-art] crédits illisibles', err);
  }

  return { props: { credits }, revalidate: 300 };
};

function FanArtCreditsPage({ credits }: Props) {
  const t = useT(nsTcgFanart);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <main className="mx-auto max-w-5xl px-6 pt-header-xl pb-24">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
          {t.creditsBadge}
        </p>
        <h1 className="mt-4 text-balance text-4xl font-bold sm:text-5xl">
          {t.creditsTitle}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-gray-200">{t.creditsIntro}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/player/tcg"
            className="rounded-lg bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-400"
          >
            {t.creditsSubmitCta}
          </Link>
          <Link
            href="/player/tcg-guide"
            className="rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-gray-100 transition hover:border-white/40"
          >
            {t.creditsGuideCta}
          </Link>
        </div>

        {credits.length === 0 ? (
          <p className="mt-12 text-sm text-gray-400">{t.creditsEmpty}</p>
        ) : (
          <>
            <p className="mt-12 text-sm text-gray-400">
              {format(
                credits.length > 1 ? t.creditsCount_other : t.creditsCount_one,
                { count: credits.length }
              )}
            </p>
            <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {credits.map((credit) => (
                <li
                  key={credit.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
                >
                  {credit.imageUrl ? (
                    // `getPublicUrl()` rend une URL
                    // `https://<ref>.supabase.co/storage/v1/object/public/…` :
                    // elle EST couverte par `images.remotePatterns`
                    // (`**.supabase.co`, préfixe de stockage public). L'ancien
                    // commentaire affirmait le contraire et servait jusqu'à 200
                    // illustrations pleine résolution dans des vignettes
                    // d'environ 310 px. `isOptimizableImageUrl` reste en garde-
                    // fou : si le stockage changeait d'hôte, on retomberait sur
                    // `<img>` au lieu d'une page cassée au rendu.
                    // Le cadre porte le rapport 3/4 et `relative` : `fill` s'y
                    // loge sans saut de mise en page, comme l'ancienne balise.
                    <div className="relative aspect-[3/4] w-full">
                      {isOptimizableImageUrl(credit.imageUrl) ? (
                        <Image
                          src={credit.imageUrl}
                          alt={format(t.creditsImageAlt, {
                            title: credit.title,
                            artist: credit.artistName,
                          })}
                          fill
                          // Grille : 1 colonne sous 640 px, 2 jusqu'à 1024 px,
                          // puis 3 dans `max-w-5xl` (1024 px, moins `px-6` et
                          // deux gouttières ≈ 310 px la vignette).
                          sizes="(min-width: 1024px) 310px, (min-width: 640px) 50vw, 100vw"
                          className="object-cover"
                        />
                      ) : (
                        // biome-ignore lint/performance/noImgElement: hôte hors `remotePatterns`, `next/image` échouerait
                        <img
                          src={credit.imageUrl}
                          alt={format(t.creditsImageAlt, {
                            title: credit.title,
                            artist: credit.artistName,
                          })}
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      )}
                    </div>
                  ) : (
                    <div
                      className="aspect-[3/4] w-full bg-white/5"
                      aria-hidden
                    />
                  )}
                  <div className="p-4">
                    <p className="font-semibold text-white">{credit.title}</p>
                    <p className="mt-1 text-sm text-gray-300">
                      {format(t.creditsBy, { artist: credit.artistName })}
                    </p>
                    {credit.artistUrl && (
                      <a
                        href={credit.artistUrl}
                        target="_blank"
                        rel="noreferrer nofollow"
                        className="mt-2 inline-block text-xs text-purple-200 underline underline-offset-2 hover:text-white"
                      >
                        {t.creditsArtistLink}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

const seo: SeoProps = {
  title: {
    fr: 'Cartes fan art — crédits',
    en: 'Fan art cards — credits',
  },
  description: {
    fr: 'Les cartes fan art du TCG de la OW Women’s Cup, et les artistes qui les ont dessinées.',
    en: 'The fan art cards of the OW Women’s Cup TCG, and the artists who drew them.',
  },
};

FanArtCreditsPage.seo = seo;

export default FanArtCreditsPage;
