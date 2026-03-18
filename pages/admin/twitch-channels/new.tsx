import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function AdminTwitchChannelNewPage({ staff }: Props) {
  const router = useRouter();

  const [form, setForm] = useState({
    channel: '',
    label: '',
    badge: '',
    description: '',
    backgroundUrl: '',
    isActive: true,
    sortOrder: '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.channel.trim() || !form.label.trim()) {
      setError('Le nom de la chaîne et le label sont obligatoires.');
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');

      const payload = {
        channel: form.channel.trim(),
        label: form.label.trim(),
        badge: form.badge.trim() || null,
        description: form.description.trim() || null,
        backgroundUrl: form.backgroundUrl.trim() || null,
        isActive: form.isActive,
        sortOrder: form.sortOrder ? parseInt(form.sortOrder, 10) : undefined,
      };

      const res = await fetch('/api/admin/twitch-channels', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || 'Création impossible.');
      }

      router.push('/admin/twitch-channels');
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin – Nouvelle chaîne Twitch</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin/twitch-channels')}
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
              Ajouter une chaîne Twitch
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              Configurez une nouvelle chaîne partenaire pour la page d&apos;accueil
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-6 max-w-2xl">
              {error && (
                <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {error}
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Nom de la chaîne Twitch <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.channel}
                    onChange={(e) => updateField('channel', e.target.value)}
                    placeholder="ex: crocheh"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    required
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    L&apos;identifiant dans l&apos;URL twitch.tv/
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Label d&apos;affichage <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.label}
                    onChange={(e) => updateField('label', e.target.value)}
                    placeholder="ex: Crocheh"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Badge
                  </label>
                  <input
                    type="text"
                    value={form.badge}
                    onChange={(e) => updateField('badge', e.target.value)}
                    placeholder="ex: Cast, Player, Coach..."
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
                  type="url"
                  value={form.backgroundUrl}
                  onChange={(e) => updateField('backgroundUrl', e.target.value)}
                  placeholder="https://static-cdn.jtvnw.net/..."
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  URL de l&apos;image de profil Twitch (150x150 recommandé)
                </p>
              </div>

              <div>
                <label className="block text-sm text-neutral-300 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Décrivez la chaîne en quelques mots..."
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
                  Chaîne active (visible sur la page d&apos;accueil)
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-700">
                <button
                  type="button"
                  onClick={() => router.push('/admin/twitch-channels')}
                  className="px-5 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Création...
                    </>
                  ) : (
                    <>
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Créer la chaîne
                    </>
                  )}
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

export default AdminTwitchChannelNewPage;
