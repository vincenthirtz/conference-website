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
(`sql/001_add_caster_scenes.sql` : pas de `tenant_id`, 8 types dans le CHECK).
La migration `database/migrations/add_caster_scenes.sql` de ce repo (variante
multi-tenant) **n'a jamais été appliquée** et porte un en-tête d'avertissement.
Se référer au schéma déployé, décrit par `types/caster.ts`.

RLS : lecture publique (`caster_scenes_select_public`, rôle `anon` — ajoutée
pour les overlays hébergés, la donnée est de l'affichage d'antenne), écriture
réservée au staff actif.

## Surfaces

| Route                        | Rôle                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/caster`              | Cockpit : édition des scènes, pilotage OBS, chat, poll MVP. Gate SSR tout staff (caster/admin/owner), comme `/admin/regie`.                                          |
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

## Hors périmètre (reste sur l'app desktop)

Capture d'écran et encodage **FFmpeg** (gdigrab/dshow → RTMP), **mixer audio
Windows**, **soundboard** (fichiers locaux) et **serveur Stream Deck** local.
Ces fonctions supposent un accès système ou un serveur persistant : elles ne
sont pas portables dans un navigateur sur un hébergement serverless.

Les types de scènes récents du caster (`bracket`, `player`, `leaderboard`,
`standings`) ne sont pas encore supportés : le CHECK de `caster_scenes` en base
ne les autorise pas (aucune migration n'a été appliquée pour eux).

## Carte du code

| Chemin                                                       | Contenu                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `types/caster.ts`                                            | Shapes de `caster_scenes.data` par type de scène.                                              |
| `utils/caster/matchScene.ts`, `sceneParse.ts`, `heroBans.ts` | Logique pure portée du renderer desktop (testée unitairement).                                 |
| `utils/caster/obsClient.ts`, `obsOps.ts`                     | OBS WebSocket v5 navigateur (protocole écrit à la main, comme le desktop — aucune dépendance). |
| `utils/caster/twitchProtocol.ts`, `mvpTally.ts`              | Parsing IRC Twitch et décompte des votes MVP (purs, testés).                                   |
| `utils/caster/twitchChatClient.ts`, `eventsubClient.ts`      | Transports navigateur : IRC anonyme (lecture) et EventSub WebSocket.                           |
| `utils/caster/mvpPollState.ts`                               | Machine à états immuable du poll MVP + snapshot publiable.                                     |
| `pages/api/admin/twitch/eventsub/subscribe.ts`               | Crée les souscriptions EventSub pour une session ouverte par le navigateur.                    |
| `hooks/useCasterScenes.ts`                                   | Chargement + Realtime + écriture des scènes.                                                   |
| `components/admin/caster/*`                                  | Éditeurs par type, `useSceneDraft` (auto-save/anti-clobber), panneaux OBS et chat.             |
| `components/overlay/caster/*`                                | Overlays (ports px-exacts des HTML desktop).                                                   |
| `lib/data/ow-heroes.json`                                    | Manifeste des héros Overwatch (copié du repo caster).                                          |
