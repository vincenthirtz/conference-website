# Faire tourner les e2e sur une Supabase jetable

## L'état des lieux

Les 87 specs Playwright du dépôt **ne tournent nulle part**.

En local, `.env` désigne la Supabase de production. Le garde-fou de
[`tests/utils/supabaseTestClient.ts`](../tests/utils/supabaseTestClient.ts)
refuse cette cible en absolu : toute spec qui sème s'interrompt à l'import, et
se retrouve donc *ignorée*. Les quatorze qui subsistent sont en lecture seule ou
négatives — elles vérifient qu'une route refuse bien un accès. Ce n'est pas un
accident heureux : c'est ce que
[`tests/unit/e2eNoProdWrites.test.ts`](../tests/unit/e2eNoProdWrites.test.ts)
vérifie désormais à chaque exécution des tests unitaires.

Sur le Mac, la suite complète fait chauffer la machine, d'où la règle « pas de
`verify` en local ». Le runner GitHub règle les deux problèmes : il est froid,
et sa Supabase naît et meurt avec le job.

## Ce qui bloque, et ce n'est pas le runner

`database/migrations/` contient **340 fichiers sans horodatage**, nommés par
sujet :

```
accept_invitation_allow_manager.sql
add_acked_at_to_cast_assignments.sql
…
update_pole_member_flipflop_events.sql
```

Leur ordre alphabétique n'est pas leur ordre chronologique, et elles dépendent
les unes des autres — un index posé sur une colonne créée trois migrations plus
tôt, une contrainte qui suppose une table existante. `supabase db reset` les
rejouerait dans le désordre et casserait tôt.

## La sortie : un socle, une fois

On fige l'état actuel de la production en **un seul fichier de socle**,
[`supabase/migrations/00000000000000_baseline.sql`](../supabase/migrations/00000000000000_baseline.sql),
et les migrations futures s'empilent dessus avec un horodatage. Les 340
fichiers existants restent où ils sont, comme archive de ce qui a été fait.

### D'où vient le socle

Le chemin « officiel » (`supabase db dump`) demande la CLI, Docker et le mot de
passe base. Le socle a été **reconstruit par introspection du catalogue** de la
production (projet `owwomenscup`, ref `yhfdhpqgmazfxyyklomp`, le 2026-09-29) :
des `SELECT` en lecture seule sur `pg_catalog`, `pg_policies` et
`pg_publication_tables`, au moyen de `pg_get_functiondef`,
`pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_viewdef`,
`pg_get_triggerdef` et `format_type`. **Aucune donnée applicative n'est lue ni
copiée.**

Contenu, dans cet ordre (l'ordre évite les problèmes de dépendances) :
extensions (`uuid-ossp`, `pgcrypto` dans `extensions` ; `unaccent`, `pg_trgm`
dans `public`), séquences, fonctions (`check_function_bodies = off`), tables,
PK/UNIQUE/CHECK, index, vues, **clés étrangères en dernier**, triggers, RLS,
policies, droits (`PUBLIC`, `anon`, `authenticated`, `service_role`),
publication `supabase_realtime`, buckets `teams-images` (public) et
`match-evidence` (privé). Ni `OWNER TO`, ni `COMMENT` ; `auth` et `storage`
viennent de `supabase start`. `pg_stat_statements`, `supabase_vault` et
`pg_graphql` ne sont pas recréés : aucun objet de `public` n'en dépend.

### Régénérer le socle

Quand la prod a beaucoup dérivé du socle (nouvelles tables appliquées hors de
`supabase/migrations/`), deux voies :

1. **Avec la CLI** (mot de passe base requis, Docker démarré) :

   ```bash
   npx supabase login
   npx supabase link --project-ref yhfdhpqgmazfxyyklomp
   npx supabase db dump --schema public \
     -f supabase/migrations/00000000000000_baseline.sql
   ```

   Relire le fichier : retirer les `OWNER TO` et les extensions propres à
   l'hébergé.

2. **Par introspection** (comme la première fois) : les mêmes requêtes de
   catalogue, lancées en lecture seule (connecteur Supabase ou `psql`), avec
   `SET search_path = ''` pour obtenir des noms entièrement qualifiés, puis
   assemblées dans l'ordre ci-dessus. Aucune requête ne doit lire une table
   de `public`, `auth` ou `storage`.

Dans les deux cas, reprendre l'en-tête de provenance, puis chercher e-mails,
jetons et URL avant de committer.

## Le seed

[`supabase/seed.sql`](../supabase/seed.sql), appliqué après le socle
(`[db.seed]` dans [`supabase/config.toml`](../supabase/config.toml)). Il ne
contient que des données de TEST inventées : le **tenant par défaut**
(`ce69a726-…`, constante de `utils/tenantId.ts`, plan `foundation`), sans
lequel toute écriture portant un `tenant_id` échoue sur sa clé étrangère.
Les comptes (joueuses, staff) sont créés par les specs elles-mêmes via
`tests/utils/supabaseTestClient.ts`, pas par le seed.

`config.toml` relève aussi les plafonds de GoTrue (`[auth.rate_limit]`) : la
suite ouvre des centaines de sessions depuis 127.0.0.1, et le plafond par
défaut fait échouer la connexion en 429 — que la page `/login` affiche comme
« Email ou mot de passe incorrect ».

## Dans la CI

Le workflow [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) :

- **Huit tranches** parallèles (`--shard=N/8`), chacune avec **sa propre**
  Supabase — les specs sèment et nettoient, deux tranches sur une même base se
  marcheraient dessus. Deux workers par tranche, pas plus : 59 fichiers sont
  en mode `serial` et toutes les specs partagent la base de leur tranche.
- Dans chaque tranche, `supabase start` tourne **en arrière-plan** pendant
  `npm ci` + `next build` ; l'app est ensuite servie en **`next start`**
  (`E2E_SERVER=start`), sans compilation à la demande. En local, `next dev`
  comme avant. La clé anon inlinée au build est la clé de démonstration
  publique et déterministe de la CLI ; une étape vérifie qu'elle correspond à
  l'instance et reconstruit sinon.
- Services Supabase réduits (`-x studio,postgres-meta,imgproxy,…`), cache du
  build Next (`.next/cache`), du npm et des navigateurs Playwright.
- **Sur push : projet `chromium` seul.** Le projet `mobile` (Pixel 7) tourne
  la nuit, et en manuel si la case `mobile` est cochée.
- Réglages CI de Playwright : timeout 60 s par test (les tests verts vont
  jusqu'à ~48 s, p95 ≈ 7 s), actions et navigations 15 s, `expect` 10 s,
  `retries: 0` (un second essai doublerait le coût des échecs connus),
  trace conservée à l'échec, pas de vidéo, `forbidOnly`.
- Rapports : `blob` par tranche + annotations `github` ; un job
  `merge-reports` fusionne le tout (artefact `playwright-report`), même quand
  des tranches échouent.
- `concurrency` : un nouveau push annule le run en cours de la même branche.

Il refuse de démarrer tant que `supabase/migrations/` est vide, avec un message
qui renvoie ici.

Déclenchement : manuel (*Actions → e2e → Run workflow*, une fois le workflow
présent sur la branche par défaut), une fois par nuit, et à chaque push sur
les branches de validation `admin-industrialisation` et `e2e-baseline` (code de
prod + infra e2e seule : la référence qui départage régressions et échecs
préexistants). Pas à chaque push sur `work` — la CI rapide (typecheck +
unitaires) reste le filet du quotidien.

Playwright ne cherche que dans `tests/e2e/` (`testDir`) : avec `./tests`, il
ramassait les `*.test.ts` de Vitest et s'arrêtait à la collecte.

### Écarté

- **Sessions pré-connectées (`storageState`)** : chaque spec crée ses propres
  comptes (`createTestPlayer` / `createTestStaff`, e-mails dédiés, équipes et
  rôles propres). Une session partagée par rôle casserait cette isolation et
  changerait ce que les specs vérifient.
- **Cache des images Docker** : le pull (~40 s) est déjà recouvert par
  `npm ci` + `next build` ; un `docker save/load` d'environ 1 Go n'y gagnerait
  rien.

## Toute nouvelle migration, à partir de là

Horodatée, dans `supabase/migrations/` :

```
supabase/migrations/20260922143000_ajout_colonne_x.sql
```

Sans quoi le problème se reconstitue, fichier par fichier.

## Les deux garde-fous qui restent en place

Ils ne deviennent pas inutiles une fois les e2e sur GitHub — ils protègent le
poste de développement, où `.env` continue de désigner la production.

| Fichier | Ce qu'il empêche |
|---|---|
| [`tests/unit/e2eSeedGuard.test.ts`](../tests/unit/e2eSeedGuard.test.ts) | Que la règle « jamais semer la prod » devienne décorative. Elle vivait dans un `if` au chargement du module, donc n'était pas exécutable par un test — et elle avait un trou : `https://localhost.evil.example.com` passait pour un hôte local, ce qui faisait sauter tous les contrôles. |
| [`tests/unit/e2eNoProdWrites.test.ts`](../tests/unit/e2eNoProdWrites.test.ts) | Qu'une nouvelle spec poste sur une route publique sans passer par le client de seed. Le serveur Next lancé par Playwright lit `.env` : une écriture réussie irait en production. |
