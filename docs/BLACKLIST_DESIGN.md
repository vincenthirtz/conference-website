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
