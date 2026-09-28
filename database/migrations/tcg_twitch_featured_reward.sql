-- Migration : une récompense Twitch « mise en avant » qui GARANTIT une carte.
-- Date: 2026-09-28
--
-- WHY. Le drop Twitch donne des pièces et un paquet tiré au hasard. L'association
--   veut une seconde récompense, plus chère, dont le paquet contient à coup sûr
--   une carte choisie — le logo Octobre Rose pendant le mois d'octobre.
--
-- TROIS COLONNES, AUCUNE TABLE.
--   - `twitch_broadcaster_connections.tcg_featured_reward_id` : la récompense
--     Twitch écoutée, à côté de `tcg_reward_id` (même ligne : le webhook lit les
--     deux d'un coup, cf. `resolveBroadcasterBinding`).
--   - `twitch_broadcaster_connections.tcg_featured_fanart_id` : la carte
--     garantie (une carte de `tcg_fanart_cards`, fan art ou « L'association »).
--   - `tcg_packs.guaranteed_fanart_id` : posé sur le paquet À L'ATTRIBUTION.
--     Le paquet est tiré à l'OUVERTURE, parfois des jours plus tard : la
--     garantie doit voyager avec lui, pas se relire dans un réglage qui aura pu
--     changer entre-temps (fin octobre, autre carte mise en avant).
--
-- ON DELETE SET NULL partout : une carte retirée ne doit ni bloquer un paquet
--   fermé ni casser la chaîne. À l'ouverture, une carte garantie qui n'est plus
--   publiable est simplement ignorée — tirage normal (cf. `packs.ts`).
--
-- CAVEATS:
--   - Additive et idempotente.
--   - Rollback : DROP des trois colonnes.

BEGIN;

ALTER TABLE public.twitch_broadcaster_connections
  ADD COLUMN IF NOT EXISTS tcg_featured_reward_id text,
  ADD COLUMN IF NOT EXISTS tcg_featured_fanart_id uuid
    REFERENCES public.tcg_fanart_cards(id) ON DELETE SET NULL;

ALTER TABLE public.tcg_packs
  ADD COLUMN IF NOT EXISTS guaranteed_fanart_id uuid
    REFERENCES public.tcg_fanart_cards(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.twitch_broadcaster_connections.tcg_featured_reward_id IS
  'Récompense Twitch « mise en avant » : son paquet garantit tcg_featured_fanart_id.';
COMMENT ON COLUMN public.tcg_packs.guaranteed_fanart_id IS
  'Carte garantie à l''ouverture (récompense Twitch mise en avant). Ignorée si elle n''est plus publiable.';

COMMIT;

NOTIFY pgrst, 'reload schema';
