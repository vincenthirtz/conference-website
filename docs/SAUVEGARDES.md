# Sauvegardes de la base

Mises en place le 2026-10-29. L'offre gratuite de Supabase ne fait **aucune**
sauvegarde : avant, une erreur ou une suppression était définitive.

## Ce qui tourne

Chaque nuit à 2 h 17 UTC (3 h 17 à Paris l'hiver), le workflow
[`.github/workflows/db-backup.yml`](../.github/workflows/db-backup.yml) :

1. exporte la base avec la CLI Supabase (`supabase db dump`, méthode
   recommandée par Supabase) en trois fichiers : `roles.sql` (rôles),
   `schema.sql` (tables, fonctions, déclencheurs, règles d'accès) et
   `data.sql` (toutes les lignes, comptes `auth.users` compris) ;
2. les contrôle ([`scripts/db-backup-check.mjs`](../scripts/db-backup-check.mjs)) :
   au moins 100 tables publiques, 50 tables avec des lignes, des comptes, des
   matchs et des équipes. Sinon le travail échoue, GitHub prévient par
   e-mail, et rien n'est envoyé ;
3. les envoie, compressés, dans le bucket R2 **privé**
   `owwomenscup-backups` (Union européenne) :
   - `quotidien/owwc-AAAA-MM-JJ.tar.gz`, gardés 35 jours ;
   - `mensuel/owwc-AAAA-MM.tar.gz` (le 1er du mois), gardés 400 jours.

   Le ménage est fait par R2 ([`scripts/db-backup-lifecycle.json`](../scripts/db-backup-lifecycle.json),
   reposé à chaque passage).

Coût : 0 $ (quelques Mo par jour ; R2 gratuit jusqu'à 10 Go). Le résumé du
workflow ne montre que des nombres, jamais de données.

**Secret** `SUPABASE_DB_URL` dans l'environnement GitHub
`cloudflare-production` : chaîne « Session pooler » du tableau de bord
Supabase (bouton **Connect**), mot de passe de la base compris. Rien d'autre
n'utilise ce mot de passe (vérifié le 2026-10-29) : le réinitialiser
(Database › Settings) ne casse rien, mais il faut alors mettre le secret à
jour.

Lancer une sauvegarde à la main : onglet Actions › `db-backup` › Run
workflow, ou `gh workflow run db-backup.yml --ref work`.

## Ce qui n'y est pas

- Les **fichiers** (logos, images) : ils sont dans R2
  (`owwomenscup-media`), pas dans la base.
- Les **réglages du temps réel** rangés dans Supabase Vault : le workflow
  `realtime` les repose (docs/REALTIME-DO.md).
- Les **réglages de Supabase** eux-mêmes (connexion Discord, e-mails,
  adresses autorisées), à refaire à la main dans un nouveau projet.

## Restaurer

À faire de préférence dans un **nouveau** projet Supabase (jamais par-dessus
la base en service sans l'avoir décidé).

1. Télécharger l'archive : tableau de bord Cloudflare › R2 ›
   `owwomenscup-backups` › choisir le fichier › Download. La décompresser
   (`tar -xzf owwc-AAAA-MM-JJ.tar.gz`).
2. Créer le projet Supabase cible, activer les extensions utilisées
   (`pg_net`, `pgcrypto`…), récupérer sa chaîne de connexion (Connect ›
   Session pooler).
3. Restaurer, dans cet ordre, en une seule transaction (procédure officielle
   Supabase, « Restore a Platform Project ») :

   ```sh
   psql \
     --single-transaction \
     --variable ON_ERROR_STOP=1 \
     --file roles.sql \
     --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql \
     --dbname "<chaîne de connexion du projet cible>"
   ```

   `session_replication_role = replica` coupe les déclencheurs pendant
   l'import (sinon ils rejoueraient leurs effets).
4. Vérifier : nombre de comptes (`select count(*) from auth.users`), de
   matchs, d'équipes, comparés au résumé du workflow de la nuit choisie.
5. Rebrancher le site et l'API sur le nouveau projet (clés et adresse
   Supabase dans GitHub et sur le serveur de l'API) — décision à prendre au
   moment, selon la panne.
