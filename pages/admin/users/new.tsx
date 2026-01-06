import { useState } from 'react';
import Head from 'next/head';
import Button from '@/components/Buttons/button';
import { withStaffPage } from '@/utils/staff';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type CreateUserResponse = {
  userId: string;
  email: string;
  tempPassword?: string;
};

export const getServerSideProps = withStaffPage('admin');

function AdminCreateUserPage({ staff }: StaffProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('player');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateUserResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccess(null);

    try {
      const payload: Record<string, any> = {
        email,
        display_name: displayName || undefined,
        role: role || undefined,
      };
      if (password.trim()) payload.password = password.trim();

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json: CreateUserResponse & { error?: string } = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || 'Impossible de créer l&apos;utilisateur');
      }

      setSuccess(json);
      setEmail('');
      setPassword('');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Créer un utilisateur</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <header className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <button
              type="button"
              onClick={() => history.back()}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour
            </button>
            <h1 className="text-3xl font-bold">Créer un utilisateur</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Génère un compte Supabase (email confirmé) pour un joueur ou un
              staff.
            </p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr,1.2fr] items-start">
          <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm text-neutral-300 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ex: player@email.tld"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm text-neutral-300">
                    Mot de passe (optionnel)
                  </label>
                  <span className="text-xs text-neutral-400">
                    Vide → mot de passe auto-généré
                  </span>
                </div>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Laisser vide pour générer"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Nom affiché (optionnel)
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="LaKiiroi"
                  />
                </div>

                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Rôle (metadata)
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="player"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-lg border border-red-600 bg-red-900/60 px-3 py-2 text-sm">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  size="compact"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-semibold"
                >
                  {loading ? 'Création...' : `Créer l'utilisateur`}
                </Button>
              </div>
            </form>
          </section>

          <aside className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-semibold">Infos</h2>
            <ul className="space-y-2 text-sm text-neutral-300">
              <li>• Le compte est créé via le rôle service Supabase.</li>
              <li>• Le mot de passe est généré si tu laisses le champ vide.</li>
              <li>• L&apos;email est marqué comme confirmé.</li>
              <li>
                • Ajoute ensuite la personne à une équipe via la page équipe ou
                team_members.
              </li>
            </ul>

            {success && (
              <div className="rounded-lg border border-emerald-600 bg-emerald-900/50 px-3 py-3 space-y-2">
                <p className="text-sm font-semibold text-white">
                  Compte créé ✅
                </p>
                <p className="text-xs text-neutral-200">
                  User ID :{' '}
                  <span className="font-mono break-all">{success.userId}</span>
                </p>
                <p className="text-xs text-neutral-200">
                  Email : <span className="font-mono">{success.email}</span>
                </p>
                {success.tempPassword && (
                  <p className="text-xs text-yellow-100">
                    Mot de passe :{' '}
                    <span className="font-mono">{success.tempPassword}</span>
                    <br />
                    Note-le, il ne sera pas affiché à nouveau.
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

export default AdminCreateUserPage;
