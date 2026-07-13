import React from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { TeamMemberRow } from '@/types/admin';

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
  /** 'roster' = joueur actif, 'sub' = remplaçant. Pilote l'apparence. */
  variant: 'roster' | 'sub';
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
  const t = useAdminT('adminTeamsMemberRow');

  // Badges d'identité BattleTag (anti-smurf) — affichés seulement si un
  // battle_tag est renseigné. Pill accessible (texte + couleur), date de vérif
  // en tooltip, + flag de mismatch « compte vérifié ≠ tag roster ».
  const verifiedBadges = member.battle_tag ? (
    <>
      {member.battle_tag_verified_at ? (
        <span
          title={format(t.battleTagVerifiedTitle, {
            date: formatVerifiedDate(member.battle_tag_verified_at),
          })}
          className="px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-600/25 text-emerald-200 border border-emerald-400/40"
        >
          {t.battleTagVerified}
        </span>
      ) : (
        <span
          title={t.battleTagUnverifiedTitle}
          className="px-1.5 py-0.5 rounded text-xs bg-neutral-700/60 text-neutral-300 border border-neutral-600"
        >
          {t.battleTagUnverified}
        </span>
      )}
      {member.battle_tag_mismatch && (
        <span
          title={t.battleTagMismatchTitle}
          className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/40"
        >
          {t.battleTagMismatch}
        </span>
      )}
    </>
  ) : null;

  const containerClassName =
    variant === 'roster'
      ? `flex items-center justify-between gap-3 rounded-xl px-4 py-3 group ${
          isCaptain
            ? 'bg-amber-900/20 border border-amber-500/30'
            : isSwapSource
              ? 'bg-blue-900/30 border border-blue-500/40'
              : 'bg-neutral-900/50'
        } ${isSwapTarget ? 'cursor-pointer hover:border-blue-500/40 hover:bg-blue-900/20 border border-transparent' : ''}`
      : `flex items-center justify-between gap-3 rounded-xl px-4 py-3 group ${
          isSwapSource
            ? 'bg-blue-900/30 border border-blue-500/40'
            : 'bg-neutral-900/30 border border-dashed border-neutral-700'
        } ${isSwapTarget ? 'cursor-pointer hover:border-blue-500/40 hover:bg-blue-900/20' : ''}`;

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
            className="h-4 w-4 rounded border-neutral-600 bg-neutral-700 flex-shrink-0"
          />
        )}
        {variant === 'roster' ? (
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isCaptain
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-neutral-700 text-neutral-400'
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
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-neutral-800 text-neutral-500">
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
          {variant === 'roster' ? (
            <div className="font-medium text-sm truncate flex items-center gap-2 flex-wrap">
              {member.battle_tag || t.memberFallback}
              {isCaptain && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                  {t.captain}
                </span>
              )}
              {verifiedBadges}
            </div>
          ) : (
            <div className="font-medium text-sm truncate flex items-center gap-2 flex-wrap text-neutral-300">
              {member.battle_tag || t.memberFallback}
              <span className="px-1.5 py-0.5 rounded text-xs bg-neutral-700 text-neutral-400 border border-neutral-600">
                {t.substitute}
              </span>
              {verifiedBadges}
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {member.role}
            </span>
            <span className="text-xs text-neutral-500 font-mono truncate">
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
              className="p-2 rounded-lg hover:bg-blue-900/50 text-neutral-400 hover:text-blue-400 transition-colors"
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
              className="p-2 rounded-lg hover:bg-amber-900/50 text-neutral-400 hover:text-amber-400 transition-colors"
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
            className="p-2 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
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
            className="p-2 rounded-lg hover:bg-red-900/50 text-neutral-400 hover:text-red-400 transition-colors"
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
        <span className="text-xs text-blue-400 font-medium">
          {t.clickToSwap}
        </span>
      )}
    </div>
  );
}

const MemberRow = React.memo(MemberRowComponent);

export default MemberRow;
