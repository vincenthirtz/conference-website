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

On fige l'état actuel de la production en **un seul fichier de socle**, et les
migrations futures s'empilent dessus avec un horodatage. Les 340 fichiers
existants restent où ils sont, comme archive de ce qui a été fait.

### L'étape manuelle (mot de passe base requis)

Le mot de passe se trouve dans la console Supabase, *Project Settings →
Database → Connection string*. Il n'est pas dans le dépôt, et ne doit pas y
entrer.

Prérequis : **Docker Desktop démarré** — `db dump` exécute `pg_dump` dans un
conteneur. Sans `link` préalable, `db dump` échoue sur « Cannot find project
ref ».

```bash
npx supabase login                      # jeton d'accès, via le navigateur
npx supabase init                       # crée supabase/config.toml si absent
npx supabase link --project-ref yhfdhpqgmazfxyyklomp

mkdir -p supabase/migrations
npx supabase db dump \
  --schema public,auth,storage \
  -f supabase/migrations/00000000000000_baseline.sql
```

Relisez le fichier obtenu avant de le committer : un dump embarque parfois des
`OWNER TO` ou des extensions qui n'ont pas de sens hors du projet hébergé, et
qui font échouer le `db reset` local.

Vérifiez qu'il se rejoue :

```bash
npx supabase start
npx supabase db reset       # rejoue le socle sur une base vierge
```

### Ensuite

Le workflow [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) prend le
relais. Il refuse de démarrer tant que `supabase/migrations/` est vide, avec le
message qui renvoie ici — plutôt que de partir dans un `db reset` qui casserait
sans qu'on comprenne pourquoi.

Déclenchement : manuel (*Actions → e2e → Run workflow*) et une fois par nuit.
Pas à chaque push — la suite est longue, et la CI rapide (typecheck +
unitaires) reste le filet du quotidien.

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
