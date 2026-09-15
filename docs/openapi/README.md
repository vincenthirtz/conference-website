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
- Couverture au 2026-09-15 : corps des 4 routes publiques d'écriture et de
  toutes les routes bot à corps validé ; réponses de toute l'API publique v1
  (`lib/apiContracts/public/v1/`).

## Où la spec est lue

- **Dev et tests** : assemblée à la volée (`utils/openapi/loadSpec.ts`), rien à
  régénérer.
- **Production** : `npm run openapi:build` (lancé par `prebuild`) écrit
  `.generated/openapi.json` et `.generated/openapi.public.json`, lus par
  `/api/admin/docs/openapi`, `/api/public/openapi` et `/developpeurs/reference`.
- **CI** : lint Redocly du document assemblé (`docs/redocly.yaml`).
