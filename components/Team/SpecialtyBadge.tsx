// components/Team/SpecialtyBadge.tsx
//
// Le poste d'une joueuse — tank, dps, support, flex — rendu partout de la même
// façon.
//
// Composant partagé plutôt qu'un `getSpecialtyStyle` recopié par écran : les
// couleurs sont une convention de lecture (l'orange dit « tank » avant même
// qu'on lise le mot), et deux copies divergent au premier ajustement. C'est
// exactement ce qui est arrivé à cette pastille — la page publique en avait
// une, l'écran staff n'en avait aucune, et le poste y était donc invisible.
//
// Ne rend RIEN sur une valeur absente ou inconnue : « non déclaré » n'est pas
// une information à mettre en avant sur chaque ligne, et un poste inventé ne
// doit pas s'afficher tel quel. L'appelant qui veut signaler le manque le fait
// lui-même.

import { useT } from '@/lib/i18n/useT';
import nsSpecialty from '@/lib/i18n/locales/fr/specialty';

type Dict = typeof nsSpecialty.fr;

type SpecialtyKey = 'tank' | 'dps' | 'support' | 'flex';

const STYLES: Record<SpecialtyKey, string> = {
  tank: 'bg-orange-500/20 border-orange-500/40 text-orange-200',
  dps: 'bg-red-500/20 border-red-500/40 text-red-200',
  support: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200',
  flex: 'bg-purple-500/20 border-purple-500/40 text-purple-200',
};

function label(t: Dict, key: SpecialtyKey): string {
  const labels: Record<SpecialtyKey, string> = {
    tank: t.tank,
    dps: t.dps,
    support: t.support,
    flex: t.flex,
  };
  return labels[key];
}

function normalize(value: string | null | undefined): SpecialtyKey | null {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'tank' || v === 'dps' || v === 'support' || v === 'flex'
    ? v
    : null;
}

export default function SpecialtyBadge({
  specialty,
  className = '',
}: {
  specialty: string | null | undefined;
  className?: string;
}) {
  const t = useT(nsSpecialty);
  const key = normalize(specialty);
  if (!key) return null;

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STYLES[key]} ${className}`}
    >
      {label(t, key)}
    </span>
  );
}
