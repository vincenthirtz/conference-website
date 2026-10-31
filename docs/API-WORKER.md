# L'API dans un Worker Cloudflare — étude de faisabilité

Étude du 2026-10-29, **lecture seule** : rien n'a changé en production. Sujet :
faire tourner conference-api (aujourd'hui une image Docker Node sur un
serveur AWS Lightsail à Stockholm, derrière CloudFront et Caddy) dans un
Worker Cloudflare, comme le site depuis le 2026-10-28. C'est le préalable à
une base chez Cloudflare (D1 ne s'utilise que depuis un Worker) et la
question du rappel du 2026-11-11 (« où héberger l'API »).

## Verdict

**Faisable, sans obstacle technique, mais pas en déplaçant simplement le
code : environ 2 à 3 semaines de travail.** Rien d'exotique ne bloque (pas de
module natif, pas de connexion directe à Postgres, pas de serveur maison). Le
vrai travail vient de ce que l'API suppose d'**un seul processus Node qui
tourne en continu** : ses verrous, ses caches et ses tâches lancées « en fond »
deviendraient faux, en silence, sur des Workers qui tournent en plusieurs
exemplaires et s'arrêtent après chaque réponse.

## Mesures (2026-10-29)

| | Valeur |
|---|---|
| Serveur actuel | Lightsail `micro_3_0`, 2 vCPU, 1 Go, **7 $/mois** ; ~200 Mo de mémoire par couleur (bleu/vert) |
| Trafic de l'API (CloudFront, 14 jours) | **12 600 requêtes/jour** en moyenne (pic : 25 200 le 23/10, finales de la Cup) ≈ 380 000/mois ; ~0,5 Go/mois |
| Worker du site | ~16 000 requêtes/jour depuis la bascule, calcul médian **7 ms** (p99 0,4 s : pages reconstruites) ; 4,5 Mo compressé, démarrage 22 ms |
| Forfait Workers (5 $/mois, déjà payé) | 10 M requêtes + 30 M ms de calcul inclus |
| Estimation site + API dans des Workers | ≈ 0,9 M requêtes et ≈ 15 M ms de calcul par mois : **dans l'inclus** |

Un appel d'un Worker à un autre (le relais du site vers l'API) ne coûte pas
de requête en plus.

## Ce qui marche tel quel

- **Base** : uniquement supabase-js (HTTPS), aucune connexion Postgres directe.
- **Dépendances** : aucun module natif (ni sharp, ni canvas, ni bcrypt, ni pg).
  supabase-js, aws4fetch (R2), graphql-yoga, zod, yaml, slugify, qrcode : OK.
- **`node:crypto`** (~75 usages : HMAC, hash, aléas, chiffrement, ECDH) : pris
  en charge par `nodejs_compat`.
- **Webhooks** HelloAsso (jeton) et Twitch EventSub (HMAC du corps brut) :
  portables. Pas de Discord interactions, de Stripe ni de Monetico côté API.
- **Calcul** : aucune route ne s'approche de 30 s de calcul (images OG,
  appariement suisse plafonné, GraphQL limité en profondeur, exports CSV/ICS).
- **Pas de** SSE, WebSocket serveur, `setInterval`, middleware ni serveur
  personnalisé. Les tâches planifiées sont déjà des appels HTTP.

## Ce qui doit changer

| Point | Pourquoi | Correction | Effort |
|---|---|---|---|
| **113 appels « lancés en fond »** (`void fn()`, 65 fichiers : événements du bot, e-mails, posts Discord) | Un Worker peut couper ce qui reste en cours après la réponse : lignes d'outbox, e-mails perdus | Aide `waitUntil` (contexte Cloudflare) | ~1 j |
| **Tâches planifiées qui continuent après l'appelant** (`crons.ts` coupe à 20–60 s, l'API finissait seule) | Même cause : coupé sur Worker | Lancer les tâches planifiées DANS le Worker de l'API (Cron Triggers : 15 min de durée réelle) ou Queues ; découper `broadcast-process` (60–120 s), `email-digest`, `recycle-bin-purge`, `tenant-purge` en lots | 2–3 j |
| **Verrous de tâche en mémoire** (`cronSingleFlight`, `_inFlight` ×4) | Deux exemplaires peuvent traiter deux fois | Verrou en base (advisory lock) ou Durable Object | 0,5–1 j |
| **Caches vidés à l'écriture, longue durée** (clés du bot 15 min, secrets d'intégration 30 min, espace 30 min, réglages 10 min) | Une révocation n'est vue que par l'exemplaire qui l'a faite | Durées ≤ 60 s ou tampon de version partagé (KV) | 0,5–1 j |
| **Signaux « une écriture a eu lieu »** (`outboxActivity`, ~14 `createDormancyMemo`) | Un exemplaire ne réveille pas l'autre : notifications push retardées jusqu'à 15 min | Supprimer la mise en sommeil ou compteur partagé (KV / DO) | 0,5–1 j |
| **Limites de fréquence en mémoire** (`utils/rateLimit.ts`) | Une limite par exemplaire = inefficace | Rate Limiting de Workers ou DO ; IP par `cf-connecting-ip` | 0,5–1 j |
| **Spécification OpenAPI lue sur disque** (`loadSpec.ts`, `publicSpec.ts`, 2 Mo) | Pas de système de fichiers | Import JSON au build | 2–4 h |
| **web-push** (https.request, agent proxy) | Bibliothèque Node | Envoi VAPID en WebCrypto | 0,5–1 j |
| **Envois de fichiers en base64** (Drive jusqu'à 25 Mio, copies multiples) | 128 Mo de mémoire par exemplaire | Envoi direct vers R2/Drive par URL signée | 1–2 j |
| `node:dns` (3 fichiers), flux de téléchargement Drive, cheerio | À vérifier | DNS par HTTPS, flux web, `cheerio/slim` | 0,5 j |
| Clé `scrypt` recalculée à chaque appel | Coûteux (50–100 ms) | La garder en mémoire | 1 h |
| Déploiement | Docker + bleu/vert + Caddy + CloudFront | OpenNext + wrangler (comme le site), secrets Worker, versions Worker pour le retour arrière | 1–2 j |

**Sécurité, vérifié pendant l'étude** : l'API croit d'abord l'en-tête
`x-nf-client-connection-ip` pour l'adresse du client. Ce n'est **pas** une
faille aujourd'hui : Caddy l'écrase toujours (adresse du relais, crue
seulement avec le secret partagé, ou adresse vue par CloudFront —
`deploy/Caddyfile.tmpl`). Dans un Worker, cette protection devra être refaite
avec `cf-connecting-ip`.

**Brevo, vérifié le 2026-10-31** : le blocage des adresses IP non autorisées est
désactivé pour les clés API et SMTP. Un Worker, qui n'a pas d'IP fixe contrairement
au serveur actuel (51.21.73.146), peut donc envoyer. À laisser désactivé.

## Trois options pour le rappel du 2026-11-11

| | Coût | Travail | Mène à D1 ? |
|---|---|---|---|
| **A. Rester sur Lightsail** | 7 $/mois + l'entretien du serveur (système, Docker, Caddy) | aucun | non |
| **B. Cloudflare Containers** (même image Docker) | ≈ 7 $/mois : le conteneur ne dormirait jamais (tâches chaque minute), 1 Go ≈ 6,35 $ + disque ≈ 0,70 $ | ~2–3 j | non (un conteneur n'accède pas à D1) |
| **C. Worker** | 0 $ de plus (dans les 5 $), **−7 $/mois**, plus de serveur à entretenir | **2–3 semaines** | **oui**, c'est le préalable |

## Recommandation

**C, en deux phases, sans date imposée :**

1. **Rendre l'API indépendante du processus, en restant sur Node** (~1
   semaine) : `waitUntil` prêt à l'emploi, verrous en base, caches courts,
   signaux partagés, tâches découpées, OpenAPI au build, web-push en
   WebCrypto. Chaque correction se déploie comme aujourd'hui, se vérifie en
   production et **rend l'API actuelle plus solide** (les deux couleurs
   bleu/vert sont déjà deux processus pendant 30 s à chaque bascule). Rien
   n'est perdu si on s'arrête là.
2. **Le Worker de l'API en parallèle** (~1 semaine) : build OpenNext, mesure
   de la taille et du démarrage, puis **bascule famille de routes par famille
   de routes** derrière le relais du site (liaison de service, sans requête
   facturée en plus), avec retour vers Lightsail à chaque étape. Lightsail
   éteint deux semaines après la dernière famille.

Si la sortie de la base n'est finalement pas décidée, l'option A reste
raisonnable : 7 $/mois pour un serveur qui marche. La phase 1 vaut la peine
dans les deux cas.

## Décision et suivi

**2026-10-29 : option C retenue par la propriétaire**, pour pouvoir ensuite
passer la base sur D1 et finir la sortie de Supabase.

**2026-10-30 : lots 1 à 6 en production**, à la demande de la propriétaire, avant
l'Event Halloween 2026 (fusionnés un par un sur `main` de conference-api et
vérifiés entre chaque). La branche `worker-phase1` n'a plus d'écart avec `main`.

| Lot | Contenu | État |
|---|---|---|
| 1 | `runInBackground` (`utils/background.ts`) à la place des ~140 envois lancés en fond ; garde-fou contre leur retour | en ligne (09777cf) |
| 2 | Verrous des tâches planifiées en base (au lieu de `cronSingleFlight` / `_inFlight` en mémoire) | en ligne (db55269), migration `add_cron_locks.sql` appliquée ; prouvé : verrous pris et relâchés sur la vraie table |
| 3 | Caches vidés à l'écriture : durées ≤ 60 s (clés du bot, tenant, guilde, secrets d'intégration, réglages, liste du miroir) | en ligne (7a34146) ; coût estimé ~3 000 lectures de plus par jour, à mesurer |
| 4 | Signaux « une écriture a eu lieu » (`outboxActivity`, mémos de sommeil) : un seul point, `utils/sharedSignals.ts`, où la phase 2 branchera une mémoire partagée ; pas de verrou pour un passage à vide | en ligne (71632f4) ; mesuré : 3 verrous en 5 min au repos au lieu de ~18 |
| 5 | Tâches longues découpées (`broadcast-process`, `email-digest`, `recycle-bin-purge`, `tenant-purge`) | en ligne (fe40963), horaires changés (7fd318311) ; aucun passage réel observé au moment d'écrire |
| 6 | web-push en WebCrypto ; `node:dns` par HTTPS ; clé `scrypt` gardée en mémoire | en ligne (0931777) ; notification reçue sur un vrai appareil, abonné avant la bascule |
| 7 | Spécification OpenAPI embarquée au build (plus de lecture disque) | en ligne (b0cf10f) ; prouvé sur un build sans le dossier généré, spec publique identique en production, spec complète ouverte avec une vraie session admin |
| 8 | Dépôt Drive direct par session d'envoi Google, au lieu du base64 | en ligne (API 3db02cb, site 1b9996c8f) ; **dépôt réel pas encore réussi, reporté** : la session s'ouvre, puis Google refuse (droits du compte de service à vérifier : Éditeur, puis Drive partagé ou non) |

**Lot 5.** Chaque passage s'arrête à son budget de temps et reprend au suivant,
d'où des passages plus rapprochés (`cloudflare/crons.ts`) : `broadcast-cron` et
`email-digest-cron` toutes les 5 min dans leur heure, `tenant-purge-cron` toutes
les 10 min. Choix assumé : un e-mail n'est jamais envoyé deux fois, quitte à ne
pas partir. Un passage coupé entre la réservation et l'envoi laisse le
destinataire en échec, sans nouvel essai.

**Lot 6.** `utils/webhookDelivery.ts` garde un `node:dns/promises` sur Node
seulement, à retirer quand Lightsail s'éteint : sans lui, le contrôle des adresses
privées serait moins strict qu'aujourd'hui.

**Lot 8.** Le fichier ne traverse plus l'API : elle ouvre la session, le navigateur
dépose chez Google, elle relit le résultat. Réduit au Drive, seul envoi qui menaçait
vraiment les 128 Mo d'un Worker. Les preuves de match et les vidéos d'alerte restent
en base64 ; le coût mémoire mesuré est plus haut que prévu (voir phase 2).

**Piège de la synchro.** `sync:api` copie tout fichier importé par le site qui
existe aussi dans l'API. Un fichier créé dans l'API sous le nom d'un fichier
propre au site écrase donc ce dernier : `utils/webPush.ts` (navigateur côté site,
envoi côté API) a bloqué le robot et la CI le 2026-10-30. Le fichier du site
s'appelle désormais `utils/webPushClient.ts`.

## Phase 2 : le Worker de l'API

Sur `main` de conference-api depuis le 2026-10-31 (bdcd405). **Le Worker ne sert encore
qu'une première famille de lectures** : tout le reste de l'API passe par le serveur Lightsail.

**2026-10-31 : mesure, réponse oui.** L'API se construit pour un Worker, et les 718
routes se chargent dans workerd en local, avec une base factice (ce qui prouve
qu'elles démarrent, pas tous leurs chemins).

| | Mesuré (build Linux) | Limite |
|---|---|---|
| Script non compressé | 25,13 Mio | 64 Mio |
| Script gzip | 5,04 Mio | |
| Démarrage (`wrangler check startup`) | 26 à 51 ms | 1 s |
| Mémoire en plus, corps de 9,4 Mo | +65 Mo | 128 Mo |
| Mémoire en plus, corps de 12,6 Mo | +86 Mo | 128 Mo |
| Mémoire en plus, 3 corps de 12,6 Mo à la fois | +277 à 319 Mo | 128 Mo |

La mémoire est un majorant (pic de workerd au-dessus du repos) : seule la production
donnera le vrai chiffre. Un envoi en base64 tient, deux à la fois sur un même
exemplaire peut-être pas. L'envoi direct vers R2 reste la parade si l'essai réel
échoue. Caddy plafonne déjà tout corps à 10 Mo (`deploy/Caddyfile.tmpl`) : aujourd'hui,
un fichier au-delà d'environ 7,5 Mo est refusé, même là où la route annonce 8 ou 10 Mo.

Le flux de `documents/download`, `cheerio`, `qrcode`, `node:dns`, `node:crypto`
(`scrypt` compris) fonctionnent sur workerd. `process.memoryUsage()` y rend 0, sans
gravité. `next/og` exige une retouche d'OpenNext avant son build
(`scripts/cloudflare/patch-opennext.mjs`), à signaler en amont.

**2026-10-31 : le Worker est écrit** (`worker-phase2` à 0589211). Dossier `worker/` et non `cloudflare/` : même piège
de synchro que `webPush.ts`, un fichier d'API nommé comme l'entrée du Worker du site
l'aurait écrasée. Vérifié sur le Worker construit, sous workerd, tout le réseau
sortant intercepté :

| Fait | Constaté |
|---|---|
| Enveloppe à la place de Caddy | Adresse falsifiée ou faux relais : la limite de fréquence tient (429). Corps au-delà de 10 Mo : 413 sans lire le corps. 404 en JSON, HSTS, nosniff, CORS, préflight. Aucun secret du relais dans les journaux |
| `runInBackground` sur `waitUntil` | Écriture ralentie à 1,5 s : réponse en 17 ms, 0 écriture finie à la réponse, 1 après |
| 28 tâches dans `scheduled()` | `CRONS_ENABLED=0` : aucun appel. `=1` : les 7 tâches dues appelées, toutes en 200. Un appel par tâche vers le Worker lui-même, car un Cron Trigger n'a que 30 s de calcul en tout |
| Signaux dans un Durable Object | Une vraie route (`POST /api/admin/discord-logs/replay`) écrit sa note dans l'objet. Relecture : ~15 ms toutes les 5 s. Estimé : ≤ 18 000 requêtes/jour, au pire ~330 000 Go-s/mois sur 400 000 inclus, partagés avec le temps réel |

12 625 tests unitaires et typecheck verts, build Linux et Windows bons (25,13 Mio,
gzip 5,05 Mio). **Non prouvé ici :** le refus d'une requête sans adresse (le simulateur
en ajoute toujours une) et le passage d'une note d'un exemplaire à un autre (le banc
n'en a qu'un) : tests unitaires seulement. La base est factice : les 200 des tâches
prouvent qu'elles tournent, pas ce qu'elles feraient sur de vraies données.

**Reste à faire :**

| Travail | Taille | Bloquant ? |
|---|---|---|
| Bascule des familles suivantes derrière le relais, avec observation | À réévaluer famille par famille : le bot a demandé un audit et des corrections, l'ancienne estimation de 1 à 2 j était trop optimiste | Accord de la propriétaire avant chaque famille |
| Limites de fréquence partagées (132 appels, synchrones) | 0,5 à 1 j | Pas pour une première famille en lecture. À trancher avant les familles sensibles (connexion, captcha, formulaires), avec le nombre d'exemplaires observé |

**Premier déploiement, 2026-10-31.** Le Worker `owwomenscup-api` tourne sans adresse
publique (`workers.dev` répond 404, aucune route) et sans tâches planifiées
(`CRONS_ENABLED=0`). `worker.yml` le déploie après chaque image réussie sur `main`, sur le
même commit : ses tests sont ceux d'`image.yml` (12 682 réussis et 3 ignorés à la fusion).
Le serveur et le Worker servent donc le même code ; `/api/health` donne le commit en ligne,
sur `api.owwomenscup.fr` pour le serveur et sur `owwomenscup.fr` pour le Worker. Démarrage
mesuré par Cloudflare : 24 à 52 ms, 25,13 Mio. Les 48 réglages du serveur y sont posés en
secrets, dont `EDGE_PROXY_SECRET` et `STAFF_MFA_EXEMPT_USER_IDS`, et survivent à un
déploiement. Retour arrière : `promote.yml` ne concerne que le serveur, pour le Worker c'est
`wrangler rollback`.

Le jeton de déploiement a le rôle Workers Editor sur tous les Workers du compte : il
peut déployer aussi le Worker du site, sans pouvoir en créer ni en supprimer. Pour le
limiter à ce seul Worker, il faut un jeton de compte créé dans le tableau de bord (rôle
Editor sur `owwomenscup-api`) : `cf` ne crée que des jetons d'utilisateur, et ceux-là
refusent cette limite (erreur 1001).

**Pièges de `cf` (bêta).** `workers secrets bulk` répond `{}` et code 0 sans rien écrire :
poser les secrets un par un (`workers secrets update NOM --type secret_text --body @fichier`)
et relire la liste. Le profil `cf` par défaut de ce PC est un autre compte : toujours
passer `--profile owwomenscup`.

**Première famille, 2026-10-31.** Le relais du site (`API_WORKER_ROUTES`, wrangler.jsonc)
envoie au Worker les lectures de `/api/health`, `/api/seasonal-logo`, `/api/leagues`,
`/api/public/tcg/live`, `/api/public/openapi` et `/api/public/v1/`. GET et HEAD seulement ; si
le Worker lève, répond 5xx ou tarde plus de 8 s, la lecture repart vers le serveur. Retour
arrière : vider la variable et redéployer le site. Pas tout `/api/public/` : certains de ses GET
écrivent (`newsletter/confirm`).

Constaté en production, sur la vraie base et avec les vrais secrets :

- Réponses identiques à l'octet à celles du serveur sur les 8 routes de lecture comparées
  (`/api/health` mise à part, qui décrit l'exemplaire qui répond).
- Écritures, `/api/admin/*`, `/api/captcha` et route inconnue toujours servies par le serveur.
- Aucun repli sur 20 min, aucune erreur dans les journaux du Worker.
- Sans cache des deux côtés, le Worker n'est pas plus lent : 128 à 301 ms contre 184 à
  347 ms. Démarrage à froid vu jusqu'à ~1 s.
- Le cache de CloudFront manquait : le Worker interrogeait la base à chaque lecture (50 à
  450 ms). Corrigé le jour même, voir ci-dessous.

**Cache des réponses, 2026-10-31** (`worker/app.ts`, `worker/edgeRules.ts`). Cloudflare a deux
outils, mesurés tous deux en production, Worker chaud :

| | En cache | À construire | Sans cache |
|---|---|---|---|
| Workers Caching | 33 ms | **~1 100 ms** | 82 à 137 ms |
| API de cache (retenue) | 28 ms | 94 à 137 ms | 82 à 134 ms |

Workers Caching consulte un centre de données supérieur à chaque réponse absente, et sa clé
ignore les cookies et `Authorization`. Il vise un gros trafic mondial : ici, où une route peut
être lue toutes les dix minutes avec un cache de cinq, il serait plus lent qu'aujourd'hui.

Règles, testées dans `apiWorkerCache.test.ts` et vérifiées en production :

- **Ce qui entre :** un GET anonyme. Une session, un jeton, une clé ou un espace (`cookie`,
  `authorization`, `x-api-key`, `x-tenant-id`) ne lisent ni n'écrivent.
- **Familles jamais en cache :** les mêmes que les comportements `Managed-CachingDisabled` de
  CloudFront (`/api/bot/`, `/api/admin/`, `/api/auth/`, `/api/twitch/`, `/api/onboard/`,
  `/api/helloasso/`, `/api/webhooks/`, `/api/cron/`, `/api/invitations/`, `/api/cast/`,
  `/api/caster/`). Certaines de leurs routes se disent publiques alors que leur réponse dépend
  de l'appelant : se fier à `Cache-Control` servirait les données d'un espace à un autre.
- **Ce qui reste :** un 200 avec `s-maxage`, sans `private`, `no-store`, `no-cache` ni cookie.
- **Clé :** l'hôte de la visiteuse, le chemin et la query, aucun en-tête.
- **Durée :** `s-maxage`, vérifiée sur une route à 60 s (encore en cache à 43 s, plus à 68 s).
- **Panne :** cache illisible, la lecture passe sans lui ; écriture refusée, la réponse part quand
  même. Une trace reste dans les journaux dans les deux cas.
- `x-owwc-cache: HIT|MISS` dit d'où vient une réponse.

**Différences avec CloudFront, assumées :** une requête avec session n'est jamais servie depuis le
cache, là où CloudFront lui sert le cache anonyme : plus de lectures en base pour les joueuses
connectées, à mesurer quand leurs familles basculeront. `stale-while-revalidate` n'est pas repris :
après expiration, une visiteuse attend ~100 ms au lieu de recevoir l'ancienne réponse. Le cache est
propre à chaque centre de données, et un déploiement ne le vide pas (comme CloudFront).

**Deuxième famille, 2026-10-31 : actualités, équipes, tournois, classements.** Les lectures
de `/api/news`, `/api/news/rss`, `/api/news/comments`, `/api/teams`, `/api/teams/:id`,
`/api/team/:id/stats`, `/api/team/:id/maps`, `/api/tournaments`,
`/api/tournaments/:id/prize-pool`, `/api/tournaments/:id/mvp-leaderboard`,
`/api/tournament/:id/calendar.ics`, `/api/tournament/:id/qr` et `/api/players/leaderboard`.
Rien de plus pour les matchs : leurs lectures publiques passaient déjà par `/api/public/v1/*`, et
le reste est réservé au staff, ou sert au draft en direct.

La comparaison par début de chemin a disparu : `/api/teams` aurait couvert les routes privées de
`/api/teams/*`, dont certaines agissent sur un GET. `API_WORKER_ROUTES` compare segment par
segment, `:id` n'accepte qu'un UUID, `*` n'existe qu'en dernier, et tout le reste va au serveur.
**Avant d'ajouter une route :** vérifier que son GET n'écrit rien, utilitaires compris, et qu'il ne
lit aucun mémo de sommeil (voir la quatrième famille). `edgeApiProxy.test.ts` lit le réglage de
production et refuse qu'il couvre une route sensible connue.

Comparé à une photo prise juste avant la bascule, par le même relais :

- 12 corps sur 13 identiques à l'octet ; `calendar.ics` ne diffère que par `DTSTAMP`, l'heure de
  génération. Seul l'en-tête de `/api/news/rss` avait bougé (voir plus bas).
- 16 routes sensibles essayées (privées, staff, GET qui écrit, POST) : toutes restées au serveur.
- Aucun repli sur 12 min, 74 tâches planifiées réussies sur 20 min, aucun échec.
- En cache : ~30 à 100 ms. À construire, à chaud : 130 à 480 ms.
- **Avec une session, jamais de cache : 138 à 303 ms à chaque lecture.** C'est le surcoût annoncé.
  Le trafic réel dira ce qu'il pèse sur Supabase.
- **Démarrage à froid vu jusqu'à ~2,7 s** sur un premier appel. Le démarrage mesuré par Cloudflare
  (24 à 52 ms) ne compte pas le premier chargement de la route : à ce trafic, ces attentes peuvent
  être fréquentes. À mesurer sur le trafic réel avant les familles suivantes.

**Troisième famille, 2026-10-31 : lectures joueuses.** `/api/player/notifications`, `dashboard`,
`progression`, `team`, `matches` et `next-match`, lancée sans attendre la mesure, à la demande de la
propriétaire. Authentification par jeton `Bearer`, pas par cookie : **les cookies, le CSRF et la double
authentification restent à prouver.** Sans `?as=`, ces GET n'écrivent rien, utilitaires
compris ; une requête avec `?as=` (inspection du staff, qui écrit au journal) reste au serveur.

Un 401 à une requête identifiée (`authorization` ou `cookie`) repart aussi vers le serveur, qui tranche,
et laisse une trace `statut 401` : refusée à tort, une joueuse se croirait déconnectée, et le repli ne
couvrait que les pannes. Repère avant bascule : 226 requêtes joueuses en 24 h, uniquement des 200 et 304.

Constaté : refus anonymes identiques à ceux du serveur, un faux jeton déclenche bien le repli, et une vraie
session (la propriétaire, le 31) reçoit 200 sur les routes appelées, sans aucun repli. `next-match` n'a pas
encore reçu de vraie session. Une seule session, donc pas une preuve de charge.

**Quatrième famille, 2026-10-31 : premières lectures admin.** `/api/admin/me`,
`/api/admin/realtime/ticket` et `/api/admin/diffusion/overlay-presence`, en GET : 503 des 1 040 requêtes
admin d'une journée (événement compris). Aucune n'écrit, garde staff comprise. `PATCH /api/admin/me` et
`?as=` restent au serveur. Jamais en cache : `/api/admin/` est exclu, et ces requêtes portent un jeton.

Un 403 à une requête identifiée repart désormais vers le serveur, comme un 401 : un faux refus de `me`
fermerait le back-office, et `getStaffByUserId` rend « pas staff » sur une erreur de lecture passagère.
Un 403 sur `me` est normal (64 par jour, joueuses connectées) : le relais ne laisse donc une trace,
`refus non confirmé par le serveur`, que si le serveur répond autre chose. Ces refus coûtent une lecture
de plus, le temps de la bascule.

**`/api/admin/alerts-summary` reste au serveur** (346 par jour). Ses quatre mémos (tournoi en cours, lignes du
badge, scrutins MVP, soirs sans staff) attendaient qu'une écriture les réveille, et le serveur ne prévenait pas
le Worker : un litige ouvert un soir de match serait apparu au badge jusqu'à 15 min plus tard. Le pont (voir
ci-dessous) lève l'obstacle ; il pourra partir une fois le pont vu sur de vraies écritures.

**`/api/admin/users/manage` reste au serveur** (30 par jour), et avec lui toute route à double
authentification obligatoire. Un Worker qui ne l'exigerait pas ne se verrait pas : ni erreur, ni repli, et
le repli ne couvre que les refus. Il faut d'abord prouver sur le Worker le refus d'une session sans double
authentification.

Constaté après déploiement, sans jeton réel : refus anonymes servis par le Worker et identiques à ceux
du serveur, faux jeton rejoué sur le serveur sans trace, cinq autres routes admin restées au serveur,
aucune erreur nouvelle.

**Écart assumé :** un staff retiré garde ces trois lectures jusqu'à 60 s sur le Worker (`getStaffByUserId`,
`loadStaffTenants`), là où le serveur le coupe aussitôt. Les écritures, restées au serveur, le coupent tout de suite.

**Toujours pas prouvé :** ces routes lisent le jeton `Bearer` et, pour `me`, le seul cookie de l'espace
actif. **Le cookie de session, le CSRF et la double authentification ne sont pas exercés par cette famille.**
Vu le 31 : une vraie session staff sur `me` (200), 15 refus de joueuses connectées tous confirmés par le serveur.
`realtime/ticket` et `overlay-presence` n'ont encore reçu aucune vraie session.

**Le pont des signaux, 2026-10-31.** Un mémo (`createDormancyMemo`) garde une lecture jusqu'à ce qu'une écriture
note son signal, ou 5 à 15 min au plus. Le serveur notait dans sa mémoire, le Worker dans son Durable Object :
aucun ne voyait les notes de l'autre. Le pont les fait passer dans les deux sens, avec `CRON_SECRET`, le temps
de la bascule :

- serveur → Worker : `SHARED_SIGNALS_BRIDGE_URL` (posée par le Dockerfile, donc sur le serveur seulement) envoie
  les notes à `POST /api/signals/notes`, que le Worker reçoit lui-même, sans passer par l'application ;
- Worker → serveur : `SHARED_SIGNALS_SERVER_URL` (wrangler.jsonc de l'API) les envoie à
  `POST /api/internal/signal-notes`.

Une note reçue ne repart pas. Une note perdue retombe sur la fenêtre de sûreté, comme une écriture faite en SQL à
la main : du retard, pas une panne. Les journaux du Worker du site masquent `Authorization` (`********`), vérifié.
**À retirer avec le serveur.** Écrit, déployé, testé ; **aucune vraie note n'a encore été vue** au moment d'écrire,
faute d'écriture sur le serveur : un `204` sur `/api/signals/notes` le prouvera (`bridge-proof`).

Défaut corrigé au passage : `noteMatchWrite` appelait des mémos abonnés au chargement de leur module, or un module
n'existe qu'une fois sa route servie. Un exemplaire qui n'avait jamais servi le badge n'avait personne à prévenir,
et les autres dormaient. Les mémos déclarent maintenant les signaux qui les périment (`wakeOn`).

**Cinquième famille, 2026-10-31 : le bot, d'un bloc, à la demande de la propriétaire.** Tout `/api/bot/v1/*`, lectures
et écritures : 104 routes, dont 3 seulement tournent en continu (`reminders`, `role-sync/snapshot`, `role-sync/presence`,
485 requêtes par jour). `/api/news` et `/api/support/ticket`, hors de `/v1`, restent au serveur.

Le relais a trois chemins :

| | Variable | Délai | Repli sur le serveur |
|---|---|---|---|
| Lecture | `API_WORKER_ROUTES` | 8 s | Oui, sur panne, délai, ou refus d'une requête identifiée |
| GET qui écrit | `API_WORKER_UNREPLAYABLE_READS` | aucun | **Non** |
| Écriture | `API_WORKER_WRITE_ROUTES` | aucun | **Non** |

Une écriture rejouée s'exécuterait deux fois. `reminders` marque ses rappels comme envoyés : rejoué, il rendrait vide
ce que le premier passage a consommé, et le rappel serait perdu. Une panne donne donc une erreur au bot, qu'il traite
comme aujourd'hui. Retour arrière : retirer `/api/bot/v1/*` des variables et redéployer le site.

Corrigé avant de bouger, à la suite d'un audit des 104 routes (un Worker peut couper une requête, et ses exemplaires
ne partagent rien) :

- **`free-players/sync`** : un DELETE puis un INSERT, coupés entre les deux, effaçaient les fiches et leur profil. Elle
  compare maintenant, et supprime les absentes en dernier. Pas d'`upsert` : l'unicité est un index partiel
  (`WHERE source = 'discord'`), que PostgREST ne sait pas viser, et le double des tests ne l'aurait pas vu.
- **`rebuildRatings` et `role-sync/presence`** : même défaut, et un INSERT refusé vidait les classements. Les lignes
  fraîches d'abord, la purge ensuite.
- **`reminders`** : un collecteur qui levait après une marque jetait ce qu'il avait marqué. Ils rangent au fil de l'eau.
- **Lectures partagées entre requêtes** (dix sites `inFlight`, le cache de réponses) : sur un Worker, attendre celle d'une
  requête terminée bloque (`handle_cross_request_promise_resolution`). `canJoinInFlightRead` : chacun fait la sienne.
- **Table de routage du bot (15 min), classements suisses (5 min), annuaire (10 min), chaînes Twitch (5 min)** :
  invalidés dans leur seul exemplaire. Ils passent par les signaux partagés.

Constaté, sur le vrai bot : `reminders` et `role-sync/snapshot` en 200 avec sa clé, sans repli ; `POST role-sync/presence`
en 200, première vraie écriture servie par le Worker. Relu en base : 74 lignes par espace, toutes du même passage, aucune
périmée. Refus sans clé identiques à ceux du serveur. 76 tâches planifiées réussies sur 20 min, aucun échec.

**Accepté :** les limites de fréquence valent par exemplaire, donc plus larges au total (forfait 5/min, `teams/messages`
3/min…) ; le travail lancé en fond a 30 s après la réponse (post Discord de résultat, e-mail de bienvenue,
auto-avancement d'une phase). Un rebuild coupé laisse de vieilles lignes en plus, jamais une table vide.

**Pas encore vu sur le Worker :** les autres écritures du bot (score, litige, forfait, tâches), ses e-mails, ses posts
Discord, l'envoi d'événements au bot, et la régénération de page après un rapport de score (`report.ts`) : le drapeau
`global_fetch_strictly_public` doit la faire repasser par l'entrée publique, d'après la documentation. Un échec ne laisse
qu'un avertissement au journal, et des pages périmées jusqu'à leur renouvellement.

**Sixième famille, 2026-10-31 : le reste des lectures publiques.** Réglages du site, partenaires, casters,
scrims, cartes, héros, profils, listes publiques, images TCG, chaînes Twitch, actualités Blizzard, patch
notes, pool d'un tournoi en lecture. 21 corps sur 22 identiques à ceux du serveur ; `/api/docs` ne diffère que par
son nonce. Les seules écritures sont des `upsert` de cache (`blizzard-*`, `patch-notes`), sans danger en cas de rejeu.

**Septième famille, 2026-10-31 : lectures joueuses et équipes.** 57 routes, anonymes identiques au serveur. Les GET qui
écrivent se rejouent sans danger : `tcg/sets` crédite sous `ON CONFLICT DO NOTHING … RETURNING`, seul le gagnant paie
les paquets ; expirations conditionnelles (échanges, recherches de scrim) ; date d'usage de l'agenda.
`tcg/welcome-gift` en lecture passe par `dryRun`.

**Huitième famille, 2026-10-31 : overlays OBS.** Le plus gros trafic restant. Lectures avec repli, et
`POST /api/overlay/heartbeat`, un `upsert` répétable, sans repli. Seul `serverTime` diffère du serveur.
Premier appel à froid vu à ~2,5 s.

**Neuvième famille, 2026-10-31 : lectures admin.** `/api/admin/*` en GET, cockpit caster, `/api/cast/:id`, avec repli : un refus à
tort est rejoué et comparé. Aucune écriture admin ne bouge. Une liste exacte dépassait la limite de 5 Ko de Cloudflare par
variable : `API_WORKER_SERVER_ONLY` liste ce qui reste au serveur, et l'emporte. Dans cette liste, `:id` couvre n'importe quel segment
(`anyId`) : passer à côté enverrait au Worker ce qui doit rester au serveur.

**Contrôle à chaque déploiement** (`scripts/worker-routes-check.mjs`, sans compte ni écriture en base). Il lit
`wrangler.jsonc` et vérifie sur le vrai site : chaque route au bon endroit et au même statut que le serveur, chaque refus,
le rejeu d'un faux jeton, les écritures là où elles doivent être, le pont dans les deux sens, et les mêmes réglages des deux côtés
(`/api/health` avec `CRON_SECRET` : double authentification exigée, comptes exemptés, pont branché ; des états et un nombre,
jamais une valeur). **Ce qu'il ne prouve pas :** une vraie session (le trafic réel le fait, dans les journaux), et qu'une vraie
écriture du serveur note bien le pont (un `204` hors contrôle le prouvera). Une note `deploy.check` reste dans l'objet : aucun mémo ne la lit.
Premier passage le 2026-10-31 (site 1add2b537, API 9345dd5) : tout conforme. Double authentification exigée des deux côtés, même
nombre de comptes exemptés, pont branché et `204` dans les deux sens. Le réglage est donc prouvé sur le Worker ; le refus lui-même, sur
une vraie session, ne l'est pas encore.

**Tout le reste, le soir du 2026-10-31, à la demande de la propriétaire** (« tout migrer avant les mesures »), sans attendre les
preuves que cette section réclamait. Le relais n'envoie plus rien au serveur, hors panne d'une lecture :

| | Variable | Sur panne |
|---|---|---|
| Lectures, toutes les routes | `API_WORKER_ROUTES` | Rejouées sur le serveur |
| GET qui consomment : retours OAuth, jetons à usage unique, désabonnement, rappels, Library | `API_WORKER_UNREPLAYABLE_READS` | Erreur |
| Écritures, toutes les routes | `API_WORKER_WRITE_ROUTES` (`/api/*`) | Erreur |

Les 28 tâches planifiées tournent sur le Worker de l'API (site à `CRONS_ENABLED=0`, API à `1`, ~3 min sans tâche, aucun chevauchement).
Le navigateur appelle `/api/public/*` sur le site (variable `NEXT_PUBLIC_API_REMOTE_PREFIXES` retirée, valeur `/api/public/` pour revenir).
Temps de calcul porté à 120 s par requête (`limits.cpu_ms`) : une écriture ne se rejoue pas.

**Corrigé avant de bouger :**

- **Limites de fréquence partagées** (`applySharedRateLimit`, `shared: true`) : connexion, captcha, formulaires, demandes, coordonnées, toutes les routes
  à jeton. Comptées aussi en base (`consume_rate_limit`), une requête de plus par appel, et en panne la base laisse passer. L'inscription garde 5 par
  heure en mémoire et 15 en base : la base ne rend pas une tentative. **Les autres limites restent par exemplaire**, donc plus larges au total.
- **Quatre tâches lancées sans attendre** (alerte Discord d'une demande de scrim, e-mail d'arrivée dans une équipe) : `runInBackground`.

**Accepté :** dix sites font un DELETE puis un INSERT sur la même table (`final_rankings`, `games`, `match_participants`, `tournament_maps`,
`league_standings`, `notification_prefs`…) : deux requêtes qui se suivent, une fenêtre de quelques millisecondes, comme sur le serveur. Un Worker
coupe une requête bien moins vite que ça : 120 s de calcul, et 30 s après la déconnexion du client.

**Pas prouvé, à lire dans les journaux au fil du trafic réel :**

- une vraie session sur les écritures et les routes staff, hors `/api/admin/me` et le bot ;
- le refus d'une session sans double authentification : le réglage est contrôlé à chaque déploiement, pas le refus ;
- une vraie note du serveur ou du Worker sur le pont ;
- e-mails, posts Discord, envoi d'événements au bot, régénération de page, depuis le Worker ;
- **webhooks signés** (Twitch EventSub, HelloAsso) : la signature se vérifie sur le corps brut, jamais vue sur le Worker. Un Twitch qui reçoit des refus répétés finit par révoquer l'abonnement ;
- mémoire : une saturation couperait aussi ce qui tourne à côté (exports, images de partage, envois).

**Ce qui passe encore par le serveur :** les appels directs à `api.owwomenscup.fr` (API publique de tiers, webhooks qui visent ce nom, pont), et le repli
des lectures. Pour éteindre Lightsail : une route Worker sur ce nom, `API_PROXY_ORIGIN` et le pont à revoir (le repli et les notes viseraient le Worker
lui-même), retirer le pont, puis attendre deux semaines. **Pas fait : changement de DNS, à décider une fois les journaux lus.**

**Découvert :** `/api/graphql` répondait 500 sur le serveur, un défaut qui lui est propre ; il répond sur le Worker.

**Piège d'OpenNext.** Il change un `stale-while-revalidate` sans valeur en `=2592000` (30 jours), que
les navigateurs appliquent aussi. Corrigé sur les cinq routes concernées, sans effet sur le serveur.
`bareStaleWhileRevalidateGuard.test.ts` refuse le prochain.

**Un seul Worker pour l'API, décidé le 2026-10-31.** Le script tient largement (25 Mio sur 64) ;
plusieurs Workers voudraient dire plusieurs builds, 48 secrets à tenir à jour sur chacun, et du code
partagé à déployer partout. Le seul vrai argument pour découper est la mémoire : 128 Mo par exemplaire,
partagés entre les requêtes en cours, alors que trois envois de 12,6 Mo à la fois en demandent 277 à
319 Mo en local. Les envois de fichiers sont donc le seul candidat à un Worker à part, si la production
le demande ; l'envoi direct vers R2 réglerait aussi ce cas.

**Pas encore mesuré :** mémoire par requête (`invocation_logs` reste coupé, il garderait le
secret du relais ; `cf` n'expose pas les statistiques), et le lien entre exemplaires des
signaux. Les tâches planifiées n'ont pas tourné sur le Worker.

**Appels directs.** Voir plus haut : seuls les appels qui visent `api.owwomenscup.fr` restent sur le serveur.

**Sécurité :** sans Caddy, `x-nf-client-connection-ip` se falsifiait (la limite de
fréquence sautait en changeant l'en-tête, constaté) ; l'enveloppe le corrige. OpenNext
écrase aussi `x-forwarded-host` : le relais doit porter l'hôte dans l'URL.

**Ce que seule la production prouvera :** démarrage et mémoire réels, CPU par route,
latence vers Supabase, blocages sur adresses partagées (Brevo, Discord, Blizzard),
coupure des tâches de fond à 30 s, hôte dans OAuth, HelloAsso et CSRF. La dispense de
double authentification (`STAFF_MFA_EXEMPT_USER_IDS`) reste à reporter dans les
secrets du Worker.
