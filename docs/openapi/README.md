# Spec OpenAPI — un fragment par handler

La spec OpenAPI 3.1 de `pages/api/*` est découpée ici, puis assemblée par
[`utils/openapi/assemble.ts`](../../utils/openapi/assemble.ts).

| Emplacement | Contenu |
|---|---|
| `root.yaml` | `openapi`, `info`, `servers`, `tags`, `security` global |
| `components/<section>.yaml` | une section de `components` (`parameters`, `responses`, `securitySchemes`) |
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

## Où la spec est lue

- **Dev et tests** : assemblée à la volée (`utils/openapi/loadSpec.ts`), rien à
  régénérer.
- **Production** : `npm run openapi:build` (lancé par `prebuild`) écrit
  `.generated/openapi.json` et `.generated/openapi.public.json`, lus par
  `/api/admin/docs/openapi`, `/api/public/openapi` et `/developpeurs/reference`.
- **CI** : lint Redocly du document assemblé (`docs/redocly.yaml`).
