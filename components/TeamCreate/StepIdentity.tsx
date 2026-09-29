// components/TeamCreate/StepIdentity.tsx — étape 1 du wizard : identité de l'équipe
// (lot P11 : extrait de pages/team/create.tsx à l'identique — mêmes classes,
// mêmes textes).

import Link from 'next/link';
import { isValidHttpUrl } from './wizardModel';
import type { TeamCreateWizard } from './useTeamCreateWizard';

export default function StepIdentity({ w }: { w: TeamCreateWizard }) {
  const {
    t,
    name,
    setName,
    shortName,
    setShortName,
    country,
    setCountry,
    logoUrl,
    setLogoUrl,
    website,
    setWebsite,
    description,
    setDescription,
    discord,
    setDiscord,
    touched,
    markTouched,
    stepHeadingRef,
    nameError,
    inputCls,
    labelCls,
    errCls,
  } = w;
  return (
    <section key="step-1" className="wizard-step-enter space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
            {t.teamInfoEyebrow}
          </p>
          <h2
            ref={stepHeadingRef}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            {t.mainDetailsTitle}
          </h2>
        </div>
        <Link href="/" className="text-sm text-gray-300 hover:text-white">
          {t.backHomeArrow}
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="team-name" className={labelCls}>
            {t.nameLabel} *
          </label>
          <input
            id="team-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => markTouched('name')}
            aria-invalid={touched.name && !!nameError()}
            aria-describedby={
              touched.name && nameError() ? 'err-name' : undefined
            }
            className={inputCls}
            placeholder={t.namePlaceholder}
          />
          {touched.name && nameError() && (
            <p id="err-name" className={errCls}>
              {nameError()}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="team-short" className={labelCls}>
            {t.shortNameLabel}
          </label>
          <input
            id="team-short"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            className={inputCls}
            placeholder="OWC"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="team-country" className={labelCls}>
            {t.countryLabel}
          </label>
          <input
            id="team-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={inputCls}
            placeholder={t.countryPlaceholder}
          />
        </div>

        <div>
          <label htmlFor="team-discord" className={labelCls}>
            {t.discordLabel}
          </label>
          <input
            id="team-discord"
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            onBlur={() => markTouched('discord')}
            aria-invalid={touched.discord && !isValidHttpUrl(discord)}
            aria-describedby={
              touched.discord && !isValidHttpUrl(discord)
                ? 'err-discord'
                : undefined
            }
            className={inputCls}
            placeholder="https://discord.gg/…"
          />
          {touched.discord && !isValidHttpUrl(discord) && (
            <p id="err-discord" className={errCls}>
              {t.validationDiscordUrl}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="team-logo" className={labelCls}>
            {t.logoLabel}
          </label>
          <input
            id="team-logo"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            onBlur={() => markTouched('logoUrl')}
            aria-invalid={touched.logoUrl && !isValidHttpUrl(logoUrl)}
            aria-describedby={
              touched.logoUrl && !isValidHttpUrl(logoUrl)
                ? 'err-logo'
                : undefined
            }
            className={inputCls}
            placeholder="https://…png"
          />
          {touched.logoUrl && !isValidHttpUrl(logoUrl) && (
            <p id="err-logo" className={errCls}>
              {t.validationLogoUrl}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="team-website" className={labelCls}>
            {t.websiteLabel}
          </label>
          <input
            id="team-website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            onBlur={() => markTouched('website')}
            aria-invalid={touched.website && !isValidHttpUrl(website)}
            aria-describedby={
              touched.website && !isValidHttpUrl(website)
                ? 'err-website'
                : undefined
            }
            className={inputCls}
            placeholder="https://…"
          />
          {touched.website && !isValidHttpUrl(website) && (
            <p id="err-website" className={errCls}>
              {t.validationWebsiteUrl}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="team-desc" className={labelCls}>
          {t.descriptionLabel}
        </label>
        <textarea
          id="team-desc"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputCls}
          placeholder={t.descriptionPlaceholder}
        />
      </div>
    </section>
  );
}
