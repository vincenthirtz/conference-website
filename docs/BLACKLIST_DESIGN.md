# Blacklist joueurs — conception & plan d'implémentation

> Étude validée le 2026-06-25. Feature transverse `conference-website` ⇄ `docker-box` (bot Discord).

## Objectif

Enregistrer les pseudos / battletags / comptes Discord bannis. Quand un joueur banni
**s'inscrit ou est inscrit** (compte, équipe, ajout par capitaine), les admins sont
**alertés** (l'inscription n'est **pas** bloquée). Le bot Discord lit la liste et
**scanne les membres** du serveur pour alerter si un pseudo banni y figure.

## Décisions produit (verrouillées)

- **Action à l'inscription** : alerter seulement, ne pas bloquer (décision humaine ensuite).
- **Critères de match** : `battle_tag` + `display_name` (pseudo) + `discord_user_id`. **Pas** l'email.
  - battletag / discord_id = match **fort** ; pseudo = match **faible (soft)**. Tout déclenche
    une alerte, mais l'alerte indique le critère touché.
- **Gestion de la liste** : page admin (`/admin/moderation/blacklist`) **et** commande slash `/blacklist`.

## Modèle de données

Table Supabase `player_blacklist` (multi-tenant, RLS service-role only) :

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `tenant_id` | uuid | scope tenant |
| `battle_tag` | text NULL | normalisé lowercase à l'écriture |
| `display_name` | text NULL | pseudo, comparé en insensible casse / trigram |
| `discord_user_id` | text NULL | id Discord numérique |
| `reason` | text NULL | motif du ban |
| `notes` | text NULL | contexte interne |
| `banned_by` | uuid NULL | staff auteur (FK auth.users) |
| `active` | bool NOT NULL DEFAULT true | soft-disable sans suppression |
| `created_at` | timestamptz DEFAULT now() | |
| `updated_at` | timestamptz DEFAULT now() | |

- CHECK : au moins un de `battle_tag`, `display_name`, `discord_user_id` non NULL.
- Index : `(tenant_id, battle_tag)`, `(tenant_id, discord_user_id)`, trigram sur `display_name`
  (`pg_trgm`), `(tenant_id, active)`.

## Côté site (conference-website)

### Helper de vérification
`utils/moderation/blacklist.ts` → `checkBlacklist(supabase, tenantId, { battleTag, displayName, discordUserId })`
renvoie `{ matched: boolean, entries: [{ id, matchedOn: 'battle_tag'|'display_name'|'discord_user_id', strength: 'strong'|'soft', reason }] }`.

### Points d'interception (émettent event + log, ne bloquent pas)
- `pages/api/auth/register.ts` — création de compte (battleTag/displayName en metadata).
- `pages/api/teams/create-with-member.ts` — création équipe + membres.
- `pages/api/teams/add-member.ts` — ajout par capitaine.

Sur match :
```ts
await emitBotEvent('registration.blacklisted', {
  matchedOn, strength, reason, battleTag, displayName, context /* 'register'|'team_create'|'add_member' */
}, tenantId);
await logStaffAction({ action: 'registration_blacklisted', entity_type: 'registration', payload: {...}, tenant_id });
```

### Event
Ajouter `'registration.blacklisted'` à `BotEventName` dans `utils/botEvents.ts` et à la liste
`notification_prefs.event_type` (migration `create_web_push_tables.sql` + doc). Le dispatcher
Web Push alerte les staff sous ~1 min ; l'outbox pousse aussi vers le bot.

### Page admin
`/admin/moderation/blacklist` (minRole manager) : CRUD entrées, recherche, toggle `active`,
affichage `reason` / `banned_by` / `created_at`. Endpoints `pages/api/admin/moderation/blacklist/*`
(GET list, POST create, PATCH/DELETE par id) avec `logStaffAction`.

### Endpoint bot
`GET /api/bot/v1/moderation/blacklist` (`withBotRoute`, method GET, `crossTenant:false`,
`rateLimit:'bot-moderation'`) → `{ blacklist: [{ id, battleTag, displayName, discordUserId, reason }] }`
(entrées `active` du tenant).

## Côté bot (docker-box/services/discord-bot)

- `api-client.js` : `getBlacklist(guildId)`, `addBlacklistEntry(...)`, `removeBlacklistEntry(...)`.
- `blacklist.js` (nouveau) : cache TTL 5 min ; `matchMember(member)` résout
  `discord_user_id → battle_tag` (via snapshot role-sync / `players/by-discord`) et compare aux 3 critères.
- Handler `guildMemberAdd` dans `index.js` (à côté de `guildCreate`) → check à l'arrivée.
- Scan au boot + cron (rythme role-sync, 30 min) → rattrape les membres présents.
- Alerte : embed dans `staff_log_channel_id` via le pattern `announceInChannel`
  (battletag, critère, force, raison).
- Réception `registration.blacklisted` dans `event-dispatch.js` → poste l'alerte d'inscription.
- Commande slash `/blacklist add|remove|list` (staff only) → endpoints admin/bot.

## Sync contrat
Ajouter l'endpoint `GET /api/bot/v1/moderation/blacklist` et l'event `registration.blacklisted`
à `docs/BOT_API_CONTRACT.md` (règle de sync obligatoire).

## Lots livrables
1. **DB + interception** : migration `player_blacklist` + `checkBlacklist()` + 3 interceptions + event/log → alerte Web Push fonctionnelle.
2. **Page admin** : CRUD + endpoints admin.
3. **Endpoint bot + module bot** : `GET …/moderation/blacklist`, cache, `guildMemberAdd`, scan boot/cron, alerte channel.
4. **Commande slash + réception event** : `/blacklist`, dispatch `registration.blacklisted`, MAJ contrat.

## Extension : blacklist entités (équipes / structures-assos)

Pendant de la blacklist joueurs pour les **noms** d'équipes et de structures.
Mêmes décisions produit : alerter seulement, ne jamais bloquer la création.

- **Table** `entity_blacklist` (RLS default-deny, service-role only) :
  `id`, `tenant_id`, `entity_type` CHECK (`'team' | 'org'`), `name` NOT NULL,
  `reason`, `notes`, `banned_by` (FK auth.users SET NULL), `active` DEFAULT true,
  `created_at`, `updated_at`.
- **Matching** (`utils/moderation/entityBlacklist.ts` → `checkEntityBlacklist`) :
  fetch des entrées `active` du tenant (limit 500) puis matching **en JS**
  (liste petite, évite l'escaping PostgREST). Normalisation = trim + lowercase +
  espaces multiples réduits à un. Égalité exacte → match **fort** ; inclusion
  dans un sens OU l'autre (nom stocké normalisé ≥ 4 caractères) → **soft** :
  une structure bannie « XYZ Org » matche l'équipe « XYZ Org Blue », et
  inversement. Dédupe par id (strong > soft). Erreur DB → warn + no-match
  (un check ne fait JAMAIS échouer une création d'équipe).
- **Event** : `alertIfEntityBlacklisted(...)` (fire-and-forget, appelé depuis
  `pages/api/teams/create-with-member.ts`, `context: 'team_create'`) émet UN
  event outbox agrégé `registration.entity_blacklisted` (payload : match le
  plus fort + `matches[]` complet, cf. `BOT_API_CONTRACT.md`). Contrairement
  aux joueurs, **pas** d'insert `blacklist_alerts` (table spécifique joueurs,
  `discord_user_id` NOT NULL) — l'event outbox EST l'alerte.
- **Endpoints admin** (`withStaffRoute` minRole `admin`, `logStaffAction`
  `entity_blacklist_add|update|remove`) :
  `pages/api/admin/moderation/entity-blacklist/` — GET liste paginée (search
  ilike sur `name`, filtres `active` / `entity_type`), POST création ;
  `.../entity-blacklist/[id]` — PATCH (`name` / `entity_type` / `reason` /
  `notes` / `active`) + DELETE.

### Conversion depuis un signalement

Le formulaire public de support (`pages/support/index.tsx` →
`POST /api/support/ticket`) porte un bloc optionnel « cible signalée » :
`reported_target_type` (`player | team | org`), `reported_target_name`
(requis si un type est fourni), `reported_battle_tag` (joueur uniquement).
Ces champs sont stockés sur `support_tickets` (migration
`add_reported_target_to_support_tickets.sql`) et affichés dans l'embed
Discord du ticket (champ « Cible signalée »).

L'admin convertit ensuite le ticket en entrée de blacklist via
`POST /api/admin/support/tickets/[id]/convert-blacklist` (`withStaffRoute`
minRole `admin`, body discriminé sur `kind`) :

- `kind: 'player'` → insert `player_blacklist` (mêmes règles que le POST
  admin : ≥ 1 identifiant, battle_tag lowercase/trim, snowflake validé) ;
- `kind: 'entity'` → insert `entity_blacklist` (`entity_type` + `name` requis).

`tenant_id` = tenant courant du staff (`support_tickets` n'a pas de
tenant_id), `banned_by` = auth user du staff. La conversion est tracée sur le
ticket (`converted_player_blacklist_id` / `converted_entity_blacklist_id`,
FKs ON DELETE SET NULL) → **409** si déjà converti pour ce `kind`. Si l'UPDATE
de traçabilité échoue après l'insert, on renvoie quand même 201 (l'entrée
existe ; le lien est best-effort). Audit :
`logStaffAction('support_ticket_convert_blacklist')`. Réponse 201 :
`{ kind, entry, ticket_id }`.
