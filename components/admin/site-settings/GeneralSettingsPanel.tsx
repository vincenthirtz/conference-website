import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';

type Dict = ReturnType<typeof useAdminT<'adminSiteSettings'>>;

type SiteSetting = {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
};

function getKnownSettings(t: Dict) {
  return [
    {
      key: 'contact_email',
      label: t.contactEmailLabel,
      description: t.contactEmailDesc,
      placeholder: 'contact@example.com',
      type: 'email',
    },
    {
      key: 'about_video_url',
      label: t.aboutVideoLabel,
      description: t.aboutVideoDesc,
      placeholder: 'https://www.youtube.com/watch?v=...',
      type: 'url',
    },
    {
      key: 'cotisation_amount',
      label: t.cotisationAmountLabel,
      description: t.cotisationAmountDesc,
      placeholder: '20.00',
      type: 'number',
    },
    {
      key: 'cotisation_year',
      label: t.cotisationYearLabel,
      description: t.cotisationYearDesc,
      placeholder: new Date().getFullYear().toString(),
      type: 'number',
    },
    {
      key: 'homepage_event_date',
      label: t.eventDateLabel,
      description: t.eventDateDesc,
      placeholder: '2026-06-15T18:00:00+02:00',
      type: 'text',
    },
  ];
}

/**
 * "Général" tab of the merged /admin/site-settings page: single-value site
 * settings (contact email, cotisation, homepage event date, about video).
 */
export default function GeneralSettingsPanel() {
  const t = useAdminT('adminSiteSettings');
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const KNOWN_SETTINGS = useMemo(() => getKnownSettings(t), [t]);
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
  }, [adminFetchJson, KNOWN_SETTINGS]);

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
      addToast(t.saveSuccess, 'success');
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.saveError, 'error');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
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
                <p className="text-sm text-neutral-400">{known.description}</p>
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
                  {saving === known.key ? t.saving : t.save}
                </button>
              </div>

              {setting?.updated_at && (
                <p className="text-xs text-neutral-500">
                  {t.lastModified}{' '}
                  {new Date(setting.updated_at).toLocaleString('fr-FR')}
                </p>
              )}
            </div>

            {known.key === 'about_video_url' && currentValue && (
              <div className="mt-6 pt-6 border-t border-neutral-700">
                <p className="text-sm text-neutral-400 mb-3">{t.preview}</p>
                <div className="relative w-full max-w-md aspect-video rounded-xl overflow-hidden bg-neutral-900">
                  {/youtu\.?be/.test(currentValue) ? (
                    <iframe
                      className="absolute inset-0 w-full h-full"
                      src={`https://www.youtube.com/embed/${
                        currentValue.match(
                          /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]+)/
                        )?.[1] || ''
                      }?rel=0`}
                      title={t.videoPreviewTitle}
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
  );
}
