import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import {
  POLE_KEYS,
  POLE_LABELS,
  type PoleKey,
} from '@/utils/associationPoles';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function AdminPoleMemberNewPage({ staff }: Props) {
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();

  const initialPole = (
    typeof router.query.pole === 'string' &&
    (POLE_KEYS as readonly string[]).includes(router.query.pole)
      ? router.query.pole
      : 'direction'
  ) as PoleKey;

  const [form, setForm] = useState({
    poleKey: initialPole,
    name: '',
    title: '',
    description: '',
    imageUrl: '',
    linkUrl: '',
    isActive: true,
    sortOrder: '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (
    key: keyof typeof form,
    value: string | boolean
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('Le nom est obligatoire.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        poleKey: form.poleKey,
        name: form.name.trim(),
        title: form.title.trim() || null,
        description: form.description.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        linkUrl: form.linkUrl.trim() || null,
        isActive: form.isActive,
        sortOrder: form.sortOrder ? parseInt(form.sortOrder, 10) : undefined,
      };

      await adminFetchJson('/api/admin/pole-members', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      router.push('/admin/pole-members');
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin – Nouveau membre de pôle</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin/pole-members')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Retour à la liste
            </button>

            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Ajouter un membre de pôle
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              Configurez un nouveau membre pour la page association
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-6 max-w-2xl">
              {error && (
                <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Pôle <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={form.poleKey}
                    onChange={(e) =>
                      updateField('poleKey', e.target.value as PoleKey)
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    required
                  >
                    {POLE_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {POLE_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Nom <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="ex: Arukdo"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Titre / Rôle
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="ex: Présidente, Trésorier..."
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Ordre d&apos;affichage
                  </label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => updateField('sortOrder', e.target.value)}
                    placeholder="Auto (dernier)"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-neutral-300 mb-1">
                  URL de l&apos;avatar
                </label>
                <input
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => updateField('imageUrl', e.target.value)}
                  placeholder="/img/team/nom.jpg ou https://..."
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-sm text-neutral-300 mb-1">
                  Lien (Twitch, X, contact...)
                </label>
                <input
                  type="url"
                  value={form.linkUrl}
                  onChange={(e) => updateField('linkUrl', e.target.value)}
                  placeholder="https://www.twitch.tv/..."
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-sm text-neutral-300 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Bio courte (optionnel)..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-y"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => updateField('isActive', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
                <span className="text-sm text-neutral-300">
                  Active (visible sur la page association)
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-700">
                <button
                  type="button"
                  onClick={() => router.push('/admin/pole-members')}
                  className="px-5 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? 'Création...' : 'Créer'}
                </button>
              </div>
            </section>
          </form>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminPoleMemberNewPage;
