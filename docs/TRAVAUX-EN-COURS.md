# Travaux en cours

État au **22 septembre 2026**. Ce fichier dit où en sont les chantiers de fond
et, surtout, **ce qui reste**. Il ne remplace pas
[IMPROVEMENT_BACKLOG.md](./IMPROVEMENT_BACKLOG.md), qui est alimenté par un
agent et recense les findings ligne à ligne : ici on parle de lots, de leur
raison d'être et de ce qui les bloque.

---

## Actions humaines en attente

Trois choses que personne d'autre ne peut faire. Elles bloquent des lots
entiers, et aucune ne se contourne par du code.

| Quoi | Où | Pourquoi ça bloque |
|---|---|---|
| **Activer la protection contre les mots de passe compromis** | Console Supabase → Authentication → Password Protection (HaveIBeenPwned) | Pas pilotable en SQL ni via MCP. Vérifié encore désactivé le 2026-09-21. |
| **Générer le socle de schéma** | `npx supabase db dump` — voir [E2E-LOCAL-SUPABASE.md](./E2E-LOCAL-SUPABASE.md) | Demande le mot de passe base. Sans lui, **les 87 specs e2e ne tournent nulle part**. |
| **Faire tourner une rotation de secret bot** | Admin → secrets du tenant | Le webhook bot est en 401 : le secret de la Freebox a divergé de `tenant_secrets`. L'agent ne peut pas lire ni écrire ce secret. |

---

## Supabase — quota « Cached Egress » dépassé (échéance 20 octobre)

Le cycle précédent a dépassé le quota : période de grâce jusqu'au
**20 octobre 2026**, ensuite le Fair Use Policy s'applique et les requêtes
peuvent répondre en 402. Le Cached Egress, c'est le trafic Storage servi par le
CDN — pas la base.

**Mesure du 22 septembre** (`edge_logs`, 24 h) : ~459 Mo/jour, soit ~13 Go par
mois pour un quota de 5 Go. **96 % venaient de Netlify Image CDN**, qui
retéléchargeait les originaux des logos de l'accueil : deux fichiers de 1,4 Mo
et 757 Ko pour un affichage en 64 px faisaient à eux seuls ~85 % du total.

Fait le jour même :

- les 5 logos lourds de l'accueil (Chocomates, Éclypse, Shujaa Angel's,
  Venom Valkyries, Team Positivité) sont recompressés en WebP de 512 px au
  maximum : 2,5 Mo → 141 Ko. `teams.logo_url` pointe sur les nouveaux fichiers ;
  **les anciens restent dans le bucket**, rien n'a été supprimé ;
- chaque upload en `upsert: false` pose désormais un cache d'un an
  ([`utils/uploads/storageCache.ts`](../utils/uploads/storageCache.ts)) au lieu
  des 3 600 s par défaut.

Ce qui reste, par ordre d'intérêt :

1. **Vérifier la baisse** d'ici quelques jours : agrégat
   `sum(response.headers.content_length)` sur `/storage/v1/object` dans
   `edge_logs`, groupé par user-agent. Cible : moins de 5 Go/mois.
2. **Rien ne redimensionne à l'upload.** Le prochain logo de 2 Mo refera le
   même problème. `sharp` est déjà là en dépendance transitive de Next ; le
   brancher dans `teams/[teamId]/upload-image`, `admin/upload`, `tcg-image` et
   `player/tcg/photo` a été écarté pour l'instant.
3. Photos TCG jusqu'à 2 Mo, affichées en `unoptimized` (`TcgPhotoCard`,
   `TcgTeamImageCard`, …) : peu vues aujourd'hui, mais elles partent à plein
   poids.
4. Les 73 objets déjà en place gardent `max-age=3600`.

---

## Lot 6 — supprimer les `any` du code de production

**Terminé.** Il reste **un** `any` dans tout le dépôt, contre 391 au départ et
205 au début de la session du 21 septembre.

Le survivant est la signature d'implémentation des overloads de
`withBotRoute` (`utils/botAuth.ts`). L'union et l'intersection des deux formes
publiques ont été essayées : la première est refusée par
`strictFunctionTypes`, la seconde se réduit à `never` parce que les deux
requêtes s'excluent. Le commentaire sur place le dit, pour que personne ne
refasse la tentative.

Le garde-fou est [`tests/unit/anyRatchet.test.ts`](../tests/unit/anyRatchet.test.ts) :
toutes les zones y sont à zéro, et son en-tête liste ce que la descente a
sorti. Ce n'était pas un exercice d'hygiène :

- un **filtre `tenant_id` qui pouvait disparaître à l'exécution**, exposant
  tous les espaces à un bot auto-hébergé (`bot/v1/cast/upcoming`, puis le même
  motif dans `utils/stages/autoAdvance`) ;
- un **statut de match libre**, venu du corps de requête, écrit tel quel dans
  `matches.status` (`stages/[stageId]/batch-scores`) — `status: "termine"`
  aurait rendu le match invisible à tous les filtres ;
- le **contexte SSR passé pour un contexte d'API** dans toute la chaîne
  d'authentification staff, qui ne tenait que tant que personne n'y appelait
  `res.status()` ;
- une dizaine d'**embeds PostgREST lus en supposant l'objet** : sur la variante
  tableau, chacun perdait un nom d'équipe, un nom de tournoi, ou une entrée
  entière ;
- deux types `Team` voisins qui **avaient déjà divergé**, l'un sans `slug`.

### La convention à tenir

`as any` → **pas** `as Machin`, qui déplacerait le mensonge. On déclare la
forme de la ligne **une fois**, en recopiant le `.select()`. Une colonne
absente devient alors une erreur de compilation — ce que le mock Supabase des
tests unitaires ne peut pas attraper, puisqu'il ne valide pas les noms de
colonnes.

Et pour les relations : `oneRelation()` de
[`utils/supabase/relation.ts`](../utils/supabase/relation.ts), jamais un
`Array.isArray(x) ? x[0] : x` recopié.

### Une nullabilité ne se suppose pas

Quatre fois pendant ce lot, une colonne a été déclarée nullable « par
prudence » alors qu'elle est `NOT NULL` en base. Ces replis morts ressemblent
à des cas réels et font perdre du temps à la lecture suivante. La vérification
coûte une requête :

```sql
select column_name, is_nullable from information_schema.columns
where table_schema='public' and table_name='<table>';
```

---

## Lot 5 — e2e : sortir de la production

**Partiellement livré, bloqué sur une action humaine.**

Ce qui est fait : les deux invariants sont devenus **vérifiables**, et le
premier test écrit a trouvé un trou réel — `https://localhost.evil.example.com`
passait pour un hôte local, ce qui faisait sauter *tous* les contrôles,
production comprise.

| Garde-fou | Ce qu'il empêche |
|---|---|
| [`e2eSeedGuard.test.ts`](../tests/unit/e2eSeedGuard.test.ts) | Que la règle « jamais semer la prod » redevienne décorative. La décision est une fonction pure, chaque branche est exercée. |
| [`e2eNoProdWrites.test.ts`](../tests/unit/e2eNoProdWrites.test.ts) | Qu'une nouvelle spec poste sur une route publique sans filet. Le serveur Next lancé par Playwright lit `.env` : une écriture réussie irait en production. |

Ce qui reste : le socle de schéma (voir le tableau en tête), puis
[`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) prend le relais —
il refuse de démarrer tant que `supabase/migrations/` est vide.

Une fois les e2e qui tournent, les lignes **Q021**, **Q026** et **Q027** du
backlog deviennent écrivables : agenda admin (drag & drop, anti-collision),
opérations groupées, et le parcours fonctionnel du planificateur.

---

## Lot 3 — god-components

**En cours, par petites touches.** 18 → 17 fichiers au-dessus de 1 400 lignes.

La fiche publique d'équipe est sortie de la liste : 2 054 → 1 001 lignes, en
deux morceaux — le chargement dans
[`utils/teams/buildTeamPage.ts`](../utils/teams/buildTeamPage.ts), les briques
d'affichage dans
[`components/Team/TeamPageParts.tsx`](../components/Team/TeamPageParts.tsx).

Les prochains, par taille : `tournament-simulator.tsx` (3 878),
`tasks/index.tsx` (3 265), `users/manage.tsx` (2 379),
`tournament/[id]/matches.tsx` (2 252), `PlayerManageTeamScreen.tsx` (2 202).

### La règle A7, et la limite de son garde-fou

La règle : *tout lot qui touche un de ces fichiers en extrait au moins un
panneau*. Le garde-fou est
[`tests/unit/adminFileSizeGuard.test.ts`](../tests/unit/adminFileSizeGuard.test.ts),
qui gèle chaque fichier à sa taille et ne tolère que la baisse.

**À savoir avant de le lire** : sortir un type ou un helper d'un fichier gelé y
laisse une ligne d'`import`. Un compteur de lignes brut enregistre donc une
*croissance* pour une extraction — le geste même que la règle demande.
`pages/admin/stages/[stageId].tsx` en est l'illustration : monté à 969 en
typant quatre lectures, redescendu à 953 en sortant `StageOption`, soit +1 sur
son gel pour 16 lignes de moins qu'au pire moment.

Le garde-fou ne couvre que `pages/admin` et `components/admin`. Deux fichiers
hors de son périmètre ont grossi pendant le lot 6 et personne ne l'a signalé :
`pages/team/create.tsx` (1 961 → 1 969) et
`utils/dashboard/buildTournamentDashboard.ts` (1 474 → 1 522).

---

## Lot 8 — performance front

**Premier geste livré (22 septembre) : mesurer, puis geler.**

[`scripts/bundle-budget.mjs`](../scripts/bundle-budget.mjs), lancé par la CI
juste après `next build` (`npm run bundle:budget`), fait deux vérifications :

| Règle | Ce qu'elle empêche |
|---|---|
| Chaque page reste sous son gel de [`bundle-budget.json`](../bundle-budget.json), à 3 ko près | Qu'un import alourdisse une page sans que personne ne le voie. Next 16 (Turbopack) **n'affiche plus les tailles** en fin de build. |
| Aucun chunk de premier chargement ne lit `SUPABASE_SERVICE_ROLE_KEY` | Qu'un module serveur reparte dans le bundle client. |

Hausse voulue : `npm run bundle:budget -- --update`, et le diff du gel se
relit dans le commit.

**La première mesure a trouvé le motif redouté, installé dans `_app`**, donc
payé par les 250 pages : navbar → `adminLinks` → `utils/staff` →
`utils/supabase`, pour la seule fonction `hasAtLeastRole`. Le même chemin
passait par `utils/tenant` (`DEFAULT_TENANT_ID`), `utils/apiHelpers`
(`isValidUUID`), `playerProfileSeo` (`coreLabel`) et deux constantes. 31 pages
touchées, aucune désormais. Remèdes, à réemployer :

- partie pure sortie dans une feuille réexportée par le module serveur :
  [`utils/staffRoles.ts`](../utils/staffRoles.ts), `utils/tenantId.ts` ;
- `await import('@/utils/supabase')` dans la seule fonction asynchrone qui en
  a besoin (`apiHelpers`, `playerProfileSeo`) ;
- constante passée en prop par `getStaticProps` plutôt qu'importée dans le
  composant (`leaderboard`, `standings`).

**Le gain en octets est modeste** : 1 à 3 ko sur 68 pages, parce que
supabase-js reste dans `_app` pour la session navigateur. L'essentiel est le
garde-fou. Les vrais chantiers de poids, mesurés :

- **`_app` pèse 213 ko gzippés**, dont ~66 ko pour supabase-js *avec*
  Realtime. C'est le plancher de toutes les pages (médiane 235 ko).
- **`/player/tcg-guide` : 323 ko**, 110 au-dessus de `_app`, soit la page la
  plus lourde de loin. Elle est à regarder en premier.

La règle serveur a une limite, écrite dans le script : les chunks asynchrones
sont exclus, sinon les `import()` à la demande la feraient échouer. Un
`dynamic()` qui tirerait un module serveur passerait donc.

---

## Lot 2 / Q020 — dégradés des pages publiques

**En attente d'un arbitrage produit**, pas technique. Les hexadécimaux des
pages publiques (`hero`, `lore`) ne sont pas tokenisés. Les tokeniser n'a de
sens que si un design system *public* est voulu — le design system « Le Ruban »
est verrouillé côté direction mais le code n'a pas encore migré.

---

## Comment on vérifie, sur ce poste

Le Mac (i7 2014) surchauffe : **`npm run verify` ne se lance pas en local**.

- En local : `npx tsc --noEmit` (mono-thread, supportable) et des tests
  **ciblés** — `npx vitest run tests/unit/<fichier>`.
- La suite complète : la **CI GitHub sur `work`**, qui est aussi le seul
  endroit où passent le lint Redocly, la dérive de contrat OpenAPI et les
  garde-fous de taille.
- Node 24 obligatoire (`nvm use 24`) : vitest 4 casse sous le 20.18.1 du
  `.nvmrc`.

Trois pièges qui ont déjà coûté du temps :

1. **Le code de sortie de `verify` ment.** Deux exécutions concurrentes font
   expirer un worker vitest et le code de sortie annonce 0. Lire la SORTIE.
2. **Sur le poste Windows**, `next build` passe (et permet `bundle:budget` en
   local), mais `npx biome ci .` signale le format de *tous* les fichiers : le
   dépôt est en CRLF (`core.autocrlf`) et Biome exige LF. Ce bruit n'est pas
   une erreur ; vérifier ses propres fichiers avec `npx biome lint <fichiers>`.
   Et `anyRatchet` y comptait les routes API comme des écrans (chemins en
   `\`) : corrigé le 22 septembre.
3. **Régénérer les réponses OpenAPI** après toute modification de types de
   route : `npm run openapi:responses`. La CI est rouge sinon, et c'est elle
   qui l'a attrapé deux fois pendant le lot 6.
