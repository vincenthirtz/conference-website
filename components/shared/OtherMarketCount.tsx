// components/shared/OtherMarketCount.tsx
//
// « Combien de monde y a-t-il en face ? » — la phrase vivante qu'on ajoute à la
// carte de renvoi vers l'AUTRE marché (lot 4 de docs/BACKLOG-reseau-social.md).
//
// POURQUOI. /rejoindre et /recrutement se renvoient déjà l'un vers l'autre,
// mais avec une promesse abstraite (« Voir les équipes qui recrutent »). Une
// joueuse ne clique pas sur une promesse ; elle clique sur « 5 équipes
// recrutent en ce moment ». Les deux listes publiques sont déjà servies par des
// routes anonymisées : il n'y a rien à créer côté serveur.
//
// DEUX PARTIS PRIS.
//   1. Silence quand c'est vide. Zéro n'est pas une information utile ici,
//      c'est un repoussoir : « 0 équipe recrute » ferait renoncer quelqu'un qui
//      allait publier sa fiche. Le composant ne rend rien tant qu'il n'a pas un
//      nombre strictement positif.
//   2. Aucun bruit en cas d'échec. C'est un ornement de carte, pas le contenu
//      de la page : une erreur réseau se traduit par l'absence de la phrase,
//      jamais par un message d'erreur.

import { useEffect, useState } from 'react';
import { format as fmt } from '@/lib/i18n/useT';

/** Les deux marchés publics, par leur route et la clé de leur tableau. */
const MARKETS = {
  'free-players': { url: '/api/public/free-players', key: 'players' },
  'team-openings': { url: '/api/public/team-openings', key: 'openings' },
} as const;

export type OtherMarket = keyof typeof MARKETS;

export default function OtherMarketCount({
  market,
  one,
  many,
  className = 'mt-2 text-sm font-medium text-[var(--color-green-light)]',
}: {
  market: OtherMarket;
  /** Gabarit singulier, avec {count}. */
  one: string;
  /** Gabarit pluriel, avec {count}. */
  many: string;
  className?: string;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const { url, key } = MARKETS[market];
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        // On compte le tableau plutôt que de lire un champ `count` : les deux
        // routes ne l'exposent pas de la même façon, et la longueur est la
        // seule source qui ne peut pas mentir sur ce qui sera affiché en face.
        const rows = data?.[key];
        if (!cancelled && Array.isArray(rows)) setCount(rows.length);
      } catch {
        /* ornement : on se tait */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [market]);

  if (count <= 0) return null;

  return <p className={className}>{fmt(count > 1 ? many : one, { count })}</p>;
}
