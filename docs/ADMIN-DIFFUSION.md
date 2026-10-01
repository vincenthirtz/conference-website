# L'espace « Diffusion » de l'admin

Tout ce qui sert un direct — les overlays, les scènes, Twitch, les casteuses —
réuni sous une seule entrée de menu et une seule barre d'onglets. Livré en 10
lots le 2026-09-28 sur la branche `work`, allégé le 2026-10-01.

## État actuel (allègement du 2026-10-01)

Le **run-of-show** (`/admin/events`, director, cues, vagues, stations), le
**cockpit** (`/admin/regie`, ex-`/caster/cockpit`) et la moitié « run » de la
console live (HUD, régie automatique, scènes de run, prochain match, antenne,
PiP, bandeau, overlay `/overlay/<runId>`) ont été **retirés** : la
fonctionnalité n'a jamais servi en production (aucune ligne dans `event_runs`).
Les tables `event_*` et `caster_presence` existent toujours ; leur suppression
reste à valider.

Les cinq onglets, dans l'ordre de la barre :

| Onglet | Page | Accès |
|---|---|---|
| **Overlays** | `/admin/diffusion/overlays` | rôle caster |
| **Scènes** | `/admin/caster` | rôle caster |
| **Twitch & interactions** | `/admin/broadcast/live` | rôle caster (panneaux d'écriture : `manage_broadcast`) |
| **Casteuses** | `/admin/diffusion/casteuses` | `manage_communications` |
| **Chaînes Twitch** | `/admin/twitch-channels` | `manage_broadcast` |

Overlays vient en premier : c'est l'écran le plus ouvert, et c'est lui qu'ouvre
la carte **Diffusion** du tableau de bord. « Twitch & interactions » a gardé
l'URL de l'ex-console live (retour par défaut de l'OAuth Twitch) et ne contient
plus que ce qui ne dépend d'aucun run : santé des drops TCG, statut d'antenne,
prédictions, points de chaîne et commandes Twitch.

Le reste de ce document est l'**historique** des chantiers : il cite des écrans
(Cockpit, Console live, Run-of-show, Director) qui n'existent plus.

## Avant / après

Ces écrans servaient la même soirée mais vivaient à **sept endroits** :

| Écran | Avant | Après |
|---|---|---|
| Cockpit régie `/admin/regie` | carte du tableau de bord seulement | Diffusion › **Cockpit** |
| Console live `/admin/broadcast/live` | « Broadcast live (cockpit) » dans Compétition › Tournois | Diffusion › **Console live** |
| Run-of-show `/admin/events` | **aucune entrée**, joignable par le fil d'Ariane du director | Diffusion › **Run-of-show** |
| Scènes caster `/admin/caster` | carte du tableau de bord seulement | Diffusion › **Scènes** |
| Sources OBS, alertes de stream | onglet **Outils** de chaque tournoi | Diffusion › **Overlays** (`/admin/diffusion/overlays`) |
| Overlay TCG (jeton, habillage) | TCG › Économie | TCG › Économie **et** Diffusion › Overlays |
| Casteuses | hub Association, onglet `?tab=cast` | Diffusion › **Casteuses** (`/admin/diffusion/casteuses`) |
| Chaînes Twitch `/admin/twitch-channels` | Contenu | Diffusion › **Chaînes Twitch** |

Une seule carte **Diffusion** au tableau de bord remplace les trois cartes
d'avant (run-of-show, cockpit, scènes).

## Le choix : une barre d'onglets, pas une page

`components/admin/broadcast/DiffusionTabsNav.tsx` relie des **pages** qui
restent distinctes, comme `TournamentTabsNav` pour l'espace tournoi. Les fondre
en une page à onglets aurait remonté des milliers de lignes de temps réel
(cues, heartbeat, Realtime des scènes) dans un seul composant, et `/admin/caster`
porte déjà ses propres onglets `?tab=`. Les URL ne bougent pas ; seules les
listes déplacées (casteuses) redirigent.

- Vrais `<Link>`, l'onglet actif porte `aria-current="page"`.
- **Chaque onglet porte son droit** : Chaînes Twitch exige
  `manage_broadcast`, Casteuses `manage_communications`. Un onglet qui mènerait
  à un 403 est masqué. Pendant la lecture de la session, tout s'affiche plutôt
  que de faire clignoter la barre.
- Le groupe de menu est ouvert au rôle **caster** : ce sont ses écrans un soir
  de match, et les pages l'admettaient déjà.

## La page Overlays

`pages/admin/diffusion/overlays.tsx` — toutes les sources OBS au même endroit :

1. un **sélecteur de tournoi** (les 30 plus récents) et le panneau des sources
   (`StreamSourcesPanel`, une seule implémentation) ; `?tournament=<id>`
   présélectionne, c'est le lien que garde l'onglet Outils d'un tournoi ;
2. les **réglages de la boîte d'alertes**, pour l'espace de l'association doté
   de la capacité de régie ET avec `manage_broadcast` ;
3. l'**overlay TCG** (jeton + habillage, `TcgOverlaySection`) avec `manage_tcg` ;
4. des renvois vers ce qui se règle sur son propre écran (Twitch &
   interactions, scènes caster, TCG pour qui n'a pas le droit ci-dessus).

La capacité « overlays de régie » (palier `matchOverlays`, espace de
l'association) est lue côté serveur par `utils/admin/overlayAccess.ts`.

**Correction de droits (lot 6).** L'onglet Outils affichait les réglages
d'alertes sur `manage_tournaments`, alors que `/api/admin/stream-alerts` exige
`manage_broadcast` : un responsable tournoi voyait un panneau qui échouait à
chaque geste.

## Redirections

Toutes permanentes (308), paramètres conservés, en **un saut** :

| Ancienne adresse | Destination |
|---|---|
| `/admin/association?tab=cast` | `/admin/diffusion/casteuses` |
| `/admin/cast-members` | `/admin/diffusion/casteuses` |
| `/admin/cast-members/new` | `/admin/diffusion/casteuses?new=1` (modale ouverte) |

`/admin/cast-members/new` faisait deux sauts (ancienne liste, puis hub) et le
test e2e attendait l'adresse du milieu.

## Taille des écrans gelés

`regie.tsx` et `broadcast/live.tsx` étaient **exactement** à leur gel
(`tests/unit/adminFileSizeGuard.test.ts`). Leurs en-têtes sont partis dans
`components/Caster/RegieHeader.tsx` et
`components/admin/broadcast/LiveConsoleHeader.tsx`, au rendu identique, et les
gels ont suivi la baisse (1038 → 959, 837 → 813).

## Tests

- `tests/unit/diffusionTabsNav.test.ts` — ordre et filtrage des onglets.
- `tests/unit/navbarAdminLinks.test.ts` — le groupe Diffusion, pour l'admin et
  le caster ; Tournois et Contenu ne portent plus ces écrans.
- `tests/unit/overlayAccess.test.ts`, `tests/unit/castersRedirect.test.ts`.
- `tests/e2e/admin-diffusion.spec.ts` — connexion exigée, redirections,
  barre d'onglets et pages Overlays / Casteuses avec le compte Test Coach.

## Lots

| Lot | Contenu |
|---|---|
| 1 | Barre d'onglets commune (cockpit, console live, scènes) |
| 2 | Groupe « Diffusion » dans le menu, une carte au tableau de bord |
| 3 | Run-of-show : entrée de menu et onglet |
| 4 | Page Overlays (sélecteur de tournoi + sources OBS) |
| 5 | Les sources OBS quittent l'onglet Outils (renvoi présélectionné) |
| 6 | Les alertes de stream rejoignent Overlays (+ correction de droits) |
| 7 | L'overlay TCG se règle aussi depuis Overlays |
| 8 | Les casteuses rejoignent la diffusion (+ redirections en un saut) |
| 9 | Les chaînes Twitch rejoignent la diffusion |
| 10 | Tests e2e et cette doc |

## Deuxième chantier (10 lots, même jour)

Issu d'un audit de l'espace (16 constats vérifiés dans le code).

| Lot | Correctif |
|---|---|
| 1 | Plus de bouton vers un 403 : lien Director seulement avec `manage_broadcast` ; carte TCG sans lien pour qui n'a pas `manage_tcg` ; « forcer le jour » seulement avec `manage_tournaments` |
| 2 | Prédictions et commandes Twitch (`TwitchDrivePanels`) montées seulement avec `manage_broadcast` — elles répondaient 403 aux casteuses et sondaient pour rien |
| 3 | Un run **en direct** ne se supprime plus : 409 `run_live` côté API, bouton désactivé |
| 4 | Director relié : Console live, Cockpit, URL `/overlay/<run>` (copier, ouvrir) ; fil d'Ariane vers le run-of-show |
| 5 | Cockpit et Scènes sur `withStaffPage('caster')` (gates faits main supprimés) ; démarrer/clore/piloter au **droit** `manage_broadcast`, y compris `/api/admin/broadcast/state` ; `next=` vers la page demandée pour tout visiteur non connecté |
| 6 | Une panne ne ressemble plus à une liste vide (Casteuses, Chaînes Twitch : erreur + Réessayer) ; compteurs du run-of-show justes sous filtre |
| 7 | `useVisiblePoll` : relecture au retour sur l'onglet (cockpit, director) ; la console live ignore les réponses périmées |
| 8 | Overlays : « Ouvrir » par source, échec de copie signalé, tournoi gardé dans l'URL |
| 9 | Director traduit (« Cue composer », « Waves »…) ; `aria-label` du « × » ; `role="alert"` ; statut Twitch annoncé seul |
| 10 | Même marge haute (`pt-header`) partout ; onglets et vrai lien retour sur les fiches ; fil d'Ariane de la fiche casteuse ; `h1` de la page Casteuses |


## Troisième chantier (8 lots)

| Lot | Apport |
|---|---|
| 1 | Point rouge « en direct » sur Cockpit et Console live, depuis tout écran de la diffusion — `GET /api/admin/diffusion/live-status` (tout le staff, espace du staff) |
| 2 | Badge « En direct » sur la liste des chaînes Twitch — `hooks/useTwitchLiveStatuses` |
| 3 | Statut d'antenne Twitch visible des casteuses — `GET /api/admin/diffusion/twitch-channels` (lecture seule, rôle caster) |
| 4 | Raccourcis clavier de la console live : Maj+1…6 scènes, Maj+A antenne, Maj+P PiP, « ? » aide — toujours avec Maj, jamais pendant une saisie |
| 5 | Copie d'URL qui marche aussi en http local / dock OBS (`utils/clipboard.ts`, repli `execCommand`) |
| 6 | Briques communes des panneaux Twitch (`twitchPanelUtils.tsx`) ; gel de `TwitchCommandsPanel` abaissé 1203 → 1172 |
| 7 | Un seul formulaire casteuse (`CastMemberFields`) : image en champ texte (l'`url` refusait `/img/…`), libellés reliés aux champs |
| 8 | Heure HH:MM du director mutualisée (`utils/director/clock.ts`) |

## Quatrième chantier (5 lots)

| Lot | Apport |
|---|---|
| 1 | Le director a ses onglets Diffusion (montés dans `RunStatusHeader`) |
| 2 | Largeur stable : le cockpit ne saute plus de 42 à 72 rem au démarrage d'un run ; run-of-show et chaînes Twitch alignés à 6xl |
| 3 | **Signal de présence des overlays** : table `overlay_heartbeats` (migration `overlay_heartbeats.sql`), `POST /api/overlay/heartbeat` (public, limité en débit), `GET /api/admin/diffusion/overlay-presence` (staff) |
| 4 | Les 14 pages `/overlay/*` signalent toutes les 30 s, **tant qu'elles sont visibles** (`useOverlayHeartbeat`) — une source masquée dans OBS s'éteint |
| 5 | Diffusion › Overlays : badge « ● Affichée » / « Vue il y a 3 min » / « Jamais affichée » par source ; console live : « Overlay affiché » ou « non affiché dans OBS » |

**Le modèle.** Une ligne par (espace, source), écrasée : on répond à « est-ce
affiché maintenant ? », pas à un historique. Une source est affichée si son
dernier signal date de moins de 75 s (deux signaux et demi manqués). L'état se
calcule sur l'heure du **serveur** : un poste de régie dont l'horloge dérive
n'éteint pas une source vivante.

**La limite assumée.** Les overlays n'ont pas de session : le signal n'est pas
authentifié et peut être simulé. L'impact se borne à un indicateur trompeur —
aucune donnée n'est exposée ni modifiée.

**Les noms de source** reprennent les clés du panneau des sources (`regie`,
`alerts`, `day`, `mvpPublic`, `partners`, `don`, `donAlert`, `scrims`,
`scrimResult`, et pour les sources de match la valeur de `?source=`), plus
`logo`, `tcg` et `caster:<scène>` (`run` a disparu avec `/overlay/<runId>`).
