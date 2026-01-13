import { useState, useEffect, useCallback } from 'react';

export type CookieCategory = 'essential' | 'functional' | 'analytics' | 'marketing';

export interface CookiePreferences {
  essential: boolean; // Toujours true, non modifiable
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

export interface CookieConsentState {
  hasConsented: boolean;
  preferences: CookiePreferences;
  consentDate: string | null;
}

const COOKIE_CONSENT_KEY = 'cookie_consent';
const COOKIE_CONSENT_VERSION = '1.0';

const defaultPreferences: CookiePreferences = {
  essential: true,
  functional: false,
  analytics: false,
  marketing: false,
};

export function useCookieConsent() {
  const [state, setState] = useState<CookieConsentState>({
    hasConsented: false,
    preferences: defaultPreferences,
    consentDate: null,
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Charger les préférences depuis localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Vérifier la version pour invalider si nécessaire
        if (parsed.version === COOKIE_CONSENT_VERSION) {
          setState({
            hasConsented: true,
            preferences: { ...defaultPreferences, ...parsed.preferences },
            consentDate: parsed.consentDate,
          });
        }
      }
    } catch {
      // Ignorer les erreurs de parsing
    }
    setIsLoaded(true);
  }, []);

  // Sauvegarder les préférences
  const saveConsent = useCallback((preferences: CookiePreferences) => {
    const consentData = {
      version: COOKIE_CONSENT_VERSION,
      preferences: { ...preferences, essential: true }, // Essential toujours true
      consentDate: new Date().toISOString(),
    };

    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consentData));

    setState({
      hasConsented: true,
      preferences: consentData.preferences,
      consentDate: consentData.consentDate,
    });
  }, []);

  // Accepter tous les cookies
  const acceptAll = useCallback(() => {
    saveConsent({
      essential: true,
      functional: true,
      analytics: true,
      marketing: true,
    });
  }, [saveConsent]);

  // Refuser tous les cookies optionnels
  const rejectAll = useCallback(() => {
    saveConsent({
      essential: true,
      functional: false,
      analytics: false,
      marketing: false,
    });
  }, [saveConsent]);

  // Accepter uniquement les essentiels (alias pour rejectAll)
  const acceptEssentialOnly = useCallback(() => {
    rejectAll();
  }, [rejectAll]);

  // Sauvegarder des préférences personnalisées
  const saveCustomPreferences = useCallback((preferences: Partial<CookiePreferences>) => {
    saveConsent({
      ...state.preferences,
      ...preferences,
      essential: true, // Toujours true
    });
  }, [saveConsent, state.preferences]);

  // Réinitialiser le consentement (pour permettre à l'utilisateur de modifier)
  const resetConsent = useCallback(() => {
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    setState({
      hasConsented: false,
      preferences: defaultPreferences,
      consentDate: null,
    });
  }, []);

  return {
    ...state,
    isLoaded,
    acceptAll,
    rejectAll,
    acceptEssentialOnly,
    saveCustomPreferences,
    resetConsent,
  };
}
