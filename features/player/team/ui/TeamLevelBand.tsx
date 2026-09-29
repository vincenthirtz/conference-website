// features/player/team/ui/TeamLevelBand.tsx — niveau de l'équipe (SR
// d'ensemble déclaré, sinon moyenne des fiches) et, avec `manage_team_info`,
// son identité : SR déclaré, nom, sigle, pays — enregistrés au blur.
// La bande n'apparaît que s'il y a un chiffre OU quelqu'un pour en saisir un.

import SkillRatingBadge from '@/components/Team/SkillRatingBadge';
import { format } from '@/lib/i18n/useT';
import type nsOverwatchRank from '@/lib/i18n/locales/fr/overwatchRank';
import { resolveTeamSkillRating } from '@/utils/overwatchRank';
import type {
  ManagedTeamInfoDto,
  ManagedTeamMemberDto,
  TeamIdentityField,
} from '../schemas';
import type {
  CommitResult,
  ManageTeamTexts,
} from '../hooks/useManageTeamScreen';
import InlineCommitInput from './InlineCommitInput';

const FIELD =
  'bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-400 disabled:opacity-50';

export default function TeamLevelBand({
  t,
  tRank,
  team,
  members,
  editable,
  busy,
  onCommitSkillRating,
  onCommitIdentity,
}: {
  t: ManageTeamTexts;
  tRank: typeof nsOverwatchRank.fr;
  team: ManagedTeamInfoDto;
  members: ManagedTeamMemberDto[];
  editable: boolean;
  busy: boolean;
  onCommitSkillRating: (raw: string) => Promise<CommitResult>;
  onCommitIdentity: (
    field: TeamIdentityField,
    raw: string
  ) => Promise<CommitResult>;
}) {
  const skill = resolveTeamSkillRating(team.skill_rating, members);
  if (!skill && !editable) return null;

  const identity = [
    {
      field: 'name' as const,
      label: t.teamNameLabel,
      placeholder: t.teamNamePlaceholder,
      maxLength: 100,
    },
    {
      field: 'short_name' as const,
      label: t.teamShortNameLabel,
      placeholder: t.teamShortNamePlaceholder,
      maxLength: 16,
    },
    {
      field: 'country' as const,
      label: t.teamCountryLabel,
      placeholder: t.teamCountryPlaceholder,
      maxLength: 56,
    },
  ];

  return (
    <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-gray-400">
          {tRank.teamAverageLabel}
        </span>
        {skill ? (
          <>
            <SkillRatingBadge skillRating={skill.average} size="md" />
            {/* D'OÙ vient le chiffre : déclaré, ou moyenne de N fiches. */}
            <span className="text-xs text-gray-400">
              {skill.source === 'declared'
                ? tRank.teamDeclaredBasis
                : format(
                    skill.count === skill.eligible
                      ? tRank.teamAverageComplete
                      : tRank.teamAverageBasis,
                    {
                      count: String(skill.count),
                      eligible: String(skill.eligible),
                    }
                  )}
            </span>
          </>
        ) : (
          <span className="text-xs text-gray-400">{tRank.teamNotDeclared}</span>
        )}
      </div>

      {editable && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="team-skill-rating" className="text-xs text-gray-400">
            {tRank.teamDeclaredLabel}
          </label>
          <InlineCommitInput
            id="team-skill-rating"
            type="number"
            inputMode="numeric"
            min={0}
            max={5000}
            step={50}
            serverValue={
              team.skill_rating != null ? String(team.skill_rating) : ''
            }
            onCommit={onCommitSkillRating}
            disabled={busy}
            placeholder={tRank.fieldPlaceholder}
            className={`w-24 ${FIELD}`}
          />
          <span className="text-[11px] text-gray-400">
            {tRank.teamDeclaredHint}
          </span>
        </div>
      )}

      {editable && (
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-white/10 pt-3 sm:grid-cols-3">
          {identity.map(({ field, label, placeholder, maxLength }) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-400">{label}</span>
              <InlineCommitInput
                type="text"
                maxLength={maxLength}
                serverValue={team[field] ?? ''}
                onCommit={(raw) => onCommitIdentity(field, raw)}
                disabled={busy}
                placeholder={placeholder}
                className={FIELD}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
