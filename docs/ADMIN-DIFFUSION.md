# L'espace « Diffusion » de l'admin

Tout ce qui sert un direct — la régie, les casteuses, les overlays — réuni sous
une seule entrée de menu et une seule barre d'onglets. Livré en 10 lots le
2026-09-28 sur la branche `work`.

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
- **Chaque onglet porte son droit** : Run-of-show et Chaînes Twitch exigent
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
4. des renvois vers les overlays réglés sur leur propre écran (run live,
   scènes caster, TCG pour qui n'a pas le droit ci-dessus).

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
