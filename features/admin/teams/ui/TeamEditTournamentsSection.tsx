// features/admin/teams/ui/TeamEditTournamentsSection.tsx — la carte
// « Tournois » de l'édition d'une équipe (pages/admin/teams/[teamId]/edit.tsx),
// passée en « Le Ruban » et sortie de la page (règle A7).
//
// Purement présentationnel : la page charge les inscriptions, porte la
// confirmation d'effectif incomplet et les appels (POST / DELETE). L'erreur
// est rendue ICI, dans la section : le bandeau de tête reste hors de vue
// depuis le bas de la fiche.

import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';
import type {
  TournamentRegistration,
  TournamentRow,
} from '@/types/adminTeamEdit';
import { TEAM_EDIT_INPUT } from './TeamEditInfoForm';

const SUBTITLE =
  'mb-2 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';

export default function TeamEditTournamentsSection({
  loading,
  error,
  registered,
  available,
  playingCount,
  selectedTournamentId,
  onSelectTournament,
  onRegister,
  onUnregister,
  selectedRosterGap,
  selectedMinPlayers,
}: {
  loading: boolean;
  error: string | null;
  registered: TournamentRegistration[];
  available: TournamentRow[];
  /** Effectif JOUANT (coachs/managers exclus). */
  playingCount: number;
  selectedTournamentId: string;
  onSelectTournament: (id: string) => void;
  onRegister: () => void;
  onUnregister: (tournamentId: string) => void;
  selectedRosterGap: number;
  selectedMinPlayers: number;
}) {
  const t = useAdminT(nsAdminTeamEdit);

  return (
    <FicheSection title={t.tournamentsTitle}>
      {loading ? (
        <div className="py-4 text-sm text-[var(--t3,#a39ba6)]">{t.loading}</div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
            >
              {error}
            </div>
          )}

          {/* Tournois déjà rejoints */}
          <div>
            <h3 className={SUBTITLE}>
              {format(t.registeredTitle, { count: registered.length })}
            </h3>
            {registered.length === 0 ? (
              <div className="rounded-[var(--r-ctrl,4px)] border border-dashed border-[var(--line2,rgba(194,196,201,.2))] py-4 text-center text-sm text-[var(--t3,#a39ba6)]">
                {t.noRegistration}
              </div>
            ) : (
              <div className="space-y-2">
                {registered.map((tourn) => (
                  <div
                    key={tourn.id}
                    className="flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-[var(--t1,#f4edf7)]">
                        {tourn.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--t3,#a39ba6)]">
                        <span>{tourn.game}</span>
                        <Chip>{tourn.status}</Chip>
                      </div>
                      {/* L'alerte d'effectif n'existait qu'AVANT l'inscription.
                          Or un roster passe sous le minimum après coup —
                          départ, exclusion — et plus rien ne le disait. */}
                      {Number(tourn.min_players) > 0 &&
                        playingCount < Number(tourn.min_players) && (
                          <div className="mt-1 text-xs text-[var(--warn,#f5a524)]">
                            {format(t.registeredRosterGap, {
                              count: playingCount,
                              min: Number(tourn.min_players),
                            })}
                          </div>
                        )}
                    </div>
                    <AdminButton
                      variant="danger"
                      size="xs"
                      onClick={() => onUnregister(tourn.id)}
                    >
                      {t.unregister}
                    </AdminButton>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inscrire à un nouveau tournoi */}
          {available.length > 0 && (
            <div className="border-t border-[var(--line,rgba(194,196,201,.12))] pt-4">
              <h3 className={SUBTITLE}>{t.registerToTournament}</h3>
              <div className="flex gap-2">
                <select
                  value={selectedTournamentId}
                  onChange={(e) => onSelectTournament(e.target.value)}
                  className={`${TEAM_EDIT_INPUT} flex-1`}
                >
                  <option value="">{t.selectTournament}</option>
                  {available.map((tourn) => (
                    <option key={tourn.id} value={tourn.id}>
                      {tourn.name} ({tourn.game})
                    </option>
                  ))}
                </select>
                <AdminButton
                  variant="secondary"
                  size="sm"
                  onClick={onRegister}
                  disabled={!selectedTournamentId || loading}
                >
                  {t.register}
                </AdminButton>
              </div>
              {/* Avertissement, pas blocage : le bouton reste actif, la
                  confirmation se fait au clic. */}
              {selectedRosterGap > 0 && (
                <p className="mt-2 text-xs text-[var(--warn,#f5a524)]">
                  {format(t.rosterGapWarning, {
                    count: playingCount,
                    min: selectedMinPlayers,
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </FicheSection>
  );
}
