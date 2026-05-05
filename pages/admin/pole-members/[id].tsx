import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
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

function AdminPoleMemberEditPage({ staff }: Props) {
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();

  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    poleKey: 'direction' as PoleKey,
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

  const fetchMember = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const data = await adminFetchJson<any>(`/api/admin/pole-members/${id}`);
      setForm({
        poleKey: (data.pole_key as PoleKey) || 'direction',
        name: data.name || '',
        title: data.title || '',
        description: data.description || '',
        imageUrl: data.image_url || '',
        linkUrl: data.link_url || '',
        isActive: data.is_active ?? true,
        sortOrder: data.sort_order?.toString() || '',
      });
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [id, adminFetchJson]);

  useEffect(() => {
    fetchMember();
  }, [fetchMember]);

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

      await adminFetchJson(`/api/admin/pole-members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      addToast('Membre mis à jour avec succès.', 'success');
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin – Modifier membre</title>
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
              Modifier le membre
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              {form.name || 'Chargement...'}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <fieldset disabled={saving} className="contents">
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
                        placeholder="ex: Présidente"
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
                        onChange={(e) =>
                          updateField('sortOrder', e.target.value)
                        }
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
                      onChange={(e) =>
                        updateField('description', e.target.value)
                      }
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
                        onChange={(e) =>
                          updateField('isActive', e.target.checked)
                        }
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
                      className={`px-5 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors${saving ? ' pointer-events-none opacity-50' : ''}`}
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {saving ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>
                </section>
              </fieldset>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminPoleMemberEditPage;
