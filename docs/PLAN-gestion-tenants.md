# Gestion des espaces (tenants) — plan d'amélioration

> Rédigé le 3 septembre 2026, sur l'état du code à `a9bb86de` et la base de
> production `owwomenscup`. Rien de ce qui suit n'est livré : c'est un plan.

## Constat

La plateforme sait **créer** un espace et **le régler**. Elle ne sait presque
rien en **dire** ensuite, et pas grand-chose en **faire sortir**.

Le parcours d'entrée est complet : demande self-service, vérification email,
rattachement du serveur Discord, secrets bot, configuration des salons, et
depuis peu une lecture de mise en service (`/admin/onboarding`, onglet
« Espaces »). Le parcours de vie, lui, s'arrête à un formulaire d'édition.

Six trous, tous vérifiables :

| Constat | Preuve |
|---|---|
| Des limites de plan déclarées mais **appliquées nulle part** | `maxLeagues` n'apparaît que dans sa propre définition (`utils/billing/planFeatures.ts:59`) — zéro appelant dans `pages/` |
| Aucune vue de **consommation** côté plateforme | `/api/admin/api-usage` n'a qu'un seul consommateur : `pages/developpeurs/dashboard.tsx:119`, scopé au tenant appelant |
| On ne peut **rattacher** que quelqu'un qui existe déjà | `POST /tenants/[id]/staff` → `404 STAFF_NOT_FOUND` (`pages/api/admin/tenants/[id]/staff/index.ts:139`) |
| Le **domaine propre** est un champ texte non vérifié | validation de syntaxe seule (`pages/api/admin/tenants/[id].ts:235`), aucun état, aucune preuve de possession |
| Le **cycle de vie** s'arrête à un booléen | `DELETE` = `is_active = false` (`pages/api/admin/tenants/[id].ts:294`) ; pas de motif, pas de purge, pas de sortie de données |
| La **rotation des secrets** coupe le bot en place | une seule empreinte dans `tenant_secrets.bot_api_key_hash` : la nouvelle clé invalide l'ancienne à la milliseconde |

Deux chiffres à garder en tête pour dimensionner :

- **96 tables** portent une colonne `tenant_id` en production. Toute opération
  transverse (export, purge, statistiques) écrite à la main sera fausse le jour
  où la 97ᵉ arrive.
- **2 espaces** en base aujourd'hui. C'est peu — et c'est exactement le moment
  d'outiller, avant que les gestes manuels ne deviennent une habitude.

## Principes

1. **Ce qu'un plan promet, le code l'applique.** Une limite affichée et non
   tenue trompe le client dans un sens, et nous dans l'autre.
2. **Un espace se raconte avant de se régler.** La fiche doit répondre à « que
   se passe-t-il ici ? » avant « que puis-je changer ? ».
3. **Rien de transverse à la main.** Les 96 tables `tenant_id` s'adressent par
   un manifeste déclaratif, jamais par une liste recopiée.
4. **Un geste lourd se motive.** Suspendre, purger, changer un plan : motif
   obligatoire, journal, et réversibilité tant qu'elle est possible.
5. **Pas d'écran de plus sans un manque en moins.** Le hub d'onboarding vient
   de perdre deux onglets pour cette raison ; le principe vaut ici.

## Les dix lots

| Lot | Titre | Répond à | Dépend de | Coût |
|---|---|---|---|---|
| T1 | Vue d'ensemble d'un espace | « il se passe quoi ici ? » | — | M |
| T2 | Les limites du plan deviennent réelles | promesse ≠ code | — | M |
| T3 | Consommation et alertes, côté plateforme | facturer et anticiper | T2 | M |
| T4 | Cycle de vie : suspendre, archiver, purger | sortir proprement | T1 | L |
| T5 | Export et effacement par espace | RGPD, réversibilité | T4 | L |
| T6 | Inviter un membre, pas seulement le rattacher | friction quotidienne | — | M |
| T7 | Domaine propre vérifié | sécurité, erreurs muettes | — | M |
| T8 | Secrets : rotation sans coupure | exploitation | — | S |
| T9 | Journal et responsabilité par espace | traçabilité | T4 | S |
| T10 | Renouvellement et facturation self-service | revenu récurrent | T2, T3 | L |

Ordre conseillé : **T1 → T2 → T8 → T6 → T7 → T3 → T4 → T9 → T5 → T10**. Les
quatre premiers se livrent sans migration lourde et rendent la suite lisible.

---

## T1 — Vue d'ensemble d'un espace

### Ce qui cloche

`/admin/tenants/[id]` a trois onglets — Général, Discord, Staff — qui montrent
tous **ce qu'on peut changer**. Aucun ne dit ce qui se passe. Un espace créé il
y a trois semaines et jamais utilisé est indiscernable d'un espace en pleine
saison : même fiche, mêmes champs remplis.

L'onglet « Espaces » du hub d'onboarding dit ce qui **manque** (`blockers`,
`pages/api/admin/tenants/readiness.ts:315`). Il ne dit rien de ce qui **vit**.

### Ce qu'on livre

Un onglet « Vue d'ensemble », premier et par défaut, en trois bandes :

- **Signes de vie** — dernier événement bot reçu, dernier match joué, dernière
  connexion staff, dernière écriture API. Chaque ligne porte une date relative
  et vire à l'ambre au-delà de 30 jours.
- **Volumétrie** — équipes, joueuses inscrites, tournois (par statut), matchs
  joués, tickets ouverts. Chaque nombre est un lien vers la liste filtrée.
- **Situation** — plan effectif, essai et échéance, manques de readiness
  (repris tels quels, sans les recalculer), consommation API du mois (T3).

### API

```
GET /api/admin/tenants/[id]/overview
→ { lifeSigns: {...}, volumes: {...}, plan: {...}, blockers: string[] }
```

Une seule requête, agrégée côté serveur. Owner, ou staff rattaché à cet espace
(la fiche l'est déjà). `Cache-Control: no-store`.

Les compteurs viennent d'un **manifeste** (`utils/tenantScope.ts`, introduit
ici et réutilisé par T3, T4 et T5) qui déclare, pour chaque domaine, la table
et la colonne de date :

```ts
export const TENANT_DOMAINS = [
  { key: 'teams',       table: 'teams',       dateCol: 'created_at' },
  { key: 'tournaments', table: 'tournaments', dateCol: 'created_at' },
  // …
] as const;
```

### Fait quand

- L'onglet est le premier, et l'ancien `?tab=general` continue de fonctionner.
- Un espace sans aucune activité l'affiche en toutes lettres, pas par des zéros.
- Aucune de ces lectures ne peut faire échouer la page : une agrégation en
  erreur affiche « indisponible » sur sa seule ligne.
- La page reste sous son plafond de `adminFileSizeGuard` (917 lignes gelées
  pour 846 écrites : 71 de marge, donc le panneau s'extrait dans
  `components/admin/tenants/`).

### Tests

Unitaires sur l'agrégat : cloisonnement tenant (un espace ne compte jamais les
lignes d'un autre), espace vide, table en erreur → dégradation locale.

---

## T2 — Les limites du plan deviennent réelles

### Ce qui cloche

`PlanFeatures` déclare `maxLeagues`, `discordEventOps`, `whiteLabel`,
`apiRateLimitPerMin`, `apiMonthlyQuota`. Seules les deux dernières sont
appliquées (`utils/billing/apiQuota.ts`). `maxLeagues` n'a **aucun appelant** :
un espace `regie` (limite : 1 ligue) peut en créer dix.

C'est un problème dans les deux sens : le client paie pour une limite qui
n'existe pas, et la plateforme ne peut pas vendre le palier au-dessus.

### Ce qu'on livre

Un point de passage unique :

```ts
// utils/billing/planLimits.ts
export async function assertPlanLimit(
  tenantId: string,
  limit: 'leagues' | 'guilds' | 'customDomain' | 'staffSeats'
): Promise<{ ok: true } | { ok: false; code: string; used: number; max: number }>;
```

Branché sur les endpoints de création concernés (ligues, rattachement de
serveur, domaine propre, sièges staff). Refus en `402 PLAN_LIMIT_REACHED` avec
un corps qui **nomme** le plan, la limite et le palier qui la lève — jamais un
403 muet.

Côté écran : la fiche affiche « 1 / 1 ligue », « 2 serveurs (illimité) », et le
bouton de création est désactivé avec l'explication à côté, pas après le clic.

### Fait quand

- Chaque limite déclarée dans `planFeatures.ts` est soit appliquée, soit
  supprimée du type. Un test de complétude interdit d'en ajouter une sans
  appelant.
- `foundation` et `editor` (illimités) ne déclenchent aucune requête de comptage.
- Le passage à un plan inférieur ne casse pas l'existant : on **bloque la
  création**, on ne supprime jamais rétroactivement.

### Tests

Un test par limite : sous la limite → 200, à la limite → 402 avec le code et
les nombres, plan illimité → aucun comptage (spy sur le client Supabase).

---

## T3 — Consommation et alertes, côté plateforme

### Ce qui cloche

`api_usage_counters` (`tenant_id`, `window_kind`, `window_key`, `count`) est
alimenté à chaque appel authentifié. Personne ne le lit à l'échelle de la
plateforme : `/api/admin/api-usage` est scopé au tenant appelant et sert le
tableau de bord développeur. L'owner ne peut pas répondre à « qui consomme
quoi », ni voir venir un dépassement.

### Ce qu'on livre

- `GET /api/admin/tenants/usage?window=month&from=…` — owner-only, une ligne
  par espace : plan, quota, consommé, part du quota, tendance sur 3 mois.
- Une page `/admin/tenants/usage` : tableau triable, seuils colorés à 80 % et
  100 %, export CSV.
- Un cron quotidien qui prévient **une fois** par seuil franchi (80 %, 100 %) —
  email à l'owner de la plateforme et aux propriétaires de l'espace, via
  l'outbox de notifications existante.
- Sur la fiche d'un espace (T1) : la même donnée, réduite à une jauge.

### Schéma

Aucune table nouvelle. Une ligne d'état d'alerte suffit pour ne pas répéter le
même avertissement chaque jour :

```sql
alter table api_usage_counters add column alerted_at timestamptz;
```

### Fait quand

- Un espace au-delà de 80 % est visible sans le chercher.
- L'alerte ne part qu'une fois par fenêtre et par seuil (test de rejeu).
- La page tient sans pagination jusqu'à 200 espaces, et pagine au-delà.

---

## T4 — Cycle de vie : suspendre, archiver, purger

### Ce qui cloche

Un espace n'a qu'un booléen, `is_active`. « Archiver » met `false` et c'est
tout : pas de motif, pas d'auteur, pas de date, pas de retour arrière tracé, et
surtout **aucune définition partagée de ce que ça produit**. Le résolveur de
tenant refuse un espace inactif (`utils/tenant.ts:158`), mais rien ne dit au
client ce qu'il perd, ni quand ses données disparaissent — puisqu'elles ne
disparaissent jamais.

### Ce qu'on livre

Un état explicite, et des effets écrits :

| État | Site public / API | Bot Discord | Données | Réversible |
|---|---|---|---|---|
| `active` | oui | oui | — | — |
| `suspended` | 402 avec motif | refuse, message au staff | intactes | oui, immédiat |
| `archived` | 404 | déconnecté | intactes, en lecture seule | oui, par un owner |
| `purge_scheduled` | 404 | déconnecté | export livré, purge à J+30 | oui, jusqu'à J-1 |
| `purged` | 404 | — | effacées | non |

### Schéma

```sql
alter table tenants
  add column lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active','suspended','archived','purge_scheduled','purged')),
  add column lifecycle_reason text,
  add column lifecycle_changed_at timestamptz,
  add column lifecycle_changed_by uuid references staff(id),
  add column purge_after timestamptz;
```

`is_active` reste, dérivé (`lifecycle_state = 'active'`), le temps que les
lectures existantes migrent — **49 occurrences** rien que dans le périmètre
tenant (`utils/tenant.ts`, `utils/adminTenants.ts`, `pages/admin/tenants/**`,
`pages/api/admin/tenants/**`). Un trigger garantit la cohérence des deux.

### API

```
POST /api/admin/tenants/[id]/lifecycle  { state, reason, purgeAfterDays? }
```

Owner-only, motif obligatoire (10 caractères minimum), idempotent, journalisé.
Le passage à `purge_scheduled` exige un export T5 réussi et daté de moins de 7
jours — on ne programme pas une purge sans avoir rendu les données.

### Fait quand

- Les cinq états ont chacun un test d'effet : appel bot, appel API, page
  publique, accès admin.
- L'espace `conference` ne peut sortir de `active` (garde existante, étendue).
- Un espace suspendu affiche son motif à son propre staff — pas seulement à
  l'owner de la plateforme.

### Risques

Le passage d'un booléen à un état est la migration la plus risquée du plan :
toute lecture oubliée rouvre un espace fermé. D'où `is_active` conservé et
dérivé, et un test qui interdit toute nouvelle lecture directe de la colonne.

---

## T5 — Export et effacement par espace

### Ce qui cloche

Aucune sortie de données. Le hard-delete est explicitement interdit (les FK
sont en `ON DELETE RESTRICT`, commentaire en tête de
`pages/api/admin/tenants/[id].ts`), et rien ne le remplace. Un organisateur qui
part ne peut ni récupérer ses tournois, ni obtenir leur effacement — ce que le
RGPD lui donne pourtant le droit de demander.

### Ce qu'on livre

- **Export** : `POST /api/admin/tenants/[id]/export` → job asynchrone qui écrit
  une archive (JSON par domaine + CSV pour les tables plates) dans un bucket
  privé, et rend une URL signée valable 7 jours. Le contenu est piloté par le
  manifeste `TENANT_DOMAINS` de T1 : ajouter une table au manifeste l'ajoute à
  l'export.
- **Purge** : le cron de `purge_scheduled` (T4) supprime dans l'ordre inverse
  des dépendances, par lots, dans une transaction par domaine, et écrit un
  rapport ligne à ligne. Les données globales non rattachées (comptes joueuses,
  liens Discord globaux) ne sont **jamais** touchées : elles ne sont pas la
  propriété de l'espace.
- Un **certificat d'effacement** (PDF/JSON signé) horodaté, remis à
  l'organisateur.

### Fait quand

- Un export d'un espace complet se termine en moins de 5 minutes, et se rejoue
  sans doublon.
- La purge d'un espace de test laisse **zéro ligne** portant son `tenant_id` :
  un test parcourt les 96 tables et le vérifie.
- Une table ajoutée au schéma sans entrée de manifeste fait échouer un test
  dédié — c'est la seule protection contre l'oubli.

---

## T6 — Inviter un membre, pas seulement le rattacher

### Ce qui cloche

`POST /tenants/[id]/staff` exige un `staff_id` **déjà existant** en base, sinon
`404 STAFF_NOT_FOUND`. Pour donner un accès à quelqu'un qui n'a jamais mis les
pieds sur la plateforme, il faut donc lui créer un compte à la main, ailleurs,
puis revenir. C'est la friction la plus quotidienne de la gestion d'un espace.

### Ce qu'on livre

Une invitation en bonne et due forme :

```sql
create table tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email citext not null,
  role text not null,
  token_hash text not null,
  invited_by uuid not null references staff(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, email) where accepted_at is null and revoked_at is null
);
```

- `POST /tenants/[id]/invitations` — email + rôle, envoi via le compte d'envoi
  de l'espace (celui que la readiness réclame déjà), expiration 14 jours.
- `GET /invitations/[token]` — page publique d'acceptation : le compte staff
  est créé à l'acceptation, jamais avant, et le rattachement se fait dans la
  même transaction.
- Relance et révocation depuis l'onglet Staff, avec l'état de chaque invitation.

### Fait quand

- Inviter quelqu'un qui a déjà un compte le rattache directement, sans email
  d'acceptation inutile.
- Un token est à usage unique, expire, et une invitation révoquée est refusée
  avec un message clair (pas un 500).
- Le rôle proposé ne peut pas dépasser celui de l'invitant.

---

## T7 — Domaine propre vérifié

### Ce qui cloche

`custom_domain` accepte n'importe quel nom d'hôte syntaxiquement valide
(`pages/api/admin/tenants/[id].ts:235`), et le résolveur s'en sert ensuite pour
router les requêtes (`utils/tenant.ts:670`). Deux conséquences : personne ne
prouve qu'il possède le domaine qu'il déclare, et une faute de frappe produit
un site qui ne répond jamais, sans un mot d'explication.

### Ce qu'on livre

Le domaine devient un objet avec un état :

```sql
alter table tenants
  add column custom_domain_state text
    check (custom_domain_state in ('pending','verified','failed')),
  add column custom_domain_token text,
  add column custom_domain_checked_at timestamptz;
```

- À la saisie : génération d'un jeton et affichage des **deux** enregistrements
  à créer (un `TXT` de preuve, un `CNAME` de routage), copiables.
- `POST /tenants/[id]/domain/verify` : résolution DNS côté serveur, passage en
  `verified` ou `failed` avec le détail de ce qui manque.
- Un cron revérifie les domaines `verified` une fois par jour : un domaine qui
  cesse de pointer chez nous repasse en `failed` et prévient.
- **Le résolveur n'accepte qu'un domaine `verified`** — c'est le cœur du lot.

### Fait quand

- Un domaine non vérifié ne route rien, et la fiche dit pourquoi.
- Deux espaces ne peuvent pas revendiquer le même domaine (contrainte unique
  partielle sur `verified`).
- Le jeton de preuve ne fuit pas dans les journaux.

---

## T8 — Secrets : rotation sans coupure

### Ce qui cloche

`tenant_secrets` porte **une** empreinte de clé (`bot_api_key_hash`). Régénérer
invalide l'ancienne clé immédiatement : le bot en place tombe à la seconde où
l'écran affiche la nouvelle, et il faut aller la reposer sur le serveur avant
que quoi que ce soit ne refonctionne. C'est une opération à fenêtre de panne,
pour un geste qui devrait être anodin.

### Ce qu'on livre

Deux clés valides à la fois :

```sql
alter table tenant_secrets
  add column previous_key_hash text,
  add column previous_key_expires_at timestamptz,
  add column last_used_at timestamptz;
```

- La rotation déplace l'empreinte courante en `previous_*` avec une expiration
  de 48 h ; l'authentification bot accepte les deux et note laquelle a servi.
- L'écran affiche « ancienne clé encore valable 47 h », avec un bouton
  « révoquer maintenant » pour les cas de fuite.
- `last_used_at` alimente deux signaux dans la vue d'ensemble : clé jamais
  utilisée depuis sa création (installation jamais faite), et clé inutilisée
  depuis 30 jours (bot mort).

### Fait quand

- Une rotation ne produit aucun 401 pendant la fenêtre, vérifié par un test qui
  authentifie avec les deux clés.
- Passé l'expiration, l'ancienne clé est refusée.
- Une révocation immédiate coupe l'ancienne clé sans toucher à la nouvelle.

---

## T9 — Journal et responsabilité par espace

### Ce qui cloche

`staff_logs` porte un `tenant_id` depuis la reprise multi-espaces, et l'API
`/api/admin/entity-history` sait lire un journal filtré. Mais la fiche d'un
espace n'en montre rien : pour savoir qui a changé le plan, suspendu, ou fait
tourner les secrets, il faut aller dans `/admin/logs` et filtrer à la main —
en sachant quoi chercher.

### Ce qu'on livre

- Un panneau « Historique » sur la fiche (même composant que celui de la fiche
  d'équipe, `components/admin/teams/TeamHistoryPanel.tsx`, généralisé), replié
  par défaut, chargé au dépliage.
- Un **motif obligatoire** sur les gestes lourds — changement de plan,
  suspension, purge, rotation, révocation — repris dans le journal et affiché
  dans l'historique. Un journal qui dit « plan changé » sans dire pourquoi ne
  sert qu'à constater.
- Les actions de la plateforme sur un espace sont visibles **par le staff de
  cet espace** : on ne suspend pas quelqu'un en secret.

### Fait quand

- Chaque endpoint de T2, T4, T7 et T8 écrit une ligne avec son motif.
- L'historique d'un espace est lisible sans connaître la nomenclature des
  slugs d'action (libellés déjà présents dans `staffLogLabels.ts`).

---

## T10 — Renouvellement et facturation self-service

### Ce qui cloche

Le paiement existe (`plan-checkout.ts` + webhook HelloAsso), mais le geste est
manuel : un owner de la plateforme génère un lien, l'envoie, attend. Le cron
quotidien (`netlify/functions/plan-renewal-cron.ts`) fait déjà deux choses —
basculer les plans expirés en `past_due`, et relancer une fois par cycle ~14
jours avant l'échéance — mais le client, lui, ne peut rien faire seul.

Et la bascule est sèche : `isPlanEntitled` (`utils/billing/planFeatures.ts:162`)
refuse tout statut différent de `active`, donc un plan qui passe en `past_due`
retombe **immédiatement** en `discovery` — c'est-à-dire sans bot Discord, du
jour au lendemain, pour un retard de paiement d'une journée.

### Ce qu'on livre

- Un écran **« Abonnement »** dans l'espace client : plan courant, ce qu'il
  ouvre, ce que le palier au-dessus ajouterait (nourri des limites réelles de
  T2 et de la consommation de T3), et un bouton qui génère le lien de paiement
  sans passer par nous.
- Une **séquence de relance** documentée : J-14, J-3, J+0, J+7, puis
  rétrogradation. Chaque étape est un email, et l'espace affiche un bandeau à
  partir de J-3.
- Une **période de grâce** de 7 jours après échéance : le plan reste actif,
  l'espace est prévenu. Aujourd'hui la bascule est sèche.
- Un **reçu** téléchargeable par paiement, et l'historique des paiements dans
  la fiche côté plateforme.

### Fait quand

- Un client peut renouveler sans écrire à personne.
- Un essai arrivé à terme suit la séquence, et la rétrogradation est un
  événement journalisé, pas un effet de bord d'un calcul.
- Le webhook reste idempotent (déjà testé) et le reçu est rejouable.

---

## Hors périmètre, volontairement

| Sujet | Pourquoi pas maintenant |
|---|---|
| « Entrer dans l'espace » (support en tant que client) | Le motif `?as=` existe pour les joueuses (`utils/subject.ts`) ; l'étendre aux espaces demande de rejouer tout le modèle de permissions. À rouvrir après T9, qui en pose la traçabilité. |
| Modèles d'espace (préréglages de tournoi, rôles, salons) | Utile à partir d'une dizaine d'espaces. Avec deux, le gain est nul et le risque de figer de mauvais défauts est réel. |
| SSO / SCIM par espace | Aucun client ne le demande. T6 couvre le besoin réel (donner un accès). |
| Facturation multi-devises, TVA, factures conformes | HelloAsso couvre le cadre associatif actuel. À rouvrir si un client hors association arrive. |
| Isolation physique (base par espace) | Le cloisonnement par `tenant_id` tient à cette échelle. Un changement de modèle coûterait plus que tout ce plan réuni. |

## Ce que ce plan ne résout pas

Rien ici ne rend l'espace **plus facile à remplir**. Un organisateur qui a un
espace opérationnel et vide reste un organisateur qui n'a pas encore de
tournoi : c'est le sujet de `docs/BACKLOG-acquisition-joueuses.md` et de
`docs/BACKLOG-tournois.md`, pas celui-ci.
