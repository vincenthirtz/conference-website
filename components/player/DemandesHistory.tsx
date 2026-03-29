import { useState } from 'react';

type Demande = {
  id: string;
  type: 'captain_request' | 'join' | 'leave' | 'other';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  updated_at?: string;
  processed_at?: string;
  comment?: string | null;
  staff_note?: string | null;
  payload?: {
    team_name?: string;
    existing_team_name?: string;
    message?: string;
  };
  team?: {
    id: string;
    name: string;
  } | null;
};

type Props = {
  demandes: Demande[];
  onCancel?: (demandeId: string) => Promise<void>;
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

function isRecent(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff < 48 * 60 * 60 * 1000; // 48h
}

export default function DemandesHistory({ demandes, onCancel }: Props) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (demandes.length === 0) return null;

  const handleCancel = async (id: string) => {
    if (!onCancel) return;
    setCancellingId(id);
    setCancelError(null);
    try {
      await onCancel(id);
    } catch (err: unknown) {
      setCancelError((err as Error).message || 'Erreur');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <h2 className="text-lg font-semibold mb-4">Historique des demandes</h2>

      {cancelError && (
        <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {cancelError}
        </div>
      )}

      <div className="space-y-3">
        {demandes.map((d) => {
          const teamName =
            d.team?.name ||
            d.payload?.team_name ||
            d.payload?.existing_team_name ||
            null;

          const message = d.comment || d.payload?.message || null;
          const recentlyProcessed =
            d.status !== 'pending' && isRecent(d.processed_at || d.updated_at);

          return (
            <div
              key={d.id}
              className="border-b border-white/5 pb-3 last:border-0"
            >
              <div className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{TYPE_LABELS[d.type]}</span>
                  {teamName && (
                    <span className="text-gray-400 ml-2">({teamName})</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {recentlyProcessed && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      Nouveau
                    </span>
                  )}
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[d.status]}`}
                  >
                    {STATUS_LABELS[d.status]}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(d.created_at).toLocaleDateString()}
                  </span>
                  {d.status === 'pending' && onCancel && (
                    <button
                      onClick={() => handleCancel(d.id)}
                      disabled={cancellingId === d.id}
                      className="px-2 py-1 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-medium transition disabled:opacity-50"
                    >
                      {cancellingId === d.id ? '...' : 'Annuler'}
                    </button>
                  )}
                </div>
              </div>

              {/* Message envoye avec la demande */}
              {message && (
                <div className="mt-1.5 text-xs text-gray-500 italic pl-0">
                  &ldquo;{message}&rdquo;
                </div>
              )}

              {/* Raison du refus */}
              {d.status === 'rejected' && d.staff_note && (
                <div className="mt-1.5 text-xs text-red-300/70 pl-0">
                  Motif : {d.staff_note}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
