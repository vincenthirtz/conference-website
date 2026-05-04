// components/Team/MemberProfileEditor.tsx
// Inline editor for a single team_member's display fields. Used by the
// team edit page (captain/manager view): each row owns its save button so
// edits can be saved member-by-member without resubmitting the whole team
// form.

import { useState } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { useToast } from '@/components/Toast';
import {
  MEMBER_DISPLAY_NAME_MAX,
  MEMBER_PRONOUNS_MAX,
  MEMBER_TAGLINE_MAX,
  MEMBER_SPECIALTIES,
  type MemberSpecialty,
} from '@/utils/markdown/teamPublicMarkdown';

const HANDLE_MAX = 80;

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

const SPECIALTY_LABELS: Record<MemberSpecialty, string> = {
  tank: 'Tank',
  dps: 'DPS',
  support: 'Support',
  flex: 'Flex',
};

export default function MemberProfileEditor({
  teamId,
  member,
}: {
  teamId: string;
  member: EditableMember;
}) {
  const { addToast } = useToast();

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
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session expirée — reconnecte-toi.');

      const res = await fetch(
        `/api/teams/${teamId}/members/${member.id}/profile`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
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

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Échec de la mise à jour.');

      const updated = json.updatedFields?.length ?? 0;
      addToast(
        updated > 0
          ? `Profil mis à jour (${updated} champ${updated > 1 ? 's' : ''}).`
          : 'Aucun changement.',
        'success'
      );
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Erreur inattendue.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  }

  const headerLabel = displayName || member.battle_tag || 'Membre';

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {headerLabel}
            {member.is_captain && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300">
                Capitaine
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
          Remplaçante
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">
            Pseudo affiché
          </label>
          <input
            type="text"
            value={displayName}
            maxLength={MEMBER_DISPLAY_NAME_MAX}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={member.battle_tag ?? 'Ex: Lyra'}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">
            Spécialité
          </label>
          <select
            value={specialty}
            onChange={(e) =>
              setSpecialty(e.target.value as MemberSpecialty | '')
            }
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">Non précisée</option>
            {MEMBER_SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {SPECIALTY_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[11px] text-neutral-400 mb-1">
          Avatar (URL https)
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
            Pronoms
          </label>
          <input
            type="text"
            value={pronouns}
            maxLength={MEMBER_PRONOUNS_MAX}
            onChange={(e) => setPronouns(e.target.value)}
            placeholder="elle, iel, she/her"
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">
            Phrase de profil
          </label>
          <input
            type="text"
            value={tagline}
            maxLength={MEMBER_TAGLINE_MAX}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Ex: Sniper redoutée."
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">
            Twitter
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
            Twitch
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
          {saving ? 'Enregistrement...' : 'Enregistrer ce membre'}
        </button>
      </div>
    </div>
  );
}
