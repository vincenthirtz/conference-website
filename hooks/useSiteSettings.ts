import { useEffect, useState } from 'react';

type SiteSettings = Record<string, string>;

const DEFAULT_SETTINGS: SiteSettings = {
  contact_email: 'owwomenscup@gmail.com',
  about_video_url: 'https://www.youtube.com/watch?v=3j6w7CjXne8',
};

let cachedSettings: SiteSettings | null = null;
let fetchPromise: Promise<SiteSettings> | null = null;

async function fetchSettings(): Promise<SiteSettings> {
  if (cachedSettings) return cachedSettings;

  if (!fetchPromise) {
    fetchPromise = fetch('/api/site-settings')
      .then((res) => res.json())
      .then((data) => {
        cachedSettings = { ...DEFAULT_SETTINGS, ...data };
        return cachedSettings!;
      })
      .catch(() => {
        cachedSettings = DEFAULT_SETTINGS;
        return cachedSettings!;
      });
  }

  return fetchPromise;
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(
    cachedSettings ?? DEFAULT_SETTINGS
  );
  const [loading, setLoading] = useState(!cachedSettings);

  useEffect(() => {
    if (cachedSettings) {
      setSettings(cachedSettings);
      setLoading(false);
      return;
    }

    fetchSettings().then((data) => {
      setSettings(data);
      setLoading(false);
    });
  }, []);

  return { settings, loading };
}

export function useSiteSetting(key: string) {
  const { settings, loading } = useSiteSettings();
  return {
    value: settings[key] ?? DEFAULT_SETTINGS[key] ?? '',
    loading,
  };
}
