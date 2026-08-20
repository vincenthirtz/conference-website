-- Migration: add_discord_guild_presence.sql
-- Date: 2026-08-20
--
-- WHY:
--   Le site sait si un compte Discord est LIÉ (`user_discord_links`), pas si la
--   personne est effectivement PRÉSENTE sur le serveur. Les deux divergent dès
--   que quelqu'un lie son compte puis quitte le Discord : le site la déclare en
--   règle, le bot ne peut plus ni lui donner ses rôles, ni l'ajouter aux salons,
--   ni la convoquer. Elle n'est donc pas validable, et personne ne le voit.
--
--   Seul le bot peut trancher : c'est lui qui a la liste des membres du guild.
--   Il la connaît DÉJÀ — `role-sync` parcourt tous les comptes liés à chaque
--   sync et jette silencieusement le résultat (`if (!member) continue`). Cette
--   table est l'endroit où ce résultat atterrit.
--
-- WHAT:
--   Une ligne par (tenant, compte Discord) constaté lors du dernier sync.
--   `in_guild` = présent ou non ; `checked_at` = quand on l'a constaté.
--
--   Le bot pousse un FULL REPLACE par tenant (POST /api/bot/v1/role-sync/
--   presence) : il vient de parcourir l'ensemble des comptes liés, sa vue est
--   complète. Les lignes absentes du payload sont donc périmées, pas
--   manquantes.
--
-- POURQUOI PAS UNE COLONNE SUR user_discord_links:
--   Cette table est GLOBALE (un compte Discord se lie une fois, tous tenants
--   confondus). La présence, elle, est par GUILD : la même personne peut être
--   sur le serveur du tenant A et pas sur celui du tenant B. Une colonne
--   `in_guild` sur le lien global écraserait l'un avec l'autre.
--
-- POURQUOI discord_user_id ET PAS auth_user_id:
--   C'est la clé que le bot manipule. Passer par auth_user_id l'obligerait à
--   résoudre le lien de son côté, alors que le site le fait déjà mieux — et un
--   compte Discord présent sur le serveur SANS compte site reste représentable
--   si le besoin apparaît.
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS partout).
--   - RLS activée sans policy : lecture/écriture service_role uniquement, comme
--     les autres tables alimentées par le bot. Aucun accès client direct.
--   - Absence de ligne = « on ne sait pas », JAMAIS « absent du serveur ». Les
--     lecteurs doivent distinguer les deux (cf. utils/teams/rosterReadiness.ts).

BEGIN;

CREATE TABLE IF NOT EXISTS public.discord_guild_presence (
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  discord_user_id text NOT NULL,
  in_guild boolean NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, discord_user_id)
);

COMMENT ON TABLE public.discord_guild_presence IS
  'Présence constatée sur le serveur Discord d''un tenant, poussée par le bot '
  'à chaque role-sync (POST /api/bot/v1/role-sync/presence). Une ligne absente '
  'signifie « non constaté », pas « absent du serveur ».';

COMMENT ON COLUMN public.discord_guild_presence.in_guild IS
  'true = le compte était membre du guild lors du dernier constat.';

-- Les lectures se font par tenant (le roster d''une équipe), jamais par compte
-- Discord seul : la PK (tenant_id, discord_user_id) les couvre déjà en préfixe.
-- Un index dédié sur discord_user_id serait du poids mort.

ALTER TABLE public.discord_guild_presence ENABLE ROW LEVEL SECURITY;

COMMIT;
