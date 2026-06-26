import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';

import { logger } from '../../../utils/logger';
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
    description:
      'Email de contact principal affiché sur le site (pages contact, mentions légales, etc.)',
    placeholder: 'contact@example.com',
    type: 'email',
  },
  {
    key: 'about_video_url',
    label: 'URL vidéo "A propos"',
    description:
      'URL de la vidéo affichée dans la section "A propos" de la page d\'accueil (YouTube ou MP4)',
    placeholder: 'https://www.youtube.com/watch?v=...',
    type: 'url',
  },
  {
    key: 'cotisation_amount',
    label: 'Montant de la cotisation annuelle',
    description:
      'Montant de la cotisation annuelle pour les adhérents (en euros)',
    placeholder: '20.00',
    type: 'number',
  },
  {
    key: 'cotisation_year',
    label: 'Année de cotisation en cours',
    description: 'Année de cotisation active pour le suivi des paiements',
    placeholder: new Date().getFullYear().toString(),
    type: 'number',
  },
  {
    key: 'homepage_event_date',
    label: "Date de l'événement (compte à rebours)",
    description:
      "Date ISO du prochain événement affiché en compte à rebours sur la page d'accueil. Si vide, la date de début du prochain tournoi est utilisée. Format : 2026-06-15T18:00:00+02:00",
    placeholder: '2026-06-15T18:00:00+02:00',
    type: 'text',
  },
];

function AdminSiteSettingsPage({ staff }: Props) {
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, SiteSetting>>({});
  const [values, setValues] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const json = await adminFetchJson<{ items?: SiteSetting[] }>(
        '/api/admin/site-settings'
      );

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
      logger.error('Error fetching site settings', err);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveSetting = async (key: string) => {
    setSaving(key);

    try {
      const known = KNOWN_SETTINGS.find((s) => s.key === key);
      await adminFetchJson('/api/admin/site-settings', {
        method: 'POST',
        body: JSON.stringify({
          key,
          value: values[key] || '',
          description: known?.description || null,
        }),
      });
      addToast('Paramètre sauvegardé avec succès', 'success');
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || 'Erreur de sauvegarde.', 'error');
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

          {/* Sub-pages : configurations multi-cles avec leur propre interface */}
          <section className="mb-8 bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-1">
              Configurations avancees
            </h2>
            <p className="text-sm text-neutral-400 mb-4">
              Pages dediees pour les parametres complexes (multi-cles, par
              type, ou avec test).
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/admin/site-settings/discord"
                className="group flex items-start gap-3 p-4 rounded-xl bg-neutral-900/50 border border-neutral-700/50 hover:border-indigo-500/50 hover:bg-neutral-900/80 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-300 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.078.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.683 12.683 0 0 0-.617-1.249.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.319 13.58.099 18.057a.082.082 0 0 0 .031.056 19.908 19.908 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.21 14.21 0 0 0 1.226-1.994.076.076 0 0 0-.041-.105 13.166 13.166 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.372.291a.077.077 0 0 1-.006.128c-.598.349-1.22.645-1.873.891a.076.076 0 0 0-.04.106c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.418 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.418 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-white group-hover:text-indigo-200 transition-colors">
                    Webhooks Discord (maitre)
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">
                    Fallback global utilise quand un tournoi n&apos;a pas
                    declare son propre webhook pour un type de channel.
                  </div>
                </div>
              </Link>

              <Link
                href="/admin/site-settings/team-roles"
                className="group flex items-start gap-3 p-4 rounded-xl bg-neutral-900/50 border border-neutral-700/50 hover:border-emerald-500/50 hover:bg-neutral-900/80 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-300 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-white group-hover:text-emerald-200 transition-colors">
                    Rôles d&apos;équipe
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">
                    Liste des rôles proposés dans les selects des formulaires
                    d&apos;ajout / édition de membre.
                  </div>
                </div>
              </Link>
            </div>
          </section>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {KNOWN_SETTINGS.map((known) => {
                const setting = settings[known.key];
                const currentValue = values[known.key] || '';
                const hasChanged = setting
                  ? setting.value !== currentValue
                  : currentValue !== '';

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
                          {saving === known.key
                            ? 'Sauvegarde...'
                            : 'Sauvegarder'}
                        </button>
                      </div>

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
                        <p className="text-sm text-neutral-400 mb-3">
                          Aperçu :
                        </p>
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
