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
| Q022 | 2026-07-10 | a11y | moyenne | M | `components/scrim/AvailabilityGrid.tsx` (cellules 24px) | open | Drag-to-paint sur cellules 24px : cibles tactiles < 44px → peinture mobile difficile sur grille dense ; agrandir/espacer ou basculer par défaut sur la vue calendrier à blocs en < sm. |
| Q023 | 2026-07-10 | robustesse | moyenne | S | `components/admin/scrims/PlanningFormModal.tsx` (champ timezone) | done | `timezone` en champ texte libre → remplacé par un `<select>` alimenté par `Intl.supportedValuesOf('timeZone')` (optgroups Fréquents/Tous, fallback curé) : impossible de saisir un fuseau IANA invalide. |
| Q024 | 2026-07-10 | robustesse | basse | M | `components/scrim/AvailabilityCalendar.tsx`, `AvailabilityGrid.tsx` | done | L'axe horaire affiche une 2e étiquette (heure locale du visiteur, en bleu) sous l'heure de référence quand le fuseau visiteur diffère de la session — résout la confusion des équipes étrangères sans re-géométriser la grille (pas de désalignement, meilleur qu'un toggle à basculer). |
| Q025 | 2026-07-10 | a11y | basse | S | `pages/admin/scrims/plannings/[planningId].tsx` (validation heatmap) | done | Le hint de validation devient un callout toujours visible avec un swatch reproduisant la cellule planifiable (fond vert + soulignement) → l'affordance de clic est ancrée visuellement, plus besoin de survoler. |
| Q026 | 2026-07-10 | test-coverage | moyenne | M | `tests/e2e/scrim-*.spec.ts` | open | Agenda admin (ScrimCalendar drag&drop, plage dynamique, layout anti-collision) et aperçu conflits non couverts en e2e ; seul le flux grille→validation l'est (recoupe Q021). |

---

### Agenda scrim — livré 2026-07-10

3 lots livrés en prod (commits `a72a994`, `f13d2d0`, `9cfaa3d`) : **joueur** (garde « modifications non enregistrées » + encart « meilleur créneau commun »), **admin agenda** (plage horaire dynamique + layout anti-collision côte-à-côte), **admin validation** (aperçu des conflits de double-booking avant clic). Reliquat qualité → Q022–Q026 ci-dessus. Améliorations **produit/UX** restantes (hors périmètre de ce backlog qualité, à verser dans [BACKLOG-tournois.md](./BACKLOG-tournois.md) si souhaité) : vue mois côté joueur, feedback d'échéance in-app (« X jours pour peindre »), indicateur de participation côté joueur (« on attend l'autre équipe »), vue mois admin avec « +N » déroulable, auto-save des dispos, unification des 3 idiomes temporels (datetime-local négociation / grille When2Meet / agenda drag&drop).

---

*Dernier passage auto : — (aucun encore ; seed manuel du 2026-07-10 issu des audits de session + points agenda scrim Q022–Q026).*
