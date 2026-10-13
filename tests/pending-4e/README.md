# Tests mis de côté à la bascule 4e (2026-10-13)

Depuis le 2026-10-13, conference-api porte toute l'API : `pages/api` et le
métier qu'elle seule importait ont quitté ce dépôt. Les tests de routes sont
partis avec (ils tournent dans conference-api, `npm run test:unit`).

Ce dossier a accueilli les **blocs qui faisaient les deux** : appeler un
handler de `pages/api` PUIS rendre un composant, une page ou un hook du site
avec sa réponse (route → UI), ou vérifier qu'une règle du site reflète une
règle de l'API (parité). 22 fichiers / 38 blocs à la bascule, 7 / 9 après le
second tri, **0 / 0 le soir même** : chaque bloc a été relu et scindé entre le
dépôt qui possède le code qu'il exerce, avec une fixture ou une parité gelée
là où les deux côtés se parlaient :

- la route vit dans l'API → `*.routes.test.ts` là-bas ;
- l'UI, la page (`getStaticProps`, `getServerSideProps`) ou le hook vivent
  ici → test du site contre une **fixture de réponse** ;
- une valeur partagée (borne serveur, ancre, empreinte d'un fichier livré) →
  **même littéral gelé des deux côtés**, chaque test nommant son jumeau.

Le dossier reste vide à dessein : `tests/unit/pending4eRatchet.test.ts`
refuse tout nouveau `.pending`. Un test route → UI nouveau se réécrit
directement contre une fixture.
