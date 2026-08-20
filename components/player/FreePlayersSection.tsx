// components/player/FreePlayersSection.tsx
// Section "Joueurs cherchant une equipe" pour la page de gestion d'equipe.
// Liste les membres Discord du tenant sans equipe ; le capitaine peut inviter
// ceux qui ont lie leur compte du site.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useT } from '@/lib/i18n/useT';
import nsFreePlayers from '@/lib/i18n/locales/fr/freePlayers';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';

type FreePlayer = {
  discordUserId: string;
  discordUsername: string | null;
  linked: boolean;
  authUserId: string | null;
  displayName: string | null;
  battleTag: string | null;
  specialty: string | null;
};

type FreePlayersResponse = {
  players: FreePlayer[];
};

type Props = {
  teamId: string;
};

export default function FreePlayersSection({ teamId }: Props) {
  const t = useT(nsFreePlayers);
  const { adminFetchJson } = useAdminFetch();
  const { withTeam } = useActiveTeam();

  const [players, setPlayers] = useState<FreePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // discordUserId currently being invited.
  const [inviting, setInviting] = useState<string | null>(null);
  // discordUserId(s) successfully invited (shows "invite ✓").
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  // Transient inline error message (e.g. 409).
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchJson<FreePlayersResponse>(
        withTeam('/api/teams/free-players')
      );
      setPlayers(data.players || []);
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t, withTeam]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInvite = async (player: FreePlayer) => {
    if (!player.authUserId) return;
    setInviting(player.discordUserId);
    setActionError(null);
    try {
      await adminFetchJson(withTeam('/api/teams/invite-free-player'), {
        method: 'POST',
        body: JSON.stringify({ teamId, authUserId: player.authUserId }),
      });
      // Optimistic: mark this player as invited.
      setInvited((prev) => ({ ...prev, [player.discordUserId]: true }));
    } catch (err: unknown) {
      if (err instanceof AdminFetchError && err.status === 409) {
        setActionError(t.alreadyInvited);
        // The player is already invited/member: reflect it on the card.
        setInvited((prev) => ({ ...prev, [player.discordUserId]: true }));
      } else {
        setActionError((err as Error).message || t.inviteError);
      }
    } finally {
      setInviting(null);
    }
  };

  const displayNameFor = (p: FreePlayer) =>
    p.displayName || p.battleTag || p.discordUsername || t.anonymous;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 mt-6">
      <h2 className="text-lg font-semibold mb-1">{t.title}</h2>
      <p className="text-sm text-gray-400 mb-4">{t.description}</p>

      {actionError && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          {actionError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">{t.loading}</p>
      ) : error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : players.length === 0 ? (
        <p className="text-sm text-gray-500">{t.empty}</p>
      ) : (
        <div className="space-y-3">
          {players.map((p) => {
            const isInvited = !!invited[p.discordUserId];
            return (
              <div
                key={p.discordUserId}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-gray-500">
                      {(displayNameFor(p) || '??').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {displayNameFor(p)}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {p.discordUsername ? (
                        <span className="font-mono">@{p.discordUsername}</span>
                      ) : (
                        t.noDiscordName
                      )}
                      {p.linked && p.specialty && (
                        <span className="ml-2 text-gray-400">
                          {' · '}
                          {p.specialty}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {!p.linked ? (
                    <div className="flex flex-col items-end gap-1 text-right">
                      <span className="inline-flex items-center px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-gray-400">
                        {t.notLinkedBadge}
                      </span>
                      <span className="text-[11px] text-gray-500 max-w-[12rem]">
                        {t.notLinkedHint}
                      </span>
                    </div>
                  ) : isInvited ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                      {t.invited}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleInvite(p)}
                      disabled={inviting === p.discordUserId}
                      className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold transition disabled:opacity-50"
                    >
                      {inviting === p.discordUserId ? t.inviting : t.invite}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
