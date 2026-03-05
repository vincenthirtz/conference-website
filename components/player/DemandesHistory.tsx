type Demande = {
  id: string;
  type: 'captain_request' | 'join' | 'leave' | 'other';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  payload?: {
    team_name?: string;
    existing_team_name?: string;
  };
  team?: {
    id: string;
    name: string;
  } | null;
};

type Props = {
  demandes: Demande[];
};

const TYPE_LABELS: Record<Demande['type'], string> = {
  captain_request: 'Demande de capitaine',
  join: 'Rejoindre une equipe',
  leave: "Quitter l'equipe",
  other: 'Demande',
};

const STATUS_STYLES: Record<Demande['status'], string> = {
  pending: 'bg-amber-500/20 text-amber-300',
  approved: 'bg-emerald-500/20 text-emerald-300',
  rejected: 'bg-red-500/20 text-red-300',
  cancelled: 'bg-gray-500/20 text-gray-300',
};

const STATUS_LABELS: Record<Demande['status'], string> = {
  pending: 'En attente',
  approved: 'Approuvee',
  rejected: 'Refusee',
  cancelled: 'Annulee',
};

export default function DemandesHistory({ demandes }: Props) {
  if (demandes.length === 0) return null;

  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <h2 className="text-lg font-semibold mb-4">Historique des demandes</h2>
      <div className="space-y-3">
        {demandes.map((d) => {
          const teamName =
            d.team?.name ||
            d.payload?.team_name ||
            d.payload?.existing_team_name ||
            null;

          return (
            <div
              key={d.id}
              className="flex items-center justify-between text-sm border-b border-white/5 pb-3 last:border-0"
            >
              <div>
                <span className="font-medium">{TYPE_LABELS[d.type]}</span>
                {teamName && (
                  <span className="text-gray-400 ml-2">({teamName})</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[d.status]}`}
                >
                  {STATUS_LABELS[d.status]}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(d.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
