// components/admin/communications/campaignUi.tsx
//
// Deux primitives d'affichage de l'écran Campagnes, partagées par le tiroir et
// la section de planification : une étiquette-valeur et une barre
// d'avancement. Sorties de CampaignDrawer pour le garder sous le plafond A7.

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-700/40">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className="text-sm font-medium text-white truncate">{children}</div>
    </div>
  );
}

export function Progress({
  sent,
  failed,
  pending,
  total,
}: {
  sent: number;
  failed: number;
  pending: number;
  total: number;
}) {
  const safeTotal = total > 0 ? total : Math.max(1, sent + failed + pending);
  const sentPct = (sent / safeTotal) * 100;
  const failedPct = (failed / safeTotal) * 100;
  return (
    <div className="h-2 w-full rounded-full overflow-hidden bg-neutral-800 border border-neutral-700/50 flex">
      <div
        className="h-full bg-emerald-500 transition-[width]"
        style={{ width: `${sentPct}%` }}
      />
      <div
        className="h-full bg-rose-500 transition-[width]"
        style={{ width: `${failedPct}%` }}
      />
    </div>
  );
}
