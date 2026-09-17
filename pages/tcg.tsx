// pages/tcg.tsx
//
// Vitrine PUBLIQUE du TCG : ce que c'est, comment on gagne des cartes, et le
// catalogue de tout ce qui est collectionnable.
//
// CE QUE CETTE PAGE NE FAIT PAS, ET C'EST SA CONTRAINTE CENTRALE : elle ne
// liste AUCUNE joueuse. Deux règles écrites du dépôt le lui interdisent, et
// elles ne sont pas levées ici :
//
//   - `docs/TCG.md` §1 énumère limitativement les surfaces publiques d'une
//     carte — « les deux seuls endroits publics […] la fiche d'une joueuse et
//     la fiche d'une équipe ». Une galerie en serait un troisième.
//   - `database/migrations/create_player_discovery_profiles.sql` (13/07) :
//     « PAS d'annuaire public / indexé SEO. Aucune route publique ne liste les
//     joueurs. » Repris par `pages/sitemap.xml.ts` : « aucune page PUBLIQUE ni
//     INDEXÉE de personne. Les ÉQUIPES restent publiques et indexées : ce sont
//     des entités, pas des personnes. »
//
// D'où la forme retenue : les ÉQUIPES et les MAPS sont énumérées en entier —
// elles n'ont aucun consentement à donner (`docs/TCG.md` §2.4) — tandis que la
// famille des joueuses est représentée par un DÉNOMBREMENT et l'échelle de
// rareté. On dit qu'elles existent et ce qui rend leur carte rare, sans
// exposer qui que ce soit.
//
// Conséquence technique : `readPlayerFaces` n'est pas appelé ici. Aucun
// `userId`, aucun nom, aucune URL de photo (le bucket est public et le chemin
// embarque l'identifiant) ne traverse ce HTML. C'est ce que vérifie le test
// e2e, et c'est la raison pour laquelle la page est indexable sans réserve.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { GetStaticProps } from 'next';

import type { SeoProps } from '@/components/Seo/DefaultSeo';
import TcgCard, { TcgRarityPips, RARITY_TEXT } from '@/components/tcg/TcgCard';
import type { TcgRarity } from '@/utils/tcg/rarity';
import type { LogoCredit as LogoCreditValue } from '@/utils/teams/logoCredit';
import { MAP_CARD_RARITY } from '@/utils/tcg/rarity';
import { format, useT } from '@/lib/i18n/useT';
import nsTcgCatalog from '@/lib/i18n/locales/fr/tcgCatalog';
// Les six libellés de rareté vivent déjà là : les redupliquer donnerait deux
// jeux de mots libres de diverger (le dépôt a déjà payé ce travers).
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

type CatalogCard =
  | {
      kind: 'team';
      id: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
      cardImageUrl: string | null;
      /**
       * Crédit du logo. OPTIONNEL : une page régénérée en ISR peut encore
       * servir des props construites avant son ajout.
       */
      logoCredit?: LogoCreditValue | null;
      rarity: TcgRarity;
    }
  | {
      kind: 'map';
      id: string;
      name: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
    };

type Props = {
  cards: CatalogCard[];
  /** Nombre de cartes de joueuses existantes — un COMPTE, jamais une liste. */
  playerCount: number;
  seo: SeoProps;
};

type Filter = 'all' | 'team' | 'map';

function TcgCatalogPage({ cards, playerCount }: Props) {
  const t = useT(nsTcgCatalog);
  const tc = useT(nsPlayerTcg);
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(
    () => (filter === 'all' ? cards : cards.filter((c) => c.kind === filter)),
    [cards, filter]
  );

  const cardLabels = {
    rarity: {
      common: tc.rarityCommon,
      rare: tc.rarityRare,
      epic: tc.rarityEpic,
      legendary: tc.rarityLegendary,
    },
    foil: tc.foil,
    copies: tc.copies,
    // Sans ce gabarit, `TcgCard` n'affiche aucun crédit : c'est l'écran qui
    // décide, pour qu'aucun texte en dur ne s'affiche dans une seule langue.
    logoCredit: tc.logoCredit,
  };

  const earnSteps = [
    { title: t.howEarnTitle, body: t.howEarnBody },
    { title: t.howPlacementTitle, body: t.howPlacementBody },
    { title: t.howStreakTitle, body: t.howStreakBody },
    { title: t.howDropTitle, body: t.howDropBody },
    { title: t.howBattlenetTitle, body: t.howBattlenetBody },
    { title: t.howShopTitle, body: t.howShopBody },
  ];

  // Ce qu'une collection permet, une fois les cartes obtenues. Aucun montant
  // ici : la page est publique et statique, le barème chiffré vit dans le guide
  // de l'espace joueuse, lu depuis le serveur.
  const doItems = [
    { title: t.doSetsTitle, body: t.doSetsBody },
    { title: t.doTradesTitle, body: t.doTradesBody },
    { title: t.doShowcaseTitle, body: t.doShowcaseBody },
  ];

  // `rarity` en plus du libellé : la légende doit porter le MÊME repère que les
  // cartes (teinte et losanges), sinon on apprend une échelle en mots et on la
  // retrouve en couleurs sur le catalogue juste en dessous, sans lien entre les
  // deux.
  const rarityRows: Array<{ rarity: TcgRarity; label: string; what: string }> =
    [
      { rarity: 'common', label: tc.rarityCommon, what: t.rarityCommonWhat },
      { rarity: 'rare', label: tc.rarityRare, what: t.rarityRareWhat },
      { rarity: 'epic', label: tc.rarityEpic, what: t.rarityEpicWhat },
      {
        rarity: 'legendary',
        label: tc.rarityLegendary,
        what: t.rarityLegendaryWhat,
      },
    ];

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: t.filterAll },
    { key: 'team', label: t.filterTeams },
    { key: 'map', label: t.filterMaps },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d0b14] via-[#120f1c] to-[#0d0b14]">
      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4">
          <p className="text-xs uppercase tracking-[0.22em] text-purple-300">
            {t.eyebrow}
          </p>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            {t.title}
          </h1>
          <p className="max-w-3xl text-gray-300">{t.lede}</p>
        </header>

        {/* Comment on obtient des cartes */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold text-white">{t.howTitle}</h2>
          <ol className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {earnSteps.map((step, i) => (
              <li
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <span className="font-mono text-xs text-purple-300">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-2 font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Ce qu'on fait de ses cartes */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold text-white">{t.doTitle}</h2>
          <ul className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {doItems.map((item) => (
              <li
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* L'échelle de rareté */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold text-white">{t.rarityTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm text-gray-400">{t.rarityLede}</p>
          <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rarityRows.map((row) => (
              <div
                key={row.label}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <dt
                  className={`flex items-center gap-2 text-sm font-semibold ${RARITY_TEXT[row.rarity]}`}
                >
                  <TcgRarityPips rarity={row.rarity} />
                  {row.label}
                </dt>
                <dd className="mt-1 text-sm text-gray-400">{row.what}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-gray-500">{t.foilNote}</p>
        </section>

        {/* Le catalogue */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">{t.catalogTitle}</h2>

          {/* `role="group"` et non `<nav>` : ces boutons filtrent la grille,
              ils ne mènent nulle part. Un repère de navigation annoncerait
              des liens qui n'existent pas. */}
          <div
            role="group"
            className="mt-6 flex flex-wrap items-center gap-2"
            aria-label={t.catalogTitle}
          >
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`min-h-11 rounded-full border px-4 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                  filter === f.key
                    ? 'border-purple-400 bg-purple-500/20 text-white'
                    : 'border-white/15 text-gray-300 hover:border-white/30 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
            {/* Annoncé poliment : changer de filtre modifie la grille sans
                déplacer le focus, et sans cette annonce une personne au
                lecteur d'écran ne saurait pas que la liste a changé. */}
            <span
              role="status"
              aria-live="polite"
              className="ml-auto font-mono text-xs tabular-nums text-gray-400"
            >
              {format(t.countCards, { n: shown.length })}
            </span>
          </div>

          {shown.length === 0 && (
            // Un filtre vide (aucune équipe active en intersaison, par exemple)
            // doit se dire : une grille vide ressemble à une page cassée.
            <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-gray-300">
              {t.filterEmpty}
            </p>
          )}

          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {shown.map((card) => (
              <li key={`${card.kind}-${card.id}`}>
                <TcgCard
                  subject={
                    card.kind === 'team'
                      ? {
                          kind: 'team',
                          teamId: card.id,
                          name: card.name,
                          slug: card.slug,
                          logoUrl: card.logoUrl,
                          cardImageUrl: card.cardImageUrl,
                          logoCredit: card.logoCredit ?? null,
                        }
                      : {
                          kind: 'map',
                          slug: card.id,
                          name: card.name,
                          imageUrl: card.imageUrl,
                        }
                  }
                  rarity={card.rarity}
                  labels={cardLabels}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* La famille qu'on ne liste pas — et pourquoi */}
        <section className="mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-xl font-bold text-white">{t.playersTitle}</h2>
          <p className="mt-3 text-sm text-gray-300">
            {format(t.playersCount, { n: playerCount })}
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-400">
            {t.playersWhy}
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
            {t.playersConsent}
          </p>
        </section>

        <section className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{t.ctaTitle}</h2>
            <p className="mt-1 text-sm text-gray-400">{t.ctaBody}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/player/tcg"
              className="inline-flex rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-500"
            >
              {t.ctaButton}
            </Link>
            <Link
              href="/player/tcg-guide"
              className="inline-flex rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-gray-200 transition hover:bg-white/10"
            >
              {t.ctaGuide}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

const tcgCatalogSeoFallback: SeoProps = {
  title: {
    fr: 'Le TCG de la Women’s Cup — toutes les cartes',
    en: 'The Women’s Cup TCG — every card',
  },
  description: {
    fr: 'Les cartes à collectionner de la Women’s Cup : équipes, maps, comment on les gagne, séries, échanges et vitrine.',
    en: 'The Women’s Cup trading cards: teams, maps, how to earn them, sets, trades and showcase.',
  },
};

function buildSeo(cards: CatalogCard[]): SeoProps {
  const teams = cards.filter((c) => c.kind === 'team').length;
  const maps = cards.filter((c) => c.kind === 'map').length;

  return {
    title: tcgCatalogSeoFallback.title,
    description: {
      fr: `Les cartes à collectionner de la Women’s Cup : ${teams} équipes et ${maps} maps, l’échelle de rareté et les façons d’en gagner.`,
      en: `The Women’s Cup trading cards: ${teams} teams and ${maps} maps, the rarity scale and how to earn them.`,
    },
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Cartes à collectionner — Women’s Cup',
        numberOfItems: cards.length,
        // Uniquement des ENTITÉS (équipes, maps). Aucune personne n'entre ici,
        // pour la même raison que le reste de la page.
        itemListElement: cards.slice(0, 20).map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.name ?? c.id,
        })),
      },
    ],
  };
}

TcgCatalogPage.seo = tcgCatalogSeoFallback;

export const getStaticProps: GetStaticProps<Props> = async () => {
  const { supabaseAdmin } = await import('@/utils/supabase');
  const { DEFAULT_TENANT_ID } = await import('@/utils/tenant');
  const { readTeamFaces } = await import('@/utils/tcg/readCardFaces');
  const { readTeamRarities } = await import('@/utils/tcg/readTeamRarity');
  const { MAP_POOL_SLUGS, mapFace } = await import('@/utils/tcg/readMapFaces');
  const { POOL_LIMIT } = await import('@/utils/tcg/drawPack');

  // Les MAPS ne coûtent aucune requête : le registre est en mémoire.
  const mapCards: CatalogCard[] = MAP_POOL_SLUGS.map((slug) => {
    const face = mapFace(slug);
    return {
      kind: 'map',
      id: face.slug,
      name: face.name,
      imageUrl: face.imageUrl,
      rarity: MAP_CARD_RARITY,
    };
  });

  if (!supabaseAdmin) {
    return {
      props: {
        cards: mapCards,
        playerCount: 0,
        seo: buildSeo(mapCards),
      },
      // Base injoignable au build : on rend la moitié statique de la page et
      // on retente vite, plutôt que de faire échouer une page de marque.
      revalidate: 30,
    };
  }

  // Le vivier des ÉQUIPES, aux mêmes filtres que l'ouverture de paquet : une
  // carte montrée ici doit être une carte réellement tirable.
  const { data: teamRows } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .is('deleted_at', null)
    // `is_active` est NULLABLE : `.neq(..., false)` exclurait les lignes NULL.
    .or('is_active.is.null,is_active.eq.true')
    .limit(POOL_LIMIT);

  const teamIds = ((teamRows ?? []) as Array<{ id: string }>).map((r) => r.id);
  const [faces, rarities] = await Promise.all([
    readTeamFaces(DEFAULT_TENANT_ID, teamIds),
    readTeamRarities(DEFAULT_TENANT_ID, teamIds),
  ]);

  const teamCards: CatalogCard[] = teamIds.map((id) => {
    const face = faces.get(id);
    return {
      kind: 'team',
      id,
      name: face?.name ?? null,
      slug: face?.slug ?? null,
      logoUrl: face?.logoUrl ?? null,
      cardImageUrl: face?.cardImageUrl ?? null,
      // Page PUBLIQUE et indexée : la première vitrine du jeu pour qui ne
      // joue pas encore. Le crédit y a sa place autant que sur la fiche.
      logoCredit: face?.logoCredit ?? null,
      rarity: rarities.get(id) ?? 'common',
    };
  });

  // UN COMPTE, PAS UNE LISTE : `head: true` ne ramène aucune ligne, donc aucun
  // identifiant de joueuse ne transite — ce qui est tout l'objet de la page.
  const { count } = await supabaseAdmin
    .from('player_ratings')
    .select('user_id', { count: 'exact', head: true })
    .eq('tenant_id', DEFAULT_TENANT_ID);

  const cards = [...teamCards, ...mapCards];

  return {
    props: {
      cards,
      playerCount: count ?? 0,
      seo: buildSeo(cards),
    },
    revalidate: 300,
  };
};

export default TcgCatalogPage;
