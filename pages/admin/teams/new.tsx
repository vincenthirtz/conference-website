// pages/admin/teams/new.tsx

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { StaffRoleBadge } from '@/components/admin/StaffRoleBadge';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};
type CreateTeamResponse = {
  team: {
    id: string;
    name: string;
  };
};

type MemberInput = {
  email: string;
  role: string;
};

export const getServerSideProps = withStaffPage('manager');

function AdminNewTeamPage({ staff }: StaffProps) {
  const router = useRouter();

  // Infos équipe
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [country, setCountry] = useState('');
  const [description, setDescription] = useState('');
  const [captainEmail, setCaptainEmail] = useState('');

  // Membres
  const [members, setMembers] = useState<MemberInput[]>([
    { email: '', role: 'player' },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleMemberChange = (
    index: number,
    field: keyof MemberInput,
    value: string
  ) => {
    setMembers((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addMemberRow = () => {
    setMembers((prev) => [...prev, { email: '', role: 'player' }]);
  };

  const removeMemberRow = (index: number) => {
    setMembers((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const payload = {
        name,
        short_name: shortName || null,
        logo_url: logoUrl || null,
        country: country || null,
        description: description || null,
        captain_email: captainEmail || null,
        // On envoie les membres par email, l'API fera le mapping vers auth.users.id
        members: members
          .filter((m) => m.email.trim().length > 0)
          .map((m) => ({
            email: m.email.trim(),
            role: m.role.trim() || 'player',
          })),
      };

      const res = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible de créer l'équipe");
      }

      const json: CreateTeamResponse = await res.json();
      setSuccessMsg('Équipe créée avec succès ✅');

      // Redirection vers la page de détail équipe (à adapter selon ton routing)
      if (json.team?.id) {
        router.push(`/admin/team/${json.team.id}`);
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin – Nouvelle équipe</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <button
              type="button"
              onClick={() => router.push('/admin/teams')}
              className="mb-3 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour à la liste des équipes
            </button>
            <h1 className="text-3xl font-bold">Créer une nouvelle équipe</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Renseigne les informations générales + tous les membres de
              l&apos;équipe.
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <StaffRoleBadge staff={staff} />
          </div>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 rounded bg-emerald-900/60 border border-emerald-600 px-4 py-3 text-sm">
            {successMsg}
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="grid gap-6 lg:grid-cols-[2fr,1.4fr]"
        >
          {/* Colonne gauche : infos équipe + membres */}
          <div className="space-y-6">
            {/* Infos équipe */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-4">
              <h2 className="text-lg font-semibold mb-1">
                Informations principales
              </h2>

              <div className="space-y-4 text-sm">
                <div>
                  <label className="block text-neutral-300 mb-1">
                    Nom de l&apos;équipe *
                  </label>
                  <input
                    className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex : Phénix"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-neutral-300 mb-1">
                      Tag / short name
                    </label>
                    <input
                      className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      type="text"
                      value={shortName}
                      onChange={(e) => setShortName(e.target.value)}
                      placeholder="Ex : PNX"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-300 mb-1">Pays</label>
                    <input
                      className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Ex : France"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">
                    URL du logo
                  </label>
                  <input
                    className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Idéalement un PNG ou WebP carré (512x512).
                  </p>
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">
                    Description
                  </label>
                  <textarea
                    className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Quelques infos sur l'équipe, palmarès, style de jeu, etc."
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">
                    Email du capitaine
                  </label>
                  <input
                    className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    type="email"
                    value={captainEmail}
                    onChange={(e) => setCaptainEmail(e.target.value)}
                    placeholder="capitaine@exemple.com"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    L&apos;API convertira cet email en{' '}
                    <code className="font-mono">captain_id</code> dans{' '}
                    <code className="font-mono">auth.users</code>.
                  </p>
                </div>
              </div>
            </section>

            {/* Membres */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold mb-1">
                    Membres de l&apos;équipe
                  </h2>
                  <p className="text-sm text-neutral-400">
                    Ajoute les joueuses / staff avec leur email (lié à
                    auth.users) et un rôle.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addMemberRow}
                  className="px-3 py-1.5 rounded-md bg-neutral-700 hover:bg-neutral-600 text-sm"
                >
                  + Ajouter un membre
                </button>
              </div>

              <div className="space-y-3">
                {members.map((member, index) => (
                  <div
                    key={index}
                    className="flex flex-col md:flex-row gap-3 bg-neutral-900/60 border border-neutral-700 rounded-lg p-3"
                  >
                    <div className="flex-1">
                      <label className="block text-neutral-300 mb-1 text-xs">
                        Email (auth.users)
                      </label>
                      <input
                        className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        type="email"
                        value={member.email}
                        onChange={(e) =>
                          handleMemberChange(index, 'email', e.target.value)
                        }
                        placeholder="joueuse@exemple.com"
                      />
                    </div>
                    <div className="w-full md:w-40">
                      <label className="block text-neutral-300 mb-1 text-xs">
                        Rôle
                      </label>
                      <input
                        className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        type="text"
                        value={member.role}
                        onChange={(e) =>
                          handleMemberChange(index, 'role', e.target.value)
                        }
                        placeholder="player / coach / sub…"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        disabled={members.length === 1}
                        onClick={() => removeMemberRow(index)}
                        className="px-3 py-2 rounded-md border border-red-700/70 text-xs text-red-300 hover:bg-red-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Suppr.
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-neutral-500">
                L&apos;API créera les lignes dans{' '}
                <code className="font-mono">team_members</code> avec{' '}
                <code className="font-mono">role</code> et le{' '}
                <code className="font-mono">user_id</code> correspondant à
                chaque email.
              </p>
            </section>
          </div>

          {/* Colonne droite : résumé & actions */}
          <div className="space-y-6">
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-semibold mb-1">
                Résumé de l&apos;équipe
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-400">Nom</span>
                  <span className="font-medium truncate max-w-[200px] text-right">
                    {name || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-400">Tag</span>
                  <span className="font-mono text-xs bg-neutral-900 px-2 py-1 rounded border border-neutral-700">
                    {shortName || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-400">Pays</span>
                  <span className="text-neutral-200">{country || '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-400">Capitaine</span>
                  <span className="text-neutral-200 text-xs font-mono">
                    {captainEmail || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-400">Nombre de membres</span>
                  <span className="text-neutral-200">
                    {members.filter((m) => m.email.trim().length > 0).length} /{' '}
                    {members.length}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Tu pourras éditer l&apos;équipe et ses membres plus tard via
                l&apos;interface admin ou l&apos;API.
              </p>
            </section>

            <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-semibold mb-1">Actions</h2>
              <p className="text-sm text-neutral-400">
                Vérifie bien les emails (ils doivent exister dans{' '}
                <code className="font-mono">auth.users</code> si l&apos;API ne
                gère pas encore la création automatique).
              </p>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 inline-flex items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Création en cours…' : "Créer l'équipe"}
              </button>

              <button
                type="button"
                onClick={() => router.push('/admin/teams')}
                className="w-full mt-2 inline-flex items-center justify-center rounded-md bg-neutral-700 hover:bg-neutral-600 px-4 py-2.5 text-sm"
              >
                Annuler
              </button>
            </section>
          </div>
        </form>
      </div>
    </>
  );
}

export default AdminNewTeamPage;
