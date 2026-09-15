<!-- MACHINE-MANAGED FILE — alimenté par l'agent `backlog-auditor` (.claude/agents/backlog-auditor.md).
     Édition humaine OK : change surtout la colonne `Statut` (open → doing → done / wontfix)
     et ajoute des notes. L'agent NE réécrit jamais les lignes existantes ; il APPEND des
     lignes `open` nouvelles et bascule en `done` celles dont le pattern a disparu du code. -->

# Backlog d'amélioration continue — conference-website

Backlog **qualité** transverse (a11y, perf, sécu-front, robustesse, dette, tests, contract-drift),
distinct de [BACKLOG-tournois.md](./BACKLOG-tournois.md) (fonctionnel/produit).

## Légende

- **Catégorie** : `a11y` · `perf` · `secu-front` · `robustesse` · `dette` · `test-coverage` · `contract-drift`
- **Sévérité** : `haute` (bug/faille/impact fort) · `moyenne` · `basse` (hygiène)
- **Effort** : `S` (< 1 h) · `M` (qq h) · `L` (chantier)
- **Statut** : `open` · `doing` · `done` · `wontfix`
- **Clé de dédup** = `Catégorie` + `Emplacement` (fichier[:ligne] ou motif). L'agent ne réajoute
  jamais une clé déjà présente, y compris `wontfix`.

## Comment l'agent alimente ce fichier

Voir [.claude/agents/backlog-auditor.md](../.claude/agents/backlog-auditor.md). En résumé, à chaque run :
1. lit ce backlog, passe en `done` les items dont le motif a disparu du code ;
2. scanne le diff depuis le dernier run + **une dimension tournante** auditée en profondeur ;
3. **vérifie** chaque finding (anti-faux-positif) avant écriture ;
4. **append** les nouveaux `open` (cap 15/ run, journalise ce qui est tronqué) ;
5. ouvre une PR `backlog/auto-<date>` — ne modifie **que** ce fichier.

---

## Findings

| ID | Date | Catégorie | Sévérité | Effort | Emplacement | Statut | Résumé |
|----|------|-----------|----------|--------|-------------|--------|--------|
| Q001 | 2026-07-10 | secu-front | haute | S | `pages/api/admin/tenants/*` (rôle owner) | done | Vérif : owner filtré client-only → **faux positif**, re-check owner présent côté serveur ; helper `requireOwner` extrait. |
| Q002 | 2026-07-10 | robustesse | moyenne | S | `components/admin/MatchTimeline.tsx`, `MatchHistoryDrawer.tsx` | done | `fetch()` sans auth ni redirect 401 → migré vers `useAdminFetch`. |
| Q003 | 2026-07-10 | a11y | moyenne | S | `teams/my.tsx`, `tournament/[id]/maps.tsx` +9 écrans | done | `alert()`/`confirm()` natifs → `useToast`/`useConfirmDialog`. |
| Q004 | 2026-07-10 | a11y | moyenne | S | `components/admin/AlertBanner.tsx` | done | Pas de `role`/`aria-live`, variantes couleur-seule, close sans label → corrigé (i18n). |
| Q005 | 2026-07-10 | a11y | basse | S | ~20 champs de recherche admin | done | Inputs `placeholder`-only sans nom accessible → `aria-label`. |
| Q006 | 2026-07-10 | a11y | moyenne | M | 35 fichiers (admin/public/embed) | done | 231 `<th>` d'en-tête sans `scope` → `scope="col"` (composant `Th` partagé). |
| Q007 | 2026-07-10 | a11y | basse | S | `components/admin/LoadingSpinner.tsx` | done | Spinner partagé muet → `role="status"` + label i18n. |
| Q008 | 2026-07-10 | perf | haute | M | `pages/api/admin/users/manage.ts` | done | GET scannait toute la table auth en mémoire → RPC SQL paginée `admin_list_users`. |
| Q009 | 2026-07-10 | perf | moyenne | M | `pages/api/admin/demandes/index.ts` + 5 routes joueur/équipe | done | N+1 `getUserById` (GoTrue) → RPC batch `admin_get_user_profiles` (helper `utils/adminUserProfiles.ts`). |
| Q010 | 2026-07-10 | perf | haute | S | `pages/admin/events/[runId]/director.tsx` | done | Resubscribe des 4 canaux WS à chaque render → callbacks `useCallback`. |
| Q011 | 2026-07-10 | perf | moyenne | S | `pages/admin/stages/[stageId].tsx` | done | Fetch stage→tournoi→siblings séquentiels → `Promise.all`. |
| Q012 | 2026-07-10 | perf | moyenne | S | `pages/api/admin/users/manage.ts` (GET) | done | Écritures `updateUserById` sur chemin de lecture → supprimées (normalisation en mémoire). |
| Q013 | 2026-07-10 | perf | moyenne | S | table `demandes` | done | Index composites `(tenant_id,status,created_at)` + `(tenant_id,type,created_at)`. |
| Q014 | 2026-07-10 | dette | moyenne | L | admin (30 hooks) + `hooks/useAdminFetch.ts` | done | `eslint-disable exhaustive-deps` : hook stabilisé (router via ref) + 30 disables + 9 warnings résolus/justifiés. |
| Q015 | 2026-07-10 | dette | M | M | `tailwind.config.ts` + hex admin | done | Config Tailwind v4 morte supprimée ; échelle `--color-surface-*` dans `@theme` ; 11 hex ad-hoc tokenisés. |
| Q016 | 2026-07-10 | a11y | basse | S | `tournament/[id].tsx:1312`, `CommentsPanel.tsx:280` | done | `target="_blank"` internes sans `rel="noopener noreferrer"`. |
| Q017 | 2026-07-10 | robustesse | basse | S | `pages/admin/tournaments/create.tsx` | done | Lecture templates `.catch(()=>{})` silencieuse → `useAdminFetch` + erreur affichée. |
| Q018 | 2026-07-10 | dette | moyenne | L | admin god-components (>1400 LOC) | open | 8 fichiers >1400 LOC (tournament-simulator 3596, tournament/[id] 3020, stages/[stageId] 2431, matches 2329, teams/my 1734, CampaignsPanel 1721, demandes 1664, teams/index 1474) : extraire en `*Panel` + hooks. |
| Q019 | 2026-07-10 | a11y | moyenne | M | `tenants/[id].tsx`, `tournament-simulator.tsx`, `teams/index.tsx` (partiel) | open | Reste des barres d'onglets réinventées à migrer vers `components/admin/Tabs.tsx` (les 2 principales faites). |
| Q020 | 2026-07-10 | dette | basse | M | pages publiques (`hero`/`lore`) | open | Hex de dégradé publics non tokenisés (hors périmètre R13, surfaces admin only) — à évaluer si un design system public est voulu. |
| Q021 | 2026-07-10 | test-coverage | moyenne | L | `tests/e2e/*` | open | Couverture e2e déséquilibrée : `tournament/[id]/*` (veto, map-draw, bulk-ops, analytics), `stages/*` (swiss, seeding), `scrims/*`, `communications/campaigns` peu couverts. |
| Q022 | 2026-07-10 | a11y | moyenne | M | `components/scrim/AvailabilityGrid.tsx` (cellules 24px) | done | Cellules `h-8 sm:h-6` (32px en mobile, 24px desktop) → cible tactile agrandie sans casser la densité « semaine » sur desktop ; la vue calendrier à blocs (drag vertical, grandes cibles) reste le défaut du panneau, chemin tactile privilégié. Le vrai 44px n'est pas atteignable sur une grille dense sans sacrifier la vue d'ensemble. |
| Q023 | 2026-07-10 | robustesse | moyenne | S | `components/admin/scrims/PlanningFormModal.tsx` (champ timezone) | done | `timezone` en champ texte libre → remplacé par un `<select>` alimenté par `Intl.supportedValuesOf('timeZone')` (optgroups Fréquents/Tous, fallback curé) : impossible de saisir un fuseau IANA invalide. |
| Q024 | 2026-07-10 | robustesse | basse | M | `components/scrim/AvailabilityCalendar.tsx`, `AvailabilityGrid.tsx` | done | L'axe horaire affiche une 2e étiquette (heure locale du visiteur, en bleu) sous l'heure de référence quand le fuseau visiteur diffère de la session — résout la confusion des équipes étrangères sans re-géométriser la grille (pas de désalignement, meilleur qu'un toggle à basculer). |
| Q025 | 2026-07-10 | a11y | basse | S | `pages/admin/scrims/plannings/[planningId].tsx` (validation heatmap) | done | Le hint de validation devient un callout toujours visible avec un swatch reproduisant la cellule planifiable (fond vert + soulignement) → l'affordance de clic est ancrée visuellement, plus besoin de survoler. |
| Q026 | 2026-07-10 | test-coverage | moyenne | M | `tests/e2e/scrim-*.spec.ts` | open | Agenda admin (ScrimCalendar drag&drop, plage dynamique, layout anti-collision) et aperçu conflits non couverts en e2e ; seul le flux grille→validation l'est (recoupe Q021). |
| Q027 | 2026-09-07 | test-coverage | moyenne | M | `tests/e2e/admin-schedule-*.spec.ts` | open | Le chantier « plateforme de tournois » (lots 1-9) est couvert en unitaire (114 tests purs + 19 tests de route) et en e2e **sur le seul contrôle d'accès** (`admin-schedule-gating.spec.ts`, 5 tests, sans seed). Le parcours fonctionnel — saisir une contrainte, lire le diagnostic, appliquer une correction — demande une Supabase LOCALE que le garde-fou impose (jamais la prod) ; à écrire quand le stack local tourne. Recoupe Q021. |
| Q028 | 2026-09-13 | robustesse | haute | S | `pages/api/player/tcg/recycle.ts` (crédit + relâche, ~l.191-215) et `pages/api/player/tcg/booster.ts` (~l.147-174) | open | **Le repli d'annulation traite « erreur d'écriture » comme « rien n'a été écrit ».** Recyclage : la carte est marquée `recycled_at`, puis le crédit est inséré ; si l'`insert` rend une erreur alors que la ligne a bel et bien été committée (504 PostgREST — mode d'échec CONSTATÉ sur ce projet, ~1,7 %), le repli remet `recycled_at = null` : la joueuse **garde la carte ET les pièces**. C'est exactement l'invariant que l'en-tête du fichier revendique (« un crédit sans carte retirée serait de la monnaie créée à partir de rien »). Symétrique côté booster : le paquet est supprimé alors que le débit tient, la joueuse perd 300 pièces sans rien recevoir. Correctif : avant de relâcher, relire l'écriture par sa clé UNIQUE (`tenant_id,user_id,'card_recycled',<packId>:<position>`) et ne relâcher que si elle est absente. |
| Q029 | 2026-09-13 | secu-front | moyenne | M | `pages/api/player/tcg/photo.ts` (revoke, ~l.289-302) et `pages/api/admin/tcg/photos.ts` (refus, ~l.184-197) | open | **Une photo peut rester publique pour toujours après un retrait de consentement.** Les deux chemins mettent `photo_path` à NULL en base PUIS suppriment le fichier ; si le `.remove()` échoue, plus rien ne porte le chemin — aucune reprise n'est possible, et le bucket `teams-images` est PUBLIC. L'échec n'est que journalisé. Vaut aussi pour une photo REFUSÉE (écartée précisément parce qu'elle pose problème). Casse la promesse « retrait rétroactif » du lot 2. Correctif : conserver le chemin dans une colonne de purge en attente balayée par un cron, plutôt que de le perdre. |
| Q030 | 2026-09-13 | contract-drift | moyenne | S | `docs/openapi/paths/api/admin/tcg/overview.yaml` (bloc `get`) | open | La fiche de l'endpoint ne déclare **aucun** `security:` : elle hérite donc du défaut global (`BotApiKey` + `BotTenantId`) alors que le handler est `withStaffRoute(..., 'moderate_support')`. La spec annonce qu'une clé bot ouvre un agrégat qui expose qui possède quoi. `tests/unit/openapiContractDrift.test.ts` échoue là-dessus (auth drift). Correctif : `security: [- StaffSession: []]`. |
| Q031 | 2026-09-13 | contract-drift | moyenne | S | `pages/api/webhooks/twitch/tcg-drop.ts` ↔ `docs/openapi/paths/api/webhooks/twitch/tcg-drop.yaml` | open | Handler absent de la spec → `openapiContractDrift` échoue (1 handler manquant). C'est une route **publique non authentifiée** (signature HMAC) qui crédite des pièces : elle mérite d'être décrite plus que les autres. Déjà consigné dans `docs/TCG.md` § 7, non encore corrigé ; consigné ici parce que `npm run verify` est ROUGE tant qu'il reste. |
| Q032 | 2026-09-13 | test-coverage | moyenne | S | `tests/unit/tcgEarnSources.test.ts` (~l.106-111), `utils/tcg/rarity.ts` (`RATING_TIERS`) | open | **Deux barèmes se disent alignés sur `utils/profile/achievements.ts` ; aucun test ne le vérifie.** Le test « garde la longueur de série sur le seuil des badges » assère `CHECKIN_STREAK_LENGTH === 5` : une tautologie qui ne peut pas détecter un changement du littéral `streak >= 5` (achievements.ts). `RATING_TIERS` (2000/1800/1600) recopie les paliers `peak_*` sans aucun test. Correctif : exporter les seuils depuis `achievements.ts` et les importer, ou à défaut un test qui lit les deux sources. |
| Q033 | 2026-09-13 | dette | moyenne | S | `utils/tcg/earnSources.ts` (`TWITCH_DROP_COINS`) ↔ `pages/api/webhooks/twitch/tcg-drop.ts` (`grantTwitchDrop`) | open | Le registre annonce le drop Twitch à 25 pièces (« demi-scrim : regarder n'est pas jouer ») ; le webhook crédite `BOOSTER_PRICE_COINS`, soit **300 — douze fois plus, et trois fois une victoire de tournoi**. Le registre n'est lu par aucun distributeur, donc rien ne rattrape l'écart. Inerte aujourd'hui (identité Twitch non résolue + CHECK `source_kind` qui refuse `twitch_drop`), mais s'ouvre avec les deux migrations attendues. Déjà consigné dans `docs/TCG.md` § 7 — à trancher avant d'ouvrir la voie. |
| Q034 | 2026-09-13 | a11y | basse | S | `components/admin/moderation/TcgPhotosPanel.tsx` (champ « motif », ~l.151-162) | open | `<input type="text">` avec `placeholder` seul : ni `<label>`, ni `aria-label`. Le motif de refus est la seule explication rendue à la joueuse ; le champ doit être nommé pour un lecteur d'écran. Même motif que Q005, sur un écran neuf. |
| Q035 | 2026-09-13 | robustesse | basse | S | `pages/api/player/tcg/photo.ts` (`readState`, GET) | open | Le GET est la seule méthode de la route sans `applyRateLimit` (POST 5/min, DELETE 10/min). Lecture authentifiée et bon marché, donc risque faible — mais l'asymétrie n'est pas justifiée dans un fichier qui documente tout le reste. |
| Q036 | 2026-09-16 | robustesse | haute | M | `utils/helloasso.ts`, `pages/api/helloasso/prize-checkout.ts`, `pages/api/admin/tournaments/[id]/prize-pool.ts` | open | **La cagnotte d'un tournoi tiers est encaissée sur le compte de l'association.** Les identifiants HelloAsso sont des variables d'environnement PLATEFORME (`HELLOASSO_CLIENT_ID/SECRET/ORG_SLUG`), pas des secrets par espace : n'importe quel staff `manager` d'un espace peut ouvrir une cagnotte (`is_open`), le public paie, et l'argent arrive chez la OW Women's Cup — sans aucun mécanisme de reversement (la brique assumait « argent entrant uniquement »). Collecter pour un tiers sans convention est un risque juridique autant que comptable. Le guide public (`/organisateurs/tournoi-feminin-ou-mixte`) le DIT désormais (« sur convention »), mais rien ne l'applique dans le code. Correctif : réserver l'ouverture d'une cagnotte au tenant de la Coupe (ou à une liste d'espaces sous convention), sinon `403`. |
| Q037 | 2026-09-16 | secu-front | moyenne | S | `utils/captcha.ts`, `pages/api/captcha.ts` | open | **Le jeton du captcha porte la réponse en clair.** Il s'agit d'un JSON base64url `{"answer":33,"issuedAt":…,"nonce":…,"hmac":…}` : le HMAC empêche de forger un jeton, pas de LIRE la réponse. Un script qui décode le jeton répond juste à tous les coups — le captcha ne filtre donc que les bots qui ne le décodent pas. Constaté en production le 2026-09-16 sur `/api/captcha`. Correctif : ne transporter que la question + un identifiant opaque, garder la réponse côté serveur (HMAC de la réponse, ou table courte durée), et vérifier par comparaison de hachés. |

---

### Agenda scrim — livré 2026-07-10

3 lots livrés en prod (commits `a72a994`, `f13d2d0`, `9cfaa3d`) : **joueur** (garde « modifications non enregistrées » + encart « meilleur créneau commun »), **admin agenda** (plage horaire dynamique + layout anti-collision côte-à-côte), **admin validation** (aperçu des conflits de double-booking avant clic). Reliquat qualité → Q022–Q026 ci-dessus. Améliorations **produit/UX** restantes (hors périmètre de ce backlog qualité, à verser dans [BACKLOG-tournois.md](./BACKLOG-tournois.md) si souhaité) : vue mois côté joueur, feedback d'échéance in-app (« X jours pour peindre »), indicateur de participation côté joueur (« on attend l'autre équipe »), vue mois admin avec « +N » déroulable, auto-save des dispos, unification des 3 idiomes temporels (datetime-local négociation / grille When2Meet / agenda drag&drop).

---

*Dernier passage auto : 2026-09-13 — passe CIBLÉE sur la fonctionnalité TCG (pas la dimension tournante habituelle) : `utils/tcg/*`, `pages/api/{player,admin}/tcg/*`, la route bot, le webhook Twitch, les composants et les 4 migrations. 8 nouveaux (1 haute, 5 moyennes, 2 basses), 0 passé en done, 0 tronqué. Aucune réconciliation des lignes Q001–Q027 : hors périmètre de cette passe. À noter — l'arbre de travail bougeait PENDANT l'audit (openapi.yaml et docs/TCG.md réécrits en cours de session), et une partie des écarts constatés est déjà consignée par l'auteur dans `docs/TCG.md` § 7 ; les lignes concernées le disent.*
