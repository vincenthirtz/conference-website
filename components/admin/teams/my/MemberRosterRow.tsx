import React from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { isNonPlayingTeamRole } from '@/utils/teams/roleKind';
import SkillRatingBadge from '@/components/Team/SkillRatingBadge';
import SpecialtyBadge from '@/components/Team/SpecialtyBadge';
import type { Member } from './types';
import nsAdminTeamsMy from '@/lib/i18n/locales/admin-fr/adminTeamsMy';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

/** Bouton-icône d'action de ligne (même allure que MemberRow). */
const ICON_BTN =
  'p-1.5 rounded-[var(--r-ctrl,4px)] text-[var(--t3,#a39ba6)] hover:bg-[var(--s3,#2f2732)] hover:text-[var(--t1,#f4edf7)] transition-colors';

type MemberRosterRowProps = {
  member: Member;
  canEdit: boolean;
  /** Nombre total de membres (condition d'affichage du bouton « échanger »). */
  membersCount: number;
  /** Édition inline du BattleTag active pour cette ligne. */
  isEditingTag: boolean;
  /** Brouillon du BattleTag (uniquement pertinent quand `isEditingTag`). */
  battleTagDraft: string;
  /** Une action réseau est en cours pour ce membre. */
  busy: boolean;
  /** Un échange est en cours quelque part dans le roster. */
  swapMode: boolean;
  /** Cette ligne est la source de l'échange en cours. */
  isSwapSource: boolean;
  /**
   * Brouillon de SR pour CETTE ligne (`undefined` = pas de saisie en cours, on
   * affiche la valeur enregistrée). Le champ est libre, donc il ne peut pas
   * enregistrer à chaque frappe comme le fait un <select>.
   */
  skillRatingDraft?: string;
  onStartEditBattleTag: (member: Member) => void;
  onBattleTagDraftChange: (value: string) => void;
  onSkillRatingDraftChange: (memberId: string, value: string) => void;
  onSaveSkillRating: (member: Member, value: string) => void;
  onSaveBattleTag: (member: Member, draft: string) => void;
  onCancelEditBattleTag: () => void;
  onToggleSubstitute: (member: Member) => void;
  onStartSwap: (member: Member) => void;
  onCancelSwap: () => void;
  onSwapWith: (member: Member) => void;
  onTransferCaptain: (member: Member) => void;
};

function MemberRosterRowInner({
  member: m,
  canEdit,
  membersCount,
  isEditingTag,
  battleTagDraft,
  skillRatingDraft,
  busy,
  swapMode,
  isSwapSource,
  onStartEditBattleTag,
  onBattleTagDraftChange,
  onSkillRatingDraftChange,
  onSaveSkillRating,
  onSaveBattleTag,
  onCancelEditBattleTag,
  onToggleSubstitute,
  onStartSwap,
  onCancelSwap,
  onSwapWith,
  onTransferCaptain,
}: MemberRosterRowProps) {
  const t = useAdminT(nsAdminTeamsMy);

  const isCaptain = m.captain || m.is_captain;
  // Encadrement : manager ET coach. Ne pas se limiter à 'manager' — un coach
  // avait exactement l'apparence d'une joueuse.
  const isStaff = !isCaptain && isNonPlayingTeamRole(m.role);
  const isManager = isStaff;
  // « Le Ruban » : capitaine = liseré orchidée (comme MemberRow), encadrement
  // = contour orchidée pâle, joueuse = simple surface.
  const containerClass = isCaptain
    ? 'bg-[var(--s2,#1d1520)] border-l-[3px] border-[var(--or,#b467d1)]'
    : isManager
      ? 'bg-[var(--s2,#1d1520)] border border-[rgba(180,103,209,.25)]'
      : 'bg-[var(--s2,#1d1520)] border border-transparent hover:border-[var(--line2,rgba(194,196,201,.2))]';
  const iconBgClass = isCaptain
    ? 'bg-[var(--s3,#2f2732)] text-[var(--or-200,#eec4ff)]'
    : isManager
      ? 'bg-[var(--s3,#2f2732)] text-[var(--t2,#c7bfca)]'
      : 'bg-[var(--s3,#2f2732)] text-[var(--t3,#a39ba6)]';
  const isSubstitute = !!m.is_substitute;

  return (
    <div
      data-testid={`member-row-${m.id}`}
      className={`p-3 rounded-[var(--r-ctrl,4px)] transition-colors ${containerClass} ${
        isSwapSource ? 'ring-2 ring-[rgba(180,103,209,.6)]' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-[var(--r-ctrl,4px)] flex items-center justify-center flex-shrink-0 ${iconBgClass}`}
        >
          {isCaptain ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
            </svg>
          ) : isManager ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.5 7.5L23 11l-5.5 5 1.3 7.5L12 19.5 5.2 23.5 6.5 16 1 11l7.5-1.5L12 2z" />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[var(--t1,#f4edf7)] font-semibold truncate">
              {m.display_name || m.user_id || m.id}
            </span>
            {isCaptain && <Chip tone="brand">{t.captain}</Chip>}
            {isStaff && (
              <Chip>
                {(m.role || '').toLowerCase() === 'coach' ? t.coach : t.manager}
              </Chip>
            )}
            {isSubstitute && (
              <Chip data-testid="substitute-badge">{t.substitute}</Chip>
            )}
          </div>
          <div className="text-xs text-[var(--t3,#a39ba6)] truncate">
            {m.role || t.defaultRole}
            {m.battle_tag && !isEditingTag && (
              <span className="font-mono text-[var(--t2,#c7bfca)] ml-2">
                {m.battle_tag}
              </span>
            )}
            <SpecialtyBadge
              specialty={m.specialty}
              className="ml-2 align-middle"
            />
            <SkillRatingBadge
              skillRating={m.skill_rating}
              className="ml-2 align-middle"
            />
          </div>
        </div>

        {/* Per-member actions */}
        {canEdit && !isEditingTag && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* SR : rôles JOUANTS seulement — le niveau d'une coach n'entre
                pas dans la moyenne d'équipe, lui offrir le champ laisserait
                croire le contraire. Enregistre au blur ou à Entrée. */}
            {!isNonPlayingTeamRole(m.role) && (
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={5000}
                step={50}
                value={
                  skillRatingDraft ??
                  (m.skill_rating != null ? String(m.skill_rating) : '')
                }
                onChange={(e) => onSkillRatingDraftChange(m.id, e.target.value)}
                onBlur={(e) => onSaveSkillRating(m, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                disabled={busy}
                aria-label={t.skillRatingLabel}
                title={t.skillRatingLabel}
                placeholder="3500"
                className="w-20 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-2 py-1 text-xs text-[var(--t1,#f4edf7)] placeholder:text-[var(--t4,#807984)] focus:border-[var(--or,#b467d1)] focus:outline-none disabled:opacity-50"
              />
            )}
            {swapMode ? (
              isSwapSource ? (
                <AdminButton variant="ghost" size="xs" onClick={onCancelSwap}>
                  {t.cancel}
                </AdminButton>
              ) : (
                <AdminButton
                  variant="secondary"
                  size="xs"
                  data-testid={`swap-target-${m.id}`}
                  disabled={busy}
                  onClick={() => onSwapWith(m)}
                >
                  {t.swapHere}
                </AdminButton>
              )
            ) : (
              <>
                <button
                  type="button"
                  title={t.editBattleTagTitle}
                  data-testid={`edit-battletag-${m.id}`}
                  onClick={() => onStartEditBattleTag(m)}
                  className={ICON_BTN}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  title={
                    isSubstitute ? t.markStarterTitle : t.markSubstituteTitle
                  }
                  data-testid={`toggle-substitute-${m.id}`}
                  disabled={busy}
                  onClick={() => onToggleSubstitute(m)}
                  className={`p-1.5 rounded-[var(--r-ctrl,4px)] transition-colors disabled:opacity-50 ${
                    isSubstitute
                      ? 'text-[var(--or-200,#eec4ff)] hover:bg-[rgba(180,103,209,.12)]'
                      : ICON_BTN
                  }`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                </button>
                {!isCaptain && membersCount > 1 && (
                  <button
                    type="button"
                    title={t.startSwapTitle}
                    data-testid={`start-swap-${m.id}`}
                    onClick={() => onStartSwap(m)}
                    className={ICON_BTN}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                      />
                    </svg>
                  </button>
                )}
                {!isCaptain && m.user_id && (
                  <button
                    type="button"
                    title={t.makeCaptainTitle}
                    data-testid={`make-captain-${m.id}`}
                    disabled={busy}
                    onClick={() => onTransferCaptain(m)}
                    className="p-1.5 rounded-[var(--r-ctrl,4px)] text-[var(--t3,#a39ba6)] hover:bg-[rgba(180,103,209,.12)] hover:text-[var(--or-200,#eec4ff)] transition-colors disabled:opacity-50"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Inline BattleTag editor */}
      {canEdit && isEditingTag && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={battleTagDraft}
            onChange={(e) => onBattleTagDraftChange(e.target.value)}
            placeholder={t.battleTagPlaceholder}
            autoFocus
            data-testid={`battletag-input-${m.id}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveBattleTag(m, battleTagDraft);
              if (e.key === 'Escape') onCancelEditBattleTag();
            }}
            className="flex-1 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] placeholder:text-[var(--t4,#807984)] focus:border-[var(--or,#b467d1)] focus:outline-none"
          />
          <div className="flex gap-2">
            <AdminButton
              variant="secondary"
              size="sm"
              data-testid={`save-battletag-${m.id}`}
              disabled={busy}
              onClick={() => onSaveBattleTag(m, battleTagDraft)}
            >
              {busy ? '...' : t.saveShort}
            </AdminButton>
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={onCancelEditBattleTag}
            >
              {t.cancel}
            </AdminButton>
          </div>
        </div>
      )}
    </div>
  );
}

export const MemberRosterRow = React.memo(MemberRosterRowInner);
