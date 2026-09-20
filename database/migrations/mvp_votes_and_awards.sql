-- Migration : le MVP devient une CHAÎNE DE VOTES, pas une saisie manuelle.
-- Date: 2026-09-20
--
-- WHY:
--   Le MVP existait sur le papier — sondage Discord natif posté par webhook à
--   la fin d'un match, gagnante ressaisie à la main par le staff, onglet MVP
--   public, compteur au palmarès, stat `🏅 MVP` du bot. En prod, au 2026-09-20 :
--   `match_mvp_polls` = 0 ligne sur 10 matchs terminés (7 en 2025, 3 en 2026).
--   Deux ruptures :
--     - `discord_webhooks` est VIDE depuis que le bot a remplacé les webhooks,
--       donc `postMvpPoll` sortait sans rien écrire — pas même une trace ;
--     - un poll Discord natif posté par webhook n'est pas RELISIBLE, d'où la
--       ressaisie manuelle par match, jamais faite en deux éditions.
--   Le vote qui avait effectivement lieu — celui du chat Twitch, dans le
--   cockpit régie — n'était persisté nulle part : il s'évaporait avec la scène.
--
--   Cette migration stocke les VOTES, pas seulement la gagnante. C'est ce que
--   le MVP de journée et le MVP de tournoi exigent : sans décompte, on ne peut
--   ni cumuler, ni départager, ni recalculer après coup.
--
-- CAVEATS:
--   - UNE VOIX PAR PERSONNE ET PAR MATCH, dernière voix gagnante : l'unicité
--     porte sur (tenant, match, source, voter_key) et l'insertion se fait en
--     UPSERT. Deux sources = deux voix possibles pour une même personne
--     présente sur Discord ET sur Twitch ; c'est assumé, l'arbitrage entre
--     sources se fait au dépouillement (utils/mvp/awards.ts), pas ici.
--   - `voter_key` est un identifiant de plateforme (id Discord, login Twitch),
--     pas un compte du site : on ne peut pas exiger d'inscription pour voter.
--     Aucune donnée nominative n'y transite.
--   - Les colonnes ajoutées à `match_mvp_polls` sont un CACHE du dépouillement
--     (gagnante, source retenue, décomptes). La source de vérité reste la table
--     de votes : tout est recalculable.
--   - Idempotente.

CREATE TABLE IF NOT EXISTS public.match_mvp_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('discord', 'twitch')),
  voter_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Une voix par personne, par match, par plateforme. L'UPSERT s'appuie dessus :
-- revoter écrase, il n'empile pas.
CREATE UNIQUE INDEX IF NOT EXISTS match_mvp_votes_one_per_voter_idx
  ON public.match_mvp_votes (tenant_id, match_id, source, voter_key);

-- Dépouillement d'un match, et cumul d'une journée (tous les matchs d'une J).
CREATE INDEX IF NOT EXISTS match_mvp_votes_match_idx
  ON public.match_mvp_votes (match_id);
CREATE INDEX IF NOT EXISTS match_mvp_votes_member_idx
  ON public.match_mvp_votes (member_id);

COMMENT ON TABLE public.match_mvp_votes IS
  'Voix individuelles du vote MVP d''un match. Une par personne et par plateforme, dernière voix gagnante (UPSERT).';
COMMENT ON COLUMN public.match_mvp_votes.voter_key IS
  'Identifiant de plateforme du votant (id Discord, login Twitch minuscule). Sert à l''unicité, jamais affiché.';
COMMENT ON COLUMN public.match_mvp_votes.source IS
  'Plateforme d''origine. L''arbitrage entre sources se fait au dépouillement, pas à l''insertion.';

ALTER TABLE public.match_mvp_votes ENABLE ROW LEVEL SECURITY;

-- Aucune policy : la table n'est jamais lue ni écrite depuis le navigateur.
-- Les écritures viennent du bot (service role, /api/bot/v1) et du cockpit régie
-- (service role, /api/admin). Les lectures publiques passent par les
-- agrégats exposés par l'API — une voix nominative n'a pas à sortir d'ici.

/* ---------------------------------------------------------------
 * match_mvp_polls : cache du dépouillement + ancrage du message Discord
 * -------------------------------------------------------------*/

ALTER TABLE public.match_mvp_polls
  ADD COLUMN IF NOT EXISTS closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS winner_source text,
  ADD COLUMN IF NOT EXISTS winner_votes integer,
  ADD COLUMN IF NOT EXISTS total_votes integer,
  ADD COLUMN IF NOT EXISTS discord_channel_id text,
  ADD COLUMN IF NOT EXISTS discord_message_id text;

-- 'manual' reste légitime : le staff peut toujours trancher (vote vide, litige,
-- rattrapage d'un match joué avant cette migration).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_mvp_polls_winner_source_chk'
  ) THEN
    ALTER TABLE public.match_mvp_polls
      ADD CONSTRAINT match_mvp_polls_winner_source_chk
      CHECK (winner_source IS NULL OR winner_source IN ('discord', 'twitch', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN public.match_mvp_polls.winner_source IS
  'Plateforme dont le dépouillement a désigné la gagnante, ou ''manual'' si le staff a tranché.';
COMMENT ON COLUMN public.match_mvp_polls.winner_votes IS
  'Voix de la gagnante dans la source retenue. Avec total_votes, donne sa PART — le critère du MVP de journée.';
COMMENT ON COLUMN public.match_mvp_polls.total_votes IS
  'Total des voix exprimées dans la source retenue.';
COMMENT ON COLUMN public.match_mvp_polls.discord_message_id IS
  'Message du vote posté par le bot dans le fil du match : sert à le rouvrir, l''éditer et le clore.';

NOTIFY pgrst, 'reload schema';
