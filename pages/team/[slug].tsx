// pages/team/[slug].tsx
// @ts-nocheck
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { supabaseAdmin as supabase } from '@/utils/supabase';
import { StaffRoleBadge } from '@/components/admin/StaffRoleBadge'; // optionnel si tu veux l'afficher
import { useRouter } from 'next/router';

type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  bio: string | null;
  created_at: string;
};

type Player = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_captain: boolean;
};

type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

type TeamPageProps = {
  team: Team;
  roster: Player[];
  tournaments: TournamentMini[];
};

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const slug = ctx.params?.slug as string;

  // 1) ESSAYER → lookup par ID exact
  let { data: team, error } = await supabase
    .from('teams')
    .select('*')
    .eq('id', slug)
    .single();

  // 2) SINON → lookup par name (insensible à la casse)
  if (!team) {
    const { data } = await supabase
      .from('teams')
      .select('*')
      .ilike('name', slug)
      .maybeSingle();
    if (data) team = data;
  }

  // 3) SINON → lookup par short_name
  if (!team) {
    const { data } = await supabase
      .from('teams')
      .select('*')
      .ilike('short_name', slug)
      .maybeSingle();
    if (data) team = data;
  }

  if (!team) {
    return {
      notFound: true,
    };
  }

  // Charger le roster
  const { data: roster } = await supabase
    .from('team_members')
    .select('id, display_name, avatar_url, is_captain')
    .eq('team_id', team.id)
    .order('is_captain', { ascending: false });

  // Tournois où l’équipe est inscrite
  const { data: tournaments } = await supabase
    .from('tournament_registrations')
    .select('tournament: tournaments(id,name,slug)')
    .eq('team_id', team.id);

  return {
    props: {
      team,
      roster: roster || [],
      tournaments: tournaments?.map((t: any) => t.tournament) || [],
    },
  };
};

export default function TeamPage({ team, roster, tournaments }: TeamPageProps) {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Équipe – {team.name}</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push('/teams')}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour aux équipes
            </button>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              {team.logo_url && (
                <Image
                  src={team.logo_url}
                  alt={team.name}
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded object-cover border border-neutral-700"
                />
              )}
              {team.name}
            </h1>
            {team.short_name && (
              <p className="text-neutral-400 text-sm mt-1">
                Tag : {team.short_name}
              </p>
            )}
          </div>
        </div>

        {/* Bio */}
        {team.bio && (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 mb-6">
            <h2 className="text-lg font-semibold mb-2">Présentation</h2>
            <p className="text-neutral-300 whitespace-pre-line">{team.bio}</p>
          </div>
        )}

        {/* Roster */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            Composition de l’équipe
          </h2>

          {roster.length === 0 ? (
            <div className="text-neutral-500">Aucun joueur enregistré.</div>
          ) : (
            <ul className="divide-y divide-neutral-700">
              {roster.map((p) => (
                <li key={p.id} className="py-3 flex items-center gap-4">
                  {p.avatar_url && (
                    <Image
                      src={p.avatar_url}
                      alt={p.display_name || 'Joueuse'}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full border border-neutral-700"
                    />
                  )}
                  <div className="flex-1">
                    <div className="font-semibold text-neutral-50">
                      {p.display_name || p.id}
                    </div>
                    {p.is_captain && (
                      <span className="text-xs text-amber-400">Capitaine</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tournois joués */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-4">Tournois</h2>

          {tournaments.length === 0 ? (
            <p className="text-neutral-500">
              Cette équipe ne participe à aucun tournoi pour le moment.
            </p>
          ) : (
            <ul className="space-y-2">
              {tournaments.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tournament/${t.id}`}
                    className="text-blue-300 hover:underline"
                  >
                    {t.name}
                  </Link>
                  {t.slug && (
                    <span className="ml-2 text-xs font-mono text-neutral-500">
                      {t.slug}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
