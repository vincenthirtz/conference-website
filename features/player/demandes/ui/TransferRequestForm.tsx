// features/player/demandes/ui/TransferRequestForm.tsx — onglet « Transfert »
// de l'écran Demandes (lot P11 ; ex-components/player/requests).
//
// Présentationnel : le formulaire (`useSchemaForm`) et les gestes vivent dans
// `useRequestsScreen`. Mêmes rôles ARIA, mêmes branches capitaine / manager,
// même i18n `playerRequests`.

import Link from 'next/link';
import Tabs, { tabButtonId, tabPanelId } from '@/components/ui/Tabs';
import TeamPicker from '@/components/player/TeamPicker';
import type {
  DesiredRole,
  RequestsScreen,
  TransferMode,
} from '../hooks/useRequestsScreen';
import {
  ErrorBanner,
  MessageField,
  Notice,
  SectionLabel,
  SubmitButton,
  TeamSearchInput,
} from './formPrimitives';

type Props = {
  screen: RequestsScreen;
};

const ROLES: DesiredRole[] = ['player', 'substitute', 'coach'];

function TransferForm({ screen, mode }: Props & { mode: TransferMode }) {
  const { t, teamMembers, teamsLoading } = screen;
  const { form, teams, error } = screen.transfer;
  const v = form.values;
  const isPropose = mode === 'propose';
  const roleLabel = (role: string) =>
    role === 'substitute'
      ? t.roleSubstitute
      : role === 'coach'
        ? t.roleCoach
        : t.rolePlayer;

  return (
    <form onSubmit={form.handleSubmit} noValidate className="space-y-6">
      {isPropose && (
        <div>
          <SectionLabel>{t.playerToTransfer}</SectionLabel>
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] p-2">
            {teamMembers.length === 0 && (
              <div className="py-4 text-center text-sm text-[var(--t3,#a39ba6)]">
                {t.noPlayersInTeam}
              </div>
            )}
            {teamMembers.map((m) => {
              const selected = v.playerId === m.user_id;
              const name = m.display_name || m.battle_tag;
              return (
                <button
                  key={m.user_id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => form.setValue('playerId', m.user_id)}
                  className={`flex w-full items-center gap-3 rounded-[var(--r-ctrl,4px)] border p-3 text-left transition ${
                    selected
                      ? 'border-[var(--or,#b467d1)] bg-[var(--s3,#2f2732)]'
                      : 'border-transparent bg-[var(--s2,#1d1520)] hover:border-[var(--line2,rgba(194,196,201,.2))]'
                  }`}
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[var(--line,rgba(194,196,201,.12))] text-xs text-[var(--t3,#a39ba6)]"
                  >
                    {(name || '?').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--t1,#f4edf7)]">
                      {name || t.fallbackPlayerName}
                    </span>
                    <span className="block text-xs text-[var(--t3,#a39ba6)]">
                      {roleLabel(m.role)}
                      {m.battle_tag && ` · ${m.battle_tag}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <SectionLabel>{t.targetTeam}</SectionLabel>
        <TeamSearchInput
          value={v.search}
          onChange={(s) => form.setValue('search', s)}
          invalid={Boolean(form.errors.teamId)}
          placeholder={t.searchTeam}
          label={t.targetTeam}
        />
        <TeamPicker
          teams={teams}
          value={v.teamId}
          onChange={(id) => form.setValue('teamId', id)}
          loading={teamsLoading}
          accentColor="purple"
          label={t.targetTeam}
          emptyLabel={t.emptyJoinable}
        />
      </div>

      <div>
        <SectionLabel>{t.desiredRole}</SectionLabel>
        <div
          role="radiogroup"
          aria-label={t.roleGroupAria}
          className="flex gap-3"
        >
          {ROLES.map((role) => (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={v.desiredRole === role}
              onClick={() => form.setValue('desiredRole', role)}
              className={`flex-1 rounded-[var(--r-ctrl,4px)] border px-4 py-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--or,#b467d1)] ${
                v.desiredRole === role
                  ? 'border-[var(--or,#b467d1)] bg-[var(--s3,#2f2732)] text-[var(--t1,#f4edf7)]'
                  : 'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] text-[var(--t3,#a39ba6)]'
              }`}
            >
              {roleLabel(role)}
            </button>
          ))}
        </div>
      </div>

      <MessageField
        form={form}
        label={isPropose ? t.msgToTargetCaptain : t.msgToCaptain}
        placeholder={t.defaultMsgPlaceholder}
      />

      {error && <ErrorBanner message={error} />}

      <SubmitButton
        disabled={form.isSubmitting || !v.teamId || (isPropose && !v.playerId)}
        loading={form.isSubmitting}
        label={isPropose ? t.submitProposeTransfer : t.submitSelfTransfer}
        loadingLabel={t.sending}
      />
    </form>
  );
}

export default function TransferRequestForm({ screen }: Props) {
  const { t, hasTeam, isCaptain, canProposeTransfer } = screen;
  const mode = screen.transfer.form.values.mode;

  if (!hasTeam) {
    return (
      <Notice title={t.noTeamTitle}>
        <p>
          {t.noTeamTransfer}{' '}
          <Link href="/player/join-team" className="underline">
            {t.joinTeam}
          </Link>
        </p>
      </Notice>
    );
  }

  return (
    <>
      {/* Bascule réservée à qui peut proposer pour autrui (`manage_roster`). */}
      {canProposeTransfer && (
        <Tabs
          tabs={[
            { id: 'propose', label: t.proposeTransferMode },
            { id: 'self', label: t.selfTransferMode },
          ]}
          active={mode}
          onChange={(id) => screen.transfer.switchMode(id as TransferMode)}
          ariaLabel={t.transferModeAria}
          idBase="transfer-mode"
          className="mb-6"
        />
      )}

      <div
        role="tabpanel"
        id={tabPanelId('transfer-mode', mode)}
        aria-labelledby={tabButtonId('transfer-mode', mode)}
      >
        {/* Une capitaine doit d'abord passer le capitanat. */}
        {isCaptain && mode === 'self' && (
          <Notice title={t.captainTitle}>
            <p>{t.captainBlocked}</p>
          </Notice>
        )}
        {canProposeTransfer && mode === 'propose' && (
          <TransferForm screen={screen} mode="propose" />
        )}
        {!isCaptain && mode === 'self' && (
          <TransferForm screen={screen} mode="self" />
        )}
      </div>
    </>
  );
}
