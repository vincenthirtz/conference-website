import React, { useState } from 'react';
import Link from 'next/link';
import { useCookieConsent, CookiePreferences } from '@/hooks/useCookieConsent';

interface CookieCategoryInfo {
  key: keyof CookiePreferences;
  name: string;
  description: string;
  required: boolean;
}

const cookieCategories: CookieCategoryInfo[] = [
  {
    key: 'essential',
    name: 'Cookies essentiels',
    description: 'Nécessaires au fonctionnement du site (authentification, sécurité). Ces cookies ne peuvent pas être désactivés.',
    required: true,
  },
  {
    key: 'functional',
    name: 'Cookies fonctionnels',
    description: 'Améliorent votre expérience (préférences, personnalisation).',
    required: false,
  },
  {
    key: 'analytics',
    name: 'Cookies analytiques',
    description: 'Nous aident à comprendre comment vous utilisez le site pour l\'améliorer.',
    required: false,
  },
  {
    key: 'marketing',
    name: 'Cookies marketing',
    description: 'Utilisés pour afficher des publicités pertinentes.',
    required: false,
  },
];

export default function CookieBanner() {
  const {
    hasConsented,
    isLoaded,
    preferences,
    acceptAll,
    acceptEssentialOnly,
    saveCustomPreferences,
  } = useCookieConsent();

  const [showDetails, setShowDetails] = useState(false);
  const [customPreferences, setCustomPreferences] = useState<CookiePreferences>(preferences);

  // Ne pas afficher si pas encore chargé ou si déjà consenti
  if (!isLoaded || hasConsented) {
    return null;
  }

  const handleToggleCategory = (key: keyof CookiePreferences) => {
    if (key === 'essential') return; // Ne peut pas être désactivé
    setCustomPreferences(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSaveCustom = () => {
    saveCustomPreferences(customPreferences);
  };

  return (
    <div className="cookie-banner" role="dialog" aria-labelledby="cookie-banner-title" aria-describedby="cookie-banner-description">
      <div className="cookie-banner-content">
        <div className="cookie-banner-header">
          <h2 id="cookie-banner-title" className="cookie-banner-title">
            Gestion des cookies
          </h2>
          <p id="cookie-banner-description" className="cookie-banner-text">
            Nous utilisons des cookies pour assurer le bon fonctionnement du site et améliorer votre expérience.
            Vous pouvez personnaliser vos préférences ci-dessous.
          </p>
        </div>

        {showDetails && (
          <div className="cookie-banner-details">
            {cookieCategories.map((category) => (
              <div key={category.key} className="cookie-category">
                <div className="cookie-category-header">
                  <label className="cookie-category-label">
                    <input
                      type="checkbox"
                      checked={category.key === 'essential' ? true : customPreferences[category.key]}
                      onChange={() => handleToggleCategory(category.key)}
                      disabled={category.required}
                      className="cookie-checkbox"
                    />
                    <span className="cookie-category-name">{category.name}</span>
                    {category.required && (
                      <span className="cookie-required-badge">Requis</span>
                    )}
                  </label>
                </div>
                <p className="cookie-category-description">{category.description}</p>
              </div>
            ))}
          </div>
        )}

        <div className="cookie-banner-actions">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="cookie-btn cookie-btn-secondary"
            type="button"
          >
            {showDetails ? 'Masquer les détails' : 'Personnaliser'}
          </button>

          {showDetails ? (
            <button
              onClick={handleSaveCustom}
              className="cookie-btn cookie-btn-primary"
              type="button"
            >
              Enregistrer mes choix
            </button>
          ) : (
            <>
              <button
                onClick={acceptEssentialOnly}
                className="cookie-btn cookie-btn-secondary"
                type="button"
              >
                Refuser
              </button>
              <button
                onClick={acceptAll}
                className="cookie-btn cookie-btn-primary"
                type="button"
              >
                Tout accepter
              </button>
            </>
          )}
        </div>

        <p className="cookie-banner-legal">
          En savoir plus dans notre{' '}
          <Link href="/mentions-legales" className="cookie-link">
            politique de confidentialité
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
