// components/admin/tenants/TenantBrandingSection.tsx
//
// « Marque blanche » — logo, couleurs et domaine propre d'un espace, dans la
// fiche d'espace.
//
// Extrait de `pages/admin/tenants/[id].tsx` le 2026-09-16, en même temps que le
// panneau « réseau entre espaces ». Ce fichier fait partie des écrans gelés
// (`tests/unit/adminFileSizeGuard.test.ts`) : la règle du dépôt veut que tout
// lot qui en touche un en sorte un panneau, plutôt que d'ajouter une couche de
// plus à un écran qu'on ne peut déjà plus lire d'un bloc. Le garde-fou a mordu
// ce matin — 794 → 855 lignes — et il avait raison.
//
// Purement présentationnel : l'état et l'enregistrement restent dans la page,
// avec le reste du formulaire « général » qu'un seul bouton soumet. Les
// libellés viennent du même namespace que la page.

import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTenantDetail from '@/lib/i18n/locales/admin-fr/adminTenantDetail';

type Props = {
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  customDomain: string;
  onChangeLogoUrl: (value: string) => void;
  onChangePrimaryColor: (value: string) => void;
  onChangeAccentColor: (value: string) => void;
  onChangeCustomDomain: (value: string) => void;
};

export default function TenantBrandingSection({
  logoUrl: editLogoUrl,
  primaryColor: editPrimaryColor,
  accentColor: editAccentColor,
  customDomain: editCustomDomain,
  onChangeLogoUrl: setEditLogoUrl,
  onChangePrimaryColor: setEditPrimaryColor,
  onChangeAccentColor: setEditAccentColor,
  onChangeCustomDomain: setEditCustomDomain,
}: Props) {
  const t = useAdminT(nsAdminTenantDetail);

  return (
    <fieldset
      className="border-t border-neutral-700/50 pt-6 space-y-6"
      data-testid="tenant-branding-section"
    >
      <legend className="sr-only">{t.brandingHeading}</legend>
      <div>
        <h3 className="text-base font-semibold text-white">
          {t.brandingHeading}
        </h3>
        <p className="mt-1 text-sm text-neutral-400">{t.brandingDesc}</p>
      </div>

      <div>
        <label
          htmlFor="g-logo-url"
          className="block text-sm font-medium text-neutral-300 mb-2"
        >
          {t.logoUrlLabel}
        </label>
        <input
          id="g-logo-url"
          type="text"
          value={editLogoUrl}
          onChange={(e) => setEditLogoUrl(e.target.value)}
          placeholder={t.logoUrlPlaceholder}
          className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
          data-testid="tenant-logo-url-input"
        />
        <p className="mt-1.5 text-xs text-neutral-500">{t.logoUrlHint}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label
            htmlFor="g-primary-color"
            className="block text-sm font-medium text-neutral-300 mb-2"
          >
            {t.primaryColorLabel}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label={t.primaryColorLabel}
              value={
                /^#[0-9a-fA-F]{6}$/.test(editPrimaryColor)
                  ? editPrimaryColor
                  : '#b24be0'
              }
              onChange={(e) => setEditPrimaryColor(e.target.value)}
              className="h-11 w-14 rounded-lg border border-neutral-600 bg-neutral-900/50 cursor-pointer p-1"
            />
            <input
              id="g-primary-color"
              type="text"
              value={editPrimaryColor}
              onChange={(e) => setEditPrimaryColor(e.target.value)}
              placeholder={t.colorPlaceholder}
              className="flex-1 px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white font-mono"
              data-testid="tenant-primary-color-input"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="g-accent-color"
            className="block text-sm font-medium text-neutral-300 mb-2"
          >
            {t.accentColorLabel}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label={t.accentColorLabel}
              value={
                /^#[0-9a-fA-F]{6}$/.test(editAccentColor)
                  ? editAccentColor
                  : '#7bc96a'
              }
              onChange={(e) => setEditAccentColor(e.target.value)}
              className="h-11 w-14 rounded-lg border border-neutral-600 bg-neutral-900/50 cursor-pointer p-1"
            />
            <input
              id="g-accent-color"
              type="text"
              value={editAccentColor}
              onChange={(e) => setEditAccentColor(e.target.value)}
              placeholder={t.colorPlaceholder}
              className="flex-1 px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white font-mono"
              data-testid="tenant-accent-color-input"
            />
          </div>
        </div>
      </div>

      <div>
        <label
          htmlFor="g-custom-domain"
          className="block text-sm font-medium text-neutral-300 mb-2"
        >
          {t.customDomainLabel}
        </label>
        <input
          id="g-custom-domain"
          type="text"
          value={editCustomDomain}
          onChange={(e) => setEditCustomDomain(e.target.value)}
          placeholder={t.customDomainPlaceholder}
          className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white font-mono"
          data-testid="tenant-custom-domain-input"
        />
        <p className="mt-1.5 text-xs text-neutral-500">{t.customDomainHint}</p>
      </div>

      {/* Live preview */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2">
          {t.previewLabel}
        </p>
        <div
          className="flex items-center gap-4 rounded-xl border border-neutral-700/50 bg-neutral-900/50 p-4"
          data-testid="tenant-branding-preview"
        >
          {editLogoUrl.trim() ? (
            // biome-ignore lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint)
            <img
              src={editLogoUrl.trim()}
              alt={t.previewLogoAlt}
              className="h-10 w-10 rounded-lg object-contain bg-neutral-800"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-500">
              {t.previewNoLogo}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span
              className="h-8 w-8 rounded-md border border-white/10"
              style={{
                backgroundColor: /^#[0-9a-fA-F]{6}$/.test(editPrimaryColor)
                  ? editPrimaryColor
                  : 'transparent',
              }}
              title={t.primaryColorLabel}
            />
            <span
              className="h-8 w-8 rounded-md border border-white/10"
              style={{
                backgroundColor: /^#[0-9a-fA-F]{6}$/.test(editAccentColor)
                  ? editAccentColor
                  : 'transparent',
              }}
              title={t.accentColorLabel}
            />
          </div>
          {editCustomDomain.trim() && (
            <span className="text-xs font-mono text-neutral-400 truncate">
              {editCustomDomain.trim()}
            </span>
          )}
        </div>
      </div>
    </fieldset>
  );
}
