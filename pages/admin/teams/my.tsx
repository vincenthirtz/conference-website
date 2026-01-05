import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';

type TeamLite = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  bio: string | null;
  country?: string | null;
  description?: string | null;
};

type Member = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  role: string | null;
  captain?: boolean | null;
  is_captain?: boolean | null;
};

type ApiResponse = {
  team: TeamLite | null;
  members: Member[];
  isCaptain: boolean;
  error?: string;
};

export default function MyTeamPage() {
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    short_name: '',
    bio: '',
    logo_url: '',
    country: '',
    description: '',
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) {
        router.replace('/admin/login');
        return;
      }

      const res = await fetch('/api/admin/teams/my', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Chargement impossible');
      setData(json);
      if (json.team) {
        setForm({
          name: json.team.name || '',
          short_name: json.team.short_name || '',
          bio: json.team.bio || '',
          logo_url: json.team.logo_url || '',
          country: json.team.country || '',
          description: json.team.description || '',
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateField = (k: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!data?.team) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) {
        router.replace('/admin/login');
        return;
      }

      const res = await fetch('/api/admin/teams/my', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          teamId: data.team.id,
          ...form,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Enregistrement impossible');
      await load();
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  const renderMembers = () => {
    if (!data?.team) return null;
    if (!data.members?.length) {
      return <div className="text-neutral-400">Aucun membre enregistré.</div>;
    }

    return (
      <ul className="divide-y divide-white/5">
        {data.members.map((m) => (
          <li key={m.id} className="py-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-white font-semibold">
                {m.display_name || m.user_id || m.id}
              </div>
              <div className="text-xs text-neutral-400">
                Rôle équipe : {m.role || '—'}
              </div>
            </div>
            {(m.captain || m.is_captain) && (
              <span className="text-[11px] uppercase tracking-wide bg-amber-500/20 text-amber-100 rounded-full px-2 py-1 border border-amber-400/40">
                Capitaine
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <Head>
        <title>Gestion de mon équipe</title>
      </Head>
      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm text-neutral-400">Espace équipe</p>
              <h1 className="text-3xl font-bold">
                {data?.team ? data.team.name : 'Mon équipe'}
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                {data?.isCaptain
                  ? 'Vous êtes capitaine : modification autorisée.'
                  : 'Vue en lecture seule.'}
              </p>
            </div>
            <button
              onClick={load}
              className="text-sm px-3 py-2 rounded-lg border border-white/15 hover:border-white/30"
            >
              Rafraîchir
            </button>
          </div>

          {loading && <div className="text-neutral-300">Chargement…</div>}
          {error && (
            <div className="text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 space-y-2">
              <div>{error}</div>
              <button
                type="button"
                onClick={() => router.push('/admin/teams/new')}
                className="inline-flex items-center gap-2 text-sm rounded-lg border border-white/20 px-3 py-2 text-white hover:border-white/40 transition"
              >
                Créer mon équipe
              </button>
            </div>
          )}

          {!loading && !error && !data?.team && (
            <div className="text-neutral-300">
              Vous n'êtes capitaine d'aucune équipe.
            </div>
          )}

          {data?.team && (
            <div className="grid gap-4 md:grid-cols-[1.2fr,1fr]">
              <section className="bg-neutral-800 border border-white/10 rounded-xl p-5 space-y-3">
                <h2 className="text-xl font-semibold">Informations équipe</h2>

                <div className="space-y-3">
                  <label className="flex flex-col gap-1 text-sm">
                    Nom
                    <input
                      value={form.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      disabled={!data.isCaptain}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Tag court
                    <input
                      value={form.short_name}
                      onChange={(e) =>
                        updateField('short_name', e.target.value)
                      }
                      disabled={!data.isCaptain}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Bio
                    <textarea
                      value={form.bio}
                      onChange={(e) => updateField('bio', e.target.value)}
                      disabled={!data.isCaptain}
                      rows={4}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Logo (URL)
                    <input
                      value={form.logo_url}
                      onChange={(e) => updateField('logo_url', e.target.value)}
                      disabled={!data.isCaptain}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Pays (optionnel)
                    <input
                      value={form.country}
                      onChange={(e) => updateField('country', e.target.value)}
                      disabled={!data.isCaptain}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Description (privée)
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        updateField('description', e.target.value)
                      }
                      disabled={!data.isCaptain}
                      rows={3}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                {data.isCaptain && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                        saving
                          ? 'bg-neutral-700 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-500'
                      }`}
                    >
                      {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                )}
              </section>

              <section className="bg-neutral-800 border border-white/10 rounded-xl p-5 space-y-3">
                <h2 className="text-xl font-semibold">Membres</h2>
                {!data.isCaptain && (
                  <p className="text-sm text-neutral-400 mb-2">
                    Lecture seule (non capitaine).
                  </p>
                )}
                {renderMembers()}
              </section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
