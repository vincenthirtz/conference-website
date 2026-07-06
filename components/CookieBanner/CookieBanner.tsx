import React, { useState } from 'react';
import Link from 'next/link';
import { useCookieConsent, CookiePreferences } from '@/hooks/useCookieConsent';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useT } from '@/lib/i18n/useT';

interface CookieCategoryInfo {
  key: keyof CookiePreferences;
  name: string;
  description: string;
  required: boolean;
}

const cookieCategories = (
  t: ReturnType<typeof useT<'cookieBanner'>>
): CookieCategoryInfo[] => [
  {
    key: 'essential',
    name: t.essentialName,
    description: t.essentialDesc,
    required: true,
  },
  {
    key: 'functional',
    name: t.functionalName,
    description: t.functionalDesc,
    required: false,
  },
  {
    key: 'analytics',
    name: t.analyticsName,
    description: t.analyticsDesc,
    required: false,
  },
  {
    key: 'marketing',
    name: t.marketingName,
    description: t.marketingDesc,
    required: false,
  },
];

export default function CookieBanner() {
  const t = useT('cookieBanner');
  const {
    hasConsented,
    isLoaded,
    preferences,
    acceptAll,
    acceptEssentialOnly,
    saveCustomPreferences,
  } = useCookieConsent();

  const [showDetails, setShowDetails] = useState(false);
  const [customPreferences, setCustomPreferences] =
    useState<CookiePreferences>(preferences);
  const trapRef = useFocusTrap<HTMLDivElement>();

  // Ne pas afficher si pas encore chargé ou si déjà consenti
  if (!isLoaded || hasConsented) {
    return null;
  }

  const handleToggleCategory = (key: keyof CookiePreferences) => {
    if (key === 'essential') return; // Ne peut pas être désactivé
    setCustomPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSaveCustom = () => {
    saveCustomPreferences(customPreferences);
  };

  return (
    <div
      ref={trapRef}
      className="cookie-banner"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-description"
    >
      <div className="cookie-banner-content">
        <div className="cookie-banner-header">
          <h2 id="cookie-banner-title" className="cookie-banner-title">
            {t.title}
          </h2>
          <p id="cookie-banner-description" className="cookie-banner-text">
            {t.description}
          </p>
        </div>

        {showDetails && (
          <div className="cookie-banner-details">
            {cookieCategories(t).map((category) => (
              <div key={category.key} className="cookie-category">
                <div className="cookie-category-header">
                  <label className="cookie-category-label">
                    <input
                      type="checkbox"
                      checked={
                        category.key === 'essential'
                          ? true
                          : customPreferences[category.key]
                      }
                      onChange={() => handleToggleCategory(category.key)}
                      disabled={category.required}
                      className="cookie-checkbox"
                    />
                    <span className="cookie-category-name">
                      {category.name}
                    </span>
                    {category.required && (
                      <span className="cookie-required-badge">
                        {t.required}
                      </span>
                    )}
                  </label>
                </div>
                <p className="cookie-category-description">
                  {category.description}
                </p>
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
            {showDetails ? t.hideDetails : t.customize}
          </button>

          {showDetails ? (
            <button
              onClick={handleSaveCustom}
              className="cookie-btn cookie-btn-primary"
              type="button"
            >
              {t.saveChoices}
            </button>
          ) : (
            <>
              <button
                onClick={acceptEssentialOnly}
                className="cookie-btn cookie-btn-secondary"
                type="button"
              >
                {t.refuse}
              </button>
              <button
                onClick={acceptAll}
                className="cookie-btn cookie-btn-primary"
                type="button"
              >
                {t.acceptAll}
              </button>
            </>
          )}
        </div>

        <p className="cookie-banner-legal">
          {t.legalPrefix}{' '}
          <Link href="/mentions-legales" className="cookie-link">
            {t.privacyPolicy}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
