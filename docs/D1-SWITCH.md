# Bascule de la base vers D1 : la soirée

Marche à suivre du lot 6 de [D1-MIGRATION.md](D1-MIGRATION.md). Écrite le 2026-11-04, avant la répétition chronométrée
(lot 5c). Chaque geste technique est fait par Claude, sur ton feu vert ; toi, tu donnes le feu vert, tu regardes les
pages, et tu dis « stop » si quelque chose te semble faux.

## En bref

- **Ce qui change** : l'API et les pages du site lisent et écrivent dans D1 (`owwomenscup-db`, Francfort) au lieu de
  Supabase. Supabase reste là, en lecture seule, au moins 14 jours (lot 7), sans plus rien recevoir.
- **Durée** : environ **50 minutes**, dont **environ 35 minutes sans écriture possible** (rien ne s'enregistre : ni
  inscription, ni score, ni achat). Les pages restent lisibles tout du long.
- **Quand** : un soir sans match, ni la veille d'un match. Aucune date n'est fixée tant que la répétition (lot 5c)
  n'a pas tourné sans écart.
- **Trois réglages** font tout :
  - `DB_WRITES_FROZEN` (API) : `1` = les écritures sont refusées poliment (« maintenance, réessaie dans un moment »),
    les tâches planifiées s'arrêtent ; `0` = normal ;
  - `DB_BACKEND` (API et site) : `supabase` = comme aujourd'hui ; `d1` = D1 répond à tout ;
  - la marque « base principale » dans D1, posée par la copie finale : ensuite, plus rien ne peut vider cette base.
- **Ce qui dépend encore des deux autres chantiers** (marqué **[A]** et **[B]** plus bas) :
  - **[A]** le retour arrière D1 → Supabase (recopie, workflow `db-d1-rollback`) et la répétition de la CI
    (`db-restore-test`, option `switch_rehearsal`) : en place depuis le 2026-11-04 ;
  - **[B]** les comptes (Better Auth) sur D1, la même nuit : en place depuis le 2026-11-04, sans réglage à part.

## Avant le soir

| Quand | Quoi | Durée | Contrôle |
|---|---|---|---|
| Dès que prêt | Le code des trois chantiers fusionné et déployé, réglages à leur valeur sans effet (`DB_BACKEND` = `supabase`, `DB_WRITES_FROZEN` = `0`) | — | https://api.owwomenscup.fr/api/health répond `"dbBackend":"supabase"` |
| J-7 à J-2 | **Répétition chronométrée** : GitHub › Actions › `db-d1-switch` › « Run workflow », mode `repetition`. La base en service est lue (rien n'y est écrit), copiée dans une base jetable, vérifiée | ~5 min | Le résumé dit « identique », « Aucune table n'a bougé » et donne les durées |
| J-7 à J-2 | **Répétition de la bascule et du retour arrière, sur une copie** : GitHub › Actions › `db-restore-test` › « Run workflow », cocher `switch_rehearsal`. La sauvegarde de la nuit est restaurée sur la machine de GitHub, copiée dans un D1 jetable, des écritures d'après la bascule y sont jouées, puis le tout revient dans une seconde base Postgres et est comparé. Rien n'est écrit en ligne | ~10 min | Le résumé dit « identique » pour la copie et pour le retour, et donne les durées de chaque étape |
| J-1 | **Secrets du temps réel** sur l'API : `db-d1-switch`, mode `secrets` | ~2 min | Le résumé dit « Posés : REALTIME_NOTIFY_SECRET, REALTIME_TICKET_SECRET » |
| J-1 | Comptes sur D1 : rien à préparer, ils suivent `DB_BACKEND` (étape 3) | — | — |
| Le jour même | Pas de match ce soir-là ni le lendemain matin ; un mot sur Discord si tu veux prévenir (« maintenance de 30 min ce soir ») | — | — |

## Le soir, étape par étape

**0. Ton feu vert.** Une phrase suffit, par exemple : « Je t'autorise à basculer la base sur D1 ce soir ».

**1. Geler les écritures** (~10 min, le temps du déploiement de l'API).

- Claude passe `DB_WRITES_FROZEN` à `"1"` dans `wrangler.jsonc` de l'API et pousse.
- À partir de la mise en ligne : toute modification reçoit « Maintenance de la base en cours… » ; les tâches
  planifiées s'arrêtent (journal : `[crons] écritures gelées`). La connexion au site et les commandes du bot qui
  écrivent sont indisponibles aussi, le temps du gel.
- Contrôle : une page s'ouvre normalement ; un formulaire (par exemple un brouillon d'actualité) affiche le message de
  maintenance.

**2. La copie finale** (~5 min).

- GitHub › Actions › `db-d1-switch` › « Run workflow » : mode `finale`, et `BASCULE` dans le champ de confirmation.
- Le workflow vérifie d'abord que les écritures sont bien gelées et que Supabase est encore la base. Il met en pause
  la photo de la nuit (`db-d1-photo`), puis copie **toutes** les tables dans D1, en une seule photo cohérente.
- Contrôle, dans le résumé du workflow :
  - « Copie Postgres → D1 : identique » ;
  - « Copie finale : identique, D1 marquée base principale » ;
  - « Aucune table n'a bougé dans Supabase pendant la copie » ;
  - « Compteurs alignés sur Postgres : 9 ».
- **Si le résumé dit « ÉCARTS » ou « ÉCHEC »** : on s'arrête là. Rien n'est perdu, Supabase est toujours la base.
  Claude remet `DB_WRITES_FROZEN` à `"0"` (~10 min) et relance la photo de la nuit. On cherche la cause un autre jour.
- **Si une table « a bougé »** : la copie reste juste (elle garde l'état d'un seul instant), mais une écriture a
  échappé au gel. Claude regarde laquelle avant de continuer.

**3. Les comptes sur D1 : aucun réglage à part.** Better Auth suit `DB_BACKEND` (API `worker/identityRoute.ts` :
`d1` → la base principale D1, tout le reste → Supabase par Hyperdrive) : il bascule dans le même déploiement que
l'étape 4, jamais séparément. La copie finale emporte toutes les tables des comptes (`auth_user`, `auth_account`,
`auth_session`, `auth_verification`, `auth_two_factor`, `auth_jwks`, `auth_rate_limit`, `auth_settings`) : les
sessions ouvertes restent ouvertes, les jetons déjà donnés restent valables, la double authentification aussi. À
ne PAS toucher : le secret `BETTER_AUTH_SECRET` (il chiffre les clés des jetons et les secrets de double
authentification), la liaison Hyperdrive `AUTH_DB` et les variables `IDENTITY_*` (gardées pour un retour arrière ;
retirées au lot 7). Pendant le gel, la connexion est impossible (écriture) ; la lecture de la session marche.

**4. Basculer** (~10 min, les deux déploiements en parallèle). Les écritures restent gelées.

- API (`wrangler.jsonc`) : `DB_BACKEND` à `"d1"`, `D1_SHADOW_RATE` à `"0"` (la comparaison n'a plus d'objet).
  Décidé le 2026-11-03 : le Worker de l'API placé près de Francfort (`placement.region: "aws:eu-central-1"`), dans le
  même déploiement.
- Site (`wrangler.jsonc`) : `DB_BACKEND` à `"d1"`.
- Contrôles :
  - https://api.owwomenscup.fr/api/health?deep=1 répond `"dbBackend":"d1"` et `"db":"ok"` ;
  - pages : l'accueil, `/tournaments`, une page de tournoi et son bracket, une page d'équipe, `/news`, `/tcg`,
    l'espace joueuse (connectée), le tableau de bord admin, la Women's Library ;
  - journaux des deux Workers : aucune ligne `[base] configuration cassée`, pas de réponses 5xx nouvelles.
- **Si quelque chose ne va pas à ce stade** : retour arrière court (plus bas), rien à recopier.

**5. Dégeler** (~10 min).

- Claude remet `DB_WRITES_FROZEN` à `"0"` dans `wrangler.jsonc` de l'API et pousse.
- Contrôles, avec le compte d'essai :
  - une vraie écriture : un brouillon d'actualité créé puis supprimé ;
  - le temps réel : un changement de scène dans le cockpit caster apparaît sur l'overlay sans recharger ;
  - le TCG : l'achat d'un booster ;
  - les tâches planifiées : des lignes `[crons] ok` dans les 5 minutes ;
  - le bot : une commande qui écrit (par exemple `/pile-ou-face`).

**6. Les 48 heures suivantes.**

- Journaux de l'API et du site, matin et soir.
- Les paiements HelloAsso arrivés pendant le gel : vérifier qu'ils sont enregistrés (le message a reçu « 503 »).
  Twitch renvoie ses notifications seul.
- La photo de la nuit reste en pause pour de bon : D1 est maintenant la base.

### Variante plus courte

Les étapes 4 et 5 dans le même déploiement (`DB_BACKEND` à `"d1"` et `DB_WRITES_FROZEN` à `"0"` ensemble) : ~10
minutes de gel en moins, mais les écritures reprennent avant les contrôles de l'étape 4. Un défaut vu alors demande le
retour arrière long. Recommandé : la version en deux temps.

## Durées

| Étape | Durée | Écritures |
|---|---|---|
| 1. Gel (déploiement API) | ~10 min | possibles jusqu'à la mise en ligne |
| 2. Copie finale | ~5 min | gelées |
| 3–4. Bascule (déploiements API et site) | ~10 min | gelées |
| 4. Contrôles | ~10 min | gelées |
| 5. Dégel (déploiement API) | ~10 min | gelées jusqu'à la mise en ligne |
| **Total** | **~45–50 min** | **~35 min gelées** |

Durées mesurées le 2026-11-04 : déploiement de l'API 9–10 min, du site 4–5 min, photo de la nuit 3 min. La
répétition chronométrée (lot 5c) remplacera ces estimations.

## Retour arrière

### Avant le dégel (étape 4 ratée) : court, rien à recopier

Les écritures étaient gelées : D1 n'a rien reçu d'important.

1. API et site : `DB_BACKEND` à `"supabase"` (les comptes reviennent sur Supabase avec lui). Écritures toujours gelées.
   ~10 min.
2. Contrôle : https://api.owwomenscup.fr/api/health répond `"dbBackend":"supabase"` ; les pages s'ouvrent.
3. Dégel : `DB_WRITES_FROZEN` à `"0"`. ~10 min.
4. Pour retenter un autre soir : la marque « base principale » est posée sur D1, et rien ne peut plus la vider. La
   retirer est un geste exprès, sur ton accord : `DROP TABLE "_d1_primary"` sur la base `owwomenscup-db`. Puis
   relancer la photo de la nuit.

### Après le dégel : la recopie D1 → Supabase [A]

Des écritures ont eu lieu dans D1 : il faut les ramener dans Supabase.

1. Gel : `DB_WRITES_FROZEN` à `"1"` (`DB_BACKEND` reste `"d1"`). ~10 min.
2. La recopie D1 → Supabase et sa vérification : GitHub › Actions › `db-d1-rollback` › « Run workflow », écrire
   `RETOUR`. Elle refuse si les écritures ne sont pas gelées ou si D1 n'est plus en service ; elle lit D1 sans
   l'écrire, remplace les tables de Supabase en une transaction (rien ne change si une seule étape échoue), puis
   relit et compare les deux bases. ~2 min (estimation du lot 5c : 20–45 s de recopie). Contrôle : le résumé dit
   « identique » ; sinon Supabase est inchangé, rester sur D1 et chercher. Toute écriture faite dans Supabase
   après la bascule est effacée (D1 fait foi). La marque « base principale » reste sur D1 : la photo de la nuit
   reste en pause.
3. API et site : `DB_BACKEND` à `"supabase"` (les comptes suivent ; la recopie de l'étape 2 les a ramenés).
   `D1_SHADOW_RATE` reste à `"0"`. ~10 min.
4. Contrôles : `"dbBackend":"supabase"` ; les mêmes pages qu'à l'étape 4.
5. Dégel : `DB_WRITES_FROZEN` à `"0"`. ~10 min.

## Ce qui est différent après la bascule

- **Le temps réel est prévenu par l'API**, plus par la base. Une modification faite à la main dans la console D1 ne met
  pas les écrans à jour (une modification dans l'éditeur SQL de Supabase le faisait).
- **Une valeur de réglage inconnue arrête l'API** (sauf `/api/health`) : `DB_BACKEND` ne connaît que `supabase` et
  `d1`. C'est voulu : écrire dans la mauvaise base serait pire qu'une panne de quelques minutes.
- **Les pages construites au déploiement du site lisent encore Supabase** (une vingtaine de pages sans paramètre,
  comme `/news` ou `/association`). Le soir de la bascule, c'est sans effet : Supabase a les mêmes données que D1. Aux
  déploiements suivants, ces pages montrent les données du soir de la bascule jusqu'à leur régénération, de 30 s à
  1 h selon la page. À régler avant le lot 7 (suppression de Supabase), sinon ces constructions échoueront.

## Ce que fait chaque morceau (pour Claude)

- API, `worker/database.ts` : l'interrupteur et le gel, à chaque requête. `DB_BACKEND` inconnu, ou `d1` sans la liaison
  `MAIN_DB` : 503 partout sauf `/api/health`, aucune tâche planifiée. Gel : 503 + `Retry-After: 300` sur tout ce qui
  n'est pas GET, HEAD ou OPTIONS, aucune tâche planifiée.
- API et site, `utils/db/d1/primary.ts` (recopié sur le site) : les crochets de `supabaseAdmin.from()`
  (`owwc.db.from-hook`) et de `dbFunctions()` (`owwc.db.rpc-hook`) vers la façade D1 ; le notificateur du temps réel
  (`REALTIME_NOTIFY_URL`, secret `REALTIME_NOTIFY_SECRET`) et le secret des tickets (`REALTIME_TICKET_SECRET`) pour
  l'API. La lecture dans l'ombre est coupée en mode `d1`.
- Site, `cloudflare/database.ts` : le même crochet pour les lectures des pages, sans temps réel (le site n'écrit pas).
- API, `scripts/d1-copy.mjs --final` et `utils/db/d1/finalCopy.ts` : la copie finale (une transaction en lecture seule,
  toutes les tables, compteurs alignés, empreintes relues, marque).
- Site, `.github/workflows/db-d1-switch.yml` : les modes `secrets`, `repetition`, `finale`.
