import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';

type SiteSetting = {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

const KNOWN_SETTINGS = [
  {
    key: 'contact_email',
    label: 'Email de contact',
    description: 'Email de contact principal affiché sur le site (pages contact, mentions légales, etc.)',
    placeholder: 'contact@example.com',
    type: 'email',
  },
  {
    key: 'about_video_url',
    label: 'URL vidéo "A propos"',
    description: 'URL de la vidéo affichée dans la section "A propos" de la page d\'accueil (YouTube ou MP4)',
    placeholder: 'https://www.youtube.com/watch?v=...',
    type: 'url',
  },
];

function AdminSiteSettingsPage({ staff }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, SiteSetting>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await fetch('/api/admin/site-settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();

      const settingsMap: Record<string, SiteSetting> = {};
      const valuesMap: Record<string, string> = {};

      for (const item of json.items || []) {
        settingsMap[item.key] = item;
        valuesMap[item.key] = item.value;
      }

      // Initialize with known settings defaults
      for (const known of KNOWN_SETTINGS) {
        if (!valuesMap[known.key]) {
          valuesMap[known.key] = '';
        }
      }

      setSettings(settingsMap);
      setValues(valuesMap);
    } catch (err) {
      console.error('Error fetching site settings', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveSetting = async (key: string) => {
    setSaving(key);
    setSuccess(null);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');

      const known = KNOWN_SETTINGS.find((s) => s.key === key);

      const res = await fetch('/api/admin/site-settings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          value: values[key] || '',
          description: known?.description || null,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Erreur de sauvegarde');
      }

      setSuccess(key);
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Erreur de sauvegarde.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <Head>
        <title>Admin – Paramètres du site</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Paramètres du site
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              Configurez les paramètres globaux du site
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {KNOWN_SETTINGS.map((known) => {
                const setting = settings[known.key];
                const currentValue = values[known.key] || '';
                const hasChanged = setting ? setting.value !== currentValue : currentValue !== '';

                return (
                  <section
                    key={known.key}
                    className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6"
                  >
                    <div className="flex flex-col gap-4">
                      <div>
                        <label
                          htmlFor={known.key}
                          className="block text-lg font-semibold text-white mb-1"
                        >
                          {known.label}
                        </label>
                        <p className="text-sm text-neutral-400">
                          {known.description}
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          id={known.key}
                          type="text"
                          value={currentValue}
                          onChange={(e) =>
                            setValues((prev) => ({
                              ...prev,
                              [known.key]: e.target.value,
                            }))
                          }
                          placeholder={known.placeholder}
                          className="flex-1 px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                        />
                        <button
                          onClick={() => saveSetting(known.key)}
                          disabled={saving === known.key || !hasChanged}
                          className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors whitespace-nowrap"
                        >
                          {saving === known.key ? 'Sauvegarde...' : 'Sauvegarder'}
                        </button>
                      </div>

                      {success === known.key && (
                        <p className="text-green-400 text-sm">
                          Paramètre sauvegardé avec succès
                        </p>
                      )}

                      {setting?.updated_at && (
                        <p className="text-xs text-neutral-500">
                          Dernière modification :{' '}
                          {new Date(setting.updated_at).toLocaleString('fr-FR')}
                        </p>
                      )}
                    </div>

                    {/* Preview for video URL */}
                    {known.key === 'about_video_url' && currentValue && (
                      <div className="mt-6 pt-6 border-t border-neutral-700">
                        <p className="text-sm text-neutral-400 mb-3">Aperçu :</p>
                        <div className="relative w-full max-w-md aspect-video rounded-xl overflow-hidden bg-neutral-900">
                          {/youtu\.?be/.test(currentValue) ? (
                            <iframe
                              className="absolute inset-0 w-full h-full"
                              src={`https://www.youtube.com/embed/${
                                currentValue.match(
                                  /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]+)/
                                )?.[1] || ''
                              }?rel=0`}
                              title="Aperçu vidéo"
                              allow="fullscreen"
                              allowFullScreen
                            />
                          ) : (
                            <video
                              className="absolute inset-0 w-full h-full object-cover"
                              src={currentValue}
                              controls
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminSiteSettingsPage;
