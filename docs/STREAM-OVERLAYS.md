# Sources de stream par match (OBS)

Afficher un match à l'antenne — score, équipes, maps, compte à rebours, écran
d'attente — depuis une simple URL collée dans OBS. C'est ce que l'offre
**Régie** ouvre, en réponse directe au « Broadcast à 30 €/mois » du concurrent
analysé le 15 septembre 2026 (lot 2 du rapport).

## Ce que c'est, et ce que ce n'est pas

|  | Sources par match (`matchOverlays`) | Régie vidéo (`broadcastStudio`) |
|---|---|---|
| Palier | Régie, Circuit, Éditeur, Fondation | Éditeur (devis), Fondation |
| Ce qu'on fait | **afficher** un match | **diriger** un direct |
| Contenu | score, équipes, maps/veto, décompte, attente | conducteur, direction automatique, enchaînement des scènes, Womenscup OBS |

La ligne entre les deux offres tient : Régie affiche, Éditeur dirige. Un espace
Régie n'a ni conducteur, ni bouton « match suivant », ni logiciel déployé.

## Les URLs

```
https://<site>/overlay/match/next?tournament=<slug>&source=scoreboard
https://<site>/overlay/match/<uuid>?source=maps
```

`next` résout **le match du moment** à chaque appel : match en cours, sinon
prochain à jouer (y compris celui dont l'heure vient de passer sans que
personne ne l'ait démarré), sinon dernier résultat s'il a moins de deux heures.
C'est le défaut proposé dans l'admin : une régie colle l'URL le matin et n'y
retouche plus de la journée.

### Paramètres

| Paramètre | Valeurs | Effet |
|---|---|---|
| `source` | `scoreboard` (défaut) · `teams` · `maps` · `countdown` · `waiting` | la source affichée |
| `tournament` | id ou slug | **requis** avec `next` |
| `tenant` | slug d'espace | source d'un autre organisateur |
| `scale` | 0.5 → 2 | taille, sans redimensionner dans OBS (ça floute) |
| `accent` | `RRGGBB` | couleur, sinon celle de l'espace, sinon le jaune de la Coupe |
| `theme` | `light` | écran d'attente en clair (les autres sources restent transparentes) |

Tailles conseillées : bandeau de score 1920×250, maps 600×600, le reste
1920×1080.

## Où on les trouve

Admin → tournoi → **Outils** → « Sources de stream (OBS) ». Le panneau donne
les cinq URLs prêtes à copier. Un espace dont le palier n'ouvre pas la capacité
y voit l'encart qui nomme l'offre, plutôt qu'un panneau absent.

## Comment c'est tenu

- **API** : `GET /api/overlay/match/[matchId]` — publique, cacheable
  (`s-maxage=5`), refuse un tournoi non public (404) et un palier insuffisant
  (402, code `PLAN_CAPABILITY_REQUIRED`).
- **Cœur pur** : [`utils/overlay/matchOverlay.ts`](../utils/overlay/matchOverlay.ts)
  — projection vers l'écran et choix du « match du moment ». Testé sans base ni
  navigateur ([`tests/unit/matchOverlay.test.ts`](../tests/unit/matchOverlay.test.ts)).
- **Rafraîchissement** : polling 4 s, mis en veille quand la source est cachée.
  Pas de Realtime : la donnée suit une feuille de match, quatre secondes ne se
  voient pas à l'antenne, et une boucle de fetch ne peut pas tomber en silence
  à cause d'une politique RLS anonyme modifiée ailleurs.
- **Horloge** : le décompte utilise `serverTime` renvoyé par l'API, pas l'heure
  du PC de régie.
- **Capacité** : `matchOverlays` dans
  [`utils/billing/planFeatures.ts`](../utils/billing/planFeatures.ts), appliquée
  par `capabilityDenial` — et déclarée dans `PLAN_FEATURE_ENFORCEMENT`.

## Affiche de match

`GET /api/og/match/<uuid>` rend l'affiche du match en PNG (1200×630 — c'est
l'`og:image` de la page du match), et `GET /api/og/match/<uuid>/story` la rend
en 1080×1920. La page publique du match propose le lien sous « Visuel ». Aucun
logo distant n'est chargé (un fetch raté casserait l'image) : les équipes sont
dessinées avec leurs initiales.

⚠️ **Deux chemins, pas un paramètre.** Jusqu'au commit `3a16425c`, la clé de
cache CDN d'une route Next sur Netlify ne variait que sur `__nextDataReq` et
`_rsc` : tout autre paramètre de query était ignoré. La première version
utilisait `?format=story` et renvoyait la carte 1200×630 en production, y
compris avec un paramètre anti-cache. Depuis, `next.config.js` pose
`Netlify-Vary: query,…` sur `/api/*` et la query fait partie de la clé ; les
deux chemins restent, et un format qui change la réponse reste mieux servi par
une URL distincte.

## Vérifier à la main

```bash
npm run dev
open 'http://localhost:3000/overlay/match/next?tournament=ow-womens-cup-2026&source=scoreboard'
open 'http://localhost:3000/api/og/match/<uuid>/story'
```
