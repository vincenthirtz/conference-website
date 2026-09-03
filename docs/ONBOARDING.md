# Self-service tenant onboarding

End-to-end flow for a user to create a new tenant by inviting the Discord
bot onto their own server.

## Flow

1. **Form submission** (`/onboard/request`, Discord OAuth gated)
   → `POST /api/onboard/tenant-request`
   → row in `tenant_requests` with `status='pending_email_verification'`
   → Brevo email "Confirmez votre demande" with one-time verification link.

2. **Email click**
   → `GET /api/onboard/verify-email?token=...`
   → atomic UPDATE to `status='pending_bot_invite'` + wipe of the
   verification token + 302 redirect to `/onboard/invite-bot/[id]`.

3. **Bot invite** (Discord OAuth URL built from `DISCORD_CLIENT_ID` and
   `DISCORD_BOT_PERMISSIONS` env vars, returned by
   `GET /api/onboard/status/[id]`)
   → bot's `guildCreate` handler calls `POST /api/bot/v1/tenants/link-guild`
   with `owner_discord_id` = the user's snowflake.
   → site auto-detects the matching `tenant_requests` row and atomically
   materialises `tenants` + `discord_guilds` + `tenant_secrets`
   (sha256-hashed API key, plain HMAC webhook secret) + `staff` (if
   requester is Supabase-signed) + `tenant_staff` (role `owner`) +
   `tenant_discord_config` (empty).
   → Brevo "Votre bot est prêt" email with a single-use reveal URL
   (`/onboard/secrets/<token>`, TTL 1h).

4. **Secrets reveal**
   → `GET /api/onboard/secrets/[token]`
   → returns `{ botApiKey, botWebhookSecret, instructions }` exactly once.
   → the column `pending_secrets_reveal` is wiped + `secrets_revealed_at`
   stamped via an atomic UPDATE.

5. **Status** = `completed`. Le tenant est créé avec un **essai de 30 jours**
   en plan `regie` (`plan_is_trial = true`) : sans lui, le tenant naîtrait en
   `discovery`, plan qui n'inclut pas le bot, et le gate baseline de
   `withBotRoute` répondrait 403 sur toutes les routes tenant-scopées — un bot
   installé mais muet. À l'échéance, le cron `plan-renewal` le repose sur
   `discovery` (cf. `utils/billing/planFeatures.ts`).

## Trois chemins de création, un seul résultat

Un espace peut naître de trois façons, et toutes trois posent le même essai de
30 jours (`utils/billing/trial.ts`) :

| Chemin                                              | Déclencheur                          |
| --------------------------------------------------- | ------------------------------------ |
| Auto-claim self-service                              | invitation du bot après une demande  |
| Création par le staff                                | `/admin/onboarding` ou `/admin/tenants` |
| Rattachement d'un serveur en attente                 | `pending_guild_links` → claim        |
| Rattachement depuis l'espace                         | `/admin/onboarding?tab=readiness`     |

L'uniformité n'est pas cosmétique : sans essai, l'espace naît en `discovery`,
plan qui n'inclut pas le bot, et le gate baseline de `withBotRoute` répond 403
sur toute route tenant-scopée. On livrerait un bot installé et muet.

Exception : les espaces `kind = developer` (portail développeur) restent en
`discovery` — ils portent des clés d'API, pas un tournoi.

## Ce que reçoit un nouvel espace

Trois surfaces, et trois seulement :

| Surface        | Comment le tenant est résolu                                      |
| -------------- | ------------------------------------------------------------------ |
| Bot Discord    | la clé d'API, arbitrée par `x-guild-id` (cf. section suivante)      |
| Back-office    | la session staff (tenant actif, `utils/adminTenants.ts`)           |
| API            | le token pour l'API authentifiée, `?tenant=<slug>` pour l'anonyme   |

**Pas de site public.** Un espace n'a pas de pages `/<espace>/...` : le site
public reste celui de l'association, et owwomenscup.fr ne change pas. Le champ
`tenants.custom_domain` sert au branding et à l'API, pas à servir des pages.

## Quel bot sert le nouveau serveur ?

Le bot invité est **le nôtre** : l'URL d'invitation est construite avec notre
`DISCORD_CLIENT_ID`. Ce process mutualisé ne porte qu'une `BOT_API_KEY`, et le
site résout le tenant depuis la clé — sans précaution, une commande lancée
depuis le serveur du nouveau tenant écrirait donc chez le propriétaire de la
clé.

D'où la **clé plateforme** (`tenant_secrets.is_platform_key`, opt-in, fausse par
défaut) : une clé ainsi marquée peut agir pour un autre tenant, et c'est le
serveur d'origine — `x-guild-id`, vérifié contre `discord_guilds` — qui
détermine lequel. Le bot envoie ce header sur tous ses appels tenant-scopés
(guild ambiant, cf. `services/discord-bot/request-context.js`).

Les secrets révélés à l'étape 4 restent utiles pour qui veut **auto-héberger**
son bot : une clé ordinaire est strictement scopée à son tenant, ne peut pas
en changer, et ne voit que ses propres serveurs et events sur les résolveurs
globaux (`/tenants/all-configs`, `/events/pending`, `/cast/upcoming`).

## Envoi d'emails : le tenant apporte son compte

L'email de fin d'onboarding le dit explicitement, avec le lien vers le
réglage : sans ça, l'absence d'envoi se découvre le jour d'un rappel de
check-in manqué.

Un espace **n'emprunte jamais notre compte Brevo**. Tant qu'il n'a pas
enregistré le sien (`PUT /api/admin/email/credentials` → `integration_secrets`
`brevo_api_key` / `brevo_from_email` / `brevo_from_name`), `sendEmail` refuse
proprement avec `email_not_configured` et journalise ; le reste de la
plateforme (bot, site, Discord) fonctionne normalement.

La raison n'est pas seulement technique : un email transactionnel part d'un
domaine, consomme un quota et construit une réputation d'expéditeur. Les
plaintes pour spam d'un tiers retomberaient sur notre domaine.

La **marque** des emails suit le tenant (nom, logo, lien — cf.
`utils/emailBrand.ts`) : le gabarit émet des jetons `{{BRAND_*}}` que
`sendEmail` remplace. Sans `tenantId`, le rendu est identique à l'octet près à
l'historique. Le lien pointe vers le `custom_domain` de l'espace s'il en a
déclaré un ; à défaut, vers la plateforme.

## Storage notes

- `tenant_requests.pending_secrets_reveal` is `jsonb`, plain text. RLS is
  service-role only on this table (same security envelope as
  `tenant_secrets.bot_webhook_secret`). The blob is wiped on first reveal.
- `tenant_requests.secrets_reveal_token` is a 32-byte hex token (single use,
  1h TTL).
- `tenant_requests.email_verification_token` is a 32-byte hex token (single
  use, no explicit TTL — the row is rolled to `expired` if a future cron
  fires).
- Unique partial indexes on `tenant_requests` enforce :
  - at most one active request per Discord user (`uq_tenant_requests_active_per_user`)
  - at most one active request per slug (`uq_tenant_requests_active_slug`)

## Environment variables

| Variable                            | Scope       | Required   | Used by                               | Notes                                                                                                                          |
| ----------------------------------- | ----------- | ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `TURNSTILE_SECRET_KEY`              | server-side | yes (prod) | `utils/turnstile.ts`                  | If unset in production, all submissions fail closed with `missing-server-secret`. Unset in non-prod = bypass.                  |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`    | client-side | yes (prod) | UI agent's `<Turnstile />` widget     | Public Cloudflare site key. Must be paired with the secret above (same Turnstile widget).                                      |
| `DISCORD_CLIENT_ID`                 | server-side | yes        | `utils/onboard.ts::buildBotInviteUrl` | Discord application client id. Without it, `/api/onboard/status/[id]` returns `botInviteUrl: null` (the UI must surface this). |
| `DISCORD_BOT_PERMISSIONS`           | server-side | no         | `utils/onboard.ts::buildBotInviteUrl` | Bitfield string. Defaults to `1099780063312` — keep an eye on parity with `services/discord-bot/permissions.js`.               |
| `SITE_URL` / `NEXT_PUBLIC_SITE_URL` | both        | yes        | `utils/onboard.ts::getSiteUrl`        | Used to build verify/reveal/redirect URLs in emails and redirects.                                                             |
| `BREVO_API_KEY`                     | server-side | yes        | `utils/email.ts`                      | Compte de la PLATEFORME uniquement. Un tenant enregistre le sien (cf. « Envoi d'emails »).                                                                                  |
| `EMAIL_FROM` / `EMAIL_FROM_NAME`    | server-side | yes        | `utils/email.ts`                      | Existing.                                                                                                                      |

All variables above must be set on Netlify (Site settings → Environment
variables) for the prod deploy. **None of them are set automatically by the
API agent** — coordinate with the operator before flipping the feature on.

### Frontend env vars (UI agent)

| Variable                         | Scope        | Required   | Used by                                                       | Notes                                                                                                                             |
| -------------------------------- | ------------ | ---------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | client       | yes (prod) | `pages/onboard/request.tsx`                                   | Public Cloudflare site key for the Turnstile widget. Missing in dev → form falls back to a warning but still submits.             |
| `DISCORD_CLIENT_ID`              | server (SSR) | yes        | `pages/onboard/invite-bot/[id].tsx` (via `buildBotInviteUrl`) | Without it, the invite button shows a "missing env" error.                                                                        |
| `DISCORD_BOT_PERMISSIONS`        | server       | no         | `utils/onboard.ts::buildBotInviteUrl`                         | Default bitfield `1099780063312`. `TODO`: keep in sync with `services/discord-bot/permissions.js` in the docker-box sibling repo. |

### Public UI pages

| Route                          | Purpose                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| `/onboard`                     | Marketing landing + CTA. Detects auth state via `useAuthSession`.      |
| `/onboard/request`             | Discord-OAuth-gated form. Posts to `/api/onboard/tenant-request`.      |
| `/onboard/check-email?id=<id>` | Post-submit waiting page. Polls `/api/onboard/status/[id]` every 5s.   |
| `/onboard/invite-bot/[id]`     | SSR + auth-gated. Renders the bot invite OAuth URL + polls completion. |
| `/onboard/secrets/[token]`     | SSR fetch of `/api/onboard/secrets/[token]` (one-shot reveal).         |

The widget is wrapped via `@marsidev/react-turnstile@^1.5.2` (only new
dependency added). All onboarding pages set `noindex: true` in their `seo`
prop except `/onboard` (the marketing landing is indexable).

## Operational notes

- **Email resend** is NOT yet supported. If the verification or reveal email
  fails to deliver, the operator must contact staff. `TODO(V2)` to ship a
  `POST /api/onboard/resend` that:
  - rate-limits per Discord user,
  - regenerates the token (so an old link can't sneak in),
  - resends the appropriate template based on `status`.
- **Auto-claim rollback** is best-effort (no Postgres transaction). If a
  step fails mid-way we delete the children we created before bubbling a 500. Long-term we should move the whole sequence into a SQL function
  `create_tenant_from_request(p_request_id, p_guild_id, p_guild_name)` so
  Postgres gives us a real atomic commit/rollback.
- The `pending_guild_links` fallback row stays in the DB if the auto-claim
  is later attempted with a stale `owner_discord_id` (e.g. the bot is
  re-invited after the request row has been deleted).

## Rattacher un serveur à la main

Deux chemins, selon le point de départ — et il fallait les deux :

| Point de départ | Écran | Endpoint |
| --- | --- | --- |
| Un SERVEUR attend | `/admin/onboarding?tab=guild-links` | `POST /api/admin/pending-guild-links/:guildId/claim` |
| Un ESPACE n'a pas de serveur | `/admin/onboarding?tab=readiness` | `POST /api/admin/tenants/:id/guilds` |

Le second existe parce que le premier exige une ligne dans
`pending_guild_links` : purgée, ou jamais créée, et il n'y avait plus aucun
moyen de rattacher — l'onglet « Espaces » signalait « aucun serveur Discord »
sans rien proposer. Il accepte donc aussi un identifiant de serveur saisi à la
main, purge l'attente s'il y en avait une, et refuse (409) un serveur déjà
rattaché ailleurs : le déplacer silencieusement couperait le bot de l'espace
d'origine.

Dans les deux cas, le bot prend le rattachement en compte au rafraîchissement
de son cache `tenant-config` (~5 min). Rien à redéployer.

La modale de rattachement porte aussi l'**invitation du bot** : quand un espace
n'a aucun serveur, la première question n'est pas « lequel rattacher ? » mais
« le bot y est-il ? ». Inviter → rafraîchir → rattacher s'enchaînent au même
endroit. L'URL d'invitation vient du serveur (`buildBotInviteUrl`, dépendante
de `DISCORD_CLIENT_ID`) et vaut `null` si l'environnement ne la fournit pas —
l'écran le dit au lieu d'afficher un bouton mort.

Enfin, chaque serveur d'un espace est listé avec un lien direct vers SES
réglages (`/admin/tenants/:id/discord-config/:guildId`) et le nombre de clés
déjà renseignées. L'écran de réglages est par serveur : y renvoyer directement
évite le détour par la fiche de l'espace, où il fallait retrouver le bon
serveur. Ce formulaire n'est volontairement pas dupliqué dans une modale — ses
champs doivent rester en phase avec les colonnes DB et la whitelist du PUT, et
une quatrième copie de cette liste serait une occasion de plus de les
désynchroniser.
