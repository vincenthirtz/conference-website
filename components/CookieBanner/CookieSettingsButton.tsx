import React from 'react';
import { useCookieConsent } from '@/hooks/useCookieConsent';

/**
 * Bouton pour rouvrir les paramètres de cookies
 * À placer dans le footer ou une page de paramètres
 */
export default function CookieSettingsButton() {
  const { resetConsent, isLoaded } = useCookieConsent();

  // Ne pas afficher avant le chargement pour éviter le flash
  if (!isLoaded) {
    return null;
  }

  return (
    <button
      onClick={resetConsent}
      className="cookie-settings-btn"
      type="button"
      aria-label="Gérer les préférences de cookies"
    >
      Gérer les cookies
    </button>
  );
}
