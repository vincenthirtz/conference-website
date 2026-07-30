# Cockpit caster web (`/admin/caster`)

Portage du cockpit de l'app desktop **womenscup-caster** (Electron) dans
l'admin du site. Objectif : piloter le stream depuis n'importe quel navigateur,
sans installer l'application — l'app desktop restant nécessaire pour ce qu'un
navigateur ne sait pas faire (voir « Hors périmètre »).

> Ce document décrit l'architecture retenue et les décisions de sécurité. Le
> contrat HTTP consommé par l'app **desktop** est documenté à part dans
> [`CASTER_API_CONTRACT.md`](./CASTER_API_CONTRACT.md) — ce cockpit-ci n'en
> dépend pas (il parle à Supabase et aux routes admin du site).

## Principe

**Supabase est le bus, le navigateur est le cockpit, OBS est l'encodeur.**

Le site est déployé sur Netlify (serverless) : aucun serveur persistant n'est
possible, donc pas d'équivalent au serveur overlay local ni au serveur Stream
Deck de l'app desktop. Tout le temps réel passe par Supabase Realtime, déjà en
production ailleurs sur le site.

```
  /admin/caster  ──édite──►  caster_scenes (Supabase)  ◄──édite──  app desktop
        │                          │  Realtime
        │                          ▼
        │                  /overlay/caster/<type>  ──Browser Source──►  OBS
        └──WebSocket direct──►  OBS local (ws://localhost:4455)
```

La table `caster_scenes` est **partagée avec l'app desktop** : une édition d'un
côté est vue en direct de l'autre. Les deux peuvent tourner en parallèle.

### Schéma `caster_scenes` — attention au piège

Le schéma **réellement déployé** est celui du repo caster
(`sql/001_add_caster_scenes.sql` : pas de `tenant_id`), dont le CHECK a été
étendu ici aux 13 types (`extend_caster_scene_types.sql`, puis `add_caster_camera_scene_type.sql`). La migration
`database/migrations/add_caster_scenes.sql` de ce repo (variante multi-tenant)
**n'a jamais été appliquée** et porte un en-tête d'avertissement. Se référer au
schéma déployé, décrit par `types/caster.ts`.

RLS : lecture publique (`caster_scenes_select_public`, rôle `anon` — ajoutée
pour les overlays hébergés, la donnée est de l'affichage d'antenne), écriture
réservée au staff actif.

## Surfaces

| Route                        | Rôle                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/caster`              | Cockpit : CRUD + édition des scènes, pilotage OBS, chat, poll MVP. Gate SSR tout staff (caster/admin/owner), comme `/admin/regie`.                                   |
| `/overlay/caster/<sceneKey>` | Overlay Browser Source public 1920×1080. `sceneKey` = UUID de scène **ou** type (première scène du type par `sort_order`). Chrome-less, `noindex`, fond transparent. |

Les overlays lisent avec la clé anon + Realtime, avec un poll de secours (les
Browser Sources tournent des heures). Flash-guard : rien n'est rendu avant la
première donnée — jamais de placeholder à l'antenne.

## Décisions de sécurité

1. **La clé de stream ne transite jamais par le web.** `SetStreamServiceSettings`
   du desktop n'est pas porté : le GO LIVE web démarre l'output sur la
   configuration déjà en place dans OBS (et signale si rien ne démarre).
2. **Aucun token Twitch dans le navigateur.** La lecture du chat se fait en IRC
   **anonyme** (`justinfan`) ; l'envoi et la modération passent par les routes
   serveur `/api/admin/twitch/{chat,moderation/*}` où le token du broadcaster
   reste en base.
3. **EventSub en deux temps.** Le navigateur ouvre la WebSocket EventSub et
   transmet son `session_id` à `POST /api/admin/twitch/eventsub/subscribe` ;
   c'est le serveur qui crée les souscriptions avec le token. Twitch autorise
   ce découplage (la souscription est liée à la session, pas à son créateur).
4. **CSP scopée.** `connect-src` n'est élargi (OBS loopback, IRC/EventSub
   Twitch) que sur le préfixe `/admin/caster`, où `upgrade-insecure-requests`
   est également retiré — sinon `ws://localhost` serait promu en `wss://` et la
   connexion à OBS échouerait. Voir `proxy.ts`. Le reste du site est inchangé.

## Prérequis d'exploitation

- **Navigateur Chromium** (Chrome/Edge) pour le pilotage OBS : le WebSocket en
  clair vers le loopback depuis une page HTTPS y est autorisé (origine
  « potentially trustworthy »). Un avertissement s'affiche ailleurs.
- **OBS ≥ 28** avec le serveur WebSocket activé (Outils → Paramètres du serveur
  WebSocket), port et mot de passe renseignés dans le panneau.
- **Chaîne Twitch connectée** (`/api/admin/twitch/connect`) pour l'envoi, la
  modération et EventSub. Les scopes `moderator:read:followers` et
  `moderator:read:shoutouts` ayant été ajoutés pour EventSub, **une chaîne
  connectée avant cet ajout doit être reconnectée** pour en bénéficier.
- Le bouton « Configurer les scènes OBS » crée/complète les scènes OBS avec un
  Browser Source par overlay pointant sur ce site (idempotent, rejouable).

## Onglets du cockpit

La page est organisée en onglets deep-linkables (`?tab=scenes|obs|chat|theme`),
avec le composant `components/admin/Tabs.tsx` + `useQueryTab` partagé par les
autres hubs admin (`/admin/moderation`, `/admin/communications`…). Empilés
verticalement, les quatre panneaux étaient inutilisables sur un écran de régie.

> ⚠️ Les quatre panneaux sont **montés en permanence** et seulement masqués en
> CSS (`hidden`), jamais démontés. `CasterChatSection` tient la WebSocket IRC +
> EventSub et l'état du poll MVP (un démontage couperait le chat et perdrait les
> votes en cours) ; `ObsPanel` tient la WebSocket OBS ; l'éditeur de scène et
> `ThemePanel` ont un auto-save **débouncé** (un démontage juste après une frappe
> perdrait la dernière saisie). Ne pas « optimiser » ça en rendu conditionnel.

## CRUD des scènes

Créer (par type), renommer, dupliquer, supprimer, monter/descendre — depuis le
web, sans ouvrir l'app desktop. Port de `sceneManager.js` du repo caster, sur la
même table.

- Logique **pure** : `utils/caster/sceneCrud.ts` (réordonnancement, nom de copie,
  nom/overlay/`data` par défaut des 13 types) et `utils/caster/sceneReorder.ts`
  (diff des `sort_order`, placement d'une copie).
- Écritures : `hooks/useCasterScenes.ts` (`createScene`, `renameScene`,
  `duplicateScene`, `deleteScene`, `reorderScenes`), en direct dans Supabase
  comme `saveSceneData` (RLS staff actif).
- UI : `components/admin/caster/SceneList.tsx` — orchestre confirmation
  (`useConfirmDialog`, variant danger, scène nommée), toasts et journal.
- **Pas de drag & drop** : des flèches monter/descendre, utilisables au clavier.
  En régie, une souris qui dérape sur un glisser-déposer réordonne l'antenne.
- `reorderScenes` n'écrit que les lignes dont le rang **change réellement** :
  chaque UPDATE part en Realtime vers l'app desktop et vers chaque Browser
  Source ouverte (le trigger `updated_at` fait muter la ligne).
- La colonne **`overlay`** est renseignée à la création (`defaultOverlayFile` →
  `match.html`…) : elle ne sert pas au web (les overlays sont des routes) mais
  l'app **desktop** s'en sert pour charger son HTML local. Une scène créée ici
  doit rester ouvrable là-bas.
- Une duplication est insérée en fin de table puis remontée juste après son
  original — deux allers-retours, mais aucun `sort_order` en doublon (le desktop,
  lui, écrit `idx + 1` et laisse deux lignes partager le même rang).

## Aperçu live de l'overlay

`components/admin/caster/OverlayPreview.tsx` : une iframe sur
`/overlay/caster/<uuid>`, c'est-à-dire **la vraie page overlay** de la scène
éditée. Aucune plomberie de données — l'overlay lit `caster_scenes` avec la clé
anon et suit sa ligne en Realtime, donc une frappe dans l'éditeur (auto-save →
event Realtime) s'y voit toute seule. C'est aussi, au pixel, ce que voit OBS.

> 🚧 **PRÉREQUIS CSP NON ENCORE EN PLACE.** `proxy.ts` pose
> `frame-ancestors 'none'` partout sauf sous `/embed` : le navigateur refuse donc
> d'embarquer `/overlay/*`, et l'aperçu affiche un encart explicite (« Aperçu
> bloqué par la politique de sécurité ») au lieu d'un cadre noir muet — il sonde
> l'en-tête CSP en HEAD same-origin pour le savoir. Il suffit d'autoriser
> `frame-ancestors 'self'` sur le préfixe `/overlay` dans `proxy.ts` (les
> overlays sont déjà des pages publiques chrome-less conçues pour être
> embarquées, dans une Browser Source OBS) et l'aperçu s'active sans changement
> côté composant. À valider avec `tests/unit/proxyCsp.test.ts`. Vérifié en
> navigateur : avec la CSP détournée en `'self'`, l'aperçu affiche l'overlay et
> reflète une édition en ~1 s (Realtime).

- Ciblage par **UUID** et non par type : `/overlay/caster/match` résout la
  première scène `match` par `sort_order`, ce qui montrerait la mauvaise scène
  dès qu'il en existe deux du même type (banal depuis le CRUD).
- Mise à l'échelle par `transform: scale()` + `transform-origin: top left` dans
  un conteneur `aspect-ratio: 16/9` en `overflow: hidden` : le rendu interne
  reste px-exact en 1920×1080, seul l'affichage est réduit.
- Repliable, choix mémorisé en `localStorage` (`caster.preview.open`), **ouvert
  par défaut**.
- ⚠️ **Scène `webcam` : aperçu derrière un clic explicite.** L'overlay appelle
  `getUserMedia` ; le monter à chaque sélection allumerait la webcam du poste et
  la prendrait à OBS, consommateur unique de la caméra et seul à partir à
  l'antenne. Le desktop résout ça avec un flag `preview: true` (placeholder) que
  la page overlay web n'a pas.

## Thèmes des overlays

Le desktop stocke ses thèmes en fichiers (`userData/themes`) et les pousse à
l'overlay dans le payload SSE. Le web n'a ni disque local ni serveur
persistant : le thème vit donc dans la table **`caster_themes`** (une seule
ligne `is_active`, garantie par un index unique partiel), lue par les overlays
avec la clé anon et suivie en Realtime — un changement d'habillage se voit à
l'antenne sans recharger la Browser Source.

La `data` d'un thème porte **la même shape que les fichiers du desktop** : un
thème exporté de l'app est donc importable ici, et réciproquement.

L'application se fait en variables CSS posées sur un wrapper de la page
overlay : les custom properties étant héritées, elles atteignent la racine de
l'overlay et l'emportent sur ses défauts (déclarés en règle de classe). Les
tokens dérivés (`--panel`, `--glow`, `--muted-2`…) sont des `color-mix()` de ces
variables et suivent automatiquement.

**Limite assumée** : seuls les **couleurs et les polices** (famille, graisse,
échelle) sont appliqués. Les **gabarits** (`template: compact | full | minimal`)
et le **repositionnement** (`positions`) ne sont pas portés — les overlays React
n'implémentent que le gabarit `default`. Les champs restent lus et préservés
(un aller-retour avec le desktop ne les perd pas), et `utils/caster/theme.ts`
expose déjà `templateClass()` et `positionStyle()` pour le jour où les variantes
seront portées.

## Journal des actions

Le cockpit écrit les scènes directement dans Supabase et pilote OBS depuis le
navigateur : aucune de ces actions ne traverse le serveur, donc rien ne peut les
tracer côté back. `POST /api/admin/caster/audit` est le point d'entrée unique du
journal et réutilise **`staff_logs`** (déjà consulté dans `/admin/logs`) plutôt
que d'ajouter un journal parallèle — le desktop, lui, n'a qu'un journal local
non partagé.

Seules les actions **notables** sont journalisées (import de match, stream,
enregistrement, configuration des scènes OBS, poll, activation de thème,
création et suppression d'une scène) : pas chaque frappe de l'auto-save, ni le
renommage / la duplication / le réordonnancement, pour lesquels
`caster_scenes.updated_at` suffit. Un échec du journal n'interrompt jamais une
action à l'antenne.

## Match picker & score live

Les scènes `match` et `results` peuvent être remplies depuis un match du site :
sélecteur tournoi → match (recherche accent-insensible au-delà de 8 matchs,
pastille de statut et créneau dans le libellé), puis « Importer dans la scène ».
L'import écrase les champs dérivés du match (équipes, logos, score, format, map,
détail par map pour `results`) et **préserve** le contexte saisi par le caster
(casters, marque & réseaux, MVP) : `buildSceneDataFromMatch` spread la data
précédente d'abord. `data.matchId` mémorise le lien.

Les lectures passent par les **GET publics `/api/caster/v1/*`** — les mêmes que
l'app desktop (cf. [`CASTER_API_CONTRACT.md`](./CASTER_API_CONTRACT.md)), donc un
seul contrat à maintenir. Le map pool du tournoi alimente le `<select>` map de
l'éditeur match.

> ⚠️ **Le score live est un POLL (~10 s), pas du Realtime.** L'app desktop
> s'abonne en `postgres_changes` sur `public.matches`, mais cette table n'est
> **pas** membre de la publication `supabase_realtime` : aucun event n'est jamais
> répliqué, donc le score live du desktop est silencieusement mort (la policy
> SELECT publique `matches_select_public` existe bien — elle ne suffit pas, elle
> ne fait que filtrer des events qui n'arrivent pas). Le web lit donc
> périodiquement `/api/caster/v1/matches/:id`, poll coupé quand l'onglet est
> masqué et relancé au retour au premier plan. Pour basculer en Realtime plus
> tard : ajouter `matches` à la publication, puis brancher un
> `useRealtimeChannel` qui appelle `refresh()` dans `useLinkedMatchTracker` — le
> contrat du hook ne change pas, et le poll reste en filet.

Le score n'est réécrit dans la scène que sur changement réel (sinon chaque tour
de poll produirait un UPDATE, donc un écho Realtime, pour rien). « Détacher »
remet `matchId` à `null` et rend la main à la saisie manuelle.

## Présence multi-caster

Supabase Realtime **Presence** sur le canal **`caster_presence`** — le même que
l'app desktop, avec la même shape trackée
(`{ staffId, displayName, role, activeScene, activeField, joinedAt }`, clé de
présence = `staffId`, `activeScene` = **id** de scène). Casters web et desktop se
voient donc mutuellement.

C'est un canal Presence, pas du `postgres_changes` : il ne dépend ni de la
publication Realtime ni d'une RLS, et rien n'est écrit en base. À ne pas
confondre avec la **table** `caster_presence` (heartbeats du cockpit régie,
`/api/caster/heartbeat`), qui n'a aucun rapport.

L'affichage est **consultatif** : bandeau d'avatars en tête de page, pastille
« 👁 » sur les scènes ouvertes par quelqu'un d'autre, et avertissement d'édition
simultanée dans le panneau. **Aucun verrou dur** — en direct, il faut toujours
pouvoir corriger une faute immédiatement (même posture que le desktop).

## Hors périmètre (reste sur l'app desktop)

Capture d'écran et encodage **FFmpeg** (gdigrab/dshow → RTMP), **mixer audio
Windows**, **soundboard** (fichiers locaux) et **serveur Stream Deck** local.
Ces fonctions supposent un accès système ou un serveur persistant : elles ne
sont pas portables dans un navigateur sur un hébergement serverless.

Les 13 types de scènes sont en revanche tous couverts, y compris les 4 scènes
« données du site » et la scène `camera` — cette dernière n'existe QUE côté web
(voir ci-dessous).

## Scène `camera` — captation d'un opérateur distant

Permet d'intégrer la captation d'un **opérateur distant** (caméraman sur site,
second commentateur, caméra de salle) à partir d'un simple lien. À ne pas
confondre avec la scène `webcam`, qui ouvre un périphérique **local** de la
machine OBS via `getUserMedia` : ici rien n'est branché en local.

`utils/caster/cameraSource.ts` détecte la nature du lien et le **réécrit** pour
qu'il soit embarquable. Le choix de la source est d'abord un choix de latence :

| Lien collé                         | Rendu                                            | Latence                                             |
| ---------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| `vdo.ninja/?view=…`                | iframe WebRTC (`cleanoutput` forcé)              | **< 1 s** — seule option pour du direct synchronisé |
| `twitch.tv/<chaîne>`               | player Twitch (`parent` = domaine courant, muet) | 5-15 s                                              |
| `youtu.be/…`, `watch?v=`, `/live/` | `/embed/` muet, sans contrôles                   | 5-15 s                                              |
| `….m3u8`                           | `<video>` + hls.js (import dynamique)            | 10-30 s                                             |
| `….mp4` / `.webm` / `.mov`         | `<video>` natif                                  | ~1 s                                                |

Un lien non reconnu, ou vide, ne rend **rien** (page transparente) : jamais de
message d'erreur à l'antenne. L'éditeur, lui, avertit explicitement.

Défauts choisis pour ne pas nuire si la scène est activée par erreur : vignette
en bas à droite (pas de plein cadre inattendu) et **son coupé** — le programme a
déjà son audio OBS, et deux sources simultanées créent un écho.

**CSP** — trois élargissements, scopés aux seules surfaces caster (le reste du
site garde la politique stricte) : `frame-src` + `vdo.ninja`, `media-src` +
`https: blob:`, et sur `/overlay/*` uniquement `connect-src` + `https:` — sans
ce dernier, un flux HLS **tiers** échouerait, car hls.js télécharge manifeste et
segments en XHR (donc soumis à `connect-src`, pas à `media-src`).

**Limites à connaître** :

- une iframe peint son propre fond : une salle VDO.Ninja sans émetteur affiche un
  rectangle sombre, pas du transparent (l'opérateur peut ajouter `&transparent`) ;
- l'autoplay du player Twitch n'est pas garanti dans une page overlay — à
  revérifier dans OBS avant de compter sur ce chemin ; ses 5-15 s de latence le
  réservent de toute façon à de l'ambiance ;
- hors OBS (onglet navigateur, aperçu du cockpit), `audio: true` retombe muet ;
  l'image, elle, est conservée ;
- un chemin relatif n'est pas reconnu (l'URL doit être absolue), et un MP4 en
  `data:` est refusé (`media-src` liste `https:` et `blob:`, pas `data:`).

**Type web-only** : l'app desktop n'a ni formulaire ni overlay local pour
`camera`. Une telle scène y reste listée mais inerte, et ses Browser Sources
doivent pointer sur `/overlay/caster/camera` du site.

## Carte du code

| Chemin                                                       | Contenu                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `types/caster.ts`                                            | Shapes de `caster_scenes.data` par type de scène.                                                                        |
| `utils/caster/matchScene.ts`, `sceneParse.ts`, `heroBans.ts` | Logique pure portée du renderer desktop (testée unitairement).                                                           |
| `utils/caster/sceneCrud.ts`, `sceneReorder.ts`               | Réordonnancement, nom de copie, défauts par type, diff des `sort_order` (purs, testés).                                  |
| `utils/caster/obsClient.ts`, `obsOps.ts`                     | OBS WebSocket v5 navigateur (protocole écrit à la main, comme le desktop — aucune dépendance).                           |
| `utils/caster/twitchProtocol.ts`, `mvpTally.ts`              | Parsing IRC Twitch et décompte des votes MVP (purs, testés).                                                             |
| `utils/caster/publicApiClient.ts`                            | Lectures `/api/public/v1/*` des pickers des scènes « données du site ».                                                  |
| `utils/caster/dataSceneOptions.ts`                           | Libellés, sélection et bornage `topN` de ces scènes (purs, testés).                                                      |
| `utils/caster/cameraSource.ts`, `vdoNinja.ts`                | Détection/réécriture du lien de captation et générateur VDO.Ninja (purs, testés).                                        |
| `utils/caster/twitchChatClient.ts`, `eventsubClient.ts`      | Transports navigateur : IRC anonyme (lecture) et EventSub WebSocket.                                                     |
| `utils/caster/mvpPollState.ts`                               | Machine à états immuable du poll MVP + snapshot publiable.                                                               |
| `pages/api/admin/twitch/eventsub/subscribe.ts`               | Crée les souscriptions EventSub pour une session ouverte par le navigateur.                                              |
| `utils/caster/matchPickerFormat.ts`, `presence.ts`           | Libellés/recherche/mapping du match picker et helpers de présence (purs, testés).                                        |
| `utils/caster/tournamentsClient.ts`                          | Lectures HTTP `/api/caster/v1/*` du picker (timeout borné, same-origin).                                                 |
| `hooks/useCasterScenes.ts`                                   | Chargement + Realtime + écriture des scènes + CRUD de la liste.                                                          |
| `hooks/useCasterTournaments.ts`                              | État du picker (tournois, matchs, map pool ; dernier tournoi mémorisé).                                                  |
| `hooks/useLinkedMatchTracker.ts`                             | Suivi du score des matchs liés — **poll** (voir « Match picker & score live »).                                          |
| `hooks/useCasterPresence.ts`                                 | Canal Realtime Presence `caster_presence` (partagé avec le desktop).                                                     |
| `components/admin/caster/*`                                  | Éditeurs par type, `useSceneDraft` (auto-save/anti-clobber), `SceneList` (CRUD), `OverlayPreview`, panneaux OBS et chat. |
| `components/overlay/caster/*`                                | Overlays (ports px-exacts des HTML desktop).                                                                             |
| `lib/data/ow-heroes.json`                                    | Manifeste des héros Overwatch (copié du repo caster).                                                                    |
