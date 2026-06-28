import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { useT } from '@/lib/i18n/useT';

type Props = {
  user: User;
  displayName: string;
};

export default function ProfileSummaryCard({ user, displayName }: Props) {
  const t = useT('profileSummary');
  const role = (user.user_metadata?.role as string | undefined) || 'player';
  const battleTag = user.user_metadata?.battle_tag as string | undefined;
  const avatarUrl =
    (user.user_metadata?.avatar_url as string | undefined) || '';
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <Link
          href="/player/profile"
          className="text-xs text-purple-300 hover:text-purple-200"
        >
          {t.manage}
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt="Avatar"
            className="h-12 w-12 rounded-full border border-purple-500/40 object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-purple-500/40 bg-purple-600/20 text-sm font-bold text-purple-100">
            {initials || 'J'}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate font-semibold">{displayName}</div>
          <div className="text-xs capitalize text-gray-400">{role}</div>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">{t.email}</span>
          <span className="truncate pl-2">{user.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">{t.displayName}</span>
          <span>{displayName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">{t.role}</span>
          <span className="capitalize">{role}</span>
        </div>
        {battleTag && (
          <div className="flex justify-between">
            <span className="text-gray-400">{t.battleTag}</span>
            <span className="font-mono">{battleTag}</span>
          </div>
        )}
      </div>

      <Link
        href="/player/profile"
        className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-2 text-sm font-medium transition"
      >
        {t.manage}
      </Link>
    </div>
  );
}
