import React from 'react';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { useT } from '@/lib/i18n/useT';

/**
 * Bouton pour rouvrir les paramètres de cookies
 * À placer dans le footer ou une page de paramètres
 */
export default function CookieSettingsButton() {
  const t = useT('cookieBanner');
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
      aria-label={t.manageAria}
    >
      {t.manage}
    </button>
  );
}
