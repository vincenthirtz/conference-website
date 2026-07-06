# i18n — État des lieux & plan d'avancement

> Préparé le 2026-07-06. Système déjà initialisé (espace joueur/capitaine) ;
> ce document cadre l'extension au reste du site.

## 1. Existant (ne pas réinventer)

- **Système maison**, zéro dépendance : `lib/i18n/LanguageProvider.tsx`
  (contexte React + persistance `localStorage`, clé `cw_player_lang`) +
  `lib/i18n/useT.ts` (`useT('<namespace>')`, interpolation `format()`,
  pluriel via clés `_one`/`_other`).
- **Dictionnaires centraux** : `lib/i18n/locales/fr.json` (source de vérité,
  typée) et `en.json` — **25 namespaces, ~653 clés**. Garde-fou de parité
  fr/en : `tests/unit/i18nLocaleParity.test.ts`.
- **Provider global** : monté dans `_app.tsx` — tout le site peut déjà
  consommer `useT`. SSR et premier rendu toujours `fr` (anti-mismatch
  d'hydratation), `<html lang>` synchronisé côté client.
- **Toggle FR/EN** : `components/Navbar/LanguageToggle.tsx`, rendu uniquement
  dans `PlayerTopBar` et `pages/espace-capitaine.tsx`.
- **Couverture actuelle** : les 12 pages `pages/player/*`, `espace-capitaine`,
  la Navbar, et 15 composants `components/player/*` + `components/Navbar/*`
  (+ `SupportAssoCard`). **Le site public est en français en dur** (~41 pages).
- **Pas de routing par locale** (pas de `/en/*`), hreflang limité à `fr-FR` +
  `x-default`. L'admin (`/admin/*`) est FR only — choix assumé, hors scope.

## 2. Décisions à acter avant d'avancer

1. **Exposer le toggle au public** : ajouter `LanguageToggle` à la Navbar
   publique (desktop + mobile) et/ou au Footer. Sans ça, traduire les pages
   publiques ne sert à rien. (Renommer à terme la clé localStorage
   `cw_player_lang` → `cw_lang`, avec lecture de l'ancienne clé en fallback.)
2. **Rester en toggle client pour la V1** (pas de `/en` indexable). Le
   routing par locale (SEO anglais) est une V2 — voir §5.
3. **Contenu éditorial en base** (news, descriptions d'équipes/tournois) :
   non traduit en V1. Seule l'UI (chrome) est bilingue.
4. **Admin reste FR.**

## 3. Plan par phases (UI publique, pattern actuel)

Méthode par page : 1 namespace par page/composant dans `fr.json` + `en.json`
(la parité est testée), remplacer les littéraux par `t.*`, `format()` pour les
variables. Estimations en volume de clés ≈ ordre de grandeur.

### Phase A — Socle transverse public (petit, débloque tout)
- `components/Navbar` : ajouter le `LanguageToggle` public (la navbar est déjà i18n).
- `components/Footer`, `CookieBanner`, `Toast` génériques, `OfflineBanner`,
  `PWAInstallAndUpdate`, pages `403.tsx` / `404.tsx`.
- ~6 namespaces, ~80 clés.

### Phase B — Parcours d'entrée & conversion (fort trafic anglophone potentiel)
- `login.tsx`, `register.tsx`, `inscription-2026.tsx`, `team/create.tsx`,
  `don.tsx`, `association.tsx`, `contact.tsx`, `partenaires/demande.tsx`.
- ~8 namespaces, ~200 clés (don/association sont verbeux).

### Phase C — Cœur compétitif public
- `index.tsx` (home + composants `Home/*`, `Hero`, `News` (chrome), `Team`,
  `Press`, `Socials`), `tournaments.tsx`, `tournoi.tsx`, `tournament/[id]`,
  `match/[id]`, `team/[slug]` (composants `Team/*`), `leaderboard.tsx`,
  `scrims.tsx`, `scrim/[id]`, `live.tsx`, `cast/[matchId]`, `leagues/*`.
- ~14 namespaces, ~350 clés. C'est le gros morceau ; découper par page,
  une PR par page ou groupe cohérent.

### Phase D — Éditorial longue traîne
- `about.tsx`, `rules.tsx`, `guide/*`, `lore.tsx`, `builds.tsx`,
  `timeline-2026.tsx`, `partenaires.tsx`, `developpeurs.tsx`,
  `mentions-legales.tsx`, `plan-du-site.tsx`, `jeux.tsx`, `hero-picker.tsx`.
- ⚠️ Pages à très longs contenus (rules, lore, mentions légales) : des blobs
  JSON deviennent illisibles. Option : un module TS par langue
  (`content/rules.fr.ts` / `.en.ts`) sélectionné via `useLang()`, plutôt que
  des centaines de clés.

### Phase E (V2, optionnelle) — SEO anglais indexable
- Routing par locale Next (`i18n: { locales: ['fr','en'] }` dans
  `next.config.js`, compatible Pages Router mais à valider avec le plugin
  Netlify), hreflang `en` dans `components/Seo/DefaultSeo.tsx`, sitemap
  alterné, SSR dans la bonne langue (supprime la contrainte « premier rendu
  toujours fr »).
- News bilingues = schéma DB (`title_en`, `content_en`…) — chantier à part.

## 4. Garde-fous & conventions

- fr.json est la référence typée : ajouter les clés en fr ET en en, sinon le
  test de parité échoue (`npx vitest run tests/unit/i18nLocaleParity.test.ts`).
- Pas de texte utilisateur concaténé : toujours `format(t.key, { var })`.
- Les dates/nombres passent par `toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')`
  (pattern déjà en place dans `pages/player/index.tsx`).
- Ne pas traduire les données issues de la DB en V1 (news, noms, descriptions).
- e2e : les specs Playwright existantes assertent du texte FR ; le défaut
  restant FR (localStorage vierge), elles ne cassent pas. Ajouter par phase un
  smoke « toggle EN » sur 1–2 pages représentatives.

## 5. Ordre de bataille proposé

| # | Chantier | Taille | Valeur |
|---|----------|--------|--------|
| 1 | Phase A (toggle public + socle) | S | Débloque tout |
| 2 | Phase B (conversion) | M | Inscriptions/dons anglophones |
| 3 | Phase C (compétitif) | L | Expérience spectateur EN |
| 4 | Phase D (éditorial) | M | Complétude |
| 5 | Phase E (SEO / routing) | L | Acquisition EN — à décider |
