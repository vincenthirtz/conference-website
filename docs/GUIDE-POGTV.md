# POGTV — mise en route de l'espace et de l'API

> Guide destiné à l'équipe **POGTV**. Il couvre ce qu'il reste à faire pour
> ouvrir l'espace, comment monter le tournoi, et comment brancher vos outils
> (overlays, scripts, site) sur notre API **sans rien payer**.
>
> Rédigé le 16 septembre 2026, sur l'état réel de la plateforme à cette date.
> Contact plateforme : Women's Cup (owwomenscup@gmail.com).

## 0. Votre espace

|                        |                                                |
| ---------------------- | ---------------------------------------------- |
| Nom                    | **POGTV**                                      |
| Slug (identifiant API) | **`pogtv`**                                    |
| Id interne             | `7fb7ffb6-fcbe-4908-816e-bd4b31d198f8`         |
| Plan                   | `regie`, actif, **essai jusqu'au 16 octobre 2026** |
| Domaine propre         | aucun (non nécessaire)                         |
| Clé API (préfixe)      | `pk_live_5b279c…` — partenaire, lecture seule, expire le 15 décembre 2026. Le préfixe identifie la clé ; la clé entière est transmise à part et n'existe en clair nulle part (la base n'en garde que l'empreinte). |
| Serveur Discord        | `1217919334710771726`, rattaché (salons non configurés) |

Un espace est une cloison : vos équipes, vos tournois et vos matchs sont
rangés sous `pogtv`, séparés de ceux des autres espaces. Côté API, c'est la
**manière d'appeler** qui détermine l'espace servi — voir §3.1, à lire avant
tout branchement.

**Ce que le plan `regie` ouvre** : back-office complet, bot Discord, arbitrage
des litiges, rating Glicko-2, une ligue/saison à la fois.
**Ce qu'il n'ouvre pas** : l'écriture par API, et la régie vidéo Womenscup OBS
(offre Éditeur, sur devis).

Le plan `regie` est aussi présenté comme ouvrant « l'API en lecture »
(60 requêtes/min, 100 000/mois). Dans les faits, aujourd'hui, aucune lecture
ne contrôle le plan ni ne consomme ce quota : seules les **écritures** (qui
exigent le plan Circuit ou une clé partenaire) y sont soumises.

### La gratuité, concrètement

1. **Les lectures ne demandent ni plan ni paiement.** Ni les lectures REST
   (`GET /api/public/v1/*`), ni les requêtes GraphQL ne regardent le plan de
   l'espace ou un quota.
2. **La clé « partenaire »** (`comp`) émise par Women's Cup **court-circuite
   entièrement la facturation** : pas de contrôle de plan, pas de quota, et
   cela **même après le 16 octobre**, quand l'essai `regie` sera retombé sur
   le palier gratuit. Elle sert aujourd'hui à une chose : **fixer votre espace
   sur GraphQL** (§3.3). Elle ne permet pas d'écrire, faute de la portée
   `matches:write` (§3.4).

> ⚠️ Une clé API **ordinaire** (non partenaire) resterait utilisable pour les
> requêtes GraphQL après le 16 octobre, mais toute écriture répondrait
> `403 plan_required`. Pour écrire en production, il faut une clé partenaire
> portant `matches:write`.

---

## 1. Ce qu'il reste à faire pour que l'espace soit opérationnel

État au 16 septembre 2026, en fin de journée : les **accès sont ouverts**, la
**clé d'API est émise**, le **serveur Discord est rattaché**. POGTV peut monter
son tournoi dès maintenant — l'espace ne contient encore ni équipe ni tournoi.

Restent deux réglages, tous deux côté Women's Cup et aucun bloquant :
l'expéditeur email et la configuration des salons Discord.

Le détail des quatre étapes, pour mémoire et pour savoir où en est l'espace.
Aucune ne demande à POGTV de manipuler la plateforme, à une exception près : le
branchement du bot Discord, qui se fait à deux.

Dans l'ordre :

| #   | À faire                                     | Qui                          | Comment                                                                                                                                                                              |
| --- | ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | ~~**Ouvrir vos accès**~~ **FAIT**           | Women's Cup                  | Le compte d'Iban est **owner de l'espace POGTV** (`staff.role = caster`, `tenant_staff.role = owner` — le rôle d'espace élève, il ne déborde pas). À ce titre il ouvre lui-même les accès du reste de l'équipe : fiche de l'espace, onglet Staff, panneau d'invitations. Une invitation est nominative, vaut 14 jours, et suppose que l'invitée soit connectée à l'adresse invitée au moment de cliquer. |
| 2   | ~~**Émettre la clé partenaire**~~ **FAIT**  | Women's Cup (rôle _owner_)   | Marquée partenaire, valable jusqu'au 15 décembre 2026. Ce document n'en porte que le **préfixe** `pk_live_5b279c…`, qui sert à l'identifier ; la clé entière est transmise à part, par un canal sûr. Portées **toutes en lecture** : `tournaments:read`, `matches:read`, `teams:read`, `players:read`. Poser un score par script demanderait `matches:write`, qui ne s'ajoute pas à une clé existante — il faut en réémettre une. |
| 3   | **Brancher le bot Discord** (optionnel) — _commencé_ | POGTV + Women's Cup | Le serveur `1217919334710771726` est rattaché en primaire. Manquent la désignation des salons (`tenant_discord_config` : 0 clé renseignée) et les secrets bot (`tenant_secrets` : 0 ligne) — tant que ces deux-là manquent, le bot ne répond pas pour POGTV. |
| 4   | **Configurer l'expéditeur email** (optionnel) | Women's Cup                | Sans compte d'envoi, **aucun email ne part** de votre espace (invitations d'équipe, convocations). À demander si votre tournoi en dépend.                                             |

Les points 3 et 4 ne bloquent ni un tournoi géré à la main, ni l'usage de l'API.

> **En résumé** : plus rien à demander pour démarrer. Connectez-vous, créez vos
> équipes, montez le tournoi. Revenez vers nous pour l'expéditeur email, les
> salons Discord, ou une clé en écriture.

---

## 2. Monter le tournoi dans le back-office

Connexion : **https://owwomenscup.fr/admin/login**. Si vous êtes rattaché à
plusieurs espaces, un sélecteur en tête de back-office choisit l'espace actif —
**vérifiez qu'il affiche POGTV avant toute création**. C'est la seule erreur
vraiment coûteuse : une donnée créée dans le mauvais espace ne se déplace pas
d'un clic.

Le parcours :

1. **Équipes** — `/admin/teams`. Nom, logo, roster. Le logo ressort dans l'API
   (`team1_logo_url`) : le poser tout de suite évite de rhabiller les overlays.
2. **Tournoi** — `/admin/tournaments`. Nom, jeu, dates, format.
3. **Phases et bracket** — `/admin/stages`, ou `/admin/quick-bracket` pour un
   arbre simple monté en une passe.
4. **Publication** — passez le tournoi en **`published`**.

> **Point clé pour l'API** : seuls les tournois en `published`, `running` ou
> `completed` sortent sur l'API publique. Un tournoi en `draft` renvoie `404` —
> ce n'est pas une panne, c'est la règle. Publiez avant de tester vos overlays.

Pendant l'épreuve, les scores se posent depuis `/admin/matches` (ou par le bot,
ou par API — §3.4). Le classement final (`standings`) n'est rempli qu'une fois
le tournoi **finalisé** ; avant cela l'endpoint répond une liste vide, ce qui
est normal.

---

## 3. L'API

Base : `https://owwomenscup.fr`

### 3.1 Quel espace vous répond — la règle à ne jamais oublier

Une réponse qui vient du mauvais espace **n'échoue pas** : elle est valide, et
fausse. L'espace servi dépend uniquement de la manière d'appeler :

| Appel                                                                          | Espace servi                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `POST /api/graphql` avec `Authorization: Bearer <votre clé>`                   | **POGTV** — la clé est rattachée à votre espace, rien ne la déplace |
| `POST /api/public/v1/matches/{id}/result` avec votre clé                       | **POGTV**                                                     |
| `POST /api/graphql` **sans** clé, ou avec une clé refusée (mal copiée, révoquée, expirée) | **Women's Cup**, sans aucune erreur                  |
| `GET /api/public/v1/*`, avec ou sans clé                                       | **Women's Cup** — ces lectures ignorent la clé               |

**Voie recommandée aujourd'hui pour lire vos données : GraphQL en `POST`, avec
votre clé (§3.3).**

<!-- EN ATTENTE : ciblage de l'espace sur les lectures REST, bloqué par le cache CDN — ne pas publier en l'état -->

> Devant un résultat inattendu (des équipes ou des tournois que vous ne
> connaissez pas), vérifiez d'abord que la requête part bien en `POST` sur
> `/api/graphql` **avec** votre clé, et que la clé n'a pas expiré.

### 3.2 Lectures REST (`GET /api/public/v1/*`)

> ⚠️ Ces lectures servent aujourd'hui l'espace **Women's Cup** (§3.1). Elles
> sont décrites ici pour la suite ; ne les branchez pas pour POGTV tant que le
> ciblage de votre espace n'y est pas disponible.

Enveloppe : `{ "data": [...], "pagination": { ... } }` pour une liste paginée,
`{ "data": [...] }` ou `{ "data": { ... } }` sinon.

| Endpoint                                          | Ce qu'il sert                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/public/v1/tournaments`                  | Tournois `published`, `running` ou `completed`. Filtres `status`, `game`, `limit` (≤ 100), `offset` — **non fiables aujourd'hui** (cache CDN, voir plus bas).                    |
| `GET /api/public/v1/tournaments/{id}`             | Détail d'un tournoi + résumé des phases. `{id}` = UUID ou slug.                                                                                                                 |
| `GET /api/public/v1/tournaments/{id}/matches`     | Matchs du tournoi : phase, round, côté de bracket, équipes (id, nom, logo), scores, vainqueur, statut, horaire. **Seulement** les statuts `pending`, `ongoing` et `finished` : un walkover, un match en litige, reporté ou annulé n'y figure pas. Filtres `stageId` / `status` non fiables aujourd'hui. |
| `GET /api/public/v1/tournaments/{id}/standings`   | Classement final (vide tant que le tournoi n'est pas finalisé).                                                                                                                 |
| `GET /api/public/v1/tournaments/{id}/arbitration` | Métriques d'arbitrage agrégées, sans aucune donnée nominative.                                                                                                                  |
| `GET /api/public/v1/matches/{id}`                 | Détail d'un match + le déroulé map par map. `{id}` = **UUID seulement** (un slug répond 400). Mêmes statuts que ci-dessus, sinon 404.                                          |
| `GET /api/public/v1/teams/{id}`                   | Équipe + roster public (pseudo, rôle, remplaçante). Ni email ni Discord. `{id}` = UUID ou slug.                                                                                 |
| `GET /api/public/v1/players/{userId}`             | Profil public : rating, historique, face-à-face, hauts faits. `{userId}` = **UUID seulement**.                                                                                  |
| `GET /api/public/v1/leaderboard`                  | Classement Glicko-2. Pagination `limit` / `offset` non fiable aujourd'hui.                                                                                                      |
| `GET /api/public/v1/leagues` · `/leagues/{slug}`  | Ligues/saisons publiques.                                                                                                                                                       |

**Cache CDN.** Ces lectures sont mises en cache 30 à 120 s selon l'endpoint.
Sur la production, la clé de cache **ignore les paramètres de query** : pendant
cette durée, une même URL renvoie la première réponse mise en cache, quels que
soient les filtres ou la pagination envoyés ensuite. D'où les mentions « non
fiable aujourd'hui » ci-dessus.

Deux endpoints utiles hors `v1`, eux aussi anonymes :

- `GET /api/public/openapi` — la **spécification OpenAPI** (JSON). La variante
  `?format=yaml` n'est pas fiable aujourd'hui, pour la même raison de cache.
- `GET /api/public/webhook-events` — le catalogue des events webhook (§4).

Référence rendue et lisible : **https://owwomenscup.fr/developpeurs/reference**

### 3.3 GraphQL avec votre clé — la voie recommandée

`POST /api/graphql`, corps JSON `{ "query": "…", "variables": { … } }`, et
votre clé en en-tête. C'est aujourd'hui le seul moyen de **lire les données de
POGTV** : la clé fixe l'espace, et un `POST` n'est pas servi depuis le cache.

Premier appel de vérification :

```bash
curl -X POST https://owwomenscup.fr/api/graphql \
  -H "Authorization: Bearer pk_live_5b279c…" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ tournaments { count items { slug name status } } }"}'
```

Tant que votre espace n'a aucun tournoi publié, `count` vaut `0`. **Si la
réponse liste des tournois Women's Cup, votre clé n'a pas été prise en
compte** (absente, mal copiée, révoquée ou expirée) : GraphQL ne renvoie
aucune erreur dans ce cas, il sert l'espace Women's Cup.

Requêtes disponibles :

```graphql
query {
  tournaments(status: "running", limit: 20) {   # liste paginée : items + count (total)
    count
    items { id slug name status start_date }
  }
  tournament(idOrSlug: "votre-slug") {           # id OU slug ; null si inconnu ou non publié
    name
    status
    stages { id name stage_type status }
    matches {
      id round_number bracket_side status scheduled_at
      team1_name team1_logo_url team1_score
      team2_name team2_logo_url team2_score
      winner_team_id
    }
  }
}
```

Aussi : `match(id: "<uuid>") { … games { map_name map_order team1_score team2_score winner_team_id } }`
pour le déroulé map par map, et `team(idOrSlug: "…") { name logo_url roster { display_name role is_substitute } }`.

À savoir :

- Mêmes règles de visibilité que le REST : tournois `published` / `running` /
  `completed` ; matchs `pending` / `ongoing` / `finished` seulement (un
  walkover, un litige, un match reporté ou annulé n'apparaît pas).
- Les requêtes ne contrôlent ni le plan, ni un quota, et **aucune limite de
  débit** n'est appliquée par l'application : restez raisonnables (une requête
  toutes les 15 à 30 s par overlay suffit).
- Profondeur de requête limitée à 8. Introspection et GraphiQL sont désactivés
  en production : servez-vous des champs ci-dessus et de la référence
  (section « Guide », partie GraphQL).
- Votre clé **expire le 15 décembre 2026**. Après cette date, les mêmes appels
  serviront l'espace Women's Cup, sans erreur : faites-la remplacer avant.

Mutation disponible : `reportMatchResult(matchId, team1Score, team2Score)`
(portée `matches:write`, mêmes effets que §3.4 ; ni mode maintenance, ni
idempotence).

### 3.4 Écrire un score

```bash
curl -X POST "https://owwomenscup.fr/api/public/v1/matches/<matchId>/result" \
  -H "Authorization: Bearer pk_live_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: pogtv-match-42-final" \
  -d '{"team1Score": 2, "team2Score": 1}'
```

> ⚠️ **La clé actuelle ne peut pas faire ça** : `pk_live_5b279c…` ne porte que
> des portées de lecture, cet appel répondrait `403 INSUFFICIENT_SCOPE`. Pour
> poser les scores par script, demander une clé portant `matches:write`.

Portée requise : `matches:write`. L'espace est celui de la clé. L'écriture est
**autoritaire** (pas de consensus des capitaines) : elle passe le match en
`finished`, propage le vainqueur dans le bracket et déclenche les
notifications, exactement comme une saisie back-office.

Réponse `200` :

```json
{
  "data": {
    "matchId": "…",
    "status": "finished",
    "team1Score": 2,
    "team2Score": 1,
    "winnerTeamId": "…"
  }
}
```

Erreurs à prévoir : `400` identifiant non-UUID (`INVALID_QUERY`), score hors
[0, 99] (`INVALID_BODY`), match _bye_ ou sans ses deux équipes
(`BAD_REQUEST`) ; `404` match inconnu **dans votre espace** ; `409` match déjà
clôturé (`finished`, `walkover` ou `cancelled`) ; `429` limites (30/min par IP,
15/min par clé) ; `503` maintenance. Détail et ordre des contrôles dans la
référence.

**Idempotence** : envoyez un en-tête `Idempotency-Key` (≤ 200 caractères). Une
réponse 2xx est rejouée pendant 5 minutes pour la même clé **et le même corps**
(en-tête `Idempotency-Replay: true`). C'est votre protection contre le
double-clic et le script relancé.

> C'est aujourd'hui le **seul** endpoint d'écriture publique. Créer un tournoi,
> une équipe ou modifier un roster passe par le back-office ou le bot.

### 3.5 Codes d'erreur

Corps d'erreur REST : `{ "error": "message", "code": "CODE" }`. Testez `code`,
jamais `error` (texte libre). Liste complète : schéma `PublicApiErrorCode` de
la référence.

| HTTP | `code`                                        | Quand                                                                                   |
| ---- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| 400  | `INVALID_QUERY` / `INVALID_BODY` / `BAD_REQUEST` | paramètre ou corps refusé (détail par champ dans `fields`), match inapplicable       |
| 401  | `UNAUTHORIZED`                                | clé absente, invalide, révoquée **ou expirée** (cas non distingués)                     |
| 403  | `INSUFFICIENT_SCOPE`                          | clé valide, portée manquante (`matches:write` n'implique pas `matches:read`)            |
| 403  | _(aucun)_                                     | plan insuffisant : corps `{ "error": "plan_required", "message", "requiredCapability" }`, **sans `code`**. Ne doit jamais arriver avec une clé partenaire |
| 404  | `NOT_FOUND`                                   | ressource inconnue dans l'espace servi, ou non publique                                 |
| 409  | `CONFLICT`                                    | match déjà clôturé                                                                      |
| 429  | `RATE_LIMITED` / `ACTOR_RATE_LIMIT` / `QUOTA_EXCEEDED` | débit ou quota dépassé ; respectez `Retry-After`. Le limiteur par IP répond **sans** `code` |
| 503  | `MAINTENANCE_MODE`                            | écritures gelées pendant une maintenance                                                |

GraphQL signale ses erreurs dans `errors[].extensions.code` : `UNAUTHENTICATED`,
`FORBIDDEN`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `BAD_USER_INPUT`, `NOT_FOUND`,
`CONFLICT`, `INTERNAL_SERVER_ERROR`.

---

## 4. Temps réel : les webhooks

Plutôt que d'interroger l'API en boucle, abonnez une URL et recevez nos events
en POST signé. Gestion depuis `/admin/webhooks` (rôle admin de l'espace) —
**vérifiez que le sélecteur d'espace affiche POGTV** avant de créer
l'abonnement : il est rattaché à l'espace actif.

Events exposables : `match.scheduled`, `match.starting`, `match.finished`,
`match.disputed`, `match.dispute.resolved`, `tournament.finalized`,
`registration.new`, `news.published`, `checkin.opened`. Catalogue à jour :
`GET /api/public/webhook-events`.

> `match.forfeit` figure aussi au catalogue, mais **aucun code ne l'émet
> aujourd'hui** : un abonnement à cet event ne reçoit rien.

- **Corps** : `{ id, event, tenantId, timestamp, data }`. La forme de `data`
  dépend de l'event et n'est pas encore décrite dans la référence.
- **Signature** : `X-Webhook-Signature: sha256=<hmac hex>` — HMAC-SHA256 du
  corps **brut** avec le secret d'abonnement (affiché une seule fois à la
  création). Vérifiez-la avant de traiter quoi que ce soit.
- Autres en-têtes : `X-Webhook-Event`, `X-Webhook-Id`, `X-Tenant-Id`.
- **Réussite** : toute réponse `2xx` reçue en moins de **8 secondes**.
- **Réessais** : le dispatcher passe chaque minute ; un échec est retenté au
  passage suivant, **5 tentatives** au plus, et seuls les events des dernières
  **24 heures** sont repris. Un endpoint qui échoue 15 fois d'affilée est
  **désactivé automatiquement** — surveillez vos livraisons dans le
  back-office.

Répondez `2xx` vite (accusez réception, traitez derrière).

---

## 5. Overlays et diffusion

Le chemin recommandé pour un overlay OBS, sans rien installer de notre côté :

1. Une page HTML à vous, en Browser Source dans OBS.
2. Elle lit ses données auprès d'un **petit service à vous, côté serveur**, qui
   interroge `POST /api/graphql` avec votre clé (§3.3) — la clé ne doit jamais
   figurer dans le HTML de l'overlay. Un rafraîchissement toutes les 15 à 30 s
   suffit largement.
3. Les webhooks `match.starting` / `match.finished` déclenchent le changement de
   scène, si vous voulez éviter la latence du polling.

<!-- EN ATTENTE : ciblage de l'espace sur les lectures REST, bloqué par le cache CDN — ne pas publier en l'état -->

Les champs déjà pensés pour ça (GraphQL, `tournament { matches { … } }`) :
`team1_name`, `team1_logo_url`, `team1_score`, `round_number`, `bracket_side`,
`status`, `scheduled_at`, et le détail map par map avec
`match(id) { games { … } }`. Un match gagné par forfait (`walkover`), en
litige, reporté ou annulé n'apparaît pas : prévoyez-le dans l'affichage du
bracket.

Notre régie vidéo maison (Womenscup OBS : direction automatique, overlays
pilotés par l'état des matchs) relève de l'offre **Éditeur**, sur devis, et
n'est pas incluse ici — mais rien de ce qui précède n'en dépend.

---

## 6. Checklist du jour J

- [ ] Le tournoi est en `published` (ou `running`) — vérifié par un appel réel à
      l'API, pas seulement à l'écran.
- [ ] Toutes les équipes ont un logo.
- [ ] La clé `pk_live_5b279c…` est stockée côté serveur, jamais dans le HTML
      d'un overlay — même en lecture seule, une clé publiée est une clé à
      remplacer.
- [ ] Les overlays affichent bien les données de POGTV : comparez un nom
      d'équipe affiché avec le back-office. C'est le test qui attrape une clé
      absente ou refusée — GraphQL sert alors Women's Cup sans erreur.
- [ ] Le remplacement de la clé est prévu **avant le 15 décembre 2026**, date
      de son expiration.
- [ ] Les abonnements webhook sont actifs et ont reçu au moins une livraison en
      succès.
- [ ] Un match de test a été clôturé de bout en bout : score posé → bracket
      propagé → overlay à jour.

## 7. Sécurité et bonnes pratiques

- La clé n'est **affichée qu'une fois**. Perdue, elle se remplace — elle ne se
  relit pas. En cas de fuite : révocation depuis `/admin/api-tokens` (sélecteur
  d'espace sur POGTV), effective dès la requête suivante.
- Demandez **les portées minimales** : un overlay n'a besoin d'aucune portée
  d'écriture.
- Aucune donnée personnelle ne transite par l'API publique (pas d'email, pas de
  Discord, pas de nom civil) — c'est délibéré, ne comptez pas dessus pour un
  usage interne.
- Les lectures REST sont en CORS `*`. L'écriture REST, non : passez par votre
  serveur — comme pour GraphQL, dès lors que la clé est en jeu.

## 8. Support

- Référence API toujours à jour : https://owwomenscup.fr/developpeurs/reference
- Spécification machine : https://owwomenscup.fr/api/public/openapi
- Contact plateforme : owwomenscup@gmail.com

Pour toute demande qui touche le plan, la clé partenaire, le serveur Discord ou
l'expéditeur email, passez par le contact plateforme : ces réglages vivent côté
Women's Cup, pas dans votre back-office.
