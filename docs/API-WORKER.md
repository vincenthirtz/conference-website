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

**À vérifier avant** : que la clé Brevo n'impose pas une liste d'adresses IP
autorisées (le serveur actuel a une IP fixe, 51.21.73.146 ; un Worker n'en a
pas).

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

Phase 1 sur la branche `worker-phase1` de conference-api (non déployée).
Rien n'est mis en ligne avant la fin de l'Event Halloween 2026 ; ensuite,
chaque lot est fusionné et vérifié seul.

| Lot | Contenu | État |
|---|---|---|
| 1 | `runInBackground` (`utils/background.ts`) à la place des ~140 envois lancés en fond ; garde-fou contre leur retour | fait sur la branche (e819920 : 142 sites, 12 225 tests) — à fusionner après l'event, puis `sync:api` du site |
| 2 | Verrous des tâches planifiées en base (au lieu de `cronSingleFlight` / `_inFlight` en mémoire) | fait sur la branche (e245f09) — migration `add_cron_locks.sql` à appliquer **avant** de fusionner |
| 3 | Caches vidés à l'écriture : durées ≤ 60 s (clés du bot, tenant, guilde, secrets d'intégration, réglages, liste du miroir) | fait sur la branche (317988a) — coût estimé : ~3 000 lectures de plus par jour, à mesurer après la fusion |
| 4 | Signaux « une écriture a eu lieu » (`outboxActivity`, mémos de sommeil) : un seul point, `utils/sharedSignals.ts`, où la phase 2 branchera une mémoire partagée ; pas de verrou pour un passage à vide | fait sur la branche (6bfd87f : 12 280 tests) — verrous : ~2 300 requêtes par jour au repos au lieu de ~10 570 (estimation) |
| 5 | Tâches longues découpées (`broadcast-process`, `email-digest`, `recycle-bin-purge`, `tenant-purge`) | à faire |
| 6 | web-push en WebCrypto ; `node:dns` par HTTPS ; clé `scrypt` gardée en mémoire | à faire |
| 7 | Spécification OpenAPI embarquée au build (plus de lecture disque) | à faire |
| 8 | Envois de fichiers directs vers R2 / Drive (URL signée) au lieu du base64 | à faire |

Phase 2 (après la phase 1) : Worker OpenNext de l'API, limites de fréquence
partagées (`cf-connecting-ip`), tâches planifiées dans le Worker de l'API,
bascule par familles de routes derrière le relais du site.
