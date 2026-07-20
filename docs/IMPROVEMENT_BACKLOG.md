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
| Q027 | 2026-07-20 | secu-front | haute | S | `pages/team/[slug]/index.tsx:654` (+ `pages/api/teams/[teamId]/public-page.ts`) | open | XSS stockée : `teamLd` (nom/description d'équipe) injecté via `JSON.stringify()` dans un `<script>` JSON-LD avec `dangerouslySetInnerHTML`, sans échapper `<`. `description` est éditable par tout capitaine (validation longueur seule) → un `</script><script>…` casse le tag et exécute sur la page publique. Mitigation déjà connue du projet (`pages/_document.tsx:25`, `.replace(/</g,'\\u003c')`) mais pas appliquée ici. |
| Q028 | 2026-07-20 | perf | moyenne | S | `pages/api/admin/events/[runId]/segments/reorder.ts:139-172`, `waves/reorder.ts:139-171` | open | Reorder en 2 phases de updates séquentiels awaités en boucle (jusqu'à ~400 aller-retours DB pour 200 items) au lieu de `Promise.all` (chaque phase est indépendante par item). |
| Q029 | 2026-07-20 | perf | moyenne | M | `pages/admin/events/[runId]/director.tsx` (state `busy`, l.105) | open | Un seul flag `busy` global désactive simultanément TimelineBuilder/SegmentEditor/RunStatusHeader/WaveBoard/StationBoard dès qu'une mutation est en vol — le même anti-pattern déjà résolu par composant dans `live.tsx` (busy ciblé) n'a pas été repris ici. |
| Q030 | 2026-07-20 | contract-drift | moyenne | S | `docs/BOT_API_CONTRACT.md` (section « Twitch broadcaster actions », ~L1576-1770) | open | ~14 endpoints `pages/api/admin/twitch/**` purement CRUD régie (staff `admin`+, jamais appelés par le bot Discord) documentés dans le contrat bot, en contradiction avec la règle de scope du doc lui-même (L2245-2248 : seules les surfaces bot-consommées y figurent). |
| Q031 | 2026-07-20 | a11y | moyenne | S | `pages/admin/events/index.tsx:412-467` (modal « Nouvel event ») | open | Labels nom/slug/date/description sans `htmlFor`/`id` correspondant sur l'`<input>` → non annoncés par un lecteur d'écran. |
| Q032 | 2026-07-20 | robustesse | moyenne | S | `pages/team/create.tsx:236-247` (`refreshCaptcha`) | open | `fetch('/api/captcha').then(r=>r.json()).catch(()=>{})` sans vérifier `r.ok` : échec réseau/serveur silencieux, la soumission échoue ensuite avec un message `CAPTCHA_INVALID` trompeur. |
| Q033 | 2026-07-20 | test-coverage | moyenne | M | `pages/auth/team-access.tsx` | open | Page de session magic-link (3 chemins : `verifyOtp`, `exchangeCodeForSession`, fragment hash legacy) + garde anti-open-redirect `safeNext`, aucune couverture `tests/unit` ni `tests/e2e`. |
| Q034 | 2026-07-20 | test-coverage | moyenne | L | `components/Caster/*` (9 fichiers), `components/admin/director/{SegmentCard,TimelineBuilder}.tsx`, `hooks/useCueStream.ts` | open | Feature régie/cockpit (19 composants) sans test unitaire direct ; seule couverture e2e indirecte (3 specs) sur ack différé/timers/drag-and-drop. |
| Q035 | 2026-07-20 | dette | basse | S | `pages/api/admin/twitch/connection.ts:8`, `components/admin/broadcast/TwitchCommandsPanel.tsx:28` | open | Commentaires « contrat figé » citant le rôle `manager+`/`manager` (supprimé) alors que le code impose `admin+` partout → doc-drift trompeur. |
| Q036 | 2026-07-20 | dette | basse | S | `components/admin/broadcast/TwitchStatusPanel.tsx:183-185` | open | Commentaire annonçant l'iframe chat Twitch bloquée par la CSP tant que `frame-src` n'est pas complété, alors que `proxy.ts:32` l'a déjà ajouté dans le même commit (`8aa4d1ab`). |
| Q037 | 2026-07-20 | a11y | basse | M | `components/admin/director/TimelineBuilder.tsx`, `SegmentCard.tsx` | open | Réordonnancement des segments via drag-and-drop HTML5 natif uniquement ; aucune alternative clavier malgré `role="button"`/`tabIndex` sur chaque carte. |
| Q038 | 2026-07-20 | a11y | basse | S | `components/admin/site-settings/TeamRolesPanel.tsx:302,323,376` | open | Boutons icône-seule (monter/descendre/supprimer un rôle) exposés seulement via `title`, sans `aria-label`. |
| Q039 | 2026-07-20 | a11y | basse | S | `pages/admin/teams/[teamId]/edit.tsx:1302-1304` | open | `target="_blank"` (lien interne « page publique de l'équipe ») sans `rel="noopener noreferrer"` (même famille que Q016). |
| Q040 | 2026-07-20 | secu-front | moyenne | S | `components/Header/header.tsx:73-77` | open | Lien externe `discord.gg` en `target="_blank"` sans `rel`, présent dans le header global (toutes pages publiques) → reverse-tabnabbing. |
| Q041 | 2026-07-20 | dette | moyenne | L | `pages/team/create.tsx` (1712), `pages/admin/users/[userId]/player-view.tsx` (1601), `pages/admin/users/manage.tsx` (1552), `utils/dashboard/buildTournamentDashboard.ts` (1464) | open | God-components >1400 LOC non précédemment loggés (hors liste Q018) — extraire en sous-composants/helpers. |

---

### Agenda scrim — livré 2026-07-10

3 lots livrés en prod (commits `a72a994`, `f13d2d0`, `9cfaa3d`) : **joueur** (garde « modifications non enregistrées » + encart « meilleur créneau commun »), **admin agenda** (plage horaire dynamique + layout anti-collision côte-à-côte), **admin validation** (aperçu des conflits de double-booking avant clic). Reliquat qualité → Q022–Q026 ci-dessus. Améliorations **produit/UX** restantes (hors périmètre de ce backlog qualité, à verser dans [BACKLOG-tournois.md](./BACKLOG-tournois.md) si souhaité) : vue mois côté joueur, feedback d'échéance in-app (« X jours pour peindre »), indicateur de participation côté joueur (« on attend l'autre équipe »), vue mois admin avec « +N » déroulable, auto-save des dispos, unification des 3 idiomes temporels (datetime-local négociation / grille When2Meet / agenda drag&drop).

---

*Dernier passage auto : 2026-07-10 (seed manuel) → **2026-07-20** (dimension tournante : `secu-front`) — 15 nouveaux (1 haute, 9 moyennes, 5 basses), 0 passés en `done` (progrès partiels non probants sur Q018/Q019/Q021/Q026 — pattern pas entièrement disparu), 0 tronqués.*
