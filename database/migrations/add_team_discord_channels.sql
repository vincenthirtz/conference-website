-- Migration: add_team_discord_channels.sql
-- Date: 2026-08-30
--
-- WHY:
--   Le cron `team-channel-reconcile` est supprimé. En deux heures il a détruit
--   les salons d'une équipe vivante, puis recréé quatre salons et deux rôles
--   dont personne ne voulait. Les deux fois le code était défendable ; c'est
--   son AUTONOMIE qui ne l'était pas. Un salon Discord porte de l'historique,
--   des permissions et des habitudes : ce n'est pas une ressource qu'on
--   réconcilie en silence toutes les 24 h.
--
--   La gestion passe donc dans l'admin du site, où quelqu'un décide. Mais le
--   site ne voit pas Discord — seul le bot a le token. Il lui faut donc un
--   endroit où déposer ce qu'il voit, que l'admin puisse lire.
--
-- WHAT:
--   `team_discord_channels` : la PHOTO de l'état Discord d'une équipe, telle
--   que le bot l'a vue. Une ligne par équipe, remplacée à chaque rafraîchi.
--
--   Ce n'est PAS une source de vérité, et c'est important : la vérité est dans
--   Discord. `teams.discord_channel_id` reste le mapping officiel ; cette table
--   dit seulement « au moment où j'ai regardé, voilà ce qui existait vraiment ».
--   D'où `captured_at` : une photo sans date induit en erreur plus qu'elle
--   n'informe.
--
--   `access` liste qui peut entrer, avec le CHEMIN par lequel : le rôle
--   d'équipe, ou une permission individuelle posée sur le salon. La distinction
--   n'est pas cosmétique — retirer quelqu'un se fait au bon endroit, sinon on
--   croit l'avoir sorti alors qu'il rentre encore par l'autre.
--
-- CAVEATS:
--   - PK = `team_id` : une seule photo par équipe, la dernière. On ne garde pas
--     d'historique — personne n'a besoin de savoir qui avait accès mardi.
--   - RLS activée SANS policy : service_role uniquement. L'admin lit via ses
--     handlers, le bot écrit via `/api/bot/v1/team-channels/snapshot`.
--   - `role_exists` / `*_channel_exists` sont explicites plutôt que déduits d'un
--     id non nul : un id peut parfaitement pointer sur un salon supprimé, et
--     c'est même le cas qui nous intéresse le plus.
--   - Reload PostgREST : nouvelles FK.
--   - Idempotente. Rollback : DROP TABLE public.team_discord_channels;

BEGIN;

CREATE TABLE IF NOT EXISTS public.team_discord_channels (
  team_id uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  role_id text,
  role_name text,
  role_exists boolean NOT NULL DEFAULT false,

  text_channel_id text,
  text_channel_name text,
  text_channel_exists boolean NOT NULL DEFAULT false,

  voice_channel_id text,
  voice_channel_name text,
  voice_channel_exists boolean NOT NULL DEFAULT false,

  -- [{ discordUserId, username, source: 'role' | 'text' | 'voice' }]
  access jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Ce que le bot n'a pas su faire (salon introuvable, permissions manquantes).
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,

  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_discord_channels_tenant
  ON public.team_discord_channels (tenant_id);

COMMENT ON TABLE public.team_discord_channels IS
  'Photo de l''etat Discord d''une equipe, vue par le bot. PAS une source de verite : Discord l''est. Alimente l''ecran admin de gestion des salons.';
COMMENT ON COLUMN public.team_discord_channels.captured_at IS
  'Quand le bot a regarde. Une photo sans date induit en erreur plus qu''elle n''informe.';
COMMENT ON COLUMN public.team_discord_channels.access IS
  'Qui peut entrer et PAR QUEL CHEMIN (role d''equipe / permission individuelle sur le salon texte / sur le vocal). Retirer quelqu''un se fait au bon endroit.';

ALTER TABLE public.team_discord_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_discord_channels_select ON public.team_discord_channels;

COMMIT;

NOTIFY pgrst, 'reload schema';
