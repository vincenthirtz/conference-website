# Schéma Base de Données

Tables principales (Supabase/PostgreSQL). Migrations dans `database/migrations/`.

## Tables métier

### staff
Membres du staff avec rôles hiérarchiques.
- `id`, `auth_user_id` (FK auth.users), `email`, `role` (owner/admin/manager/caster)
- `display_name`, `avatar_url`, `created_at`

### staff_logs
Audit trail des actions staff.
- `id`, `staff_id` (FK staff), `action` (StaffLogAction), `entity_type`, `entity_id`
- `tournament_id`, `payload` (JSONB), `created_at`

### tournaments
Tournois organisés.
- `id`, `name`, `slug`, `status` (draft/published/running/completed)
- `format`, `max_teams`, dates, `created_at`

### teams
Équipes inscrites.
- `id`, `name`, `slug`, `logo_url`, `is_active`
- `captain_user_id` (FK auth.users)

### matches
Matchs de tournoi.
- `id`, `tournament_id`, `stage_id`, `round_number`
- `team1_id`, `team2_id`, `team1_score`, `team2_score`
- `winner_team_id`, `status`, `is_bye`, `scheduled_at`, `completed_at`

### tournament_maps
Maps jouées dans un match.
- `id`, `match_id`, `map_name`, `image_url`
- `team1_score`, `team2_score`, `winner_team_id`

### demandes
Demandes joueur (rejoindre équipe, devenir capitaine).
- `id`, `user_id`, `team_id`, `tournament_id`
- `type` (join/leave/captain_request/other)
- `status` (pending/approved/rejected/cancelled)
- `comment`, `staff_note`, `processed_by_staff_id`

### news
Articles de blog.
- `id`, `title`, `slug` (UNIQUE), `tag`, `excerpt`, `content`, `image_url`
- `status` (draft/published), `published_at`, `author_id` (FK staff)

### news_comments
Commentaires sur articles.
- `id`, `news_id`, `author_name`, `content`, `created_at`

## Tables contenu

### announcements
Bannières promotionnelles actives.
- `id`, `title`, `message`, `cta_label`, `cta_url`
- `is_active`, `priority`, `starts_at`, `ends_at`

### partners
Partenaires de l'association.
- `id`, `name`, `description`, `category` (super/major/cultural)
- `logo_url`, `website_url`, `display_order`, `is_active`

### partnership_requests
Demandes de partenariat.
- `id`, `company_name`, `contact_name`, `email`, `category`
- `status` (new/read/contacted/negotiating/accepted/declined/archived)

### cast_members
Casteurs/streamers de l'association.
- `id`, `name`, `title`, `description`, `image_url`, `twitch_url`
- `is_active`, `is_promo`, `sort_order`

### contact_submissions
Messages du formulaire de contact.
- `id`, `name`, `email`, `subject`, `message`
- `status` (new/read/replied/archived/spam), `ip_address`

### adherents
Membres de l'association (adhérents).
- `id`, `first_name`, `last_name`, `email`, `member_number`
- `payment_status` (pending/partial/paid/exempt/overdue)
- `role` (member/volunteer/board/president/treasurer/secretary)

### site_settings
Configuration dynamique du site (clé-valeur).
- `key` (PK), `value`, `description`, `updated_by` (FK staff)

## Tables externes

### blizzard_news / patch_notes / blizzard_media
Contenu scrapé depuis Blizzard (actualités, patchs, médias OW2).

### twitch_channels
Chaînes Twitch partenaires avec statut live.
