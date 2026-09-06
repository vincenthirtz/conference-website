# Espace scrims — plan d'amélioration en 10 lots

Établi le 2026-09-06. Périmètre : `/admin/scrims` et ses trois onglets — la
**liste des scrims**, l'**agenda** et les **grilles de planification**.

Chaque lot part d'un **constat vérifié dans le code ou dans la base de
production**, pas d'une bonne pratique générique. Les chiffres de production
datent du 2026-09-06 : 4 scrims (dont 2 terminés), 14 équipes, **0 grille de
planification**, **0 disponibilité saisie**.

> **État : 9 lots livrés sur 10.** Chaque section reçoit son bilan au fur et à
> mesure. Rien n'est poussé : les lots sont committés en local.

---

## Lot 1 — La liste des grilles ment par omission

> **Livré.** Recherche par titre (soumission explicite, pas de debounce :
> `useUrlFilters` pousse une entrée d'historique à chaque écriture), pagination
> par 25 avec le total réel, filtres `pq`/`pstatus` portés par l'URL, et un état
> vide qui distingue « aucune grille » de « aucune correspondance ».
>
> Le total n'a rien coûté : l'API comptait déjà à chaque requête
> (`count: 'exact'`) et renvoyait `total` — le panneau le jetait. On le lit via
> `selectTotal` plutôt que d'ajouter `includeTotal`, qui aurait été un second
> COUNT inutile.

**Effort : S.**

**Constat.** `ScrimPlanningsListPanel` demande `limit: 50` avec
`includeTotal: false`, sans pagination ni recherche — exactement le défaut que
la liste des scrims vient de perdre. Pire : l'API `/api/admin/scrim-plannings`
compte **toujours** (`select('*', { count: 'exact' })`) et renvoie ce total,
que le panneau jette. Le filtre de statut vit en état local, donc ni partageable
ni conservé au rechargement.

**Contenu.** Recherche, pagination avec total, filtres portés par l'URL —
alignés sur `ScrimsListPanel`.

**Critère de sortie.** Au-delà de 50 grilles, la 51e reste atteignable, et un
lien vers une liste filtrée rouvre la même liste.

---

## Lot 2 — Deux requêtes pour afficher un nom d'équipe

> **Livré.** Les deux API des grilles (liste et détail) embarquent désormais
> `team1`/`team2` via leurs clés étrangères. La liste et la page de détail ne
> rappellent plus `/api/admin/teams` : un aller-retour de moins sur chacune, et
> le plafond muet de 200 équipes disparaît de ces deux chemins.
>
> `PlanningFormModal` garde son propre appel, et c'est justifié : il lui faut la
> liste complète pour ses sélecteurs, pas deux noms. Il la charge déjà à
> l'ouverture seulement.
>
> Le lint n'a pas signalé les imports devenus morts (`TeamOption`,
> `useAdminFetch`, `useMemo`) — retirés à la main.

**Effort : S.**

**Constat.** La liste des grilles ET la page de détail appellent
`/api/admin/teams?limit=200&isActive=true` uniquement pour traduire des
`team1_id` en noms, parce que l'API des grilles renvoie des lignes brutes
(`select('*')`). L'API des scrims, elle, embarque déjà
`team1:teams!scrims_team1_id_fkey(...)`. Deux façons de faire la même chose, et
la seconde coûte un aller-retour de plus. Le `limit=200` est un plafond muet
(14 équipes aujourd'hui, donc latent).

**Contenu.** Embarquer les équipes dans l'API des grilles, supprimer la requête
annexe des deux écrans.

**Critère de sortie.** Le détail et la liste des grilles n'appellent plus
`/api/admin/teams`.

---

## Lot 3 — L'agenda filtre les matchs sur le NOM de l'équipe

> **Livré.** L'API calendrier expose `team1_id`/`team2_id` pour les matchs —
> elle les lisait déjà et les jetait au moment de composer sa réponse. Le
> panneau filtre désormais sur l'id, et `selectedTeamName` disparaît.
>
> Le test de l'API a été étendu, puis **vérifié en cassant volontairement le
> correctif** : sans les ids, il échoue. Sans cette vérification, l'assertion
> aurait pu être vraie par accident.

**Effort : S.**

**Constat.** `ScrimCalendarPanel` filtre les matchs avec
`m.team1Name === selectedTeamName`. Deux équipes homonymes se mélangent, et une
différence de casse ou d'espace fait rater le filtre en silence. Or l'API
calendrier LIT déjà `team1_id`/`team2_id` des matchs (`calendar.ts:59`) et les
jette au moment de composer sa réponse : seuls les noms sortent.

**Contenu.** Exposer les ids dans la charge utile, filtrer dessus.

**Critère de sortie.** Deux équipes de même nom ne se mélangent plus dans
l'agenda filtré.

---

## Lot 4 — Le filtre d'équipe dépend de la semaine affichée

> **Livré.** L'équipe sélectionnée est mémorisée avec son libellé au moment du
> choix (`stickyTeam`) et réinjectée dans les options quand elle sort de la
> plage. Les options s'enrichissent au passage des équipes des MATCHS, pas
> seulement des scrims — l'agenda les affiche, il est logique de pouvoir
> filtrer dessus.
>
> Le symptôme était vicieux : le filtre restait actif mais son option
> disparaissait du menu ; l'agenda paraissait vide et on ne pouvait même plus
> désélectionner l'équipe.

**Effort : S.**

**Constat.** `teamOptions` est dérivé des scrims de la plage visible. Filtrer
sur une équipe puis changer de semaine laisse un filtre ACTIF dont l'option a
disparu du menu : l'agenda paraît vide sans que rien n'explique pourquoi.

**Contenu.** Conserver l'équipe sélectionnée dans les options même absente de
la plage, ou charger la liste d'équipes indépendamment.

**Critère de sortie.** Naviguer d'une semaine à l'autre ne rend jamais le
filtre courant invisible.

---

## Lot 5 — « Conflit détecté » sans dire lequel

> **Livré.** Le message nomme désormais ce qui bloque et quand :
> « Créneau déjà pris : Phoenix vs Dragons — 8 sept. 20:30 », avec un compteur
> quand il y en a plusieurs. Le conflit le PLUS PROCHE est celui qu'on nomme.
>
> La mise en forme vit dans `utils/teams/scrimConflictLabel.ts`, séparé de
> `scrimConflicts.ts` qui porte la requête base : un composant client peut
> l'importer sans tirer un client Supabase dans le bundle. Pur, horloge et
> localisation injectées, 6 tests — dont le cas d'un match sans nom et celui
> d'une date illisible, qui ne doit pas être masquée par un formatage.
>
> L'ancienne clé générique est supprimée des deux locales : une clé morte finit
> par être réutilisée à tort.

**Effort : S.**

**Constat.** Le PATCH d'un scrim renvoie `conflicts: SlotConflict[]` — équipe
concernée, créneau, nature. À la réception, l'UI affiche un toast générique
(`t.calConflictWarning`). L'information utile est calculée, transmise, puis
perdue à l'affichage.

**Contenu.** Nommer l'équipe déjà prise et l'heure du conflit dans le message.

**Critère de sortie.** Déplacer un scrim sur un créneau occupé dit QUI est pris
et QUAND.

---

## Lot 6 — Un déplacement à la souris ne se défait pas

> **Livré.** Une barre « Annuler » apparaît après un déplacement ou un
> redimensionnement et rejoue un PATCH vers la valeur d'avant. Elle s'efface
> d'elle-même au bout de 12 s : un déplacement non annulé est un déplacement
> voulu.
>
> Deux détails qui comptent : la valeur mémorisée est la valeur EFFECTIVE
> (surcharge optimiste si elle existe, sinon la donnée serveur) et non celle du
> dernier fetch ; et une annulation ne se réarme pas elle-même, sans quoi le
> bouton ferait osciller le scrim entre deux créneaux.
>
> Choix assumé : pas d'action dans les toasts. Le composant Toast a 140
> consommateurs et un rendu délibérément optimisé (actions et état séparés en
> deux contextes) ; y ajouter une action pour un seul écran aurait fait payer
> tout le monde. La barre reste locale à l'agenda.

**Effort : M.**

**Constat.** Le drag & drop replanifie sans filet : un dépôt d'un cran à côté
oblige à retrouver l'heure d'origine de mémoire. Le code garde pourtant la
valeur précédente le temps de l'optimisme (`overrides`).

**Contenu.** Proposer « Annuler » sur le toast de replanification, qui rejoue
un PATCH vers la valeur d'origine.

**Critère de sortie.** Un déplacement accidentel se répare en un clic, sans
connaître l'heure d'avant.

---

## Lot 7 — L'agenda est inutilisable au clavier

> **Livré.** Les événements de l'agenda étaient déjà des `<button>` (donc
> focalisables, et Entrée ouvrait la fiche) : ce qui manquait, c'était de
> pouvoir DÉPLACER sans souris. Flèches = un cran de 15 min ou un jour ;
> Maj+flèches = la durée. Les déplacements sont bornés au créneau visible et à
> la semaine affichée — sortir de la vue en aveugle serait pire que de ne rien
> faire.
>
> Anneau de focus visible ajouté (`focus-visible:ring`), `aria-keyshortcuts`
> posé, et surtout un rappel écrit sous la grille : un raccourci qu'on ne peut
> pas découvrir n'existe pas.
>
> Le lot 6 sert de filet : un déplacement clavier malheureux s'annule comme un
> déplacement à la souris.

**Effort : M.**

**Constat.** Déplacer ou redimensionner un scrim exige la souris
(`onMoveScrim` / `onResizeScrim` ne sont câblés que sur le drag). Les
invariants d'accessibilité du dépôt sont tenus ailleurs (modales, cartes,
navigation mobile) ; cet écran y échappe.

**Contenu.** Un chemin clavier pour replanifier, et un focus visible sur les
événements de l'agenda.

**Critère de sortie.** Replanifier un scrim sans souris.

---

## Lot 8 — L'état de l'agenda ne se partage pas

> **Livré.** `cview`, `cweek`, `cmonth`, `cteam` et `cstatus` vivent dans
> l'URL. Deux choix de forme : l'absence de `cstatus` signifie « tous les
> statuts » (l'URL reste courte dans le cas nominal), et une valeur illisible
> retombe sur « tous » plutôt que de vider l'agenda sans explication. Les dates
> venues de l'URL sont validées avant usage.
>
> Le compilateur React a attrapé deux tableaux de dépendances devenus faux :
> `setWeekStart`, `setView` et `setTeamFilter` ne sont plus des setters de
> `useState` — ils écrivent dans l'URL et changent donc d'identité. C'est
> exactement la classe de closure périmée qu'on cherche à éviter.

**Effort : S.**

**Constat.** `view`, `weekStart`, `teamFilter` et `statusFilter` vivent en état
local. « La semaine du 8 septembre, filtrée sur telle équipe » n'a pas d'URL, et
un rechargement ramène à la semaine courante, tous statuts.

**Contenu.** Porter ces quatre états dans l'URL, comme les filtres des listes.

**Critère de sortie.** Un lien d'agenda rouvre exactement la même vue.

---

## Lot 9 — La grille de planification n'a jamais servi

> **Livré.** Un scrim sans date propose désormais « Ouvrir une grille de
> disponibilités », équipes pré-remplies.
>
> Le point d'entrée seul aurait été un piège : la validation d'une grille
> INSÉRAIT toujours un nouveau scrim. Suivre le lien depuis un scrim existant
> aurait donc produit un doublon — le scrim d'origine restant là, sans date, à
> côté de son jumeau planifié. Une grille peut maintenant être attachée à un
> scrim (`scrim_id` accepté à la création, propagé par `?forScrim=`), et la
> validation REPLANIFIE ce scrim au lieu d'en créer un second.
>
> Test ajouté puis vérifié en neutralisant la branche : sans elle, il échoue.

**Effort : M.**

**Constat.** `scrim_plannings` et `scrim_planning_availabilities` sont **vides
en production**, alors que la fonctionnalité est complète : heatmap d'overlap,
classement des créneaux, aperçu des conflits, suivi de participation, rappels
cron, notifications push. Même schéma que le veto de cartes : construit,
correct, invisible depuis l'endroit où le besoin naît.

**Contenu.** Proposer la grille là où la question « quand joue-t-on ? » se pose
— un scrim sans date, une négociation en cours — avec les équipes
pré-remplies (le chemin `?new=1&team1=&team2=` existe déjà).

**Critère de sortie.** Depuis un scrim sans date, ouvrir une grille prête à
remplir sans ressaisir les équipes.

---

## Lot 10 — Aucun test ne couvre ces écrans

**Effort : M.**

**Constat.** Seize fichiers de test couvrent l'API et les utils des scrims
(`apiScrims`, `apiScrimCalendar`, `apiScrimPlannings`, `scrimPlanningOverlap`,
`scrimTime`…), et **aucun** ne couvre les composants de cet espace. Les neuf
lots ci-dessus ajoutent du comportement d'interface : sans filet, il repartira
au prochain refactor.

**Contenu.** Couvrir la logique introduite par les lots précédents, en
privilégiant les fonctions pures extraites plutôt que le rendu.

**Critère de sortie.** Chaque comportement ajouté par ce plan a un test qui
échoue si on le retire.

---

## Ordre d'exécution

Du moins risqué au plus structurant : **1, 2** (alignement des listes), **3, 4,
5** (défauts francs de l'agenda), **8** (état partageable), **6, 7** (confort et
accessibilité), **9** (adoption), **10** (filet).
