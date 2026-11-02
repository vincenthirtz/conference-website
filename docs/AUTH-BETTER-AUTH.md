# Comptes et connexion : Better Auth à la place de Supabase Auth

Étude du 2026-11-01, **lecture seule** : rien n'est construit, rien n'a changé en production. Elle
remplace celle du 2026-10-29. Ordre décidé par la propriétaire pour quitter Supabase : l'API sur Workers
(presque fini), Better Auth, puis D1. Le choix d'aujourd'hui doit donc tenir sur Postgres maintenant et
sur D1 ensuite.

## En bref

**Verdict : faisable, mais pas encore.**

- **Faisable.** Sur un banc d'essai local (moteur des Workers, D1 simulé, aucune donnée réelle), un compte
  repris a gardé son identifiant, son mot de passe bcrypt et son code de double authentification, et un
  jeton signé en est sorti. Reste à prouver sur le vrai réseau : l'accès à la base depuis le Worker.
- **Pas encore.** La bascule change les chemins que l'API sur Worker n'a pas encore tous prouvés : les écritures
  staff sont vues depuis le 2026-11-01, mais aucun refus de double authentification constaté
  (`docs/API-WORKER.md`), et Lightsail vient d'être supprimé, le 2026-11-01. Si ça casse, on ne saurait pas lequel
  des deux changements est en cause.
- **Quand.** Les deux premiers lots, invisibles, dès que des écritures du staff et un refus sont vus sur le
  Worker. La bascule une soirée sans match, une fois le travail fait : **pas avant mi-décembre 2026**, à ce
  rythme de 4 à 6 semaines. Aucun match n'est planifié en base aujourd'hui, à revérifier.
- **Effort.** 22 à 32 jours de travail, soit 4 à 6 semaines. L'estimation du 10-29 (3 semaines) oubliait
  l'absence de double authentification par session, la Library et les vérifications sur un trafic très
  faible : 14 connexions ou renouvellements en 24 h.
- **Pour les personnes.** Tout le monde se reconnecte une fois. Mêmes mots de passe, mêmes comptes Discord.
  Les membres du staff déjà enrôlés gardent leur code si la décision 4 va dans ce sens. Le bot et les
  overlays OBS ne voient rien.

### Coût mensuel : aucune économie

| | Aujourd'hui | Lightsail éteint | Après Better Auth | Après D1 |
|---|---|---|---|---|
| Supabase (plan Free, vérifié) | 0 $ | 0 $ | 0 $ | projet supprimé |
| Workers Paid | 5 $ | 5 $ | 5 $, Hyperdrive inclus | 5 $, D1 dans l'inclus (à mesurer alors) |
| Lightsail (supprimé le 2026-11-01) | 7 $ | 0 $ | 0 $ | 0 $ |
| **Total** | **12 $** | **5 $** | **5 $** | **5 $** |

Supabase Auth est gratuit sur ce plan : le remplacer ne rapporte rien. Le plan Pro (25 $) n'a pas été pris,
donc rien n'est évité aujourd'hui. Ce sont Lightsail, déjà prévu, puis la sortie de la base qui comptent.

**Pourquoi le faire quand même.** D1 en a besoin : Supabase Auth vit dans la base Postgres. Gains modestes,
mais réels : un cookie de session que le JavaScript ne peut plus lire (celui d'aujourd'hui l'est, volontairement,
`utils/supabase.ts`), des secrets de double authentification chiffrés, moins de code dans le navigateur (13 Kio
compressés contre un morceau de supabase-js mesuré à 238 ko en septembre, une fois supabase-js retiré du
navigateur). **Ce qu'on y perd :** la sécurité d'un service tenu par Supabase devient la nôtre. Better
Auth a publié une faille de contournement de la double authentification en 2026, corrigée en 1.4.9
([GHSA-xg6x-h9c9-2m83](https://advisories.gitlab.com/npm/better-auth/GHSA-xg6x-h9c9-2m83/)), et sort souvent
(1.7.15 le jour de cette étude, 1.8 en bêta). Il faudra figer la version et suivre ses alertes.

### Ce que cette étude change par rapport à celle du 10-29

**Plus besoin de garder les 26 règles d'accès à travers Supabase.** L'API écrit en base avec sa clé de service.
Le jeton de la personne n'atteint la base que depuis le cockpit caster (scènes et thèmes) et la Women's Library.
On déplace ces deux usages derrière l'API et Better Auth n'a plus à se faire reconnaître par Supabase, ce qui
est aussi le chemin vers D1, qui n'a pas de règles d'accès.

### Les trois risques principaux

| Risque | Conséquence | Parade |
|---|---|---|
| Une erreur à la bascule | Personne ne se connecte, staff compris | L'API accepte les deux systèmes avant la bascule (lot 6), essai écran par écran (lot 7), retour par un réglage en 10 min, Supabase Auth intact 14 jours |
| Double authentification affaiblie sans bruit | Better Auth ne retient pas si le code a été donné dans la session, et ne le demande qu'après un mot de passe : **une connexion Discord passe sans code** ([doc](https://www.better-auth.com/docs/plugins/2fa)) | Niveau ajouté par nous, déjà essayé sur le banc ; les gardes refusent tout jeton sans niveau ; test du refus avant la bascule |
| Deux chantiers en même temps | Panne impossible à attribuer | Attendre les preuves du Worker, qui n'a plus de serveur derrière lui |

### Décisions de la propriétaire

Les 8 validées le 2026-11-01 telles que recommandées ci-dessous, avec le souhait de basculer bientôt. La reprise des secrets
(décision 4) redemandera un accord explicite au moment de les lire.

1. **La séquence** : les preuves sur le Worker d'abord (P1), bascule ensuite, pas avant mi-décembre.
2. **Women's Library** : la passer sur les salons Cloudflare qui servent déjà aux autres écrans avant la bascule
   (recommandé, à faire de toute façon pour quitter Supabase), la garder sur Supabase Realtime en faisant reconnaître
   Better Auth par Supabase, ou la couper le temps de la bascule.
3. **Reconnexion de tout le monde** : acceptée et annoncée (recommandé), plutôt qu'une passerelle de sessions.
4. **Les secrets de double authentification** : les reprendre (recommandé) ou faire ré-enrôler. La reprise lit ces secrets une fois, par une tâche
   du Worker, et demande un accord explicite.
5. **Durée de session** : celle d'aujourd'hui à relever, 7 jours par défaut chez Better Auth. Recommandé : 30 jours, renouvelés à l'usage.
6. **Accès à la base** : créer un rôle réservé aux tables de comptes et poser son mot de passe dans Hyperdrive, le
   relais de Cloudflare vers Postgres.
7. **Fin de Supabase Auth** : inscriptions coupées chez Supabase à la bascule, et date de purge de `auth.*` (hachages
   et secrets) après les 14 jours. Jusque-là, un ancien mot de passe ouvre encore une session Supabase, que l'API
   refuse mais que PostgREST accepte.
8. **Les e-mails** : textes et expéditeur de la confirmation d'inscription et du changement d'adresse.

## Vérifié ou supposé

Les constats de ce document portent leur source :

| Marque | Sens |
|---|---|
| **[base]** | Lu en base de production le 2026-11-01 : catalogue et comptages uniquement |
| **[code]** | Lu dans les dépôts au 2026-11-01 : site `5c0933abe`, API `45f597e`, bot `62ad3fc` |
| **[doc]** | Documentation officielle lue le 2026-11-01, lien donné |
| **[source]** | Code de better-auth 1.7.15 ou de supabase-js lu dans le paquet |
| **[banc]** | Essayé sur le banc jetable, non versionné : workerd local (miniflare, `nodejs_compat`), D1 simulé, comptes de test |
| **[supposé]** | Déduit, pas prouvé. Voir « À prouver avant de démarrer » |

**Essayé en production depuis le 2026-11-01 :** Hyperdrive et Postgres depuis le Worker, à travers le relais du site.
**Depuis le 2026-11-02 :** un vrai compte, un vrai téléphone, de vrais e-mails, un vrai retour Discord, un essai de bout en bout.
**Pas encore :** le coût de calcul.

### Tableau de bord Auth de Supabase (P4)

Relevé par la propriétaire le 2026-11-01, sur captures, complété par `GET /auth/v1/settings` :

| Réglage | Aujourd'hui | Ce que Better Auth doit faire |
|---|---|---|
| Fournisseurs | `email` et `discord` ; inscriptions ouvertes ; confirmation par e-mail exigée | Les mêmes |
| SMTP | **Aucun.** Les e-mails d'authentification partent de l'expéditeur par défaut de Supabase, limité à **2 par heure** | Envois par Brevo, déjà en place : la limite disparaît. Rien à reprendre : les textes sont à écrire (décision 8) |
| Notifications de sécurité | Actives : mot de passe changé, adresse changée, méthode de connexion liée, retirée, double authentification ajoutée, retirée. Inactive : téléphone changé | **À reproduire, oublié par l'étude :** 6 e-mails de plus au lot 5 |
| Limites par adresse IP | Connexions et inscriptions 30 / 5 min, vérifications de code 30 / 5 min, renouvellements 150 / 5 min, délai de 60 s entre deux envois à une même personne | Point de départ des règles de `customRules`, à la place des 3 par 10 s par défaut |
| Adresses | Site `https://owwomenscup.fr`. Liste de retour : `/auth/discord-member`, `/admin/reset-password`, `/login**`, et le `localhost` de développement | Autoriser l'origine du site entière (`trustedOrigins`) : la liaison Discord revient sur la page d'où elle part (`DiscordLinkCard`), hors de cette liste |
| Sessions | Pas de durée maximale ni de délai d'inactivité (réglages du plan Pro), jeton de 1 h, détection de réutilisation du jeton de renouvellement active | Décision 5 : 30 jours renouvelés à l'usage. Vérifier le comportement de Better Auth si un cookie de session est rejoué |

### Plan Free : le bandeau de quota (2026-11-01)

Le tableau de bord affiche « Grace period is over ». D'après [la doc](https://supabase.com/docs/guides/platform/billing-faq#fair-use-policy),
il reste affiché même revenu sous les limites, et signifie qu'**au prochain dépassement il n'y a plus de délai** : pause, lecture seule
ou 402 sur tous les appels, levés au cycle suivant ou tout de suite par le passage en Pro. Quota de journaux annoncé par la doc : 5 Go,
[facturation pas encore active](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest). Estimation de ce jour : environ
3,6 Go par mois (48 000 lignes sur 24 h, à 2,75 Ko), dont 91 % d'appels à l'API de la base, que seul le passage à D1 retire. Le quota à
l'origine du bandeau n'est pas connu : la page Usage n'est pas lisible avec nos outils. Le tableau de coût plus haut suppose que le plan
Free tient jusque-là : **en cas de restriction, le plan Pro (25 $ par mois) est le recours immédiat**, à la décision de la propriétaire.

## 1. Inventaire de la dépendance à Supabase Auth

### Code

Fichiers suivis par git, tests exclus **[code]**. Occurrences / fichiers. Le site et l'API partagent 14 de ces
occurrences par la synchro : **130 appels distincts**.

| | Site (2 873 fichiers) | conference-api (2 300) | Bot (117) |
|---|---|---|---|
| `.auth.*`, total | 73 / 34 | 71 / 46 | 0 |
| `auth.admin.*` | 11 / 11 | 51 / 37 | 0 |
| — `getUserById` | 9 | 28 | |
| — `updateUserById` | 0 | 7 | |
| — `createUser`, `deleteUser` | 0 | 5, 4 | |
| — `generateLink`, `listUsers` | 1, 1 | 4, 3 | |
| `auth.getUser`, `auth.getSession` | 7, 14 | 13, 3 | 0 |
| `auth.mfa.*` | 9 / 1 (`StaffMfaPanel.tsx`) | 0 | 0 |
| Connexion, sortie : `signInWithPassword`, `signInWithOAuth`, `signOut`, `signUp` | 3, 3, 9, 0 | 0, 0, 1, 2 | 0 |
| Liens : `verifyOtp`, `exchangeCodeForSession`, `setSession`, `updateUser`, `linkIdentity` | 3, 3, 2, 6, 1 | 0 | 0 |
| `@supabase/ssr` | 5 / 3 | 5 / 3 | 0 |
| `getServerClient(` | 6 / 5 | 17 / 15 | 0 |
| `user_metadata` | 29 / 19 | 59 / 31 | 0 |
| `Bearer ` (dont cron et tiers côté API) | 60 / 30 | 139 / 69 | sans objet |
| `aal` | 36 / 4 | 30 / 4 | 0 |
| Tests qui mentionnent ces appels | 54 fichiers | 14 fichiers, plus le double `supabaseMock.ts` | 0 |

Le bot n'a ni supabase-js ni trace de `auth.users` : il appelle l'API avec sa clé. Dans l'API, `getServerClient` ne
sert qu'à lire la session. Partout, en production, les lectures et écritures passent par `supabaseAdmin` : les
`supabaseAdmin ?? getServerClient` de `news` et du plan du site ne prennent pas leur second chemin.

**Le jeton de la personne vers la base, en entier [code] :**

| Depuis le navigateur | Tables | Volume |
|---|---|---|
| `hooks/useCasterScenes.ts`, `components/admin/caster/ThemePanel.tsx` | `caster_scenes`, `caster_themes` : lecture, ajout, modification, suppression | 12 appels |
| `hooks/useCasterTheme.ts`, `pages/overlay/caster/[sceneKey].tsx` | Lecture, publique | 2 appels |
| `features/player/library/realtime/` | Canaux privés Supabase Realtime | 1 client, 4 canaux |
| `hooks/useRealtimeChannel.ts`, `useCasterPresence.ts` | Branche Supabase, éteinte : `NEXT_PUBLIC_REALTIME_BACKEND=cloudflare`, publication vide **[base]** | 0 en temps normal |

Tout le reste du navigateur passe par `/api/*`, sur la même origine, avec `Authorization: Bearer` dès qu'il faut une
session.

### Base

Lecture seule, 2026-11-01 **[base]**.

| | Mesure |
|---|---|
| Clés étrangères vers `auth.users` | **44** depuis 36 tables de `public` : 24 en cascade, 20 à null (plus 10 internes à `auth`) |
| Déclencheurs posés sur `auth.*`, vues, valeurs par défaut | 0 |
| Fonctions | **9** : 8 lisent `auth.users` (`admin_list_users`, `admin_search_users`, `admin_get_user_profiles`, `admin_search_tcg_players`, `count_confirmed_auth_users`, `get_user_id_by_email`, `tcg_trade_eligibility`, `clear_supporter_role_on_roster_join`, déclencheur sur `team_members`), 1 utilise `auth.uid()` (`library_can_join`). Aucune n'utilise `auth.jwt()` |
| Règles d'accès de `public` | 92 sur 72 tables, dont **26 avec `auth.uid()`** sur 13 tables, 0 avec `auth.jwt()` ou `auth.role()` |
| Règles de `realtime` | 6 sur `messages`, toutes pour la Library, dont 4 pour `authenticated` qui passent par `library_can_join` |
| Règles de `storage` | 0 (fichiers sur R2) |
| Publication `supabase_realtime` | 0 table |
| Tables `public`, RLS active | 178 sur 178 |

**Sur les 26 règles, le code n'en exerce que 7 [code + base] :** les 6 d'écriture de `caster_scenes` et `caster_themes`,
et `staff_select_own`, lue par leur sous-requête. Les 19 autres (`event_*`, `caster_presence`, `demandes`,
`notification_prefs`, `push_subscriptions`, `teams`) ne protègent plus que contre un appel direct à PostgREST avec un
jeton de session.

**Trafic vers Supabase sur 24 h** (une requête de journaux, le 11-01) **[base]** : 36 889 vers `rest`, 313 `GET /auth/v1/user`,
99 lectures `admin/users/:id`, 14 `POST token`, le reste à 1 ou moins, 1 seule requête `realtime`.

### Ce qui casse si le jeton n'est plus émis par Supabase

| Élément | Effet | Remède |
|---|---|---|
| `resolveUserFromToken` (`utils/staff.ts`), `getUser` côté API | 401 sur toutes les routes à jeton | Lot 6 |
| `getServerClient().auth.getUser()`, cookies, 15 fichiers d'API, 5 du site | Personne n'est connectée : liaisons Battle.net, Twitch, Discord, onboarding, pages admin | Lots 1 et 6 |
| `aalFromAccessToken` (`utils/staffMfa.ts`) | Niveau illisible, donc « pas `aal2` » : renvoi vers `/admin/mfa`, 403 sur les routes sensibles. Sûr, mais le staff est bloqué | Même claim `aal` dans notre jeton |
| `supabaseClient.auth.getSession()`, 14 sites | « Session manquante », tout `authedRequest` échoue | Lot 7 |
| `supabaseClient.from('caster_*')` | Cockpit refusé par PostgREST ou par les règles | Lot 2 |
| Canaux privés de la Library | `library_can_join` sans identité : refus | Lot 3 |
| `auth.admin.*` | Répondent encore, mais sur des comptes figés : compte neuf introuvable (`subject_not_found`), adresses périmées | Lot 1, puis lot 4 |
| 44 clés étrangères | Compte neuf absent de `auth.users` : **écritures refusées** sur `team_members`, `staff`, `demandes`… | Lot 4 |
| 8 fonctions | Listes admin sans les comptes neufs, métadonnées divergentes | Lot 4 |
| E-mail de confirmation, changement d'adresse | Plus envoyés (modèles Supabase) | Lot 5 |

Sans effet **[code]** : tickets des salons Durable Objects (signés par l'API après la lecture de session), clés du bot,
jetons `pk_live` de l'API publique, overlays OBS sans compte.

## 2. Parcours à conserver

Identités en base **[base]** : `email` et `discord`, rien d'autre. Battle.net et Twitch ne sont pas des fournisseurs
Supabase : ce sont nos propres OAuth, dans `user_battlenet_links` et `user_twitch_links`.

| Parcours | Aujourd'hui **[code]** | Avec Better Auth | État |
|---|---|---|---|
| Inscription | `/api/auth/register` : limite, qualité de l'adresse, rôle borné, puis `signUp` anon | Même route, `auth.api.signUpEmail`, rôle et métadonnées en champs internes | **[banc]** pour l'inscription |
| Confirmation | E-mail et modèle Supabase, `/auth/v1/verify` | `emailVerification.sendVerificationEmail` par Brevo ([doc](https://www.better-auth.com/docs/authentication/email-password)) | À écrire |
| Connexion | `signInWithPassword`, 3 écrans dont le portail développeurs | `POST /sign-in/email` | **[banc]** |
| Mot de passe oublié | `/api/auth/forgot-password` : `generateLink` + Brevo, `/admin/reset-password` (`verifyOtp`) | `sendResetPassword` par Brevo, `/reset-password`. Mettre `revokeSessionsOnPasswordReset` à vrai, faux par défaut ([doc](https://www.better-auth.com/docs/authentication/email-password)) | **[doc]** |
| Changer mot de passe, adresse, tout déconnecter | `updateUser`, `signOut({ scope: 'global' })` | `/change-password`, `/change-email`, `/revoke-sessions` | **[source]** |
| Discord, connexion | `signInWithOAuth` ×3, `/auth/discord-member`, `/api/auth/link-discord` | Fournisseur `discord`, retour à déclarer dans l'application Discord. 21 identités ont une autre adresse que le compte : `allowDifferentEmails` **[base]** | **[source]**, pas de vrai Discord |
| Discord, liaison | `linkIdentity`, `user_discord_links`, pseudo lu dans `identity_data` | `linkSocial`. Better Auth ne garde pas `identity_data` : stocker le pseudo à la liaison | **[source]** |
| Battle.net | Notre OAuth. Connexion : `generateLink` + `verifyOtp` sur `/auth/battlenet` | OAuth inchangé. Le pont disparaît : le retour ouvre directement la session | **[banc]** pour la session |
| Twitch | Notre OAuth, liaison seule | Inchangé, seule la lecture de la personne change | **[code]** |
| Accès équipe | `generateLink` (magic link) + Brevo, `/auth/team-access` | Greffon `magicLink` | **[source]** |
| Comptes créés par d'autres | `createUser` : admin, bot (`register-user`), portail développeurs, `findOrCreateUserByEmail` | Même porte (lot 1). Le contrat du bot ne change pas : mêmes UUID | **[code]** |
| Admin comptes | `features/admin/users/service/accounts.ts` : mot de passe, suspension, nom, rôle, suppression | Porte ; suspension par nos soins, 1 compte concerné. Pas le greffon `admin`, qui ouvre aussi `/admin/impersonate-user` | **[source]** pour le greffon, le reste à écrire |
| Effacement RGPD | `erasePersonalData` + `deleteUser`, cascades | Mêmes cascades, repointées | Lot 4 |
| Double authentification | `StaffMfaPanel`, `/admin/mfa`, `withStaffPage`, `assertStaffMfa`, claim `aal` | Voir ci-dessous | **[banc]** |
| Inspection staff (`?as=`) | Lecture de la cible et journal (`utils/subject.ts`), jamais d'usurpation de session | Porte, sans changement de sens | **[code]** |

### Double authentification : le point le plus délicat

Supabase donne un niveau par session : `aal1`, puis `aal2` après le code. **Better Auth n'a pas cette notion** : un drapeau
`twoFactorEnabled` sur le compte, et une barrière posée seulement sur `/sign-in/email`, `/sign-in/username` et
`/sign-in/phone-number` **[source + [doc](https://www.better-auth.com/docs/plugins/2fa)]**. Discord, magic link et session
ouverte par Battle.net passent sans code.

Montage essayé **[banc]** : une colonne `aal` sur la session, à `aal1` par défaut ; un crochet après `/two-factor/verify-*`
qui la passe à `aal2` ; le même `aal` dans le jeton. `aalFromAccessToken`, `withStaffPage`, `assertStaffMfa` et l'exemption
ne changent pas. Constaté : connexion par mot de passe, pas de session avant le code ; session sans mot de passe, `aal1`,
puis `aal2` après le code, sans nouvelle connexion.

**Piège constaté [banc] :** écrire `aal2` en base ne suffit pas. Le cache de session en cookie et le jeton restent à `aal1`
tant que le crochet ne réécrit pas le cookie (`setSessionCookie`). À figer par un test.

Écarts à traiter : Better Auth propose des codes de secours, absents aujourd'hui (table `twoFactor`, champ obligatoire ; à
montrer ou non à l'enrôlement) ; `twoFactor.enable` demande le mot de passe, et `allowPasswordless` pour les 27 comptes Discord
seuls, au cas où un membre du staff en serait un.

### Session entre les deux Workers

- Depuis le 2026-10-31, le navigateur n'appelle plus que `owwomenscup.fr/api/*` : le site relaie vers `owwomenscup-api` par
  liaison de service. `NEXT_PUBLIC_API_REMOTE_PREFIXES` est retirée (`docs/API-WORKER.md`). Le cookie reste sur
  `owwomenscup.fr`, sans cookie partagé entre sous-domaines, à n'activer
  [que si nécessaire](https://www.better-auth.com/docs/concepts/cookies).
  `api.owwomenscup.fr` ne voit ni cookie ni session : API publique et webhooks. Une route Worker sur ce nom n'y change rien.
- Espaces : 3, aucun domaine propre **[base]**, donc une seule adresse de base `https://owwomenscup.fr`.
- **Better Auth dans le Worker de l'API**, sur `/api/identity/*` : `/api/auth/` est déjà occupé par nos routes. Un seul Worker
  pour l'API, décidé le 10-31, avec les secrets et les envois Brevo déjà là. L'étude du 10-29 proposait un Worker à part :
  abandonné. Contrepartie : une saturation mémoire de l'API bloquerait aussi la connexion.
- **Montage proposé [supposé]** : dans `worker/`, après l'enveloppe et avant OpenNext, `auth.handler(request)`
  ([doc](https://www.better-auth.com/docs/installation)). L'enveloppe écrase `x-forwarded-for` avec la vraie adresse
  (`appRequest`, **[code]**), lue par défaut par Better Auth. À défaut : `toNodeHandler` dans `pages/api`
  ([doc](https://www.better-auth.com/docs/integrations/next)).
- **Jeton à courte durée pour `/api/*` :** le navigateur garde `Authorization: Bearer`, avec un jeton du greffon `jwt`, ES256,
  5 min, vérifié dans l'API sans aller-retour. Ainsi `withAuthRoute` reste sans CSRF : passer tout au cookie obligerait à ajouter
  le contrôle d'origine sur toutes ces routes. Le cookie de session, lui, n'est plus lisible en JavaScript. [La doc du
  greffon](https://www.better-auth.com/docs/plugins/jwt) précise qu'il ne remplace pas la session : ici il la complète. Une
  suspension met jusqu'à 5 min à s'appliquer sur les routes joueuses, 60 s sur le staff (`getStaffByUserId`).
- **Rendu serveur du site** (`withStaffPage`, onboarding) : il transmet le cookie à `/api/identity/get-session` par la liaison
  `API_WORKER`. Aucun secret ni code Better Auth dans le Worker du site. **Piège de synchro :** `utils/staff.ts` est une copie
  de l'API, la lecture de session doit donc passer par un module propre à chaque dépôt, sous un nom qui ne se synchronise pas
  (`docs/API-WORKER.md`, « Piège de la synchro »).
- **Relais :** ajouter `/api/identity/*` à `API_WORKER_UNREPLAYABLE_READS` et aux familles jamais en cache : un retour OAuth se
  consomme, et `GET /get-session` peut écrire ([doc](https://www.better-auth.com/docs/concepts/session-management)).

Le service worker ne touche ni à `/auth/` ni aux cookies `sb-` **[code]**.

## 3. Better Auth sur Workers

Version lue : **1.7.15**, publiée le 2026-11-01 **[source]**.

### Calcul et taille

Banc, PC de développement, durées vues de l'extérieur, 5 essais **[banc]**. Ordre de grandeur, pas une mesure de production.

| | Mesure |
|---|---|
| `bcryptjs.compare`, `$2a$10$` (la forme des 90 hachages, **[base]**) | 63 ms médiane, appel à vide 2 ms |
| scrypt par défaut de Better Auth (`hashPassword`) | 60 ms : la condition `workerd` du paquet prend `node:crypto`, pas la version JavaScript **[source]** |
| Nouvelle instance `betterAuth()` à chaque requête | 7 ms |
| Connexion complète sur D1 simulé | ~150 ms |
| Serveur : better-auth + `twoFactor` + `jwt` + bcryptjs, minifié | 794 Kio, 217 Kio gzip |
| Le même avec `pg` | 881 Kio, 244 Kio gzip |
| Navigateur : client React + greffons | 34 Kio, 13 Kio gzip |

Limites **[doc](https://developers.cloudflare.com/workers/platform/limits/)** : 128 Mo par exemplaire, 64 Mio de script,
5 min de calcul au maximum. Le Worker pèse 25,13 Mio, à 120 s de calcul : **Better Auth y ajoute 3 %, un mot de passe y
coûte 60 ms.** À 14 `POST token` par jour, c'est négligeable sur les 30 M ms incluses. **Garder bcrypt :** aucun gain à
passer à scrypt, et ça garde le retour arrière ouvert. Le guide officiel utilise le module natif `bcrypt`, absent des
Workers : `bcryptjs` à la place. Fixer `maxPasswordLength` à 72, comme `registerSchema` : bcrypt s'arrête là.

### Accès à la base

Better Auth parle SQL, pas PostgREST, et l'API n'a aucune connexion directe aujourd'hui.

| | Hyperdrive, connexion directe | Hyperdrive, session pooler | Adaptateur maison sur PostgREST |
|---|---|---|---|
| Coût | Inclus, requêtes illimitées ([doc](https://developers.cloudflare.com/hyperdrive/platform/pricing/)) | Inclus | 0 $ |
| Conseillé par | [Cloudflare pour Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/) | [Supabase pour un réseau IPv4](https://supabase.com/docs/guides/database/connecting-to-postgres) | [API `createAdapterFactory`](https://www.better-auth.com/docs/guides/create-a-db-adapter), suite de tests fournie |
| Obstacle | **Le nom direct n'a qu'une adresse IPv6 [vérifié par DNS]**, l'option IPv4 est réservée au plan Pro ; [la doc de Hyperdrive ne parle pas d'IPv6](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/) | Deux pools l'un sur l'autre, limite du pooler non lue | 8 méthodes à écrire et tester, pas de transaction |
| Latence | 20 à 30 ms par requête, 1 à 3 avec Placement ([FAQ](https://developers.cloudflare.com/hyperdrive/reference/faq/)), non mesuré ici | Plus lent **[supposé]** | Comme l'API aujourd'hui, 50 à 450 ms par lecture |
| Secret | Mot de passe de base chez Cloudflare | Idem | Aucun nouveau |

**Recommandation : Hyperdrive,** d'abord en direct, puis par le session pooler si l'IPv6 ne passe pas. L'essai tient en une
commande. L'adaptateur reste le plan de secours : il a les mêmes limites que D1, sans transaction, mais c'est du code d'authentification
de plus à maintenir. Le cache de session en cookie rend ces lectures rares.

Réglages imposés par la doc :

- **Cache coupé** (`--caching-disabled`) : Hyperdrive n'invalide rien, et [Cloudflare cite l'authentification et les
  sessions](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/) comme cas à ne pas mettre en cache ;
- **client créé dans le gestionnaire**, jamais en global (même page), `pg` ≥ 8.16.3 ;
- **limite d'origine à 5**, le minimum ([doc](https://developers.cloudflare.com/hyperdrive/configuration/tune-connection-pool/)) :
  `max_connections` vaut 60, 17 en cours au moment de la mesure **[base]** ;
- **pool en mode transaction :** pas de verrou consultatif ni de `SET` de session
  ([doc](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/)). Better Auth n'en a pas besoin **[supposé]** ;
- **un rôle dédié**, limité aux tables de comptes, pas `postgres`.

### Passage à D1

- **Better Auth 1.7.15 embarque son propre `D1SqliteDialect`** **[source]** : `database: env.DB` suffit. Sur le banc, il a créé les
  7 tables et tout le scénario a tourné **[banc]**. [La doc](https://www.better-auth.com/docs/adapters/other-relational-databases)
  ne cite encore que le dialecte communautaire `kysely-d1`, et [sa page SQLite](https://www.better-auth.com/docs/adapters/sqlite)
  ne dit rien de D1. Se fier au code, et le re-tester à chaque montée de version.
- **Pas de transaction interactive** **[source]** : Better Auth enchaîne alors ses écritures, et [une écriture reste faite si la
  suivante échoue](https://www.better-auth.com/docs/guides/create-a-db-adapter). Donc aucune logique maison ne doit dépendre d'une
  transaction, dès la version Postgres.
- **Capacité :** chaque base D1 traite une requête à la fois ([doc](https://developers.cloudflare.com/d1/platform/limits/)),
  sans enjeu pour les comptes à ce volume **[supposé]**. Prix : [25 milliards de lignes lues et 50 millions écrites incluses par
  mois](https://developers.cloudflare.com/workers/platform/pricing/).

**Ce qui fait tenir le choix sur D1 :** mêmes tables et noms de colonnes des deux côtés, aucun appel de fonction SQL ni déclencheur
dans les crochets, limites de fréquence en table, navigateur sans accès à la base. Seule la ligne `database` change. Les 8 fonctions
qui lisent les comptes seront réécrites avec le reste de la base.

**Rejeté :** Better Auth sur D1 dès maintenant, le reste sur Postgres. Les 44 clés étrangères et les 8 fonctions exigent les comptes
dans Postgres : il faudrait deux sources de vérité.

### Sessions sans mémoire de processus

Les sessions vivent en base par défaut ([doc](https://www.better-auth.com/docs/concepts/session-management)), rien ne reste en
mémoire. Le cache en cookie signé évite une lecture par requête : **60 s**, comme les caches de l'API. Une session révoquée reste donc
valable 60 s au plus. `disableCookieCache: true` sur les actions sensibles. La faille de 2026 touchait justement ce cache avec la double
authentification : version ≥ 1.4.9 obligatoire, et notre test de niveau par-dessus. `advanced.backgroundTasks.handler` se branche
sur `waitUntil`, comme `runInBackground` **[source]**. Le secret se renouvelle sans perte
([doc](https://www.better-auth.com/docs/reference/security)).

### Limites de fréquence partagées

La mémoire, défaut de Better Auth, [ne vaut rien sans serveur](https://www.better-auth.com/docs/concepts/rate-limit).
`storage: 'database'` compte en table : sur le banc, une rafale sur `/sign-in/email` donne 401 puis 429 ×5 **[banc]**. Défaut : 3 par
10 s sur la connexion. Le [Rate Limiting de Workers](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
est approximatif et par lieu : pas retenu. Pour une limite stricte, un Durable Object, ou `consume_rate_limit` déjà en place par
`customStorage.consume`, qui doit rester atomique. Retenu : `database`, valable aussi sur D1. Coût : une écriture de plus par appel
aux routes d'identité.

## 4. Le maintien des règles d'accès

**Oui, Supabase accepte un émetteur OIDC personnalisé.** Conditions
([tiers](https://supabase.com/docs/guides/auth/third-party/overview), [OIDC](https://supabase.com/docs/guides/auth/third-party/custom-oidc)) **[doc]** :

- découverte à `<issuer>/.well-known/openid-configuration`, en HTTPS, clés au `jwks_uri` ;
- jetons asymétriques avec `kid`, HS256 refusé ;
- claim `role` à `authenticated`, sinon la requête passe en `anon` ; `sub` converti en UUID par `auth.uid()` ;
- `Data API`, `Storage`, `Realtime` et `Functions` le reconnaissent. Clés relues périodiquement, 30 min pour une rotation ;
- ajout par le tableau de bord ou l'API de gestion, pas par le CLI ; Supabase Auth ne se désactive pas ;
- **si Supabase Auth reste actif à côté, ajouter une règle restrictive sur `iss`**, sinon les deux émetteurs sont crus.

**Plan :** [Free : 50 000 utilisateurs tiers par mois, Pro : 100 000](https://supabase.com/pricing), on en a 33. La page OIDC ne cite
aucun plan, et [la page de décompte](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users-third-party) ne
nomme que Clerk, Firebase, Auth0 et Cognito : disponible sur Free **[supposé]**, l'ajout dans le tableau de bord le dira.

**Algorithme :** ES256 et RS256 sont documentés [pour les clés de Supabase](https://supabase.com/docs/guides/auth/signing-keys), EdDSA
« à venir » ; rien n'est écrit pour un émetteur tiers. ES256 **[supposé]**. Le greffon `jwt` est en EdDSA par défaut, à régler en
`keyPairConfig.alg: 'ES256'`. Sur le banc, en-tête `ES256` + `kid`, `sub` en UUID, `role`, `aal`, `iss`, `aud` **[banc]**. Le greffon ne
publie pas la découverte **[source]** : document fixe à servir. Enfin, un client supabase-js avec l'option `accessToken` lève une erreur
sur `.auth` **[source]**, donc deux clients pendant la cohabitation.

**Recommandation : ne pas s'en servir, sauf pour garder la Library sur Supabase Realtime.** Seules 7 règles sur 26 sont exercées, par
un cockpit réservé au staff, et D1 n'aura pas de règles d'accès. Passer ces écritures par l'API revient au même contrôle (« membre du
staff actif ») et sert deux fois. Une fois `auth.*` purgé, plus personne ne reçoit le rôle `authenticated` : les droits de ce rôle sur les
178 tables ne sont plus atteignables par une session. RLS reste active, le rôle `anon` garde ses 10 règles, et l'API reste la seule
autorité, comme c'est déjà le cas partout ailleurs.

Si la Library reste sur Realtime : fournisseur OIDC, compter 1 à 2 jours, et règle sur `iss` pendant la cohabitation.

## 5. Migration des comptes

Comptages en lecture seule, 2026-11-01 **[base]**. Comme les comptes restent dans la même base, la reprise se fait en SQL
(`INSERT … SELECT`) : **rien ne quitte Postgres**, seuls les secrets TOTP passent par le Worker.

| Élément | Mesure | Reprise |
|---|---|---|
| Comptes | **117** : aucun sans adresse, aucun anonyme, aucune adresse en majuscules ni en double, 0 non confirmé, 33 connectés sur 30 jours | Même UUID, donc les 44 clés, les rosters et le bot suivent. `generateId: 'uuid'` donne une colonne `uuid` sur Postgres **[source]**, indispensable aux clés étrangères |
| Comptes suspendus | 1 | **Le script du guide les ignore sans le greffon `admin`** : la clé étrangère casserait. Les reprendre, avec notre propre champ |
| Mots de passe | **90**, tous `$2a$10$` | Copie telle quelle, **personne ne change son mot de passe**. Vérifié sur un hachage de test de même forme **[banc]**, aucun vrai hachage lu |
| Identités e-mail | 86 | `account` à `providerId: 'credential'` |
| **Mot de passe sans identité e-mail** | **4** | D'après le guide, le mot de passe suit l'identité `email` : **ces 4-là le perdraient [supposé].** Partir de `auth.users` |
| Identités Discord | 74 sur 73 comptes (une personne en a deux), 0 sans adresse, 21 avec une autre adresse que le compte | `account` à `providerId: 'discord'`, `accountId` = identifiant Discord (forme correcte pour les 74) |
| Comptes Discord seuls | 27 | Aucun mot de passe à reprendre |
| Métadonnées | `role` 117, `display_name` 88, `battle_tag` 68, `avatar_url` 50, `twitch` 17, `signup_source` 3… | Champs de `auth_user`. **Pas de table de profil aujourd'hui :** `auth.users` en tient lieu |
| Facteurs | TOTP uniquement, chiffres gardés hors de ce dépôt public | Voir plus bas |
| Staff actif | Répartition gardée hors de ce dépôt public | L'exemption porte sur un UUID conservé : **aucun réglage à changer** |
| Sessions | Comptées, chiffres gardés hors de ce dépôt public | **Non transférables** ([guide](https://www.better-auth.com/docs/guides/supabase-migration-guide)) : reconnexion. La fonction de purge `purgeSupabaseAuthStorage` existe déjà |
| Règles d'accès | 26 + 6 | Non reprises, voir § 4 |

**Ne pas prendre le script du guide tel quel :** module natif, 4 comptes et 1 suspendu perdus, ni double authentification ni règles
d'accès couvertes **[doc]**. Il garde son utilité comme liste de champs.

**Secrets de double authentification : récupérables [base]**, comptage sur la forme sans lecture de valeur. Better Auth accepte l'import sous la forme `base32:<secret>`, chiffrée avec son secret, à condition de
SHA-1 et de mêmes chiffres et période ([doc](https://www.better-auth.com/docs/plugins/2fa)). Sur le banc, un secret ainsi repris accepte
un code calculé indépendamment **[banc]**. Que Supabase produise bien du SHA-1 à 6 chiffres et 30 s reste **[supposé]**, à prouver au
lot 5 avec le vrai téléphone de la propriétaire. Le fait d'importer par une tâche unique du Worker évite qu'un secret passe par un PC.

**Liens en attente :** 5 récupérations en cours, sans valeur après la bascule : les personnes refont la demande.

### Retour arrière de la bascule

Pendant 14 jours : `auth.users` reste en place, un réglage ramène l'ancien système (~10 min, comme pour le temps réel). Les clés restent
sur `auth_user`, que le miroir continue d'alimenter : rien à défaire en base. Ce qui a changé entre-temps se rejoue par un script :
comptes créés et mots de passe modifiés, avec `admin.createUser({ id, password_hash })`, que le type de GoTrue accepte **[source]**,
possible parce qu'on garde bcrypt. Un facteur enrôlé entre-temps est perdu : à ré-enrôler. Tout le monde se reconnecte une fois de plus.
Passé 14 jours et la purge, le retour n'existe plus.

## 6. Plan

Estimations de l'auteur de l'étude, en jours de travail. Celle du Worker de l'API s'est révélée à la fois longue sur le papier et rapide
à écrire, mais la preuve sur du trafic réel ne se compresse pas : à ce volume, un chemin rare peut mettre des jours à passer.

### À prouver avant de démarrer

| # | Preuve | Par qui | Si ça rate |
|---|---|---|---|
| P1 | Des écritures de vraies sessions staff : **vues le 2026-11-01** (cockpit caster, `PATCH` en 204, overlay à jour, en base depuis Cloudflare seulement). **Le refus d'une session sans code** sur une route sensible, sur le Worker : **vu le 2026-11-02** avec une session Better Auth `aal1` (`mfa_required` sur `/api/admin/circuit-partners`) | Fait | Sans objet |
| P2 | Lightsail supprimé : **fait le 2026-11-01** (`docs/API-WORKER.md`), route Worker sur `api.owwomenscup.fr`, pont retiré, plus de repli | Fait | Sans objet |
| P3 | Configuration **créée le 2026-11-01** : rôle `auth_app` (migration `add_auth_app_role`, 63 contrôles sur 63 sur une restauration), **connexion directe acceptée par Cloudflare**, l'obstacle IPv6 ne s'est pas présenté. Supabase ne reçoit que l'empreinte SCRAM du mot de passe, qui ne va qu'à Hyperdrive. **Aller-retour vu en production :** une connexion ratée sur une adresse réservée lit `auth_user` et écrit `auth_rate_limit`, aucune session, comptes inchangés | Fait | Sans objet |
| P4 | Relevé du tableau de bord Auth : **fait le 2026-11-01**, voir « Tableau de bord Auth de Supabase » | Fait | Sans objet |
| P5 | **Fait le 2026-11-01**, monté hors de Next, dans l'enveloppe : déployé à 28,5 Mio (limite 64), 5,7 Mio compressés. Chargé seulement après la clé de la route, donc aucun effet sur le démarrage ni sur les autres routes. Sur workerd en local : bcrypt 77 ms à la vérification, clés ES256 valides | Fait | Sans objet |
| P6 | Le fournisseur OIDC s'ajoute sur le plan Free, **seulement si la Library reste sur Realtime** | Propriétaire | Salons Durable Objects |

### Lots

Toute migration est écrite dans conference-api et appliquée par la propriétaire. Aucun lot ne redéploie le bot.

| Lot | Ce qu'il change | Vérification | Retour arrière | Jours |
|---|---|---|---|---|
| **1. Une seule porte** — **fait le 2026-11-01** | `utils/identity.ts` (API, recopié au site) et `utils/identityBrowser.ts` (site), qui rendent ce que rend Supabase : 49 appels `auth.admin` côté API, `getUser`, 59 appels propres au site. Les 80 mentions de `user_metadata` ne bougent pas. Garde-fou `identityDoorGuard` dans les deux dépôts. Aucun effet visible | Tests et CI, `worker-routes-check`, volumes `/auth/v1/*` identiques | `git revert` | 3–4 |
| **2. Plus de jeton vers la base** — **fait et essayé en conditions réelles le 2026-11-01** | Routes `/api/admin/caster/*` pour les scènes et thèmes, même garde que la page (`caster`, plus étroite que l'ancienne règle « staff actif » : arbitres et aides n'ouvrent pas le cockpit), cockpit et overlay dessus. `/api/overlay/caster/*` **sans cache** : l'enveloppe met en cache un GET anonyme avec `s-maxage`. Garde-fou `casterNoDirectDb` | Scène modifiée dans le cockpit → overlay OBS à jour, en conditions réelles. Journaux : plus d'appel `rest/v1/caster_*` depuis un navigateur | `git revert` | 2–3 |
| **3. Library** — **fait et basculé le 2026-11-01, sans essai réel à deux navigateurs** (Library non utilisée, décision de la propriétaire) | Quatre canaux privés sur les salons du Worker temps réel (`docs/REALTIME-DO.md`, étape 5), décidés par `GET …/rooms/{id}/realtime-tickets`. L'API diffuse encore aux deux transports, jusqu'au lot 9 | Mêmes refus que `library_can_join` (`libraryRealtimeTickets.test.ts`) ; `realtime-check` à chaque déploiement du Worker. **À lire à la première vraie visite :** présence, chat, une ligne `[publish]` réelle | Interrupteur (une ligne, `LIBRARY_REALTIME_BACKEND`) | 3–5, ou 1–2 |
| **4. Tables de comptes** — **fait le 2026-11-01** : essayé sur une restauration (58 contrôles sur 58, `db-restore-test` avec `auth_trial`), appliqué par la propriétaire, vérifié en production (117 comptes, 90 mots de passe, 74 comptes liés, aucun écart). `getUserById` lit le miroir, avec repli sur Supabase. **Reste pour le lot 8 :** `clear_supporter_role_on_roster_join` ÉCRIT dans la source, elle n'a pas été réécrite. Le relevé du schéma et les types sont reportés à la main : à régénérer au prochain passage avec une clé de service | Tables `auth_user`, `auth_account`, `auth_session`, `auth_verification`, `auth_two_factor`, `auth_jwks`, `auth_rate_limit`, RLS sans règle, aucun droit pour `anon` et `authenticated`. Copie, puis miroir par déclencheurs sur `auth.users` et `auth.identities`. **44 clés repointées** en `NOT VALID` puis `VALIDATE`, 8 fonctions réécrites, la porte lit la table : 99 appels GoTrue de moins par jour | Essai de la migration sur une restauration (`db-restore-test`, logs en chiffres seuls). Comptages égaux, sorties des fonctions égales par empreinte, inscription réelle visible dans le miroir. Clé anon et jeton de session refusés sur ces tables (Supabase donne par défaut des droits sur toute table neuve de `public`), garde-fou comme `sensitiveColumnsGrantsSql` | Migration `_revert`, rien de perdu tant que `auth.users` est la source | 3–4 |
| **5. Better Auth dans l'ombre** — **fait le 2026-11-02**, essayé en production avec un vrai compte, un vrai téléphone, de vrais e-mails et un vrai Discord (voir « Lot 5 : ce qui reste ») : déployé le 2026-11-01, route fermée (404 sans le secret `IDENTITY_SHADOW_KEY` et sa clé), inscriptions coupées, seuls les comptes de `IDENTITY_SHADOW_EMAILS` peuvent changer, Supabase reste la seule source des autres. Scénario sur un vrai Postgres, Discord simulé au réseau (PGlite, `identityAuth.test.ts`) : hachage repris, jeton ES256, `aal1` puis `aal2` sans reconnexion, limites, suspension, origine, e-mails, liaison et retrait. En production, à blanc : aller-retour Hyperdrive, refus de l'ombre, page d'essai. Restent : voir « Lot 5 : ce qui reste » | `/api/identity/*` sur le Worker, sans écran. Hyperdrive, bcrypt, jeton ES256, `aal`, limites, e-mails par Brevo, retour Discord ajouté à côté de l'ancien, relais et cache | Le scénario du banc, en production sur un compte de test : connexion, code, jeton, Discord, e-mails reçus ; un compte créé par Supabase avec un vrai hachage ; le vrai téléphone ; coût CPU réel | Retirer la route | 3–4 |
| **6. L'API accepte les deux** — **fait le 2026-11-02** (API `96ad238`, `e30cf2d`, site `68a28721c`), interrupteur `IDENTITY_ACCEPTED` dans le `wrangler.jsonc` de l'API. La porte choisit par `iss`, l'enveloppe du Worker pose le lecteur (`worker/identityBackend.ts`) ; le site le demande à l'API (`GET /api/identity-session`, `cloudflare/identityReader.ts`). Vu en production avec le compte d'essai : routes joueuses à jeton 200, routes staff 403 « reconnu, pas staff » par jeton et par cookie, jeton forgé 401 partout, session fermée sans effet passé la minute des caches, `/admin` rendu par le site : connexion sans session, `/403` avec. Puis la propriétaire, connectée par Discord sans code (`aal1`) : `/api/admin/alerts-summary` 200, `/api/admin/circuit-partners` refusé `mfa_required`. Restent : l'exemption (même identifiant, non essayée) et l'ajout à `worker-routes-check` (il faudrait les identifiants d'essai dans la CI) | Porte serveur : jeton par `iss`, cookies `sb-*` ou Better Auth, `aal` des deux côtés. Rendu serveur par `API_WORKER` | Matrice de gardes (joueuse, staff, sensible) avec les deux jetons, **`aal1` refusé**, exemption, jeton forgé refusé, ajoutée à `worker-routes-check` | Réglage | 2 |
| **7. Écrans derrière interrupteur** — **7a déployé et essayé le 2026-11-02** (site `9abb66b3f`, API `6bfdccc`) par la propriétaire avec `?auth=better-auth` : Discord jusqu'à l'administration, mot de passe du compte d'essai jusqu'à l'espace joueur, pages rendues par le site (6 lectures `/api/identity-session`), déconnexion, retour à Supabase ; 0 erreur serveur : `utils/authBackend.ts` (`NEXT_PUBLIC_AUTH_BACKEND`, `?auth=better-auth` gardé par le navigateur, une connexion traversant plusieurs pages), `utils/identityBrowserBetterAuth.ts` chargé à la demande, appels directs à `/api/identity` sans bibliothèque. Pris en charge : session, jeton de 5 min renouvelé, mot de passe avec code sur la page de connexion (le code vient avant la session chez Better Auth), Discord, déconnexion, niveau. La session porte `metadata` (l'ancien `user_metadata`). **7b à faire** : liens par e-mail (réinitialisation, accès équipe, Battle.net, que l'API fabrique encore avec Supabase), changements de compte (mot de passe, adresse, profil), enrôlement et retrait de la double authentification (Better Auth demande le mot de passe), liaison Discord du profil, portail développeurs | `NEXT_PUBLIC_AUTH_BACKEND` et `?auth=` par page, comme `?realtime=`. Connexion, inscription, réinitialisation, `discord-member`, `team-access`, `battlenet`, `StaffMfaPanel`, profils, `DiscordLinkCard`, déconnexion, portail développeurs | Essai manuel de chaque parcours du § 2 avec `?auth=`, propriétaire et un caster. L'e2e était rouge depuis la séparation (pas d'API dans le job) : à vérifier, puis réparer ou assumer | Interrupteur | 3–5 |
| **8. Bascule** | Soirée sans match, annonce. Copie finale, import des secrets, inscriptions coupées chez Supabase, interrupteur, l'API cesse d'accepter les jetons Supabase | 48 h de journaux : 5xx et 401 sur `/api/identity/*`, inscriptions, connexion du staff, MFA. Rejeu du contrôle de déploiement | Réglage en ~10 min, script de rejeu, voir § 5 | 1 + 2 de suivi |
| **9. Nettoyage** (≥ 14 jours) | Retrait du miroir, du code Supabase Auth, de `@supabase/ssr`, de la branche Realtime et des 26 + 6 règles. Purge de `auth.*` selon décision 7. CSP allégée | Tests, poids du bundle (`bundle-budget`) | `git revert` ; la purge ne se défait que par sauvegarde | 2 |

**Total : 22 à 32 jours**, selon la Library et l'accès à la base.

### Lot 5 : ce qui reste

**Prouvé en production le 2026-11-02, sur un compte d'essai créé par le vrai parcours Supabase** (son adresse est dans le secret
`IDENTITY_SHADOW_EMAILS`, hors de ce dépôt) : connexion avec un vrai hachage `$2a$10$`, enrôlement et code avec le vrai téléphone de la
propriétaire, session et jeton `aal2` directement après le code. Puis un essai de bout en bout automatique, 21 contrôles sur 21 : jeton ES256
vérifié par `/jwks`, `aal1` puis `aal2` sans reconnexion, mot de passe seul sans session, clé au format SHA-1 6 chiffres 30 s, code calculé par
une implémentation indépendante de la RFC 6238, changement de mot de passe et désactivation en `aal2`, envois acceptés par Brevo sans
erreur, aller vers Discord avec le bon retour. Aucun autre compte n'a bougé : adresses et hachages identiques à Supabase, aucun jeton Discord gardé.

**Deux défauts trouvés par ces essais, corrigés et figés par des tests qui échouent sans la correction :**

- une session sans code (lien, Discord) pouvait désactiver la double authentification, et sans rien d'autre pour un compte sans mot de
  passe (`allowPasswordless`). Tout ce qui change un compte protégé demande maintenant `aal2`, comme chez Supabase (API `6ddf19b`) ;
- changer de mot de passe en déconnectant les autres appareils ouvrait une session neuve à `aal1`. Elle garde maintenant le niveau de celle
  qu'elle remplace (API `c4e4e40`).

**Vus ensuite par la propriétaire :** les e-mails reçus dans la boîte principale, pas en indésirables, avec le bon expéditeur ; un vrai
retour Discord dans un navigateur, qui ouvre le compte lié (`aal1`) sans rien écrire d'autre qu'une session : liaison inchangée, aucun jeton
gardé. Le secret client Discord vient de Supabase : ne jamais le régénérer chez Discord, ça couperait la connexion actuelle. La double
authentification Supabase d'un compte n'est pas encore connue de Better Auth : reprise des secrets au lot 8, avec accord explicite.

**À trancher ou à écrire avant la bascule, connu et assumé pour l'instant :**

- le délai de 60 s entre deux envois à une même personne n'est pas repris : seule la limite par adresse IP existe ;
- la longueur minimale du mot de passe reste celle de Better Auth (8), à aligner sur l'inscription actuelle ;
- le pseudo Discord (`identity_data`) n'est pas écrit à la liaison, à faire au lot 7 avec `DiscordLinkCard` ;
- `last_sign_in_at` et `metadata` ne sont alimentés que par le miroir, à reprendre au lot 8 ;
- une preuve de format des secrets repris de Supabase (SHA-1, 6 chiffres, 30 s) n'existe que sur un secret neuf ; un secret réel se lit avec un accord explicite, au lot 8 ;
- le coût de calcul en production n'est pas mesuré : le journal automatique est coupé. Temps vus de l'extérieur : 300 à 660 ms pour une connexion ratée, 60 ms pour une lecture de session sans cookie ;
- `BETTER_AUTH_SECRET` n'existe que chez Cloudflare : à sauvegarder avant d'importer les secrets de double authentification, qu'il chiffrera ;
- à la bascule : retirer la page d'essai, l'ombre et `disableImplicitSignUp`.

### Ce qui peut cohabiter

- **Deux jetons et deux cookies** : l'API les accepte tous à partir du lot 6.
- **Deux adresses de retour Discord** dans l'application Discord **[supposé, usage courant]**.
- **Deux systèmes sur le même navigateur**, page par page, avec `?auth=`.
- **Les comptes** : Supabase reste la source jusqu'à la bascule, le miroir alimente `auth_user`, et les écrans lisent déjà cette table.

**Ne cohabite pas :** l'écriture des comptes (une seule source à la fois) et l'enrôlement en double authentification, qui reste chez
Supabase jusqu'au soir de la bascule. Les e-mails de confirmation ne partent que d'un seul côté.

### Après la bascule

Le chantier D1 retrouve des comptes déjà prêts : tables portables, aucune règle d'accès à reprendre sur ce sujet, navigateur sans accès à la
base. Restent les 2 500 appels `.from()` et les fonctions SQL, qui ne relèvent pas de cette étude. Le Worker de l'API, les salons Durable Objects et R2
restent tels quels.

## En attendant : ce qui protège déjà

- **Double authentification du staff active** sur le site et l'API.
- **Cloudflare Access devant `/admin`**, en option : gratuit jusqu'à 50 personnes, ne remplace rien, à étudier à part (le cockpit `/admin/caster` et
  les routes `/api/admin/*` passent par la même origine).
