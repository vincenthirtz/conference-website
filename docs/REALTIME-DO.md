# Temps réel sur Cloudflare (Durable Objects) à la place de Supabase Realtime

Étape 1 faite le 2026-10-29 (Worker en ligne, aucun écran branché) ; étape 2
en cours depuis le même jour, ~11 h UTC : domaine `realtime.owwomenscup.fr`,
migration appliquée, réglages posés dans Vault, 12 contrôles sur 12. La base
prévient les salons. Étape 3 construite le même jour, puis **bascule des
écrans le 2026-10-29** (variable `NEXT_PUBLIC_REALTIME_BACKEND=cloudflare`,
déploiement 40871096927), après un essai de l'overlay OBS : modification
d'une scène dans le cockpit → overlay à jour en 65 à 500 ms. La Women's
Library reste sur Supabase Realtime. La base et les comptes restent chez
Supabase ; seul le « prévenir les écrans » change.

## Ce qui écoute aujourd'hui

Toutes les écoutes passent par `hooks/useRealtimeChannel.ts`
(`postgres_changes` Supabase), sauf la présence des casters et la Women's
Library.

| Écran | Table écoutée (filtre) | Réaction |
|---|---|---|
| Cloche de la joueuse (`components/Navbar/PlayerBell.tsx`) | `demandes` (équipe) | recharge |
| Messages capitaine (`features/player/messages/hooks/useCaptainMessages.ts`) | `demandes` (équipe) | recharge |
| Alertes de l'admin (`hooks/admin/useAdminAlertsCount.ts`) | `matches` UPDATE (tournoi) | recharge |
| Tableau de bord tournoi (`pages/admin/tournament/[id]/dashboard.tsx`) | `matches` (tournoi) | recharge (anti-rebond) |
| Draft (`hooks/useDraftState.ts`) | `match_drafts` (id), `match_draft_steps` (draft) | recharge |
| Scènes caster (`hooks/useCasterScenes.ts`) | `caster_scenes` | recharge |
| Thème caster (`hooks/useCasterTheme.ts`) | `caster_themes` | recharge |
| Overlay OBS (`pages/overlay/caster/[sceneKey].tsx`) | `caster_scenes` (id) | **applique la ligne reçue** |
| Présence des casters (`hooks/useCasterPresence.ts`) | Presence (pas une table) | liste des connectés |
| Women's Library (`features/player/library/realtime/`) | Broadcast + Presence privés | déplacements, chat — **bêta fermée** |

Volume mesuré (statistiques Postgres, 2026-10-29) : quelques milliers de
modifications au total sur les tables suivies (`matches` ~900,
`caster_presence` ~800, `caster_scenes` ~400, `demandes` ~280, `event_*`
~250). L'application de bureau womenscup-caster, qui écoutait aussi `matches`,
`caster_scenes` et `event_*`, est retirée (dépôt archivé le 2026-10-29).

## Ce qu'on construirait

1. **Un Worker à part, `owwomenscup-realtime`**, sur `realtime.owwomenscup.fr`.
   À part du site : chaque déploiement d'un Worker redémarre ses Durable
   Objects et coupe leurs connexions ; le site se déploie plusieurs fois par
   jour, le temps réel presque jamais.
2. **Un « salon » (Durable Object) par sujet** : `matches:tournament:<id>`,
   `draft:<id>`, `demandes:team:<id>`, `caster:scenes`, `caster:themes`,
   `caster:scene:<id>`, `caster:presence`. Durable Objects natifs (plutôt
   que PartyServer : une centaine de lignes, aucune dépendance), API
   d'hibernation : un salon sans message ne coûte rien, et le `ping` des
   écrans reçoit son `pong` sans réveiller l'objet.
3. **Des messages sans données** : « la table X, ligne Y, a changé ». L'écran
   recharge avec ses propres droits, comme aujourd'hui. Aucune donnée ne
   transite par le salon : les règles d'accès restent dans l'API et la base.
   L'overlay OBS passe au même schéma (recharger sa scène, publique).
4. **Entrée dans un salon privé** (`matches:tournament:`, `demandes:team:`,
   `caster:presence`) : un ticket court signé par l'API (HMAC, un salon,
   quelques minutes). Salons publics, sans ticket : ce que la base laisse
   déjà lire à tout le monde — `draft:<id>`, `caster:scene:<id>`,
   `caster:scenes`, `caster:themes` (l'overlay OBS, sans compte, suit les
   thèmes).
5. **Détection des changements dans la base**, comme Supabase aujourd'hui :
   un déclencheur Postgres sur chaque table suivie appelle le Worker via
   l'extension `pg_net`, en asynchrone, signé avec un secret rangé dans
   Supabase Vault. Toutes les écritures sont vues — API, bot, éditeur SQL —
   sans toucher au code de l'API. Migration
   `add_realtime_notify_triggers.sql` dans conference-api, appliquée par la
   propriétaire.
6. **Un interrupteur côté site**, `NEXT_PUBLIC_REALTIME_BACKEND=supabase|cloudflare`,
   lu par `useRealtimeChannel` (même interface pour les écrans) et la
   présence caster : bascule et retour arrière par un simple déploiement.

## Coût

Compris dans Workers Paid (5 $/mois), partagé avec le site : 1 million de
requêtes et 400 000 GB-s de calcul par mois pour les Durable Objects.

- Requêtes : une par connexion d'écran, une par changement notifié, et les
  messages entrants. Ordre de grandeur actuel : quelques milliers à quelques
  dizaines de milliers par mois, soit **moins de 5 %** de l'inclus.
- Calcul : avec l'hibernation, un salon ne compte que pendant qu'il traite un
  message ; même dix salons éveillés une heure par jour font ~135 000 GB-s,
  **un tiers** de l'inclus.
- Seul risque de dépassement : la Women's Library ouverte à beaucoup de
  joueuses (déplacements en continu = salons toujours éveillés). Le
  dépassement se paie par tranche entière : 12,50 $ le million de GB-s,
  0,15 $ le million de requêtes. Elle reste sur Supabase Realtime tant
  qu'elle est en bêta fermée ; à mesurer avant de l'y passer.

## Étapes

1. **Worker et salons** (sans effet) — **fait le 2026-10-29** :
   `realtime/worker.mjs` (Worker `owwomenscup-realtime`, adresse technique
   https://owwomenscup-realtime.owwomenscup.workers.dev), règles pures et
   testées dans `realtime/protocol.ts` (`tests/unit/realtimeProtocol.test.ts`),
   workflow `.github/workflows/realtime.yml` (déploie seulement quand
   `realtime/` change), contrôles `scripts/realtime-check.mjs` (refus sans
   signature ni ticket, ping/pong, présence, changement reçu sans données).
   Secrets `REALTIME_NOTIFY_SECRET` et `REALTIME_TICKET_SECRET` dans
   l'environnement GitHub `cloudflare-production` : à **renouveler** à
   l'étape 2 ; le workflow les recopie dans Supabase Vault (déclencheurs de
   la base, secret des tickets lu par l'API).
2. **Déclencheurs en double** : la base prévient les salons, mais les écrans
   écoutent toujours Supabase. On compare pendant quelques jours de matchs.
   Préparé le 2026-10-29 :
   - migration conference-api `database/migrations/add_realtime_notify_triggers.sql`
     (+ `_revert`) : `pg_net`, déclencheur `realtime_notify` sur `matches`,
     `match_drafts`, `match_draft_steps`, `demandes`, `caster_scenes`,
     `caster_themes` ; réglages dans Vault (`realtime_notify_url`,
     `realtime_notify_secret`, `realtime_ticket_secret`) ; tant qu'ils sont
     vides, rien ne part. Signature vérifiée contre le Worker (vecteur Postgres
     figé dans `tests/unit/realtimeProtocol.test.ts`) ;
   - `.github/workflows/realtime.yml` : après les secrets du Worker, les mêmes
     secrets et l'adresse `https://realtime.owwomenscup.fr/notify` sont posés
     dans Vault (`realtime_set_config`, clé service_role). Une seule source :
     l'environnement GitHub `cloudflare-production` ;
   - le Worker journalise chaque notification (`[notify] table op salon ·
     délai · écrans`).

   Mise en route (faite le 2026-10-29) : (1) domaine
   `realtime.owwomenscup.fr` sur le Worker (tableau de bord Cloudflare →
   Workers → owwomenscup-realtime → Domaines) ; (2) migration appliquée par
   la propriétaire ; (3) workflow lancé → réglages posés, la base prévient les
   salons. Les secrets de l'étape 1 n'ont pas eu à être renouvelés : le
   workflow les recopie depuis GitHub, il n'a jamais fallu les ressortir.

   Comparaison : chaque modification d'une table suivie doit donner une
   réponse 200 du Worker (`net._http_response`, gardée 6 h) et une ligne
   `[notify]` dans ses journaux, avec un délai de l'ordre de la seconde.
   Requête de contrôle (lecture seule) :
   `select status_code, count(*) from net._http_response group by 1;`
   Les couper sans rien retirer : supprimer `realtime_notify_url` dans Vault.
3. **Bascule des écrans** par l'interrupteur, un jour calme ; overlay et draft
   testés en conditions de match. Construite le 2026-10-29, interrupteur
   coupé :
   - API (conference-api) : `GET /api/admin/realtime/ticket?room=`
     (`matches:tournament:<id>` du tenant, staff ; `caster:presence`, rôle
     caster, identité = staffId) et `GET /api/player/realtime/ticket?room=`
     (`demandes:team:<id>`, équipe gérée) → `{ room, ticket, expiresAt }`,
     5 min. Le secret est lu dans Vault (`realtime_ticket_secret()`).
     Format du ticket figé par le même vecteur des deux côtés ;
   - site : `utils/realtime/rooms.ts` (règles pures : salon d'une écoute,
     route du ticket, messages, présence) et
     `utils/realtime/cloudflareRealtime.ts` (une WebSocket par salon,
     partagée ; ticket à chaque connexion ; reconnexion ; ping 30 s ;
     présence une fois par seconde au plus). `useRealtimeChannel` et
     `useCasterPresence` passent par les salons quand l'interrupteur est sur
     `cloudflare` ; l'overlay OBS et les messages capitaine rechargent quand
     le message arrive sans données. CSP : `wss://realtime.owwomenscup.fr`
     dans `connect-src` (proxy.ts) ;
   - interrupteur : variable `NEXT_PUBLIC_REALTIME_BACKEND` de
     l'environnement GitHub `cloudflare-production` (`cloudflare`, ou vide =
     Supabase), lue au build. **Par écran**, sans rien redéployer :
     `?realtime=cloudflare` dans l'adresse d'une page l'essaie,
     `?realtime=supabase` la ramène sur Supabase (lu au chargement de la
     page) — utile pour tester l'overlay dans OBS avant la bascule générale,
     ou pour replier un seul écran après.

   Bascule faite le 2026-10-29. Retour arrière : vider la variable et
   relancer le workflow `cloudflare` (~10 min), ou `?realtime=supabase` sur un
   seul écran. Reste : coupure de workers.dev (`workers_dev: false`) après
   quelques jours sans souci, contrôles sur le seul domaine.
4. **Après deux semaines** : retrait des tables de la publication
   `supabase_realtime`.

Retour arrière avant l'étape 4 : l'interrupteur sur `supabase`.
