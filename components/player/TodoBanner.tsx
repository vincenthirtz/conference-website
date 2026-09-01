// components/player/TodoBanner.tsx
//
// Bandeau « à faire » — lot J6 de docs/PLAN-espace-joueur.md.
//
// Le tableau de bord empile une quinzaine de cartes. Chacune se masque quand
// elle n'a rien à dire — bonne règle — mais quand elles parlent toutes, la
// hiérarchie est celle du code, pas celle de l'urgence : une capitaine à J-1
// doit descendre pour trouver son check-in.
//
// Trois principes :
//   1. Rien à faire ⇒ AUCUN bandeau. Pas de « tout va bien » permanent, qui
//      s'apprend à ignorer en trois jours et fait du bruit pour toujours.
//   2. Trois items maximum, ordre décidé par le serveur (le plus périssable
//      d'abord) : au-delà, ce n'est plus une liste d'actions, c'est une page.
//   3. Aucune règle métier ici — les items viennent du payload du dashboard.

import Link from 'next/link';
import { useT, format } from '@/lib/i18n/useT';
import nsPlayerIndex from '@/lib/i18n/locales/fr/playerIndex';
import type { TodoItem } from '@/pages/api/player/dashboard';

type T = typeof nsPlayerIndex.fr;

function labelFor(item: TodoItem, t: T): string {
  switch (item.id) {
    case 'checkin':
      return t.todoCheckin;
    case 'lineup':
      return t.todoLineup;
    case 'roster':
      return format(t.todoRoster, { n: item.count ?? 0 });
    case 'invitation':
      return format(t.todoInvitation, { n: item.count ?? 0 });
    case 'scrims':
      return format(t.todoScrims, { n: item.count ?? 0 });
    case 'messages':
      return format(t.todoMessages, { n: item.count ?? 0 });
    case 'battletag':
      return t.todoBattleTag;
    default:
      return '';
  }
}

export default function TodoBanner({ items }: { items: TodoItem[] }) {
  const t = useT(nsPlayerIndex);
  if (!items || items.length === 0) return null;

  return (
    <section
      aria-labelledby="todo-heading"
      className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/[0.07] p-5 backdrop-blur-xl"
    >
      <h2
        id="todo-heading"
        className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200"
      >
        {t.todoTitle}
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white transition hover:border-amber-300/40 hover:bg-black/50"
            >
              <span>{labelFor(item, t)}</span>
              <span aria-hidden className="text-amber-200">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
