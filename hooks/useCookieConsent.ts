import { useState, useEffect, useCallback } from 'react';

export type CookieCategory =
  | 'essential'
  | 'functional'
  | 'analytics'
  | 'marketing';

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
const COOKIE_CONSENT_CHANGE_EVENT = 'cookie_consent_change';

const defaultPreferences: CookiePreferences = {
  essential: true,
  functional: false,
  analytics: false,
  marketing: false,
};

// Fonction utilitaire pour charger l'état depuis localStorage
function loadConsentFromStorage(): CookieConsentState {
  try {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.version === COOKIE_CONSENT_VERSION) {
        return {
          hasConsented: true,
          preferences: { ...defaultPreferences, ...parsed.preferences },
          consentDate: parsed.consentDate,
        };
      }
    }
  } catch {
    // Ignorer les erreurs de parsing
  }
  return {
    hasConsented: false,
    preferences: defaultPreferences,
    consentDate: null,
  };
}

export function useCookieConsent() {
  const [state, setState] = useState<CookieConsentState>({
    hasConsented: false,
    preferences: defaultPreferences,
    consentDate: null,
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Charger les préférences depuis localStorage
  useEffect(() => {
    setState(loadConsentFromStorage());
    setIsLoaded(true);
  }, []);

  // Écouter les changements de consentement (pour synchroniser entre composants)
  useEffect(() => {
    const handleConsentChange = () => {
      setState(loadConsentFromStorage());
    };

    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, handleConsentChange);
    return () => {
      window.removeEventListener(
        COOKIE_CONSENT_CHANGE_EVENT,
        handleConsentChange
      );
    };
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

    // Notifier les autres composants
    window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGE_EVENT));
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
  const saveCustomPreferences = useCallback(
    (preferences: Partial<CookiePreferences>) => {
      saveConsent({
        ...state.preferences,
        ...preferences,
        essential: true, // Toujours true
      });
    },
    [saveConsent, state.preferences]
  );

  // Réinitialiser le consentement (pour permettre à l'utilisateur de modifier)
  const resetConsent = useCallback(() => {
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    setState({
      hasConsented: false,
      preferences: defaultPreferences,
      consentDate: null,
    });

    // Notifier les autres composants
    window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGE_EVENT));
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
