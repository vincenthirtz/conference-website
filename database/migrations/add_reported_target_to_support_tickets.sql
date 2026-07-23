-- Migration: Cible signalée + traçabilité de conversion sur support_tickets
-- Date: 2026-07-23
--
-- WHY:
--   Feature « conversion signalement → blacklist ». Le formulaire public de
--   support gagne un bloc structuré optionnel « personne/équipe concernée » :
--   qui est visé par le signalement (joueur, équipe ou structure), avec un
--   battletag optionnel pour permettre un match fort côté joueur. L'admin
--   pourra ensuite convertir le ticket en entrée de blacklist joueur
--   (player_blacklist) ou entité (entity_blacklist) ; les deux FKs
--   converted_*_blacklist_id tracent cette conversion (un badge admin
--   s'appuiera dessus pour signaler les tickets déjà convertis).
--
-- CAVEATS:
--   - Toutes les colonnes sont NULLables : le bloc du formulaire est
--     optionnel, les tickets existants ne sont pas backfillés.
--   - FKs en ON DELETE SET NULL : supprimer une entrée de blacklist ne doit
--     jamais supprimer le ticket d'origine, on perd juste le lien.
--   - Nouvelles FKs → recharger le schema cache PostgREST après application
--     (le NOTIFY final s'en charge si exécuté via SQL Editor / apply_migration).

BEGIN;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS reported_target_type text,
  ADD COLUMN IF NOT EXISTS reported_target_name text,
  ADD COLUMN IF NOT EXISTS reported_battle_tag text,
  ADD COLUMN IF NOT EXISTS converted_player_blacklist_id uuid,
  ADD COLUMN IF NOT EXISTS converted_entity_blacklist_id uuid;

-- CHECK nommé, ré-appliqué de façon idempotente (DROP puis ADD).
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_reported_target_type_chk;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_reported_target_type_chk
    CHECK (reported_target_type IN ('player', 'team', 'org'));

-- FKs nommées vers les tables de blacklist, ajout idempotent.
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_converted_player_blacklist_id_fkey;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_converted_player_blacklist_id_fkey
    FOREIGN KEY (converted_player_blacklist_id)
    REFERENCES public.player_blacklist(id) ON DELETE SET NULL;

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_converted_entity_blacklist_id_fkey;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_converted_entity_blacklist_id_fkey
    FOREIGN KEY (converted_entity_blacklist_id)
    REFERENCES public.entity_blacklist(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.support_tickets.reported_target_type IS
  'Type de cible signalée : player, team ou org. NULL si le bloc optionnel n''est pas rempli.';
COMMENT ON COLUMN public.support_tickets.reported_target_name IS
  'Pseudo du joueur ou nom de l''équipe/structure signalé(e). Texte libre saisi par le reporter.';
COMMENT ON COLUMN public.support_tickets.reported_battle_tag IS
  'Battletag optionnel si la cible est un joueur — permet un match fort lors de la conversion en blacklist.';
COMMENT ON COLUMN public.support_tickets.converted_player_blacklist_id IS
  'Entrée player_blacklist créée depuis ce ticket (conversion admin). NULL si non converti ou entrée supprimée.';
COMMENT ON COLUMN public.support_tickets.converted_entity_blacklist_id IS
  'Entrée entity_blacklist créée depuis ce ticket (conversion admin). NULL si non converti ou entrée supprimée.';

COMMIT;

-- Nouvelles FKs : PostgREST doit recharger son schema cache pour exposer les
-- embeds ?select=*,player_blacklist(*) / entity_blacklist(*).
NOTIFY pgrst, 'reload schema';
