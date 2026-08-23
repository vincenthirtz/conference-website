# Backlog — acquisition de joueuses (faire venir, faire rester)

> Étude du 2026-08-23. Périmètre : **l'entonnoir d'acquisition** — comment une joueuse
> découvre le site, crée un compte, rejoint une équipe et revient. Par opposition aux backlogs
> [réseau esport](./BACKLOG-reseau-esport.md) (liquidité entre équipes déjà présentes),
> [réseau intelligent](./BACKLOG-reseau-intelligent.md) (rétention d'équipe) et
> [tournois](./BACKLOG-tournois.md) (rail compétitif).
>
> Chaque constat est ancré sur du code (`fichier:ligne`) **et** sur l'état réel de la base de
> production, relevé le 2026-08-23.
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S (< 1 h) / M (qq h) / L (chantier).

---

## 1. État des lieux (prod, 2026-08-23)

| Rail          | Mesure                                             | Valeur                       |
| ------------- | -------------------------------------------------- | ---------------------------- |
| Comptes       | `auth.users` (dont créés sur 90 j)                 | 46 (24)                      |
| Équipes       | actives / ouvertes au recrutement                  | 11 / 10                      |
| Roster        | `team_members`                                     | 31                           |
| Tournoi       | tournois / équipes inscrites                       | 3 / 9                        |
| Entrée solo   | `free_players` / demandes `type='join'`            | 6 / 6                        |
| Réseau        | profils découverte / comptes Discord liés          | 1 / 10 (sur 46)              |
| **Newsletter**| `newsletter_subscribers` (toutes statuts confondus)| **0**                        |
| Emails        | `email_deliveries`                                 | **0**                        |
| Contenu       | actus publiées                                     | 36                           |
| **Mesure**    | outil d'analytics web installé                     | **aucun**                    |

**Lecture.** Première inscription le 2025-11-15, dernière le 2026-08-20 : ~46 comptes en
9 mois, soit environ **5 comptes par mois**. Le produit est massivement sur-construit par
rapport à l'audience (ligues, scouting, régie broadcast, rating Glicko-2, marché de scrims,
portail développeur… pour 31 joueuses inscrites). Le goulot d'étranglement n'est plus la
fonctionnalité : c'est **l'acquisition** (personne n'arrive) et l'**activation** (celles qui
arrivent n'ont pas de chemin si elles n'ont pas déjà une équipe).

---

## 2. Constats structurels

### A1 · On pilote à l'aveugle — 🟥 / S

Aucun outil d'analytics web n'est installé : `grep` sur `plausible|umami|gtag|posthog|matomo`
ne remonte rien hors du dashboard admin interne. Le bandeau cookies demande pourtant le
consentement pour les catégories `analytics` et `marketing`
([CookieBanner.tsx:31](../components/CookieBanner/CookieBanner.tsx#L31)), et
[hooks/useCookieConsent.ts](../hooks/useCookieConsent.ts) le stocke proprement — **mais rien ne
consomme ce consentement**. On demande une permission qu'on n'utilise pas.

Conséquence : on ignore combien de visiteuses arrivent, d'où elles viennent, et à quelle étape
elles décrochent. Impossible de savoir si « 0 inscrite newsletter » veut dire « formulaire
cassé » ou « 12 visiteuses par jour ». **Tout le reste de ce backlog se pilote avec cette
mesure** — d'où le lot 0.

### A2 · La joueuse solo n'a aucun chemin sur le site — 🟥 / M

Le hero propose deux portes : « Créer une équipe » et « Discord »
([HomeHeroV2.tsx:97](../components/Home/HomeHeroV2.tsx#L97)). Les 3 étapes de la home partent
toutes de `/team/create` ([HomeSteps.tsx:24](../components/Home/HomeSteps.tsx#L24)). Et la FAQ
inscription répond noir sur blanc :

> « L'inscription se fait par équipe. Si tu cherches un roster, passe sur le Discord »
> — [inscription-2026.tsx:96](../pages/inscription-2026.tsx#L96)

Or **la joueuse seule est le plus gros gisement** : celle qui n'a pas déjà cinq copines n'a
littéralement rien à faire sur le site, on la renvoie ailleurs. Le marché « joueuses libres »
existe (6 lignes) mais il est alimenté **uniquement** par un rôle Discord synchronisé par le bot,
et il n'est lisible que par une capitaine **connectée** dont l'équipe est déjà créée
([free-players.ts:3](../pages/api/teams/free-players.ts#L3), gate `assertTeamPermission`).
Le seul point d'entrée on-site — `/player/join-team` — est derrière login et invisible depuis
la home.

### A3 · Rien n'est indexable ni partageable — 🟥 / M

- **Aucune page publique « équipes qui recrutent »**. Le flag `is_joinable` est pourtant posé sur
  10 équipes sur 11, et l'API existe (`/api/teams?joinable=1`,
  [teams/index.ts:79](../pages/api/teams/index.ts#L79)) — mais elle n'est consommée que par
  `/player/join-team`, derrière login ([join-team.tsx:79](../pages/player/join-team.tsx#L79)).
  Le sitemap ne liste aucune page d'annuaire.
- **Aucun partage social natif** : pas de bouton de partage, pas d'OG image dynamique par équipe
  ou par match. L'OG par défaut est une photo statique pour tout le site
  ([DefaultSeo.tsx](../components/Seo/DefaultSeo.tsx), `DEFAULT_IMAGE = '/img/fourplayers.jpg'`).
- **La découverte joueuse est invisible par défaut** (opt-in global, décision produit assumée) :
  1 profil sur 46 comptes. Ce lot ne doit pas la remettre en cause — c'est aux **équipes**
  d'être visibles, pas aux personnes.
- [config/socials.ts](../config/socials.ts) est un **résidu vide du template AsyncAPI** (tous les
  liens commentés pointent vers AsyncAPI). Les vrais réseaux (TikTok, Instagram, Twitch, YouTube)
  sont codés en dur dans [footer.tsx:67](../components/Footer/footer.tsx#L67) et n'existent
  nulle part ailleurs sur le site.

### A4 · Rien ne relance, rien ne fait revenir — 🟥 / M

`newsletter_subscribers` = **0** et `email_deliveries` = **0**. Le formulaire est pourtant présent
sur **toutes** les pages (footer) plus une section dédiée sur la home
([index.tsx:110](../pages/index.tsx#L110)). Or l'endpoint crée une ligne `pending` **avant**
d'envoyer l'email de confirmation
([newsletter/subscribe.ts](../pages/api/public/newsletter/subscribe.ts)) : zéro ligne signifie donc
que **personne n'a jamais soumis le formulaire avec succès**.

> **Tranché le 2026-08-23** — test réel de bout en bout en production : captcha servi, POST accepté,
> ligne `pending` créée, email Brevo reçu, lien de confirmation cliqué, ligne passée à `confirmed`.
> **Le tunnel n'est pas cassé.** Zéro inscrite = zéro soumission = il n'y a personne sur le site.
> Ce qui déplace le problème là où il est vraiment : l'acquisition, pas la plomberie.

Au-delà de la newsletter : aucun email de cycle de vie. Une joueuse qui crée un compte et ne
rejoint aucune équipe ne reçoit jamais rien. Une capitaine dont le roster est à 3/6 non plus.

### A5 · Le contenu existant n'est pas exploité en haut d'entonnoir — 🟧 / M

36 actus publiées et un flux RSS ([footer.tsx](../components/Footer/footer.tsx), `/api/news/rss`) :
c'est un actif réel. Mais tout est du contenu « bas d'entonnoir » (résultats, annonces) destiné à
qui connaît déjà. Aucune page ne répond aux questions que se pose une joueuse qui **ne connaît pas**
le tournoi : quel niveau faut-il, c'est quoi un scrim, à quoi ressemble un premier tournoi.

### A6 · Le frein n'est pas que technique — 🟧 / S

Deux informations décisives sont vraies mais quasi invisibles :

- **aucun rang minimum** — l'info n'existe que dans une réponse de FAQ au milieu de
  `/inscription-2026` ;
- **la modération et le cadre de sécurité** — `/rules`, la charte et le ticketing support existent,
  mais rien n'est mis en avant en page d'accueil.

C'est le premier frein cité par les joueuses qui n'osent pas se lancer. Le rendre visible coûte
peu et lève une barrière que ni le SEO ni la pub ne lèveront.

---

## 3. Lots priorisés

### Lot 0 — Voir : instrumenter l'entonnoir — 🟥 / M · **prérequis à tout le reste**

Sans mesure, chaque lot suivant est un pari. Contenu :

- Analytics web **provider-agnostique** (Plausible ou Umami, cookieless, RGPD-friendly),
  branché sur le consentement **existant** du bandeau cookies — aucune collecte sans opt-in
  explicite sur la catégorie `analytics`.
- Pageviews SPA (changement de route Next) + événements de conversion nommés :
  `register_start` → `register_done` → `team_created` / `join_request_sent` → `checkin_done`,
  plus `newsletter_submit`.
- **Attribution** : capture des `utm_*` + referrer + page d'atterrissage à la première visite,
  conservée jusqu'à l'inscription et stockée sur le compte (`signup_source` en user metadata —
  pas de table `profiles` dans ce projet, tout vit dans `auth.users.raw_user_meta_data`).
- CSP : autorisation de l'hôte analytics **uniquement quand il est configuré**
  ([proxy.ts](../proxy.ts)), sinon la politique reste byte-identique.
- Diagnostic du tunnel newsletter (cf. A4) une fois la mesure en place.
- Mentions légales : nommer l'outil et sa politique de données.

**Critère de sortie** : un tableau de bord qui répond « combien de visiteuses / combien de comptes
créés / où ça décroche », et la réponse tranchée sur la newsletter (trafic nul vs formulaire cassé).

### Lot 1 — Le parcours « je joue seule » — 🟥 / L · **le plus fort levier**

- Page publique **`/rejoindre`** : « Pas d'équipe ? On te trouve un roster. » CTA de rang égal à
  « Créer une équipe » dans le hero et dans les 3 étapes de la home.
- Formulaire **sans compte obligatoire d'abord** : pseudo, rôle (tank/DPS/support), disponibilités,
  niveau approximatif → crée une entrée `free_players` **côté site** (aujourd'hui : Discord
  uniquement). Le compte se crée à la première mise en relation.
- Lecture **publique anonymisée** des joueuses libres (pseudo + rôle + dispos, jamais de contact),
  pour prouver qu'il y a du monde.
- Notification aux capitaines d'équipes non-pleines dès qu'une joueuse libre correspond au besoin
  (le canal outbox → bot Discord existe déjà).
- Réécrire la FAQ « peut-on s'inscrire seule » : la réponse devient **oui**, avec un lien.

**Critère de sortie** : ≥ 30 joueuses libres et ≥ 10 mises en relation abouties sur l'édition suivante.

### Lot 2 — Surfaces publiques indexables — 🟥 / L

- **`/equipes`** public : annuaire filtrable (recrute / rôle recherché / fuseau / niveau), SSR,
  dans le sitemap. Le back existe, il manque la page.
- Fiches d'équipe partageables : **OG image dynamique** (logo + nom + « recherche 2 supports »),
  JSON-LD `SportsTeam`.
- Bouton « Cette équipe recrute » ⇒ candidature possible **sans compte** (compte créé à
  l'acceptation).
- La découverte **joueuse** reste opt-in et non indexée : ce lot rend visibles les **équipes**.

**Critère de sortie** : `/equipes` et `/team/[slug]` indexées, premières entrées organiques sur
« équipe Overwatch féminine recrute ».

### Lot 3 — Activation & relance — 🟥 / M

- Emails de cycle de vie sur l'infra Brevo déjà en place : J+0 bienvenue → J+2 « tu n'as pas
  d'équipe, voici 5 équipes qui recrutent » → J+7 relance → J-3 avant clôture des inscriptions.
- Relance capitaines : « ton roster est incomplet (3/6), voici les joueuses libres ».
- Newsletter réparée (lot 0) puis alimentée : récap d'édition, portraits, dates.

**Critère de sortie** : taux « compte créé → équipe rejointe » mesuré, puis +50 %.

### Lot 4 — Viralité & partage — 🟧 / M · *à lancer une fois ~100 joueuses actives*

- **Parrainage** : lien traçable par joueuse, compteur dans l'espace joueuse, badge symbolique.
  C'est le canal n°1 en esport féminin — le recrutement se fait par cercles d'amies.
- Cartes partageables auto-générées (inscription d'équipe, résultat de match, podium), format
  Story 9:16 pour TikTok/Instagram — les deux comptes existent déjà.
- Boutons de partage sur fiche équipe / résultat / actu.
- Supprimer [config/socials.ts](../config/socials.ts) (résidu AsyncAPI) et remonter les réseaux
  hors du footer.

### Lot 5 — Contenu & réassurance — 🟧 / L · *effet différé de 2-3 mois*

- 5 à 8 pages evergreen : « comment débuter Overwatch en compétition », « trouver une équipe
  Overwatch féminine », « c'est quoi un scrim », « les ranks expliqués », « ton premier tournoi :
  à quoi t'attendre ».
- Page **« Débutantes bienvenues »** : aucun rang minimum (déjà vrai, jamais mis en avant), format
  Swiss expliqué, ce qu'il se passe si on perd.
- **Charte et sécurité en page d'accueil** : modération, staff, comment signaler (cf. A6).
- Portraits de participantes des éditions passées — 36 actus de matière déjà disponible.

### Lot 6 — Faire revenir entre deux tournois — 🟧 / L

- **Format d'entrée à faible engagement** : soirée découverte / tournoi 1 jour à rosters mixés,
  **inscription individuelle**, équipes composées par l'organisation. Meilleur convertisseur pour
  une joueuse solo : elle joue le soir même et repart avec 4 contacts.
- Réactiver la ladder de scrims permanente (inutile à 11 équipes, utile à 40).
- Étendre le récap hebdomadaire (déjà livré, cf. N7) aux joueuses **sans** équipe.

---

## 4. Séquencement suggéré

1. **Lot 0** seul, d'abord — tout le reste se pilote avec.
2. **Lot 1 + Lot 3** en parallèle : l'un amène les joueuses solo, l'autre les empêche de partir.
   Ce sont les deux qui bougent l'aiguille au niveau d'audience actuel.
3. **Lot 2 + Lot 5** (SEO) : à démarrer tôt, sans en attendre de résultat avant 2-3 mois.
4. **Lot 4 + Lot 6** : n'ont de sens qu'au-delà de ~100 joueuses actives. Du parrainage sans
   personne à qui envoyer le lien ne produit rien.

---

## 5. Limite de cette étude

Le levier n°1 à ce stade n'est probablement **pas** dans le code, mais dans la présence terrain
(Discord partenaires, streameuses, associations étudiantes esport, relais Blizzard FR). Le rôle du
site est de **convertir** ce trafic, pas de le créer. Les lots ci-dessus préparent cette conversion ;
ils ne remplacent pas le travail de communauté.

---

## 6. Journal

- **2026-08-23** — étude initiale, relevé prod, 7 lots définis (0 → 6).
- **2026-08-23** — **Lot 0 livré** : analytics consent-gated provider-agnostique
  (`lib/analytics/*`), pageviews SPA, 6 événements de conversion, attribution UTM →
  `signup_source`, CSP conditionnelle.
- **2026-08-23** — collecteur retenu : **Umami auto-hébergé** sur la Freebox
  (`docker-box`, unités `umami.service` + `umami-db.service`, vhost `stats.owwomenscup.fr`,
  mise en service par `scripts/init-umami.sh`). Reste hors code : DNS du sous-domaine,
  création du site dans Umami, puis `NEXT_PUBLIC_ANALYTICS_{PROVIDER,HOST,SITE_ID}` dans Netlify.
- **2026-08-23** — tunnel newsletter vérifié en production de bout en bout : il fonctionne
  (cf. A4). Le « 0 inscrite » est un problème d'audience, pas de code.
- **2026-08-23** — **Lot 0 EN PRODUCTION.** Umami est en ligne sur
  `https://stats.owwomenscup.fr` (Freebox), les trois `NEXT_PUBLIC_ANALYTICS_*` sont posées
  dans Netlify, le site est déployé et la CSP autorise le collecteur. Chaîne validée de bout
  en bout par un événement synthétique (1 pageview / 1 visiteur enregistrés). **La mesure est
  active** — le constat A1 est levé, et les lots suivants se pilotent désormais sur des
  chiffres réels plutôt que sur des hypothèses.
- **Prochain jalon** : laisser tourner quelques jours pour disposer d'une ligne de base
  (visiteuses/jour, sources, taux `register_start` → `register_done`), puis attaquer le
  **Lot 1** — le parcours « je joue seule ».
