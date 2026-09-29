// features/player/team/ui/MemberIdentity.tsx — la partie « qui » d'une ligne
// du roster : initiales, nom, BattleTag copiable, poste, niveau, badges
// Battle.net / Discord, rôle. Visible de TOUTE membre.

import CopyButton from '@/components/player/CopyButton';
import SkillRatingBadge from '@/components/Team/SkillRatingBadge';
import SpecialtyBadge from '@/components/Team/SpecialtyBadge';
import { format } from '@/lib/i18n/useT';
import type { ManagedTeamMemberDto } from '../schemas';
import type { ManageTeamTexts } from '../hooks/useManageTeamScreen';

const BADGE =
  'shrink-0 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold';

export default function MemberIdentity({
  t,
  member: m,
  label,
  roleLabel,
  locale,
}: {
  t: ManageTeamTexts;
  member: ManagedTeamMemberDto;
  label: string;
  roleLabel: string;
  locale: string;
}) {
  const checkedAt = m.discord_checked_at
    ? new Date(m.discord_checked_at).toLocaleString(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : null;

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center flex-shrink-0">
        <span className="text-xs text-gray-400">
          {label.slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm truncate">{label}</span>
          {m.battle_tag && (
            <CopyButton
              value={m.battle_tag}
              label={t.copyBattleTag}
              className="h-5 w-5 shrink-0"
            />
          )}
          <SpecialtyBadge specialty={m.specialty} className="shrink-0" />
          {/* Ne rend rien sans niveau déclaré. */}
          <SkillRatingBadge skillRating={m.skill_rating} className="shrink-0" />
          {/* Vérification Battle.net : seulement si l'API l'expose. */}
          {'battle_tag_verified_at' in m &&
            (m.battle_tag_verified_at ? (
              <span
                title={t.verifiedBadgeTitle}
                className={`${BADGE} gap-0.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-300`}
              >
                <span aria-hidden="true">✓</span>
                {t.verifiedBadge}
              </span>
            ) : (
              <span
                title={t.unverifiedBadgeTitle}
                className={`${BADGE} border-white/15 bg-white/5 text-gray-400`}
              >
                {t.unverifiedBadge}
              </span>
            ))}
          {/* Discord non lié — le MANQUE seulement ; `=== false` : l'absence
              d'information n'est pas un manque constaté. */}
          {m.discord_linked === false && (
            <span
              title={t.discordUnlinkedBadgeTitle}
              className={`${BADGE} border-amber-500/40 bg-amber-500/10 text-amber-300`}
            >
              {t.discordUnlinkedBadge}
            </span>
          )}
          {/* A quitté le serveur (compte lié) : exclusif du précédent. */}
          {m.discord_linked === true && m.discord_in_guild === false && (
            <span
              title={
                checkedAt
                  ? `${t.discordLeftBadgeTitle} ${format(t.discordCheckedAt, {
                      date: checkedAt,
                    })}`
                  : t.discordLeftBadgeTitle
              }
              className={`${BADGE} border-red-500/40 bg-red-500/10 text-red-300`}
            >
              {t.discordLeftBadge}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400">
          {m.is_captain && (
            <>
              <span className="text-purple-300">{t.captain}</span>
              {' · '}
            </>
          )}
          {roleLabel}
        </div>
      </div>
    </div>
  );
}
