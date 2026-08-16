// components/Team/MemberProfileEditor.tsx
// Inline editor for a single team_member's display fields. Used by the
// team edit page (captain/manager view): each row owns its save button so
// edits can be saved member-by-member without resubmitting the whole team
// form.

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useT, format } from '@/lib/i18n/useT';
import {
  MEMBER_DISPLAY_NAME_MAX,
  MEMBER_PRONOUNS_MAX,
  MEMBER_TAGLINE_MAX,
  MEMBER_SPECIALTIES,
  type MemberSpecialty,
} from '@/utils/markdown/teamPublicMarkdown';
import nsMemberProfileEditor from '@/lib/i18n/locales/fr/memberProfileEditor';

const HANDLE_MAX = 80;

type MemberEditorDict = typeof nsMemberProfileEditor.fr;

export type EditableMember = {
  id: string;
  user_id: string;
  battle_tag: string | null;
  role: string | null;
  is_captain: boolean;
  is_substitute: boolean;
  display_name: string | null;
  specialty: string | null;
  avatar_url: string | null;
  pronouns: string | null;
  tagline: string | null;
  twitter: string | null;
  twitch: string | null;
};

const getSpecialtyLabels = (
  t: MemberEditorDict
): Record<MemberSpecialty, string> => ({
  tank: t.specialtyTank,
  dps: t.specialtyDps,
  support: t.specialtySupport,
  flex: t.specialtyFlex,
});

export default function MemberProfileEditor({
  teamId,
  member,
}: {
  teamId: string;
  member: EditableMember;
}) {
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const t = useT(nsMemberProfileEditor);
  const specialtyLabels = getSpecialtyLabels(t);

  const [displayName, setDisplayName] = useState(member.display_name ?? '');
  const [specialty, setSpecialty] = useState<MemberSpecialty | ''>(
    (member.specialty as MemberSpecialty | null) ?? ''
  );
  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url ?? '');
  const [pronouns, setPronouns] = useState(member.pronouns ?? '');
  const [tagline, setTagline] = useState(member.tagline ?? '');
  const [twitter, setTwitter] = useState(member.twitter ?? '');
  const [twitch, setTwitch] = useState(member.twitch ?? '');
  const [isSubstitute, setIsSubstitute] = useState(member.is_substitute);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const json = await adminFetchJson<{ updatedFields?: unknown[] }>(
        `/api/teams/${teamId}/members/${member.id}/profile`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            display_name: displayName,
            specialty,
            avatar_url: avatarUrl,
            pronouns,
            tagline,
            twitter,
            twitch,
            is_substitute: isSubstitute,
          }),
        }
      );

      const updated = json.updatedFields?.length ?? 0;
      addToast(
        updated > 0
          ? format(updated > 1 ? t.updateSuccess_other : t.updateSuccess_one, {
              count: updated,
            })
          : t.noChanges,
        'success'
      );
    } catch (err) {
      addToast(err instanceof Error ? err.message : t.errorUnexpected, 'error');
    } finally {
      setSaving(false);
    }
  }

  const headerLabel = displayName || member.battle_tag || t.memberFallback;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {headerLabel}
            {member.is_captain && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300">
                {t.captain}
              </span>
            )}
          </p>
          <p className="text-[11px] text-gray-400 truncate">
            {member.battle_tag ?? '—'}
            {member.role ? ` • ${member.role}` : ''}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-300 select-none">
          <input
            type="checkbox"
            checked={isSubstitute}
            onChange={(e) => setIsSubstitute(e.target.checked)}
            className="accent-cyan-500"
          />
          {t.substitute}
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">
            {t.displayNameLabel}
          </label>
          <input
            type="text"
            value={displayName}
            maxLength={MEMBER_DISPLAY_NAME_MAX}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={member.battle_tag ?? t.displayNamePlaceholder}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">
            {t.specialtyLabel}
          </label>
          <select
            value={specialty}
            onChange={(e) =>
              setSpecialty(e.target.value as MemberSpecialty | '')
            }
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">{t.specialtyNone}</option>
            {MEMBER_SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {specialtyLabels[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[11px] text-neutral-400 mb-1">
          {t.avatarLabel}
        </label>
        <input
          type="text"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://..."
          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">
            {t.pronounsLabel}
          </label>
          <input
            type="text"
            value={pronouns}
            maxLength={MEMBER_PRONOUNS_MAX}
            onChange={(e) => setPronouns(e.target.value)}
            placeholder={t.pronounsPlaceholder}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">
            {t.taglineLabel}
          </label>
          <input
            type="text"
            value={tagline}
            maxLength={MEMBER_TAGLINE_MAX}
            onChange={(e) => setTagline(e.target.value)}
            placeholder={t.taglinePlaceholder}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">
            {t.twitterLabel}
          </label>
          <input
            type="text"
            value={twitter}
            maxLength={HANDLE_MAX}
            onChange={(e) => setTwitter(e.target.value)}
            placeholder="@handle"
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">
            {t.twitchLabel}
          </label>
          <input
            type="text"
            value={twitch}
            maxLength={HANDLE_MAX}
            onChange={(e) => setTwitch(e.target.value)}
            placeholder="streamer"
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-medium text-white"
        >
          {saving ? t.saving : t.save}
        </button>
      </div>
    </div>
  );
}
