-- Migration: le vote MVP DU PUBLIC — viewers Twitch et supporters Discord.
-- Date: 2026-09-23
--
-- WHY:
--   Le vote MVP existant est celui des ÉQUIPES : il vit dans un salon Discord
--   fermé aux rôles d'équipe. Le public, lui, votait déjà — dans le chat
--   Twitch, avec `!mvp N` — mais ce vote n'était persisté nulle part : il
--   vivait en mémoire du cockpit régie et s'évaporait avec la scène. C'est
--   écrit noir sur blanc en tête de `mvp_votes_and_awards.sql`.
--
--   Ce lot lui donne des tables, et un second titre : « MVP du match » reste
--   aux équipes, le public décerne le sien.
--
-- POURQUOI DES TABLES À PART, ET PAS UNE SOURCE DE PLUS DANS `match_mvp_votes`.
--   C'est la question qu'il faut se poser, et la réponse est le RISQUE, pas
--   l'élégance.
--
--   `utils/mvp/awards.ts` décide du titre des équipes par
--   `twitch.total > 0 ? twitch : discord`. Une seule voix de viewer rangée
--   dans la table commune en `source='twitch'` donnerait donc le titre des
--   JOUEUSES au public — instantanément, sur tous les matchs diffusés.
--
--   Et il faudrait filtrer par source chez SEPT lecteurs (dépouillement,
--   classement de journée, classement de tournoi, panneau staff, palmarès
--   public, fiche joueuse, export RGPD) sans en oublier un seul. Le système
--   des équipes vient d'entrer en service et fonctionne ; on ne le remet pas
--   en jeu pour économiser deux tables. Les fonctions PURES de dépouillement
--   (`tallySource`, `resolveMatchMvp`, seuil, égalité) se réutilisent, elles :
--   c'est la logique qui est partagée, pas les lignes.
--
-- DEUX SOURCES, ICI AUSSI, ET ELLES NE VEULENT PAS DIRE LA MÊME CHOSE QU'À CÔTÉ.
--   Dans `match_mvp_votes`, 'discord' = une joueuse d'une des deux équipes.
--   Ici, 'discord' = une supportrice du serveur, et 'twitch' = une viewer du
--   chat. Aucune ambiguïté possible : les tables sont disjointes.
--
--   Une même personne présente sur Discord ET sur Twitch peut voter deux fois.
--   C'est assumé, comme à côté : on ne sait pas rapprocher les deux identités
--   sans exiger une inscription, et exiger une inscription tuerait le vote.
--
-- CE QUE `voter_key` CONTIENT. Un identifiant de PLATEFORME — identifiant
--   Discord, ou login IRC Twitch en minuscules — jamais un compte du site.
--   Il ne sort d'aucune API : le panneau staff n'affiche que des agrégats.
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS partout) : re-jouable sans effet.
--   - Création pure : ne touche à AUCUNE table existante. Le vote des équipes
--     est strictement inchangé par cette migration.
--   - RLS activée SANS policy, comme `match_mvp_votes` : ces tables ne sont
--     jamais lues ni écrites depuis un navigateur, uniquement par le serveur
--     avec la clé de service.
--
-- POSTGREST:
--   Nouvelles tables + clés étrangères -> reload du schema cache (NOTIFY en
--   fin), sinon elles restent invisibles de l'API REST et des jointures.
--
-- APRÈS APPLICATION : régénérer l'instantané de schéma dont dépend le garde-fou
--   `tests/unit/supabaseSelectSchema.test.ts` :
--     node scripts/refresh-schema-snapshot.mjs

BEGIN;

-- ===========================================================================
-- Le scrutin public d'un match : une ligne par match, comme son homologue.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.match_public_mvp_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  match_id uuid NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,

  -- Fenêtre de vote. Bien plus COURTE que celle des équipes (48 h) : un vote
  -- du public se tient à chaud, pendant le direct, annoncé à l'antenne.
  opened_at timestamptz,
  closes_at timestamptz,
  closed_at timestamptz,

  -- Les candidates figées à l'ouverture : celles qui ont JOUÉ le match. Sans
  -- ce gel, une entrée de roster postérieure deviendrait votable après coup.
  candidate_member_ids uuid[],

  -- Cache du dépouillement. La vérité reste `match_public_mvp_votes`.
  winner_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  winner_battle_tag text,
  winner_votes integer,
  total_votes integer,
  settled_at timestamptz,

  -- Ancrage du message Discord du scrutin supporters, pour l'éditer à la
  -- clôture. Même rôle que `discord_message_id` côté équipes.
  discord_channel_id text,
  discord_message_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.match_public_mvp_polls IS
  'Scrutin MVP DU PUBLIC (viewers Twitch + supporters Discord). Distinct du vote des équipes (match_mvp_polls) : deux titres, deux électorats.';

COMMENT ON COLUMN public.match_public_mvp_polls.candidate_member_ids IS
  'Candidates figées à l''ouverture (celles qui ont joué). NULL = pas encore ouvert.';

CREATE INDEX IF NOT EXISTS match_public_mvp_polls_tenant_idx
  ON public.match_public_mvp_polls (tenant_id);

-- Le poller de clôture cherche exactement ceci : échu et pas encore clos.
CREATE INDEX IF NOT EXISTS match_public_mvp_polls_due_idx
  ON public.match_public_mvp_polls (closes_at)
  WHERE closed_at IS NULL;

-- ===========================================================================
-- Les voix.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.match_public_mvp_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,

  -- 'twitch'  = une viewer du chat (login IRC, minuscules)
  -- 'discord' = une supportrice du serveur (identifiant Discord)
  source text NOT NULL CHECK (source IN ('discord', 'twitch')),
  voter_key text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.match_public_mvp_votes IS
  'Voix du PUBLIC pour la MVP d''un match. Une voix par personne et par plateforme, la dernière compte.';

COMMENT ON COLUMN public.match_public_mvp_votes.voter_key IS
  'Identifiant de plateforme (id Discord, login Twitch minuscule), jamais un compte du site. Ne sort d''aucune API.';

-- Une personne, une voix, par plateforme et par match. La DERNIÈRE compte :
-- l'écriture est un UPSERT sur cet index.
CREATE UNIQUE INDEX IF NOT EXISTS match_public_mvp_votes_one_per_voter_idx
  ON public.match_public_mvp_votes (tenant_id, match_id, source, voter_key);

CREATE INDEX IF NOT EXISTS match_public_mvp_votes_match_idx
  ON public.match_public_mvp_votes (match_id);

CREATE INDEX IF NOT EXISTS match_public_mvp_votes_member_idx
  ON public.match_public_mvp_votes (member_id);

-- ===========================================================================
-- RLS : activée, aucune policy. Serveur uniquement (clé de service).
-- Une voix nominative ne doit jamais pouvoir être lue depuis un navigateur —
-- savoir pour qui Untel a voté n'est l'affaire de personne.
-- ===========================================================================

ALTER TABLE public.match_public_mvp_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_public_mvp_votes ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload (nouvelles tables + clés étrangères)
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
