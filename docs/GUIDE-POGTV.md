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

Un espace est une cloison étanche : vos équipes, vos tournois, vos matchs ne
sont visibles que sous `pogtv`, et aucune requête portant ce slug ne peut lire
les données d'un autre espace.

**Ce que le plan `regie` ouvre** : back-office complet, bot Discord, arbitrage
des litiges, rating Glicko-2, une ligue/saison à la fois, et l'**API en
lecture** (60 req/min, 100 000 req/mois).
**Ce qu'il n'ouvre pas** : l'écriture par API, et la régie vidéo Womenscup OBS
(offre Éditeur, sur devis).

### La gratuité, concrètement

Deux mécanismes, à ne pas confondre :

1. **Les lectures anonymes sont gratuites pour tout le monde, sans clé.**
   `GET /api/public/v1/*` avec `?tenant=pogtv` ne demande aucun token et ne
   regarde aucun plan. C'est déjà de quoi alimenter un overlay ou un site.
   Limite : ~120 requêtes/minute par IP, réponses cachées 60 s.
2. **Pour l'écriture (et une lecture authentifiée hors quota), une clé
   « partenaire »** (`comp`) vous est émise par Women's Cup. Elle **court-circuite
   entièrement la facturation** : lecture _et_ écriture, sans quota, sans
   rate-limit de plan, et **même après le 16 octobre**, quand l'essai `regie`
   sera retombé sur le palier gratuit. C'est le dispositif prévu pour un
   partenaire ; il ne demande aucune démarche de paiement de votre part.

> ⚠️ Sans clé `comp`, une clé API ordinaire de POGTV cessera de fonctionner le
> **16 octobre 2026** (plan expiré → `403 plan_required`). Demandez la clé
> partenaire avant de brancher quoi que ce soit en production.

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

### 3.1 Désigner votre espace — la règle à ne jamais oublier

- **Sans token** (lectures) : ajoutez **`?tenant=pogtv`** à chaque requête.
- **Avec token** : le token _est_ l'espace. Aucun paramètre ni en-tête ne peut
  le déplacer, et `?tenant=` y est ignoré.

> Un slug mal orthographié **ne renvoie pas d'erreur** : la requête retombe sur
> l'espace historique (Women's Cup) et vous sert une réponse **valide et
> fausse**. Devant un résultat inattendu, suspectez le slug avant le reste.

### 3.2 Lectures anonymes — aucune clé nécessaire

```bash
curl "https://owwomenscup.fr/api/public/v1/tournaments?tenant=pogtv&status=running"
```

Enveloppe : `{ "data": [...], "pagination": { ... } }` pour une liste,
`{ "data": { ... } }` pour un objet. Partout ci-dessous, `{id}` accepte l'UUID _ou_ le slug de la ressource.

| Endpoint                                              | Ce qu'il sert                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/public/v1/tournaments`                      | Liste des tournois publics. Filtres `status`, `game`, `limit` (≤ 100), `offset`.                                                                                        |
| `GET /api/public/v1/tournaments/{id}`           | Détail d'un tournoi + résumé des phases.                                                                                                                                |
| `GET /api/public/v1/tournaments/{id}/matches`   | **Tous les matchs** : phase, round, côté de bracket, équipes (id, nom, logo), scores, vainqueur, statut, horaire. C'est la source d'un bracket ou d'un scoreboard. |
| `GET /api/public/v1/tournaments/{id}/standings` | Classement final (vide tant que le tournoi n'est pas finalisé).                                                                                                         |
| `GET /api/public/v1/tournaments/{id}/arbitration` | Métriques d'arbitrage agrégées, sans aucune donnée nominative.                                                                                                        |
| `GET /api/public/v1/matches/{id}`                     | Détail d'un match + le déroulé map par map.                                                                                                                             |
| `GET /api/public/v1/teams/{id}`                 | Équipe + roster public (pseudo, rôle, remplaçante). Ni email ni Discord.                                                                                                |
| `GET /api/public/v1/players/{userId}`                 | Profil public : rating, historique, face-à-face, hauts faits.                                                                                                           |
| `GET /api/public/v1/leaderboard`                      | Classement Glicko-2 de l'espace.                                                                                                                                        |
| `GET /api/public/v1/leagues` · `/leagues/{slug}`      | Ligues/saisons publiques.                                                                                                                                               |

Deux endpoints utiles hors `v1`, eux aussi anonymes :

- `GET /api/public/openapi` (`?format=yaml`) — la **spécification OpenAPI**,
  dérivée des handlers réels, donc toujours à jour. De quoi générer un client.
- `GET /api/public/webhook-events` — le catalogue des events webhook (§4).

Référence rendue et lisible : **https://owwomenscup.fr/developpeurs/reference**

### 3.3 Lectures authentifiées

Mêmes URLs, avec l'en-tête :

```
Authorization: Bearer pk_live_5b279c…
```

Intérêt par rapport à l'anonyme : pas de rate-limit par IP, pas de cache de
60 s, et l'espace n'a plus besoin d'être précisé — le token _est_ POGTV. La clé
étant marquée partenaire, aucun quota ne s'applique.

Premier appel de vérification :

```bash
curl -H "Authorization: Bearer pk_live_5b279c…" \
  https://owwomenscup.fr/api/public/v1/tournaments
```

Aujourd'hui la réponse est `{ "data": [] }` : l'espace n'a pas encore de
tournoi, et c'est le bon résultat. Une liste contenant des tournois Women's Cup
signalerait que la clé ne pointe pas sur le bon espace.

### 3.4 Écrire un score

```bash
curl -X POST "https://owwomenscup.fr/api/public/v1/matches/<matchId>/result" \
  -H "Authorization: Bearer pk_live_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: pogtv-match-42-final" \
  -d '{"team1Score": 2, "team2Score": 1}'
```

> ⚠️ **La clé actuelle ne peut pas faire ça** : `pk_live_5b279c…` est en lecture
> seule, cet appel répondrait `403 INSUFFICIENT_SCOPE`. Pour poser les scores par
> script, demander une clé portant `matches:write`.

Scope requis : `matches:write`. L'écriture est **autoritaire** (pas de consensus
des capitaines) : elle passe le match en `finished`, propage le vainqueur dans
le bracket et déclenche les notifications, exactement comme une saisie
back-office.

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

Erreurs à prévoir : `404` match inconnu, `400` équipes manquantes ou _bye_,
`409` match déjà clôturé.

**Idempotence** : envoyez un en-tête `Idempotency-Key` (≤ 200 caractères). Une
réponse 2xx est rejouée pendant 5 minutes pour la même clé **et le même corps**
(en-tête `Idempotency-Replay: true`). C'est votre protection contre le
double-clic et le script relancé.

> C'est aujourd'hui le **seul** endpoint d'écriture publique. Créer un tournoi,
> une équipe ou modifier un roster passe par le back-office ou le bot.

### 3.5 GraphQL

`POST /api/graphql` — lecture anonyme, mutations sous token.

```graphql
query {
  tournament(idOrSlug: "votre-slug") {
    name
    status
    matches {
      team1_name
      team2_name
      team1_score
      team2_score
      status
    }
  }
}
```

Mutation disponible : `reportMatchResult(matchId, team1Score, team2Score)`
(scope `matches:write`). Profondeur de requête limitée à 8. L'introspection et
GraphiQL sont désactivées en production — servez-vous du schéma ci-dessus et de
la spec OpenAPI.

### 3.6 Codes d'erreur

| HTTP | Code                                | Quand                                                                                                              |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 401  | `UNAUTHORIZED`                      | token absent, invalide ou révoqué                                                                                  |
| 403  | `INSUFFICIENT_SCOPE`                | token valide, scope manquant (`matches:write` n'implique pas `matches:read`)                                       |
| 403  | `plan_required`                     | plan insuffisant — **ne doit jamais arriver avec une clé `comp`** ; si ça arrive, ce n'est pas la bonne clé        |
| 404  | `NOT_FOUND`                         | ressource inconnue **dans votre espace**, ou tournoi non publié                                                    |
| 409  | `CONFLICT`                          | conflit d'état (match déjà clôturé)                                                                                |
| 429  | `RATE_LIMITED` / `QUOTA_EXCEEDED`   | débit ou quota mensuel dépassé ; respectez `Retry-After`                                                           |
| 503  | `MAINTENANCE_MODE`                  | écritures gelées pendant une maintenance                                                                            |

Corps d'erreur : `{ "error": "message", "code": "CODE" }`.

---

## 4. Temps réel : les webhooks

Plutôt que d'interroger l'API en boucle, abonnez une URL et recevez nos events
en POST signé. Gestion depuis `/admin/webhooks` (rôle admin de l'espace).

Events exposables : `match.scheduled`, `match.starting`, `match.finished`,
`match.disputed`, `match.dispute.resolved`, `match.forfeit`,
`tournament.finalized`, `registration.new`, `news.published`, `checkin.opened`.
Catalogue à jour : `GET /api/public/webhook-events`.

- **Corps** : `{ id, event, tenantId, timestamp, data }`.
- **Signature** : `X-Webhook-Signature: sha256=<hmac hex>` — HMAC-SHA256 du
  corps **brut** avec le secret d'abonnement (affiché une seule fois à la
  création). Vérifiez-la avant de traiter quoi que ce soit.
- Autres en-têtes : `X-Webhook-Event`, `X-Webhook-Id`, `X-Tenant-Id`.
- **Réessais** : jusqu'à 5 tentatives par event. Un endpoint qui échoue 15 fois
  d'affilée est **désactivé automatiquement** — surveillez vos livraisons dans
  le back-office.

Répondez `2xx` vite (accusez réception, traitez derrière) : le dispatcher passe
chaque minute et n'attend pas votre traitement.

---

## 5. Overlays et diffusion

Le chemin recommandé pour un overlay OBS, sans rien installer de notre côté :

1. Une page HTML à vous, en Browser Source dans OBS.
2. Elle interroge `GET /api/public/v1/tournaments/{slug}/matches?tenant=pogtv`.
   Les réponses sont cachées 60 s côté serveur : un rafraîchissement toutes les
   15–30 s suffit largement et reste loin de la limite par IP.
3. Les webhooks `match.starting` / `match.finished` déclenchent le changement de
   scène, si vous voulez éviter la latence du polling.

Les champs déjà pensés pour ça : `team1_name`, `team1_logo_url`, `team1_score`,
`round_number`, `bracket_side`, `status`, `scheduled_at`, et le détail map par
map sur `/matches/{id}`.

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
- [ ] Les overlays lisent bien `?tenant=pogtv` (comparez un nom d'équipe affiché
      avec le back-office : c'est le test qui attrape l'erreur de slug).
- [ ] Les abonnements webhook sont actifs et ont reçu au moins une livraison en
      succès.
- [ ] Un match de test a été clôturé de bout en bout : score posé → bracket
      propagé → overlay à jour.

## 7. Sécurité et bonnes pratiques

- La clé n'est **affichée qu'une fois**. Perdue, elle se remplace — elle ne se
  relit pas. En cas de fuite : révocation immédiate depuis `/admin/api-tokens`,
  prise en compte en quelques secondes.
- Demandez **le scope minimum** : un overlay n'a besoin que de lecture.
- Aucune donnée personnelle ne transite par l'API publique (pas d'email, pas de
  Discord, pas de nom civil) — c'est délibéré, ne comptez pas dessus pour un
  usage interne.
- Les lectures anonymes sont en CORS `*` : elles s'appellent depuis un
  navigateur. Les écritures, non — passez par votre serveur.

## 8. Support

- Référence API toujours à jour : https://owwomenscup.fr/developpeurs/reference
- Spécification machine : https://owwomenscup.fr/api/public/openapi
- Contact plateforme : owwomenscup@gmail.com

Pour toute demande qui touche le plan, la clé partenaire, le serveur Discord ou
l'expéditeur email, passez par le contact plateforme : ces réglages vivent côté
Women's Cup, pas dans votre back-office.
