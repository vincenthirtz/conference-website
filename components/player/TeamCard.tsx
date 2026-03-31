import { useState } from 'react';
import Link from 'next/link';

type TeamInfo = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
} | null;

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
  team: TeamInfo;
  isCaptain: boolean;
  pendingCaptainRequest: Demande | undefined;
  pendingJoinRequest: Demande | undefined;
  onLeaveTeam?: () => Promise<void>;
};

export default function TeamCard({
  team,
  isCaptain,
  pendingCaptainRequest,
  pendingJoinRequest,
  onLeaveTeam,
}: Props) {
  const hasPendingRequest = pendingCaptainRequest || pendingJoinRequest;
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const handleLeave = async () => {
    if (!onLeaveTeam) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await onLeaveTeam();
    } catch (err: unknown) {
      setLeaveError((err as Error).message || 'Erreur');
    } finally {
      setLeaving(false);
      setLeaveConfirm(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <h2 className="text-lg font-semibold mb-4">Mon equipe</h2>

      {team ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {team.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.logo_url}
                alt={team.name}
                className="w-12 h-12 rounded-full object-cover border border-white/10"
              />
            )}
            <div>
              <div className="font-semibold">{team.name}</div>
              {team.short_name && (
                <div className="text-xs text-gray-400">{team.short_name}</div>
              )}
            </div>
          </div>

          {isCaptain && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 text-xs text-purple-200">
              <span>Capitaine</span>
            </div>
          )}

          <div className="space-y-2">
            {isCaptain && (
              <Link
                href="/player/manage-team"
                className="block w-full text-center px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold transition"
              >
                Gerer mon equipe
              </Link>
            )}

            <Link
              href={`/team/${team.id}`}
              className="block w-full text-center px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-300 transition"
            >
              Voir la page equipe
            </Link>

            {!isCaptain && (
              <Link
                href="/player/requests?tab=transfer"
                className="block w-full text-center px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-300 transition"
              >
                Demander un transfert
              </Link>
            )}

            {isCaptain && (
              <Link
                href="/player/requests?tab=scrim"
                className="block w-full text-center px-4 py-2 rounded-xl border border-blue-400/20 bg-blue-500/10 hover:bg-blue-500/20 text-sm text-blue-200 transition"
              >
                Proposer un scrim
              </Link>
            )}

            {isCaptain && (
              <Link
                href="/player/messages"
                className="block w-full text-center px-4 py-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-sm text-emerald-200 transition"
              >
                Messagerie capitaine
              </Link>
            )}

            {/* Quitter l'equipe (non-capitaine) */}
            {!isCaptain && onLeaveTeam && (
              <>
                {leaveError && (
                  <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {leaveError}
                  </div>
                )}
                {!leaveConfirm ? (
                  <button
                    onClick={() => setLeaveConfirm(true)}
                    className="w-full px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm transition"
                  >
                    Quitter l&apos;equipe
                  </button>
                ) : (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 space-y-3">
                    <p className="text-xs text-red-200">
                      Es-tu sur de vouloir quitter {team.name} ?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleLeave}
                        disabled={leaving}
                        className="flex-1 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm font-medium transition"
                      >
                        {leaving ? 'En cours...' : 'Confirmer'}
                      </button>
                      <button
                        onClick={() => setLeaveConfirm(false)}
                        disabled={leaving}
                        className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm transition"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-400">
          <p className="mb-4">
            Tu n&apos;es pas encore membre d&apos;une equipe.
          </p>

          {hasPendingRequest && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4">
              <div className="text-amber-200 font-medium mb-1">
                {pendingCaptainRequest
                  ? 'Demande de capitaine en attente'
                  : 'Demande en attente'}
              </div>
              <div className="text-xs text-amber-300/70">
                {pendingCaptainRequest ? (
                  <>
                    Equipe :{' '}
                    {pendingCaptainRequest.payload?.team_name ||
                      pendingCaptainRequest.payload?.existing_team_name ||
                      '\u2014'}
                  </>
                ) : pendingJoinRequest ? (
                  <>
                    Rejoindre :{' '}
                    {pendingJoinRequest.team?.name ||
                      pendingJoinRequest.payload?.team_name ||
                      '\u2014'}
                  </>
                ) : null}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Envoyee le{' '}
                {new Date(
                  (pendingCaptainRequest || pendingJoinRequest)!.created_at
                ).toLocaleDateString()}
              </div>
            </div>
          )}

          {!hasPendingRequest && (
            <div className="space-y-3">
              <Link
                href="/player/join-team"
                className="block w-full text-center px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white text-sm font-semibold transition"
              >
                Rejoindre une equipe
              </Link>
              <Link
                href="/player/request-captain"
                className="block w-full text-center px-4 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition"
              >
                Creer ma propre equipe
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
