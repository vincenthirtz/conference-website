# Tests mis de côté à la bascule 4e (2026-10-13)

Depuis le 2026-10-13, conference-api porte toute l'API : `pages/api` et le
métier qu'elle seule importait ont quitté ce dépôt. Les tests de routes sont
partis avec (ils tournent dans conference-api, `npm run test:unit`).

Les fichiers `*.pending` de ce dossier sont les **blocs qui faisaient les
deux** : appeler un handler de `pages/api` PUIS rendre un composant, une page
ou un hook du site avec sa réponse (route → UI), ou vérifier qu'une règle du
site reflète une règle de l'API (parité). Ils ne compilent pas et ne tournent
pas : ils sont conservés tels quels, prologue compris, pour être **réécrits
contre une fixture de réponse** (la route est déjà testée dans l'API ; ici, on
teste ce que l'UI en fait). Un bloc réécrit → retiré du `.pending` ; fichier
vide → supprimé.

Ce stock ne peut que baisser : `tests/unit/pending4eRatchet.test.ts` gèle le
nombre de fichiers et de blocs.
