// components/tcg/TcgShowcaseSection.tsx
//
// La VITRINE TCG sur la fiche publique d'une joueuse (`/player/[userId]`).
//
// PUREMENT D'AFFICHAGE. Tout est décidé en amont, dans `getStaticProps` via
// `readPublicShowcase` : vitrine activée ou non, cartes relues contre la
// possession réelle, faces passées par le filtre de consentement. Ce composant
// ne reçoit que le résultat — `null` quand il n'y a rien à montrer, et il ne
// rend alors RIEN : pas de titre vide, pas d'invitation. Une vitrine absente
// n'est pas un manque à signaler aux visiteuses, c'est le réglage par défaut.
//
// `import type` seulement depuis `utils/tcg/showcase.ts` : ce module lit la
// base, et un import de valeur ferait entrer le client Supabase serveur dans
// le bundle de la page.

import type { JSX } from 'react';
import TcgCard, { type TcgCardSubject } from '@/components/tcg/TcgCard';
import type { ShowcaseCard } from '@/utils/tcg/showcase';
import { useT } from '@/lib/i18n/useT';
import nsTcgShowcase from '@/lib/i18n/locales/fr/tcgShowcase';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

/** La face attendue par `TcgCard`, depuis une carte de vitrine. */
export function showcaseCardSubject(card: ShowcaseCard): TcgCardSubject {
  if (card.kind === 'player') {
    return {
      kind: 'player',
      userId: card.userId,
      displayName: card.displayName,
      imageUrl: card.imageUrl,
    };
  }
  if (card.kind === 'map') {
    return {
      kind: 'map',
      slug: card.slug,
      name: card.name,
      imageUrl: card.imageUrl,
    };
  }
  return {
    kind: 'team',
    teamId: card.teamId,
    name: card.name,
    slug: card.slug,
    logoUrl: card.logoUrl,
    cardImageUrl: card.cardImageUrl,
    // `?? null` : une carte venue de l'éditeur (collection convertie) peut ne
    // pas le porter si la réponse précède le déploiement.
    logoCredit: card.logoCredit ?? null,
  };
}

export default function TcgShowcaseSection({
  cards,
}: {
  cards: ShowcaseCard[] | null;
}): JSX.Element | null {
  const t = useT(nsTcgShowcase);
  const tTcg = useT(nsPlayerTcg);
  if (!cards || cards.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="tcg-showcase-title">
      <h2
        id="tcg-showcase-title"
        className="mb-1 text-sm font-semibold uppercase tracking-widest text-brand-gradient"
      >
        {t.publicTitle}
      </h2>
      <p className="mb-3 text-sm text-neutral-400">{t.publicIntro}</p>
      <ul className="grid grid-cols-2 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 sm:grid-cols-3 sm:gap-4 sm:p-5">
        {cards.map((card) => (
          <li key={card.key} className="min-w-0">
            <TcgCard
              subject={showcaseCardSubject(card)}
              rarity={card.rarity}
              isFoil={card.isFoil}
              labels={{
                rarity: {
                  common: tTcg.rarityCommon,
                  rare: tTcg.rarityRare,
                  epic: tTcg.rarityEpic,
                  legendary: tTcg.rarityLegendary,
                },
                foil: tTcg.foil,
                copies: tTcg.copies,
                logoCredit: tTcg.logoCredit,
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
