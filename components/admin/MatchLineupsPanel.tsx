// components/admin/MatchLineupsPanel.tsx
//
// Feuilles de match, vue ORGANISATION : où en sont les deux équipes, et les
// deux leviers du staff — valider à leur place, ou rouvrir une feuille figée.
//
// Pourquoi ces deux leviers existent, et pas un de plus :
//
//   - VALIDER À LA PLACE : le jour du tournoi, une équipe injoignable ne doit
//     pas bloquer la suite. La feuille est alors marquée
//     `validated_by_kind = 'admin'` — une validation par l'organisation
//     n'engage pas l'équipe comme la sienne propre, et confondre les deux
//     rendrait toute contestation ininterprétable.
//   - ROUVRIR : c'est le SEUL geste qui défige une feuille validée. Réservé au
//     staff, parce qu'une composition qu'une équipe peut réécrire après le
//     match ne prouve rien — et c'est justement ce qu'on cherchait à réparer.
//
// Le check-in reste la porte, même ici : valider la composition d'une équipe
// qui ne s'est pas présentée n'aurait aucun sens, c'est le forfait qui répond
// à ce cas.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logger } from '../../utils/logger';
import nsAdminMatchLineups from '@/lib/i18n/locales/admin-fr/adminMatchLineups';

type LineupPlayer = {
  team_id: string;
  user_id: string | null;
  battle_tag: string | null;
  role: string | null;
  is_substitute: boolean;
};

type TeamLineup = {
  teamId: string;
  teamName: string | null;
  open: boolean;
  closedReason: 'not_in_match' | 'match_over' | 'awaiting_checkin' | null;
  status: 'draft' | 'validated';
  validatedAt: string | null;
  validatedByKind: 'team' | 'admin' | null;
  players: LineupPlayer[];
};

export default function MatchLineupsPanel({ matchId }: { matchId: string }) {
  const t = useAdminT(nsAdminMatchLineups);
  const { adminFetchJson } = useAdminFetch();
  const [lineups, setLineups] = useState<TeamLineup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await adminFetchJson<{ lineups: TeamLineup[] }>(
        `/api/admin/matches/${matchId}/lineup`
      );
      setLineups(payload.lineups || []);
    } catch (err) {
      logger.error('[MatchLineupsPanel] load', err);
      setLineups([]);
    }
  }, [adminFetchJson, matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Un match sans équipes (bye, bracket non résolu) n'a pas de feuille.
  if (!lineups || lineups.length === 0) return null;

  async function act(teamId: string, body: Record<string, unknown>) {
    setBusy(teamId);
    setError(null);
    try {
      await adminFetchJson(`/api/admin/matches/${matchId}/lineup`, {
        method: 'POST',
        body: JSON.stringify({ teamId, ...body }),
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <h2 className="text-lg font-semibold mb-3">{t.heading}</h2>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {lineups.map((l) => {
          const validated = l.status === 'validated';
          return (
            <div
              key={l.teamId}
              className="rounded-xl border border-white/10 bg-black/30 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm">
                  {l.teamName ?? t.unknownTeam}
                </span>
                {validated ? (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      l.validatedByKind === 'admin'
                        ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                        : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                    }`}
                  >
                    {l.validatedByKind === 'admin' ? t.badgeAdmin : t.badgeTeam}
                  </span>
                ) : (
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                    {t.badgeDraft}
                  </span>
                )}
              </div>

              {!l.open && !validated && (
                <p className="mb-2 text-xs text-gray-400">
                  {l.closedReason === 'awaiting_checkin'
                    ? t.awaitingCheckin
                    : t.closed}
                </p>
              )}

              {l.players.length > 0 ? (
                <ul className="space-y-1 text-xs text-gray-300">
                  {l.players.map((p) => (
                    <li
                      key={`${l.teamId}-${p.user_id}`}
                      className="flex items-center gap-2"
                    >
                      <span className="truncate">
                        {p.battle_tag || p.user_id}
                      </span>
                      {p.is_substitute && (
                        <span className="shrink-0 text-[10px] text-gray-500">
                          {t.substitute}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">{t.noPlayers}</p>
              )}

              {l.validatedAt && (
                <p className="mt-2 text-[11px] text-gray-500">
                  {format(t.validatedAt, {
                    date: new Date(l.validatedAt).toLocaleString('fr-FR'),
                  })}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {/* Valider à la place : seulement si la feuille est ouverte
                    ET qu'une composition existe — valider le vide n'aurait
                    aucun sens, et le serveur le refuse de toute façon. */}
                {!validated && l.open && l.players.length > 0 && (
                  <button
                    type="button"
                    onClick={() => act(l.teamId, {})}
                    disabled={busy === l.teamId}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
                  >
                    {t.validateForTeam}
                  </button>
                )}
                {validated && (
                  <button
                    type="button"
                    onClick={() => act(l.teamId, { reopen: true })}
                    disabled={busy === l.teamId}
                    className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-gray-200 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    {t.reopen}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-gray-500">{t.footnote}</p>
    </div>
  );
}
