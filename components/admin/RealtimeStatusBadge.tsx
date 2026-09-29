// components/admin/RealtimeStatusBadge.tsx
//
// Petit badge d'état temps-réel / mode dégradé pour les pages régie (Director,
// Broadcast live). `connected` vient de useEventRunRealtime : true = les canaux
// Supabase sont SUBSCRIBED (état frais en direct) ; false = canal tombé, la
// page tourne sur son poll de secours (15–30 s de retard). Le régisseur DOIT
// savoir qu'il pilote potentiellement sur un état périmé.
//
// Les libellés sont passés en props pour que chaque page reste dans son propre
// namespace i18n. aria-live polite : le lecteur d'écran annonce le passage
// dégradé -> temps réel sans voler le focus.

import Chip from '@/features/admin/_shared/ui/Chip';

type Props = {
  connected: boolean;
  connectedLabel: string;
  degradedLabel: string;
};

// Puce « Le Ruban » : `ok` (et non `live`, dont la lueur est réservée à l'état
// EN DIRECT d'un match) quand les canaux sont abonnés, `warn` en mode dégradé.
export default function RealtimeStatusBadge({
  connected,
  connectedLabel,
  degradedLabel,
}: Props) {
  return (
    <span role="status" aria-live="polite" className="inline-flex">
      <Chip tone={connected ? 'ok' : 'warn'}>
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${
            connected
              ? 'bg-[var(--ok,#30d07e)]'
              : 'bg-[var(--warn,#f5a524)] animate-pulse'
          }`}
        />
        {connected ? connectedLabel : degradedLabel}
      </Chip>
    </span>
  );
}
