import React from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { TeamMemberRow } from '@/types/admin';
import nsAdminTeamsMemberRow from '@/lib/i18n/locales/admin-fr/adminTeamsMemberRow';
import SkillRatingBadge from '@/components/Team/SkillRatingBadge';
import SpecialtyBadge from '@/components/Team/SpecialtyBadge';
import Chip from '@/features/admin/_shared/ui/Chip';

function formatVerifiedDate(d: string | null | undefined): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

type MemberRowProps = {
  member: TeamMemberRow;
  /**
   * 'roster' = joueuse active, 'sub' = remplaçante, 'staff' = encadrement
   * (coach / manager). Pilote l'apparence ET l'identité affichée : le staff
   * n'a pas forcément de BattleTag, on l'identifie par son pseudo.
   */
  variant: 'roster' | 'sub' | 'staff';
  /** Capitaine de l'équipe (roster uniquement). */
  isCaptain: boolean;
  isSelected: boolean;
  /** Un échange est en cours (swapSource non nul). */
  swapActive: boolean;
  /** Cette ligne est la source de l'échange en cours. */
  isSwapSource: boolean;
  /** Cette ligne est une cible d'échange cliquable. */
  isSwapTarget: boolean;
  /** Le bouton "Échanger" doit être affiché (roster: subs présents, sub: roster présent). */
  canSwap: boolean;
  onToggleSelected: (id: string) => void;
  onStartSwap: (member: TeamMemberRow) => void;
  onSwapWithSource: (member: TeamMemberRow) => void;
  onSetCaptain: (member: TeamMemberRow) => void;
  onEdit: (member: TeamMemberRow) => void;
  onDelete: (member: TeamMemberRow) => void;
};

function MemberRowComponent({
  member,
  variant,
  isCaptain,
  isSelected,
  swapActive,
  isSwapSource,
  isSwapTarget,
  canSwap,
  onToggleSelected,
  onStartSwap,
  onSwapWithSource,
  onSetCaptain,
  onEdit,
  onDelete,
}: MemberRowProps) {
  const t = useAdminT(nsAdminTeamsMemberRow);

  // Identité affichée. Le roster jouant est identifié par son BattleTag ;
  // l'encadrement n'en a pas forcément (c'est même la règle : le BattleTag
  // n'est exigé que des rôles qui jouent, cf. utils/teams/addMember), donc on
  // met le pseudo en tête pour ne pas afficher une ligne vide.
  const label =
    variant === 'staff'
      ? member.display_name || member.battle_tag || t.memberFallback
      : member.battle_tag || member.display_name || t.memberFallback;

  // Badges d'identité BattleTag (anti-smurf) — affichés seulement si un
  // battle_tag est renseigné. Pill accessible (texte + couleur), date de vérif
  // en tooltip, + flag de mismatch « compte vérifié ≠ tag roster ».
  const verifiedBadges = member.battle_tag ? (
    <>
      {member.battle_tag_verified_at ? (
        <Chip
          tone="ok"
          title={format(t.battleTagVerifiedTitle, {
            date: formatVerifiedDate(member.battle_tag_verified_at),
          })}
        >
          {t.battleTagVerified}
        </Chip>
      ) : (
        <Chip title={t.battleTagUnverifiedTitle}>{t.battleTagUnverified}</Chip>
      )}
      {member.battle_tag_mismatch && (
        <Chip tone="warn" title={t.battleTagMismatchTitle}>
          {t.battleTagMismatch}
        </Chip>
      )}
    </>
  ) : null;

  const containerClassName =
    variant === 'staff'
      ? 'flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] px-4 py-3 group bg-[var(--s2,#1d1520)] border border-[rgba(180,103,209,.25)]'
      : variant === 'roster'
        ? `flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] px-4 py-3 group ${
            isCaptain
              ? 'bg-[var(--s2,#1d1520)] border-l-[3px] border-[var(--or,#b467d1)]'
              : isSwapSource
                ? 'bg-[rgba(180,103,209,.1)] border border-[rgba(180,103,209,.45)]'
                : 'bg-[var(--s2,#1d1520)]'
          } ${isSwapTarget ? 'cursor-pointer hover:border-[var(--or,#b467d1)] hover:bg-[rgba(180,103,209,.08)] border border-transparent' : ''}`
        : `flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] px-4 py-3 group ${
            isSwapSource
              ? 'bg-[rgba(180,103,209,.1)] border border-[rgba(180,103,209,.45)]'
              : 'bg-[var(--s1,#100812)] border border-dashed border-[var(--line2,rgba(194,196,201,.2))]'
          } ${isSwapTarget ? 'cursor-pointer hover:border-[var(--or,#b467d1)] hover:bg-[rgba(180,103,209,.08)]' : ''}`;

  return (
    <div
      className={containerClassName}
      onClick={isSwapTarget ? () => onSwapWithSource(member) : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">
        {!swapActive && (
          <input
            type="checkbox"
            data-testid={`member-checkbox-${member.id}`}
            checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelected(member.id)}
            className="h-4 w-4 flex-shrink-0 accent-[var(--or,#b467d1)]"
          />
        )}
        {variant === 'staff' ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-ctrl,4px)] bg-[var(--s3,#2f2732)] text-[var(--t2,#c7bfca)]">
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
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
              />
            </svg>
          </div>
        ) : variant === 'roster' ? (
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-[var(--r-ctrl,4px)] bg-[var(--s3,#2f2732)] ${
              isCaptain
                ? 'text-[var(--or-200,#eec4ff)]'
                : 'text-[var(--t3,#a39ba6)]'
            }`}
          >
            {isCaptain ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
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
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-ctrl,4px)] bg-[var(--s3,#2f2732)] text-[var(--t4,#807984)]">
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
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
          </div>
        )}
        <div className="min-w-0">
          {variant === 'staff' ? (
            <div className="flex flex-wrap items-center gap-2 truncate text-sm font-medium text-[var(--t1,#f4edf7)]">
              {label}
              {member.battle_tag && (
                <span className="font-mono text-xs text-[var(--t3,#a39ba6)]">
                  {member.battle_tag}
                </span>
              )}
              {verifiedBadges}
            </div>
          ) : variant === 'roster' ? (
            <div className="flex flex-wrap items-center gap-2 truncate text-sm font-medium text-[var(--t1,#f4edf7)]">
              {label}
              {isCaptain && <Chip tone="brand">{t.captain}</Chip>}
              {verifiedBadges}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 truncate text-sm font-medium text-[var(--t2,#c7bfca)]">
              {label}
              <Chip>{t.substitute}</Chip>
              {verifiedBadges}
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <Chip>{member.role}</Chip>
            {/* Poste (tank / dps / support). Il n'était affiché NULLE PART sur
                cet écran : la ligne montrait le rôle d'équipe, qui dit
                « joueuse », jamais à quel poste. */}
            <SpecialtyBadge specialty={member.specialty} />
            {/* Niveau déclaré. Rien à afficher quand il n'y en a pas. */}
            <SkillRatingBadge skillRating={member.skill_rating} />
            <span className="truncate font-mono text-xs text-[var(--t4,#807984)]">
              {member.user_id.slice(0, 8)}...
            </span>
          </div>
        </div>
      </div>
      {!swapActive && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canSwap && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartSwap(member);
              }}
              className="rounded-[var(--r-ctrl,4px)] p-2 text-[var(--t3,#a39ba6)] transition-colors hover:bg-[var(--s3,#2f2732)] hover:text-[var(--or-200,#eec4ff)]"
              title={
                variant === 'roster'
                  ? t.swapWithSubTitle
                  : t.swapWithRosterTitle
              }
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
          )}
          {variant === 'roster' && !isCaptain && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetCaptain(member);
              }}
              className="rounded-[var(--r-ctrl,4px)] p-2 text-[var(--t3,#a39ba6)] transition-colors hover:bg-[var(--s3,#2f2732)] hover:text-[var(--or-200,#eec4ff)]"
              title={t.setCaptainTitle}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(member);
            }}
            className="rounded-[var(--r-ctrl,4px)] p-2 text-[var(--t3,#a39ba6)] transition-colors hover:bg-[var(--s3,#2f2732)] hover:text-[var(--t1,#f4edf7)]"
            title={t.editTitle}
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
            onClick={(e) => {
              e.stopPropagation();
              onDelete(member);
            }}
            className="rounded-[var(--r-ctrl,4px)] p-2 text-[var(--t3,#a39ba6)] transition-colors hover:bg-[rgba(255,107,107,.08)] hover:text-[var(--err,#ff6b6b)]"
            title={t.deleteTitle}
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      )}
      {isSwapTarget && (
        <span className="text-xs font-medium text-[var(--or-200,#eec4ff)]">
          {t.clickToSwap}
        </span>
      )}
    </div>
  );
}

const MemberRow = React.memo(MemberRowComponent);

export default MemberRow;
