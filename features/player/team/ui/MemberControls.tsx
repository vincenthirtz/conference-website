// features/player/team/ui/MemberControls.tsx — leviers d'une ligne du
// roster, réservés à `manage_roster`. Les attributs d'une fiche (BattleTag,
// SR, poste) s'éditent pour TOUT LE MONDE, capitaine comprise ; seules les
// actions de HIÉRARCHIE (rôle, droits délégués, capitanat, exclusion)
// ignorent la capitaine.

import { format } from '@/lib/i18n/useT';
import type nsOverwatchRank from '@/lib/i18n/locales/fr/overwatchRank';
import { isNonPlayingTeamRole } from '@/utils/teams/roleKind';
import type { ManagedTeamMemberDto } from '../schemas';
import type {
  CommitResult,
  ManageTeamTexts,
} from '../hooks/useManageTeamScreen';
import InlineCommitInput from './InlineCommitInput';

const FIELD =
  'bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-400 disabled:opacity-50';
const PILL =
  'px-2 py-1 rounded-lg text-xs font-semibold transition disabled:opacity-50';

export type MemberControlsProps = {
  t: ManageTeamTexts;
  tRank: typeof nsOverwatchRank.fr;
  member: ManagedTeamMemberDto;
  label: string;
  /** Un geste est en cours (tous les champs se figent). */
  busy: boolean;
  /** Clé du geste en cours (`remove-<id>`…). */
  actionLoading: string | null;
  confirmingRemoval: boolean;
  roleLocked: boolean;
  hasCaptain: boolean;
  rightsOpen: boolean;
  onCommitBattleTag: (raw: string) => Promise<CommitResult>;
  onCommitSkillRating: (raw: string) => Promise<CommitResult>;
  onSpecialty: (value: string) => void;
  onRole: (role: string) => void;
  onToggleRights: () => void;
  onPromote: () => void;
  onAskRemoval: () => void;
  onCancelRemoval: () => void;
  onRemove: () => void;
};

export default function MemberControls(p: MemberControlsProps) {
  const { t, tRank, member: m, busy } = p;
  const removing = p.actionLoading === `remove-${m.id}`;

  if (p.confirmingRemoval) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-red-200 basis-full sm:basis-auto">
            {format(t.removeConfirm, { name: p.label })}
            <span className="block text-[11px] text-red-300/80 mt-0.5">
              {t.removeConsequences}
            </span>
          </span>
          <button
            type="button"
            onClick={p.onRemove}
            disabled={removing}
            className={`${PILL} bg-red-600 hover:bg-red-500`}
          >
            {t.confirmRemove}
          </button>
          <button
            type="button"
            onClick={p.onCancelRemoval}
            disabled={removing}
            className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs transition disabled:opacity-50"
          >
            {t.cancelRemove}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {/* BattleTag : la capitaine le connaît mieux que quiconque. */}
      <InlineCommitInput
        type="text"
        serverValue={m.battle_tag || ''}
        onCommit={p.onCommitBattleTag}
        disabled={busy}
        aria-label={t.battleTagLabel}
        title={t.battleTagLabel}
        placeholder="Pseudo#1234"
        maxLength={64}
        className={`w-32 ${FIELD}`}
      />
      {/* SR : rôles JOUANTS seulement — le niveau d'une coach n'entre pas
          dans la moyenne. */}
      {!isNonPlayingTeamRole(m.role) && (
        <InlineCommitInput
          type="number"
          inputMode="numeric"
          min={0}
          max={5000}
          step={50}
          serverValue={m.skill_rating != null ? String(m.skill_rating) : ''}
          onCommit={p.onCommitSkillRating}
          disabled={busy}
          aria-label={tRank.fieldLabel}
          title={tRank.fieldLabel}
          placeholder={tRank.fieldPlaceholder}
          className={`w-20 ${FIELD}`}
        />
      )}
      <select
        value={m.specialty || ''}
        onChange={(e) => p.onSpecialty(e.target.value)}
        disabled={busy}
        aria-label={t.specialtyLabel}
        title={t.specialtyLabel}
        className={FIELD}
      >
        <option value="">{t.specialtyNone}</option>
        <option value="tank">{t.specialtyTank}</option>
        <option value="dps">{t.specialtyDps}</option>
        <option value="support">{t.specialtySupport}</option>
        <option value="flex">{t.specialtyFlex}</option>
      </select>
      {!m.is_captain && (
        <>
          <select
            value={m.role || 'player'}
            onChange={(e) => p.onRole(e.target.value)}
            disabled={busy || p.roleLocked}
            aria-label={t.roleSelectLabel}
            title={p.roleLocked ? t.roleLockedPrivileged : t.roleSelectLabel}
            className={FIELD}
          >
            <option value="player">{t.optionPlayer}</option>
            <option value="substitute">{t.optionSubstitute}</option>
            <option value="coach">{t.optionCoach}</option>
            <option value="manager">{t.roleManager}</option>
          </select>
          {/* Délégation (J3) : confier une responsabilité sans changer le
              rôle — la règle appliquée par la route. */}
          {m.user_id && (
            <button
              type="button"
              onClick={p.onToggleRights}
              className={`${PILL} border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-200`}
              aria-expanded={p.rightsOpen}
            >
              {p.rightsOpen ? t.delegateClose : t.delegateOpen}
            </button>
          )}
          <button
            type="button"
            onClick={p.onPromote}
            disabled={busy || !m.user_id}
            className={`${PILL} border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300`}
            title={p.hasCaptain ? t.promote : t.designate}
            aria-label={p.hasCaptain ? t.promote : t.designate}
          >
            {p.hasCaptain ? t.promote : t.designate}
          </button>
          <button
            type="button"
            onClick={p.onAskRemoval}
            disabled={busy}
            className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition disabled:opacity-50"
            title={t.removeTitle}
            aria-label={t.removeTitle}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
