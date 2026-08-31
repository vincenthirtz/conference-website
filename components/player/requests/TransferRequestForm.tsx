// components/player/requests/TransferRequestForm.tsx
//
// Contenu de l'onglet « Transfert » de la page Demandes. Présentationnel : tout
// l'état et le handler de soumission vivent dans pages/player/requests.tsx et
// sont passés en props. Extrait sans changement de comportement (mêmes rôles
// ARIA, mêmes branches capitaine/manager, même i18n `playerRequests`).

import Link from 'next/link';
import TeamPicker from '@/components/player/TeamPicker';
import { useT } from '@/lib/i18n/useT';
import { MessageField, ErrorBanner, SubmitButton } from './formPrimitives';
import type {
  Team,
  TransferTeamMember,
  DesiredRole,
  TransferMode,
} from './types';
import nsPlayerRequests from '@/lib/i18n/locales/fr/playerRequests';

type ErrorField = 'team' | 'player' | 'slots' | null;

/* ------------------------------------------------------------------ */
/*  Formulaire de transfert paramétré (propose vs self)                */
/* ------------------------------------------------------------------ */

function TransferForm({
  mode,
  teamMembers,
  selectedPlayerId,
  setSelectedPlayerId,
  teamSearch,
  setTeamSearch,
  errorField,
  displayTeams,
  selectedTeamId,
  setSelectedTeamId,
  teamsLoading,
  desiredRole,
  setDesiredRole,
  message,
  setMessage,
  error,
  submitting,
  onSubmit,
}: {
  mode: TransferMode;
  teamMembers: TransferTeamMember[];
  selectedPlayerId: string;
  setSelectedPlayerId: (id: string) => void;
  teamSearch: string;
  setTeamSearch: (v: string) => void;
  errorField: ErrorField;
  displayTeams: Team[];
  selectedTeamId: string;
  setSelectedTeamId: (id: string) => void;
  teamsLoading: boolean;
  desiredRole: DesiredRole;
  setDesiredRole: (r: DesiredRole) => void;
  message: string;
  setMessage: (v: string) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const t = useT(nsPlayerRequests);
  const isPropose = mode === 'propose';

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {isPropose && (
        <div>
          <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
            {t.playerToTransfer}
          </label>
          <div className="max-h-48 overflow-y-auto space-y-2 rounded-xl border border-white/10 bg-black/40 p-2">
            {teamMembers.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-4">
                {t.noPlayersInTeam}
              </div>
            )}
            {teamMembers.map((m) => (
              <button
                key={m.user_id}
                type="button"
                onClick={() => setSelectedPlayerId(m.user_id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition ${
                  selectedPlayerId === m.user_id
                    ? 'bg-purple-600/30 border border-purple-400/50'
                    : 'bg-white/5 border border-transparent hover:bg-white/10'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs text-gray-400">
                    {(m.display_name || m.battle_tag || '?')
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white text-sm truncate">
                    {m.display_name || m.battle_tag || t.fallbackPlayerName}
                  </div>
                  <div className="text-xs text-gray-400">
                    {m.role === 'substitute'
                      ? t.roleSubstitute
                      : m.role === 'coach'
                        ? t.roleCoach
                        : t.rolePlayer}
                    {m.battle_tag && ` · ${m.battle_tag}`}
                  </div>
                </div>
                {selectedPlayerId === m.user_id && (
                  <svg
                    className="w-5 h-5 text-purple-400 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
          {t.targetTeam}
        </label>
        <input
          type="search"
          value={teamSearch}
          onChange={(e) => setTeamSearch(e.target.value)}
          aria-invalid={errorField === 'team'}
          aria-describedby={
            errorField === 'team' ? 'requests-error' : undefined
          }
          className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 mb-3"
          placeholder={t.searchTeam}
        />
        <TeamPicker
          teams={displayTeams}
          value={selectedTeamId}
          onChange={setSelectedTeamId}
          loading={teamsLoading}
          accentColor="purple"
          label={t.targetTeam}
          emptyLabel={t.emptyJoinable}
        />
      </div>

      <div>
        <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
          {t.desiredRole}
        </label>
        <div
          role="radiogroup"
          aria-label={t.roleGroupAria}
          className="flex gap-3"
        >
          {(['player', 'substitute', 'coach'] as const).map((role) => (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={desiredRole === role}
              onClick={() => setDesiredRole(role)}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition border focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 ${
                desiredRole === role
                  ? 'bg-purple-600/30 border-purple-400/50 text-white'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              {role === 'player'
                ? t.rolePlayer
                : role === 'substitute'
                  ? t.roleSubstitute
                  : t.roleCoach}
            </button>
          ))}
        </div>
      </div>

      <MessageField
        value={message}
        onChange={setMessage}
        label={isPropose ? t.msgToTargetCaptain : t.msgToCaptain}
      />

      {error && <ErrorBanner message={error} />}

      <SubmitButton
        disabled={
          isPropose
            ? submitting || !selectedTeamId || !selectedPlayerId
            : submitting || !selectedTeamId
        }
        loading={submitting}
        label={isPropose ? t.submitProposeTransfer : t.submitSelfTransfer}
      />
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Onglet transfert complet                                           */
/* ------------------------------------------------------------------ */

export default function TransferRequestForm({
  hasTeam,
  isCaptain,
  canProposeForOthers,
  transferMode,
  setTransferMode,
  teamMembers,
  selectedPlayerId,
  setSelectedPlayerId,
  teamSearch,
  setTeamSearch,
  errorField,
  displayTeams,
  selectedTeamId,
  setSelectedTeamId,
  teamsLoading,
  desiredRole,
  setDesiredRole,
  message,
  setMessage,
  error,
  submitting,
  onSubmit,
  setError,
  setErrorField,
}: {
  hasTeam: boolean;
  isCaptain: boolean;
  /**
   * Permission EFFECTIVE `manage_roster` : proposer le transfert de QUELQU'UN
   * D'AUTRE l'exige (cf. /api/demandes/transfer). Distincte de `isCaptain`,
   * qui sert encore ici à bloquer le mode « mon transfert » — une capitaine
   * doit d'abord passer le capitanat.
   */
  canProposeForOthers: boolean;
  transferMode: TransferMode;
  setTransferMode: (m: TransferMode) => void;
  teamMembers: TransferTeamMember[];
  selectedPlayerId: string;
  setSelectedPlayerId: (id: string) => void;
  teamSearch: string;
  setTeamSearch: (v: string) => void;
  errorField: ErrorField;
  displayTeams: Team[];
  selectedTeamId: string;
  setSelectedTeamId: (id: string) => void;
  teamsLoading: boolean;
  desiredRole: DesiredRole;
  setDesiredRole: (r: DesiredRole) => void;
  message: string;
  setMessage: (v: string) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  setError: (v: string | null) => void;
  setErrorField: (v: ErrorField) => void;
}) {
  const t = useT(nsPlayerRequests);

  if (!hasTeam) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
        <p className="font-semibold mb-1">{t.noTeamTitle}</p>
        <p>
          {t.noTeamTransfer}{' '}
          <Link
            href="/player/join-team"
            className="text-purple-300 hover:text-purple-200 underline"
          >
            {t.joinTeam}
          </Link>
        </p>
      </div>
    );
  }

  const switchMode = (m: TransferMode) => {
    setTransferMode(m);
    setSelectedTeamId('');
    setSelectedPlayerId('');
    setError(null);
    setErrorField(null);
  };

  return (
    <>
      {/* Mode toggle — réservé à qui peut proposer pour autrui. */}
      {canProposeForOthers && (
        <div
          role="tablist"
          aria-label={t.transferModeAria}
          className="flex gap-2 mb-6"
        >
          <button
            type="button"
            role="tab"
            id="transfer-mode-tab-propose"
            aria-selected={transferMode === 'propose'}
            aria-controls="transfer-mode-panel"
            onClick={() => switchMode('propose')}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition border ${
              transferMode === 'propose'
                ? 'bg-purple-600/30 border-purple-400/50 text-white'
                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
            }`}
          >
            {t.proposeTransferMode}
          </button>
          <button
            type="button"
            role="tab"
            id="transfer-mode-tab-self"
            aria-selected={transferMode === 'self'}
            aria-controls="transfer-mode-panel"
            onClick={() => switchMode('self')}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition border ${
              transferMode === 'self'
                ? 'bg-purple-600/30 border-purple-400/50 text-white'
                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
            }`}
          >
            {t.selfTransferMode}
          </button>
        </div>
      )}

      <div
        role="tabpanel"
        id="transfer-mode-panel"
        aria-labelledby={`transfer-mode-tab-${transferMode}`}
      >
        {/* Capitaine : mode "mon transfert" bloque */}
        {isCaptain && transferMode === 'self' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
            <p className="font-semibold mb-1">{t.captainTitle}</p>
            <p>{t.captainBlocked}</p>
          </div>
        )}

        {/* Mode "proposer un transfert" (permission `manage_roster`) */}
        {canProposeForOthers && transferMode === 'propose' && (
          <TransferForm
            mode="propose"
            teamMembers={teamMembers}
            selectedPlayerId={selectedPlayerId}
            setSelectedPlayerId={setSelectedPlayerId}
            teamSearch={teamSearch}
            setTeamSearch={setTeamSearch}
            errorField={errorField}
            displayTeams={displayTeams}
            selectedTeamId={selectedTeamId}
            setSelectedTeamId={setSelectedTeamId}
            teamsLoading={teamsLoading}
            desiredRole={desiredRole}
            setDesiredRole={setDesiredRole}
            message={message}
            setMessage={setMessage}
            error={error}
            submitting={submitting}
            onSubmit={onSubmit}
          />
        )}

        {/* Mode "mon transfert" (joueur non-capitaine ou manager en self) */}
        {!isCaptain && transferMode === 'self' && (
          <TransferForm
            mode="self"
            teamMembers={teamMembers}
            selectedPlayerId={selectedPlayerId}
            setSelectedPlayerId={setSelectedPlayerId}
            teamSearch={teamSearch}
            setTeamSearch={setTeamSearch}
            errorField={errorField}
            displayTeams={displayTeams}
            selectedTeamId={selectedTeamId}
            setSelectedTeamId={setSelectedTeamId}
            teamsLoading={teamsLoading}
            desiredRole={desiredRole}
            setDesiredRole={setDesiredRole}
            message={message}
            setMessage={setMessage}
            error={error}
            submitting={submitting}
            onSubmit={onSubmit}
          />
        )}
      </div>
    </>
  );
}
