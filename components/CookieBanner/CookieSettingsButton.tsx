import { useCookieConsent } from '@/hooks/useCookieConsent';
import { useT } from '@/lib/i18n/useT';
import nsCookieBanner from '@/lib/i18n/locales/fr/cookieBanner';

/**
 * Bouton pour rouvrir les paramètres de cookies
 * À placer dans le footer ou une page de paramètres
 */
export default function CookieSettingsButton() {
  const t = useT(nsCookieBanner);
  const { resetConsent, isLoaded } = useCookieConsent();

  // Ne pas afficher avant le chargement pour éviter le flash
  if (!isLoaded) {
    return null;
  }

  return (
    // Pas d'`aria-label` : le texte visible EST le nom accessible, et il est
    // déjà explicite. L'ancien libellé — « Gérer les préférences de cookies »
    // — ne contenait pas le texte affiché « Gérer les cookies », si bien qu'une
    // commande vocale prononçant ce qu'on lit à l'écran n'activait pas le
    // bouton (audit Lighthouse `label-content-name-mismatch`).
    <button
      onClick={resetConsent}
      className="cookie-settings-btn"
      type="button"
    >
      {t.manage}
    </button>
  );
}
