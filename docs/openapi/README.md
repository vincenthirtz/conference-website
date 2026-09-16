# Spec OpenAPI — un fragment par handler

La spec OpenAPI 3.1 de `pages/api/*` est découpée ici, puis assemblée par
[`utils/openapi/assemble.ts`](../../utils/openapi/assemble.ts).

| Emplacement | Contenu |
|---|---|
| `root.yaml` | `openapi`, `info`, `servers`, `tags`, `security` global, et `x-public-description` (introduction de la spec publique) |
| `components/<section>.yaml` | une section de `components` (`parameters`, `responses`, `headers`, `securitySchemes`) |
| `components/schemas/<domaine>.yaml` | les schémas, par domaine : `common`, `competition`, `teams-players`, `rankings`, `draft`, `broadcast`, `prize-pool`, `tcg`, `public`, `public-v1`, `bot`, `cron`, `admin` (fusionnés à l'assemblage, doublons refusés) |
| `paths/api/…/<route>.yaml` | l'objet « path item » d'UNE route, au même emplacement que son handler |

**L'URL se déduit de l'emplacement**, comme le routage Next : le fragment de
`pages/api/teams/[teamId]/members.ts` est `paths/api/teams/[teamId]/members.yaml`
et décrit `/api/teams/{teamId}/members`. Le fichier ne répète pas l'URL.

## Modifier une route

1. Éditer (ou créer) le fragment à côté du chemin du handler.
2. Les `$ref` visent le document assemblé : `#/components/schemas/Uuid`.
3. `npx vitest run tests/unit/openapi` — dérive handlers ↔ spec, intégrité
   (operationId uniques, tags déclarés, `$ref` résolus, composants morts), règles
   de l'assembleur.

## Schémas générés depuis zod (`x-zod`)

Quand le handler valide son entrée avec zod, le fragment ne recopie pas le
schéma : il le référence.

```yaml
requestBody:
  content:
    application/json:
      schema:
        x-zod: bot.matches/[matchId]/report   # nom dans lib/apiContracts
        properties:
          discordUserId:
            description: Capitaine qui déclare le score.   # texte seulement
```

- Le schéma vit dans `lib/apiContracts/**` (zod et modules purs, chemins
  relatifs), importé par le handler ET enregistré dans
  `lib/apiContracts/index.ts` (ou `bot/index.ts`).
- L'assembleur y met `z.toJSONSchema` ; les clés voisines (descriptions,
  exemples) sont fusionnées. Documenter une propriété absente du schéma zod,
  référencer un nom inconnu, ou utiliser un schéma non représentable fait
  échouer l'assemblage.
- **Schémas nommés** : un schéma zod marqué `.meta({ id: 'Nom' })` devient le
  composant `#/components/schemas/Nom` (zod le sort en `$defs`, l'assembleur le
  remonte). Déclarer `Nom: { x-zod: … }` dans `components/schemas/` n'est utile
  que pour y ajouter de la doc ; deux schémas différents sous le même id, ou un
  id qui heurte un composant écrit à la main, font échouer l'assemblage.
- **Réponses** (`io: 'output'`) : le schéma doit décrire EXACTEMENT le type
  TypeScript renvoyé par le handler. `tests/unit/publicV1ResponseContracts.test.ts`
  le vérifie au typecheck (`expectTypeOf`), et les tests de handler valident la
  réponse réelle, champ en trop compris.
- **Paramètres** : une opération qui porte `x-zod-query: <nom>` voit ses
  paramètres générés depuis le `z.object` de query du handler (propriété
  présente dans l'URL → `in: path`, sinon `in: query`). Les textes des
  paramètres écrits sont gardés ; un paramètre de requête documenté mais
  absent du schéma fait échouer l'assemblage.
- Couverture au 2026-09-15 : corps des 4 routes publiques d'écriture et de
  toutes les routes bot à corps validé ; réponses de toute l'API publique v1
  (`lib/apiContracts/public/v1/`) ; paramètres de requête des 36 routes bot à
  `querySchema` et des 8 routes admin/joueuse qui valident leur query avec zod.

## Réponses déduites du code

Les réponses de succès (2xx) de `pages/api/**` (hors API publique v1, décrite
par zod) sont **déduites du type TypeScript** passé à `res.json()` :
`npm run openapi:responses` (API du compilateur TypeScript, aucune dépendance
ajoutée) écrit `docs/openapi/inferred-responses.json`, commité.

- L'assembleur l'utilise là où le fragment n'a pas de schéma, ou un schéma
  générique (`type: object` sans propriétés), et ajoute un code 2xx renvoyé
  mais non documenté. Un schéma écrit précis est conservé.
- `x-infer-responses: false` sur une opération désactive la déduction.
- `tests/unit/openapiInferredResponses.test.ts` vérifie que le fichier est à
  jour, et qu'**aucune réponse écrite ne contredit le code** (mêmes propriétés
  de premier niveau). Pour documenter une réponse, le plus sûr est donc de NE
  PAS écrire son schéma : le code le fournit ; n'écrire que la description.
- Une réponse que le script ne sait pas attribuer à une méthode HTTP n'est pas
  documentée (liste `unattributed` du fichier) : jamais de supposition.

## Surface publique (partenaires)

Ce qu'un partenaire lit en premier — la référence `/developpeurs/reference`
et `GET /api/public/openapi` — ne garde que `/api/public/*`. Règles propres :

- **Introduction** : `x-public-description` dans `root.yaml` (espace servi,
  cache, clés, limites, erreurs, GraphQL, webhooks, compatibilité).
  Balisage limité à ce que la page rend : titres `## `, listes `- `,
  paragraphes, `code` en ligne.
- **Erreurs** : les fragments `public/v1` ne référencent que des réponses
  `components/responses.yaml#Public*` (corps `PublicApiError` /
  `PublicPlanDenial`, avec exemples) ou des réponses écrites avec exemple.
  Un nouveau `code` émis va dans `PublicApiErrorCode` (`public-v1.yaml`).
- **Exemples** : chaque réponse 2xx JSON et chaque corps de `public/v1` porte
  un `example`, validé contre le schéma zod du handler, champ en trop compris.
  Un nouveau composant de réponse s'ajoute à `COMPONENT_ZOD` du test.
- **Espace** : une lecture scopée par espace référence
  `#/components/parameters/PublicTenant` (`?tenant=<slug>`). Le cache CDN
  varie sur la query (`Netlify-Vary`, `next.config.js`) : un paramètre de
  query est fiable sur une réponse mise en cache.

Gardes : `tests/unit/openapiPublicExamples.test.ts` (exemples) et
`tests/unit/apiErrorCodeCatalog.test.ts` (codes émis ↔ `PublicApiErrorCode`,
codes GraphQL ↔ introduction, codes bot ↔ tableau de
`docs/BOT_API_CONTRACT.md`).

## Où la spec est lue

- **Dev et tests** : assemblée à la volée (`utils/openapi/loadSpec.ts`), rien à
  régénérer.
- **Production** : `npm run openapi:build` (lancé par `prebuild`) écrit
  `.generated/openapi.json` et `.generated/openapi.public.json`, lus par
  `/api/admin/docs/openapi`, `/api/public/openapi` et `/developpeurs/reference`.
- **CI** : lint Redocly du document assemblé (`docs/redocly.yaml`).
