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

import { useState } from 'react';
import {
  useMatchLineupAction,
  useMatchLineups,
} from '@/features/admin/matches/hooks/useMatch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminMatchLineups from '@/lib/i18n/locales/admin-fr/adminMatchLineups';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  rubanCard,
  rubanErr,
  rubanInset,
} from '@/features/admin/_shared/ui/ruban';

export default function MatchLineupsPanel({ matchId }: { matchId: string }) {
  const t = useAdminT(nsAdminMatchLineups);
  const { data: lineups } = useMatchLineups(matchId);
  const lineupAction = useMatchLineupAction(matchId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Un match sans équipes (bye, bracket non résolu) n'a pas de feuille —
  // ni une lecture en échec : le panneau ne s'affiche simplement pas.
  if (!lineups || lineups.length === 0) return null;

  async function act(teamId: string, body: Record<string, unknown>) {
    setBusy(teamId);
    setError(null);
    try {
      // Relit les feuilles avant de rendre la main (comme avant).
      await lineupAction.mutateAsync({ teamId, ...body });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`p-4 ${rubanCard}`}>
      <h2 className="text-lg font-semibold mb-3">{t.heading}</h2>

      {error && (
        <p role="alert" className={`mb-3 px-3 py-2 text-xs ${rubanErr}`}>
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {lineups.map((l) => {
          const validated = l.status === 'validated';
          return (
            <div key={l.teamId} className={`p-3 ${rubanInset}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm">
                  {l.teamName ?? t.unknownTeam}
                </span>
                {validated ? (
                  <Chip tone={l.validatedByKind === 'admin' ? 'warn' : 'ok'}>
                    {l.validatedByKind === 'admin' ? t.badgeAdmin : t.badgeTeam}
                  </Chip>
                ) : (
                  <Chip>{t.badgeDraft}</Chip>
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
                  <AdminButton
                    variant="secondary"
                    size="xs"
                    onClick={() => act(l.teamId, {})}
                    disabled={busy === l.teamId}
                  >
                    {t.validateForTeam}
                  </AdminButton>
                )}
                {validated && (
                  <AdminButton
                    size="xs"
                    onClick={() => act(l.teamId, { reopen: true })}
                    disabled={busy === l.teamId}
                  >
                    {t.reopen}
                  </AdminButton>
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
