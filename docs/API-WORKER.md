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

Branche `worker-phase2` de conference-api. **Worker déployé le 2026-10-31, aucune
visiteuse dessus** : l'API de production reste le serveur Lightsail.

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
| Fusionner `worker-phase2` dans `main` et déployer le Worker depuis `main` | 0,5 j | Oui, avant d'élargir : un correctif sur `main` n'atteint pas le Worker |
| Bascule des familles suivantes derrière le relais, avec observation | 1 à 2 j | Accord de la propriétaire avant chaque famille |
| Limites de fréquence partagées (132 appels, synchrones) | 0,5 à 1 j | Pas pour une première famille en lecture. À trancher avant les familles sensibles (connexion, captcha, formulaires), avec le nombre d'exemplaires observé |

**Premier déploiement, 2026-10-31.** Le Worker `owwomenscup-api` tourne sans adresse
publique (`workers.dev` répond 404, aucune route) et sans tâches planifiées
(`CRONS_ENABLED=0`). `worker.yml` le déploie à chaque push sur `worker-phase2` : 12 622
tests réussis et 3 ignorés, démarrage mesuré par Cloudflare 49 ms, 25,13 Mio. Les 48
réglages du serveur y sont posés en secrets, dont `EDGE_PROXY_SECRET` et
`STAFF_MFA_EXEMPT_USER_IDS`, et survivent à un déploiement. **Aucune vraie requête ne l'a
encore atteint** : rien n'est prouvé sur la vraie base ni avec les vrais secrets.

Le jeton de déploiement a le rôle Workers Editor sur tous les Workers du compte : il
peut déployer aussi le Worker du site, sans pouvoir en créer ni en supprimer. Pour le
limiter à ce seul Worker, il faut un jeton de compte créé dans le tableau de bord (rôle
Editor sur `owwomenscup-api`) : `cf` ne crée que des jetons d'utilisateur, et ceux-là
refusent cette limite (erreur 1001).

**Pièges de `cf` (bêta).** `workers secrets bulk` répond `{}` et code 0 sans rien écrire :
poser les secrets un par un (`workers secrets update NOM --type secret_text --body @fichier`)
et relire la liste. Le profil `cf` par défaut de ce PC est un autre compte : toujours
passer `--profile owwomenscup`.

**Première famille, 2026-10-31.** Le relais du site (`API_WORKER_PREFIXES`,
wrangler.jsonc) envoie au Worker les lectures de `/api/health`, `/api/seasonal-logo`,
`/api/leagues`, `/api/public/tcg/live`, `/api/public/openapi` et `/api/public/v1/`. GET et
HEAD seulement ; si le Worker lève, répond 5xx ou tarde plus de 8 s, la lecture repart vers
le serveur. Retour arrière : vider la variable et redéployer le site. Pas tout
`/api/public/` : certains de ses GET écrivent (`newsletter/confirm`).

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

**Pas encore mesuré :** temps de calcul et mémoire par requête (`invocation_logs` reste coupé,
il garderait le secret du relais ; `cf` n'expose pas les statistiques), et le lien entre
exemplaires des signaux. Écritures, e-mails, Discord et tâches planifiées n'ont pas tourné.

**Appels directs.** Le navigateur pour `/api/public/*` et les tâches planifiées du site
appellent `api.owwomenscup.fr` sans passer par le relais. Ils ne basculeront pas avec
lui : il faudra une route Worker sur ce nom, à la fin. À la bascule des tâches,
`CRONS_ENABLED` passe à 0 sur le site et à 1 sur l'API au même moment.

**Sécurité :** sans Caddy, `x-nf-client-connection-ip` se falsifiait (la limite de
fréquence sautait en changeant l'en-tête, constaté) ; l'enveloppe le corrige. OpenNext
écrase aussi `x-forwarded-host` : le relais doit porter l'hôte dans l'URL.

**Ce que seule la production prouvera :** démarrage et mémoire réels, CPU par route,
latence vers Supabase, blocages sur adresses partagées (Brevo, Discord, Blizzard),
coupure des tâches de fond à 30 s, hôte dans OAuth, HelloAsso et CSRF. La dispense de
double authentification (`STAFF_MFA_EXEMPT_USER_IDS`) reste à reporter dans les
secrets du Worker.
