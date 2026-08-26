-- allow_accents_in_battle_tag.sql
--
-- Contexte : un BattleTag Blizzard peut contenir des lettres accentuées
-- (« Noémiedepain#1234 »). La contrainte `team_members_battletag_format`, posée
-- à l'origine avec `[A-Za-z0-9]`, refusait ces tags — une joueuse ne pouvait
-- donc pas être inscrite au roster par sa manager.
--
-- Nouvelle règle, miroir SQL de `BATTLE_TAG_REGEX` (utils/teams/roleKind.ts) :
--   - partie « nom » : 2 caractères minimum, alphanumériques de n'importe quel
--     script (`[[:alnum:]]` est Unicode-aware en base UTF-8), plus les marques
--     combinantes pour accepter la forme décomposée (NFD : « e » + U+0301) que
--     produisent certains claviers / copier-coller macOS ;
--   - suffixe : `#` + 3 à 6 chiffres ASCII, inchangé.
--
-- Ranges de marques combinantes couvertes :
--   U+0300–U+036F (diacritiques),
--   U+1AB0–U+1AFF (diacritiques étendus),
--   U+20D0–U+20F0 (marques pour symboles).
--
-- Idempotent : la contrainte est déposée puis recréée.

ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_battletag_format;

ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_battletag_format
  CHECK (
    battle_tag ~ U&'^[[:alnum:]\0300-\036F\1AB0-\1AFF\20D0-\20F0]{2,}#[0-9]{3,6}$'
  );

COMMENT ON COLUMN public.team_members.battle_tag IS
  'BattleTag Battle.net au format Pseudo#0000 — le pseudo accepte les lettres accentuées et non latines.';
