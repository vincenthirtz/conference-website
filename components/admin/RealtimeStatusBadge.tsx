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

type Props = {
  connected: boolean;
  connectedLabel: string;
  degradedLabel: string;
};

export default function RealtimeStatusBadge({
  connected,
  connectedLabel,
  degradedLabel,
}: Props) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        connected
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
          : 'border-amber-500/50 bg-amber-500/15 text-amber-200'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          connected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
        }`}
      />
      {connected ? connectedLabel : degradedLabel}
    </span>
  );
}
