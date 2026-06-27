import Link from 'next/link';
import type { User } from '@supabase/supabase-js';

type Props = {
  user: User;
  displayName: string;
};

export default function ProfileSummaryCard({ user, displayName }: Props) {
  const role = (user.user_metadata?.role as string | undefined) || 'player';
  const battleTag = user.user_metadata?.battle_tag as string | undefined;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Mon profil</h2>
        <Link
          href="/player/profile"
          className="text-xs text-purple-300 hover:text-purple-200"
        >
          Gérer mon profil
        </Link>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Email</span>
          <span className="truncate pl-2">{user.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Nom affiche</span>
          <span>{displayName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Role</span>
          <span className="capitalize">{role}</span>
        </div>
        {battleTag && (
          <div className="flex justify-between">
            <span className="text-gray-400">BattleTag</span>
            <span className="font-mono">{battleTag}</span>
          </div>
        )}
      </div>

      <Link
        href="/player/profile"
        className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-2 text-sm font-medium transition"
      >
        Gérer mon profil
      </Link>
    </div>
  );
}
