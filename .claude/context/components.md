# Composants

## Layout & Navigation

- `Navbar/navbar.tsx` — Barre de navigation principale (menu, auth, rôle staff)
- `Navbar/navDrop.tsx` — Menu déroulant navigation
- `Footer/footer.tsx` — Pied de page
- `Header/header.tsx` — Header avec image de fond
- `Seo/DefaultSeo.tsx` — Balises SEO (via `page.seo` sur chaque page)

## Sections de contenu

- `About/about.tsx` — Section "À propos" (avec vidéo YouTube)
- `News/HomeNewsSection.tsx` — Aperçu des news sur la home
- `News/ActualitesPreviewSection.tsx` — Mise en avant du tournoi mixte (anciennement actu OW)
- `News/PatchNotesSection.tsx` — Section patch notes
- `Live/LiveTwitchSection.tsx` — Statut live Twitch
- `Popup/popup.tsx` — Modal/popup

## Cartes & Listes

- `Speaker/speaker.tsx` — Carte casteur/streamer
- `Team/Team.tsx` — Carte équipe
- `PastEditionCard/index.tsx` — Carte édition passée
- `Slider/slider.tsx` — Carousel (react-slick)

## Formulaires

- `Form/Contact.tsx` — Formulaire de contact
- `Form/subscription.tsx` — Inscription email

## UI de base

- `Buttons/button.tsx` — Bouton (props: `overlay`, `size`, `as`, `disabled`)
- `Buttons/BackToTopButton.tsx` — Retour en haut
- `Dropdown/dropdown.tsx` — Select dropdown
- `Typography/heading.tsx` — Titres (h1-h6, `typeStyle` pour variantes)
- `Typography/paragraph.tsx` — Paragraphes (`typeStyle`, `textColor`)

## RGPD

- `CookieBanner/CookieBanner.tsx` — Bannière cookie consent
- `CookieBanner/CookieSettingsButton.tsx` — Bouton paramètres cookies

## Illustrations (SVG)

- `illustration/Socials/` — LinkedIn, X (Twitter), YouTube
- `illustration/` — arrow, arrows, cancel, dropdown, hamburger, link, mapPointer, plus, activityLoader

## Hooks

- `hooks/useSiteSettings.ts` — Settings dynamiques depuis `/api/site-settings` (cache client)
- `hooks/useCookieConsent.ts` — Gestion RGPD cookies (localStorage + sync tabs)
