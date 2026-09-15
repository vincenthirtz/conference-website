-- Migration : ÉCHANGES DE CARTES entre joueuses du TCG.
-- Date: 2026-09-15
--
-- WHY:
--   Une collection ne se construisait qu'en solitaire : gagner, ouvrir,
--   recycler. Les doublons n'avaient qu'une issue, la monnaie. L'échange est la
--   première interaction entre collectionneuses — une carte contre une carte.
--
-- RÈGLES PRODUIT QUE LE SCHÉMA PORTE (et pas la prudence de l'appelant) :
--
--   1. CARTE CONTRE CARTE, RIEN D'AUTRE. Aucune colonne de montant, aucun
--      paquet fermé, aucune ligne de `tcg_wallet_entries` n'est écrite ici. La
--      monnaie reste GAGNÉE, jamais transférée : un marché de pièces ouvrirait
--      la revente contre de l'argent réel, c'est-à-dire une loot box payante de
--      fait (interdite BE/NL, surveillée par l'ANJ, public mineur). Pas de don
--      unilatéral non plus : les deux côtés portent au moins une carte, et
--      AUTANT de cartes (parité 1 pour 1, cf. `tcg_propose_trade`).
--
--   2. ATOMICITÉ RÉELLE. PostgREST ne fait pas de transaction multi-requêtes :
--      deux `update` successifs pourraient laisser une carte partie sans que
--      l'autre arrive. L'acceptation est donc UNE fonction SQL, donc une
--      transaction : verrous consultatifs sur les deux joueuses, verrous de
--      ligne sur les cartes, RE-VÉRIFICATION de la possession au moment même
--      de l'acceptation, déplacement, puis statut.
--
--   3. LA CARTE SE DÉPLACE, ELLE N'EST PAS RECOPIÉE. La ligne de
--      `tcg_pack_cards` change de paquet : elle rejoint un paquet d'origine
--      `trade`, OUVERT, créé pour la destinataire. Conséquences voulues :
--        - rareté et brillance restent celles du TIRAGE (la ligne est la même) ;
--        - AUCUN lecteur de collection n'est modifié : « ce que je possède » se
--          déduit toujours des paquets ouverts, et une carte ne peut pas être
--          comptée deux fois (une recopie + un marquage l'aurait permis) ;
--        - le recyclage concurrent échoue proprement : son `UPDATE` exige
--          l'ancien `pack_id`, que la ligne n'a plus ;
--        - aucune image ne voyage : la face reste relue par `readCardFaces`, et
--          un retrait de consentement atteint aussi la nouvelle propriétaire.
--      Ce qu'un paquet contenait À L'OUVERTURE n'est relu nulle part (la
--      révélation est ponctuelle) ; la provenance de chaque carte échangée est
--      gardée dans `tcg_trade_items` (`from_*` → `to_*`).
--
--   4. ANTI-HARCÈLEMENT ET ANTI-ABUS :
--      - opt-in (`tcg_trade_settings.accepts_proposals`, défaut FALSE) : on ne
--        reçoit rien sans l'avoir demandé, et seules les collectionneuses
--        volontaires apparaissent comme destinataires possibles ;
--      - aucune colonne de texte libre dans une proposition : pas de canal de
--        message, donc pas de canal de harcèlement ;
--      - une seule proposition en attente par paire (index unique partiel) ;
--        plafonds d'attente par personne ; délai après un refus ; expiration ;
--      - pas d'échange avec soi-même (CHECK) ;
--      - multi-comptes qui aspirent des cartes : seules les cartes de paquets
--        qui ont COÛTÉ quelque chose sont échangeables (pas les cadeaux, séries
--        ni drops — `tcg_pack_source_tradeable`), ancienneté minimale du COMPTE
--        et de la COLLECTION, parité du nombre de cartes, plafond d'échanges
--        ACCEPTÉS par 24 h glissantes ;
--      - ces plafonds sont PAR COMPTE et portés par la base : le rate-limit
--        HTTP lit une IP fournie par le client, il ne protège de rien seul.
--
-- ⚠️ `tcg_packs` : DEUX CONTRAINTES SUR `source_kind`, TOUTES DEUX ÉLARGIES ICI.
--   Le 2026-09-14, élargir l'une sans l'autre a fait rejeter 58 paquets en
--   23514. Les listes sont RECOPIÉES d'après `tcg_earn_sources_drop_streak_placement.sql`
--   (dernière migration qui les touche). AVANT D'APPLIQUER, énumérer sur la base
--   réelle — une autre migration en cours (séries, vitrine…) a pu y ajouter une
--   valeur que la liste ci-dessous écraserait :
--
--     SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.tcg_packs'::regclass AND contype = 'c';
--
-- LECTEURS À CONNAÎTRE : un paquet `trade` est OUVERT dès sa création. Il entre
--   donc dans la collection (voulu) et il est EXCLU explicitement des compteurs
--   de paquets « distribués » (`/api/player/tcg/packs` GET, vue d'ensemble staff,
--   route bot) : il ne sort d'aucune victoire ni d'aucun achat.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS, DROP ... IF EXISTS, CREATE OR REPLACE.
--   - Additive : trois tables neuves, deux CHECK élargis, six fonctions.
--     Aucune ligne existante ne peut devenir invalide.
--   - RLS activée, policy `service_role` seule, comme les autres tables TCG :
--     rien n'est lu par le client en direct.
--   - Les fonctions sont SECURITY DEFINER (search_path épinglé) et exécutables
--     par `service_role` SEULEMENT : ni `anon` ni `authenticated` ne peuvent
--     les appeler par `/rest/v1/rpc`, sans quoi n'importe quel compte pourrait
--     accepter l'échange d'une autre en passant son identifiant.
--   - NON APPLIQUÉE à la rédaction (2026-09-15). Ordre : appliquer, PUIS
--     déployer le site (sans migration, les routes d'échange répondent 500 et
--     rien d'autre n'est touché), le bot pouvant apprendre les événements avant.
--   - Rollback :
--       DROP FUNCTION IF EXISTS public.tcg_accept_trade(uuid, uuid, uuid, integer, integer, integer);
--       DROP FUNCTION IF EXISTS public.tcg_propose_trade(uuid, uuid, uuid, jsonb, jsonb, integer, integer, integer, integer, integer, integer, integer);
--       DROP FUNCTION IF EXISTS public.tcg_trade_eligibility(uuid, uuid, integer, integer);
--       DROP FUNCTION IF EXISTS public.tcg_pack_source_tradeable(text);
--       DROP TABLE IF EXISTS public.tcg_trade_items, public.tcg_trades, public.tcg_trade_settings;
--       (ne PAS resserrer les CHECK de tcg_packs tant qu'un paquet `trade` existe)

BEGIN;

/* ---------------------------------------------------------------------------
 * 1) Les paquets acceptent l'origine `trade`
 * ------------------------------------------------------------------------- */

ALTER TABLE public.tcg_packs
  DROP CONSTRAINT IF EXISTS tcg_packs_source_kind_check;

ALTER TABLE public.tcg_packs
  ADD CONSTRAINT tcg_packs_source_kind_check
  CHECK (
    source_kind IN (
      'victory',
      'purchase',
      'welcome',
      'drop',
      'placement',
      'streak',
      -- Cartes reçues par un échange accepté. Paquet OUVERT à sa création : il
      -- ne se tire pas, il recueille des lignes déplacées.
      'trade'
    )
  );

ALTER TABLE public.tcg_packs
  DROP CONSTRAINT IF EXISTS tcg_packs_source_coherent;

ALTER TABLE public.tcg_packs
  ADD CONSTRAINT tcg_packs_source_coherent CHECK (
    (source_kind = 'victory' AND source_match_id IS NOT NULL)
    OR (
      source_kind IN ('purchase', 'welcome', 'drop', 'placement', 'streak', 'trade')
      AND source_match_id IS NULL
    )
  );

COMMENT ON COLUMN public.tcg_packs.source_kind IS
  'victory = match gagné (source_match_id obligatoire) ; purchase = acheté en pièces ; welcome = cadeau d''accueil ; drop = drop Twitch en direct ; placement = palmarès de tournoi ; streak = série de check-ins ; trade = cartes reçues par un échange (ouvert à la création, exclu des compteurs de paquets distribués). Hors victory, source_match_id est NULL.';

/* ---------------------------------------------------------------------------
 * 2) tcg_trade_settings — « j'accepte de recevoir des propositions »
 *
 *    DÉFAUT FALSE, l'option la plus protectrice : dans un milieu où les
 *    joueuses subissent du harcèlement, être sollicitable est un choix, pas un
 *    état par défaut. Même logique que la photo (opt-in explicite) et que la
 *    découverte joueuse (invisible par défaut). Pas de ligne = FALSE.
 * ------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.tcg_trade_settings (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  accepts_proposals boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

-- « Qui accepte des propositions dans cet espace ? » — la liste des partenaires.
CREATE INDEX IF NOT EXISTS idx_tcg_trade_settings_open
  ON public.tcg_trade_settings (tenant_id)
  WHERE accepts_proposals;

/* ---------------------------------------------------------------------------
 * 3) tcg_trades — une proposition et son issue
 * ------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.tcg_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  proposer_id uuid NOT NULL,
  recipient_id uuid NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),

  -- POURQUOI une proposition a été annulée. `proposer_cancelled` est le seul
  -- geste de la proposante elle-même : c'est lui, et lui seul, qui ne lui est
  -- PAS notifié (elle vient de le faire). Les autres sont décidés par le
  -- système et lui sont annoncés (`tcg.trade_resolved`, outcome `cancelled`).
  resolution_reason text CHECK (
    resolution_reason IS NULL OR resolution_reason IN (
      'proposer_cancelled',
      -- Une carte offerte n'est plus à elle au moment de l'acceptation
      -- (recyclée, ou partie dans un autre échange).
      'offered_unavailable',
      -- Une carte offerte vient de partir dans un AUTRE échange accepté.
      'card_unavailable',
      -- La proposante ou la destinataire a désactivé les échanges.
      'trading_disabled'
    )
  ),

  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,

  -- Les paquets `trade` créés à l'acceptation (NULL sinon). SET NULL : purger
  -- un paquet ne doit pas effacer l'histoire de l'échange.
  proposer_pack_id uuid REFERENCES public.tcg_packs(id) ON DELETE SET NULL,
  recipient_pack_id uuid REFERENCES public.tcg_packs(id) ON DELETE SET NULL,

  CONSTRAINT tcg_trades_not_self CHECK (proposer_id <> recipient_id),
  -- Une proposition en attente n'est pas résolue ; une proposition close l'est.
  CONSTRAINT tcg_trades_resolution_coherent CHECK (
    (status = 'pending') = (resolved_at IS NULL)
  ),
  CONSTRAINT tcg_trades_cancel_has_reason CHECK (
    (status = 'cancelled') = (resolution_reason IS NOT NULL)
  ),
  CONSTRAINT tcg_trades_expiry_after_creation CHECK (expires_at > created_at)
);

-- UNE seule proposition en attente par paire orientée : la même personne ne
-- peut pas empiler dix propositions dans la boîte de la même destinataire. Porté
-- par le schéma, pas par une relecture préalable (cf. l'incident du 2026-09-12).
CREATE UNIQUE INDEX IF NOT EXISTS tcg_trades_one_pending_per_pair
  ON public.tcg_trades (tenant_id, proposer_id, recipient_id)
  WHERE status = 'pending';

-- Boîtes « reçues » et « envoyées », dans l'ordre du curseur (created_at, id).
CREATE INDEX IF NOT EXISTS idx_tcg_trades_recipient
  ON public.tcg_trades (tenant_id, recipient_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tcg_trades_proposer
  ON public.tcg_trades (tenant_id, proposer_id, created_at DESC, id DESC);

-- Balayage d'expiration (cron + paresseux).
CREATE INDEX IF NOT EXISTS idx_tcg_trades_pending_expiry
  ON public.tcg_trades (expires_at)
  WHERE status = 'pending';

-- Plafond d'échanges acceptés par 24 h.
CREATE INDEX IF NOT EXISTS idx_tcg_trades_accepted_recent
  ON public.tcg_trades (tenant_id, resolved_at)
  WHERE status = 'accepted';

/* ---------------------------------------------------------------------------
 * 4) tcg_trade_items — les cartes d'une proposition
 *
 *    `offered`   : un EXEMPLAIRE précis de la proposante, choisi et figé à la
 *                  proposition (`from_*`, rareté, brillance).
 *    `requested` : un SUJET que la destinataire montre en double ; l'exemplaire
 *                  n'est choisi qu'à l'acceptation (le moins précieux), d'où
 *                  `from_*`, rareté et brillance NULL jusque-là.
 *
 *    AUCUNE IMAGE ICI, comme dans `tcg_pack_cards` : une photo retirée doit
 *    disparaître aussi des propositions et des cartes échangées.
 *    Pas de clé étrangère vers le sujet ni vers les paquets : la carte se
 *    déplace et un paquet peut être purgé, l'histoire doit rester lisible.
 * ------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.tcg_trade_items (
  trade_id uuid NOT NULL REFERENCES public.tcg_trades(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('offered', 'requested')),
  ordinal smallint NOT NULL CHECK (ordinal >= 0 AND ordinal < 10),

  subject_kind text NOT NULL CHECK (subject_kind IN ('player', 'team', 'map')),
  card_user_id uuid,
  card_team_id uuid,
  card_map_slug text,

  rarity text CHECK (rarity IS NULL OR rarity IN ('common', 'rare', 'epic', 'legendary')),
  is_foil boolean,

  from_pack_id uuid,
  from_position smallint,
  to_pack_id uuid,
  to_position smallint,

  PRIMARY KEY (trade_id, side, ordinal),

  CONSTRAINT tcg_trade_items_subject_exclusif CHECK (
    (subject_kind = 'player' AND card_user_id IS NOT NULL
      AND card_team_id IS NULL AND card_map_slug IS NULL)
    OR (subject_kind = 'team' AND card_team_id IS NOT NULL
      AND card_user_id IS NULL AND card_map_slug IS NULL)
    OR (subject_kind = 'map' AND card_map_slug IS NOT NULL
      AND card_user_id IS NULL AND card_team_id IS NULL)
  ),
  -- Une carte OFFERTE est un exemplaire précis dès la proposition.
  CONSTRAINT tcg_trade_items_offered_is_a_copy CHECK (
    side <> 'offered'
    OR (from_pack_id IS NOT NULL AND from_position IS NOT NULL
      AND rarity IS NOT NULL AND is_foil IS NOT NULL)
  )
);

-- « Cet exemplaire est-il déjà engagé dans une proposition en attente ? »
CREATE INDEX IF NOT EXISTS idx_tcg_trade_items_from
  ON public.tcg_trade_items (from_pack_id, from_position)
  WHERE from_pack_id IS NOT NULL;

/* ---------------------------------------------------------------------------
 * RLS — service_role uniquement.
 * ------------------------------------------------------------------------- */

ALTER TABLE public.tcg_trade_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_trade_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tcg_trade_settings_service_role ON public.tcg_trade_settings;
CREATE POLICY tcg_trade_settings_service_role ON public.tcg_trade_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tcg_trades_service_role ON public.tcg_trades;
CREATE POLICY tcg_trades_service_role ON public.tcg_trades
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tcg_trade_items_service_role ON public.tcg_trade_items;
CREATE POLICY tcg_trade_items_service_role ON public.tcg_trade_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

/* ---------------------------------------------------------------------------
 * 5) Petits utilitaires
 * ------------------------------------------------------------------------- */

-- Ordre de valeur d'une rareté, pour désigner l'exemplaire le MOINS précieux
-- (même règle que le recyclage : on ne cède jamais la meilleure copie).
CREATE OR REPLACE FUNCTION public.tcg_rarity_rank(p_rarity text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_rarity
    WHEN 'common' THEN 0
    WHEN 'rare' THEN 1
    WHEN 'epic' THEN 2
    WHEN 'legendary' THEN 3
    ELSE 4
  END;
$$;

-- Clé de verrou consultatif « échanges de cette joueuse dans cet espace ».
CREATE OR REPLACE FUNCTION public.tcg_trade_lock_key(p_tenant_id uuid, p_user_id uuid)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT hashtextextended('tcg_trade:' || p_tenant_id::text || ':' || p_user_id::text, 0);
$$;

-- QUELLES CARTES SONT ÉCHANGEABLES, selon l'origine de leur paquet.
--
-- Garde MULTI-COMPTES (retour d'audit sécurité, 2026-09-15). Le rôle
-- `supporter` s'auto-attribue et rapporte un paquet par compte ; une capitaine
-- peut gonfler son roster de comptes secondaires avant un 5e check-in. Tant que
-- rien n'était transférable, c'était sans intérêt ; l'échange en ferait un
-- filon — des comptes jetables qui aspirent leurs cartes vers un compte
-- principal. Sont donc ÉCHANGEABLES les seules cartes dont le paquet a coûté
-- quelque chose de réel :
--   - `victory`   : un match joué et gagné ;
--   - `placement` : un classement de fin de tournoi, figé par le staff ;
--   - `purchase`  : 300 pièces gagnées — le cadeau d'accueil (100) n'y suffit
--                   pas seul ;
--   - `trade`     : une carte déjà échangée venait d'un paquet échangeable.
-- Sont EXCLUES :
--   - `welcome`   : cadeau d'édition ET cadeau supportrice — gratuit par compte ;
--   - `streak`    : série de check-ins, payée aux titulaires du roster, donc
--                   gonflable en ajoutant des comptes avant le 5e check-in ;
--   - `drop`      : drop Twitch — un compte Twitch est gratuit, et un paquet par
--                   direct resterait cumulable sur plusieurs comptes.
-- Liste en miroir de `TRADEABLE_PACK_SOURCES` (`utils/tcg/tradeRules.ts`),
-- vérifiée par un test qui lit ce fichier.
CREATE OR REPLACE FUNCTION public.tcg_pack_source_tradeable(p_source_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_source_kind IN ('victory', 'placement', 'purchase', 'trade');
$$;

-- ANCIENNETÉ : du COMPTE et de la COLLECTION, les deux. Un compte ancien sans
-- carte n'a rien à protéger ; une collection d'hier sur un compte d'hier est
-- exactement le profil d'un compte jetable. Le premier paquet GAGNÉ fait foi
-- (un paquet `trade` ne compte pas).
--
-- SECURITY DEFINER parce qu'elle lit `auth.users.created_at`, que ni `anon` ni
-- `authenticated` ne voient ; exécutable par `service_role` seule (cf. fin).
-- Ne rend ni la date de création du compte ni celle du premier paquet : la
-- date d'éligibilité suffit à l'interface, le reste serait une donnée de plus.
CREATE OR REPLACE FUNCTION public.tcg_trade_eligibility(
  p_tenant_id uuid,
  p_user_id uuid,
  p_min_account_age_days integer,
  p_min_collection_age_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account timestamptz;
  v_first_pack timestamptz;
  v_at timestamptz;
BEGIN
  SELECT created_at INTO v_account FROM auth.users WHERE id = p_user_id;
  SELECT min(granted_at) INTO v_first_pack FROM public.tcg_packs
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND source_kind <> 'trade';
  IF v_account IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'eligibleAt', NULL, 'reason', 'no_account');
  END IF;
  IF v_first_pack IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'eligibleAt', NULL, 'reason', 'no_collection');
  END IF;
  v_at := GREATEST(
    v_account + make_interval(days => p_min_account_age_days),
    v_first_pack + make_interval(days => p_min_collection_age_days)
  );
  RETURN jsonb_build_object(
    'eligible', v_at <= now(),
    'eligibleAt', v_at,
    'reason', CASE WHEN v_at <= now() THEN NULL ELSE 'too_recent' END
  );
END;
$$;

/* ---------------------------------------------------------------------------
 * 6) tcg_propose_trade — proposer, en une transaction
 *
 *    Les plafonds sont PASSÉS par l'appelant (source unique :
 *    `utils/tcg/tradeRules.ts`) plutôt que recopiés ici, où ils divergeraient
 *    au premier réglage. La fonction n'est exécutable que par `service_role`,
 *    donc aucun client ne peut les choisir.
 *
 *    Retour : `{ status: 'proposed', tradeId, expiresAt }` ou
 *    `{ status: <code de refus>, ... }`. Elle ne LÈVE PAS pour un refus métier :
 *    un code stable se traduit, une exception se journalise.
 * ------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.tcg_propose_trade(
  p_tenant_id uuid,
  p_proposer_id uuid,
  p_recipient_id uuid,
  p_offered jsonb,
  p_requested jsonb,
  p_ttl_hours integer,
  p_max_cards integer,
  p_max_pending_sent integer,
  p_max_pending_received integer,
  p_decline_cooldown_hours integer,
  p_min_account_age_days integer,
  p_min_collection_age_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_n_offered integer;
  v_n_requested integer;
  v_count integer;
  v_item record;
  v_kind text;
  v_raw_id text;
  v_user uuid;
  v_team uuid;
  v_map text;
  v_copy record;
  v_trade_id uuid;
  v_expires timestamptz;
  v_offered_rows jsonb := '[]'::jsonb;
  v_requested_rows jsonb := '[]'::jsonb;
  v_rarity text;
  v_foil boolean;
  v_tradeable integer;
BEGIN
  -- 0) Forme. Le JSON a déjà été validé par zod côté route ; on revérifie ce
  --    dont la sûreté dépend, parce que la fonction ne doit pas avoir à
  --    faire confiance à son appelant.
  IF p_offered IS NULL OR jsonb_typeof(p_offered) <> 'array'
     OR p_requested IS NULL OR jsonb_typeof(p_requested) <> 'array' THEN
    RETURN jsonb_build_object('status', 'invalid_items');
  END IF;
  v_n_offered := jsonb_array_length(p_offered);
  v_n_requested := jsonb_array_length(p_requested);
  IF v_n_offered < 1 OR v_n_offered > LEAST(p_max_cards, 10)
     OR v_n_offered <> v_n_requested THEN
    -- Carte contre carte, À PARITÉ : jamais de don unilatéral, et un compte
    -- secondaire ne peut pas céder cinq cartes contre une seule.
    RETURN jsonb_build_object('status', 'invalid_items');
  END IF;
  -- Sujets distincts de chaque côté, et aucun sujet des deux côtés à la fois.
  IF (SELECT count(DISTINCT e.value) FROM jsonb_array_elements(p_offered) e) <> v_n_offered
     OR (SELECT count(DISTINCT e.value) FROM jsonb_array_elements(p_requested) e) <> v_n_requested
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_offered) o
       JOIN jsonb_array_elements(p_requested) r ON o.value = r.value
     ) THEN
    RETURN jsonb_build_object('status', 'invalid_items');
  END IF;

  IF p_proposer_id = p_recipient_id THEN
    RETURN jsonb_build_object('status', 'self_trade');
  END IF;

  -- 1) Verrous consultatifs sur les DEUX joueuses, dans un ordre stable (pas
  --    d'interblocage). Ils sérialisent les plafonds et l'engagement d'un
  --    exemplaire : deux propositions simultanées ne peuvent pas promettre la
  --    même carte, ni dépasser un plafond d'une unité.
  IF p_proposer_id::text < p_recipient_id::text THEN
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, p_proposer_id));
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, p_recipient_id));
  ELSE
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, p_recipient_id));
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, p_proposer_id));
  END IF;

  -- 2) Consentements. On ne sollicite que si l'on est soi-même sollicitable :
  --    personne ne peut envoyer des propositions en restant injoignable.
  IF NOT EXISTS (
    SELECT 1 FROM public.tcg_trade_settings
     WHERE tenant_id = p_tenant_id AND user_id = p_proposer_id AND accepts_proposals
  ) THEN
    RETURN jsonb_build_object('status', 'trading_disabled');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tcg_trade_settings
     WHERE tenant_id = p_tenant_id AND user_id = p_recipient_id AND accepts_proposals
  ) THEN
    -- Même réponse qu'une destinataire inexistante ou d'un autre espace : on
    -- ne confirme pas qui existe.
    RETURN jsonb_build_object('status', 'recipient_unavailable');
  END IF;

  -- 3) Ancienneté du compte ET de la collection (garde multi-comptes), pour
  --    les deux. L'activation l'exige déjà ; on la revérifie ici parce que la
  --    fonction ne doit pas dépendre de l'ordre des gestes de l'appelante.
  IF NOT COALESCE((public.tcg_trade_eligibility(
       p_tenant_id, p_proposer_id, p_min_account_age_days, p_min_collection_age_days
     ) ->> 'eligible')::boolean, false) THEN
    RETURN jsonb_build_object('status', 'collection_too_recent');
  END IF;
  IF NOT COALESCE((public.tcg_trade_eligibility(
       p_tenant_id, p_recipient_id, p_min_account_age_days, p_min_collection_age_days
     ) ->> 'eligible')::boolean, false) THEN
    RETURN jsonb_build_object('status', 'recipient_unavailable');
  END IF;

  -- 4) Plafonds d'attente. Une proposition échue mais pas encore marquée ne
  --    compte plus : `expires_at > now()`.
  SELECT count(*) INTO v_count FROM public.tcg_trades
   WHERE tenant_id = p_tenant_id AND proposer_id = p_proposer_id
     AND status = 'pending' AND expires_at > v_now;
  IF v_count >= p_max_pending_sent THEN
    RETURN jsonb_build_object('status', 'too_many_pending');
  END IF;

  SELECT count(*) INTO v_count FROM public.tcg_trades
   WHERE tenant_id = p_tenant_id AND recipient_id = p_recipient_id
     AND status = 'pending' AND expires_at > v_now;
  IF v_count >= p_max_pending_received THEN
    RETURN jsonb_build_object('status', 'recipient_inbox_full');
  END IF;

  -- Une seule par paire orientée (l'index unique partiel le garantit aussi ;
  -- le vérifier ici rend un code au lieu d'une violation 23505).
  IF EXISTS (
    SELECT 1 FROM public.tcg_trades
     WHERE tenant_id = p_tenant_id AND proposer_id = p_proposer_id
       AND recipient_id = p_recipient_id AND status = 'pending'
  ) THEN
    -- Une proposition échue mais non marquée bloquerait la paire : la route
    -- expire paresseusement AVANT d'appeler, ce cas reste donc rare.
    RETURN jsonb_build_object('status', 'already_pending');
  END IF;

  -- Un refus se respecte : pas de nouvelle proposition à la même personne
  -- avant le délai. Sans lui, « non » ne serait qu'une invitation à insister.
  IF EXISTS (
    SELECT 1 FROM public.tcg_trades
     WHERE tenant_id = p_tenant_id AND proposer_id = p_proposer_id
       AND recipient_id = p_recipient_id AND status = 'declined'
       AND resolved_at > v_now - make_interval(hours => p_decline_cooldown_hours)
  ) THEN
    RETURN jsonb_build_object('status', 'recently_declined');
  END IF;

  -- 5) Cartes offertes : pour chaque sujet, l'exemplaire le MOINS précieux de
  --    la proposante, possédé (paquet ouvert à elle, non recyclé) et non déjà
  --    engagé dans une autre proposition en attente. Verrouillé jusqu'à la fin
  --    de la transaction.
  FOR v_item IN
    SELECT e.value AS v, (e.ordinality - 1)::smallint AS ord
      FROM jsonb_array_elements(p_offered) WITH ORDINALITY e
  LOOP
    v_kind := v_item.v ->> 'kind';
    v_raw_id := v_item.v ->> 'id';
    v_user := NULL; v_team := NULL; v_map := NULL;
    IF v_kind IN ('player', 'team')
       AND v_raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      IF v_kind = 'player' THEN v_user := v_raw_id::uuid; ELSE v_team := v_raw_id::uuid; END IF;
    ELSIF v_kind = 'map' AND v_raw_id ~ '^[a-z0-9-]{1,64}$' THEN
      v_map := v_raw_id;
    ELSE
      RETURN jsonb_build_object('status', 'invalid_items');
    END IF;

    SELECT pc.pack_id, pc.position, pc.rarity, pc.is_foil
      INTO v_copy
      FROM public.tcg_pack_cards pc
      JOIN public.tcg_packs p ON p.id = pc.pack_id
     WHERE p.tenant_id = p_tenant_id
       AND p.user_id = p_proposer_id
       AND p.opened_at IS NOT NULL
       AND public.tcg_pack_source_tradeable(p.source_kind)
       AND pc.recycled_at IS NULL
       AND pc.subject_kind = v_kind
       AND (v_user IS NULL OR pc.card_user_id = v_user)
       AND (v_team IS NULL OR pc.card_team_id = v_team)
       AND (v_map IS NULL OR pc.card_map_slug = v_map)
       AND NOT EXISTS (
         SELECT 1 FROM public.tcg_trade_items i
           JOIN public.tcg_trades t ON t.id = i.trade_id
          WHERE i.side = 'offered'
            AND i.from_pack_id = pc.pack_id
            AND i.from_position = pc.position
            AND t.status = 'pending'
            AND t.expires_at > v_now
       )
     ORDER BY public.tcg_rarity_rank(pc.rarity), pc.is_foil, pc.pack_id, pc.position
     LIMIT 1
     FOR UPDATE OF pc;

    IF NOT FOUND THEN
      -- Ni possédée, ni échangeable (paquet cadeau, série, drop), ni libre :
      -- un seul code, la joueuse sait ce qu'elle a.
      RETURN jsonb_build_object('status', 'offered_not_owned', 'kind', v_kind, 'id', v_raw_id);
    END IF;

    v_offered_rows := v_offered_rows || jsonb_build_object(
      'ord', v_item.ord, 'kind', v_kind, 'user', v_user, 'team', v_team, 'map', v_map,
      'pack', v_copy.pack_id, 'position', v_copy.position,
      'rarity', v_copy.rarity, 'foil', v_copy.is_foil
    );
  END LOOP;

  -- 6) Cartes demandées : seulement ce que la destinataire MONTRE, c'est-à-dire
  --    un sujet dont elle a au moins deux exemplaires. On ne verrouille rien
  --    chez elle : une demande ne doit pas pouvoir geler la collection d'une
  --    autre (sinon demander = empêcher de recycler). La possession est
  --    revérifiée à l'acceptation.
  FOR v_item IN
    SELECT e.value AS v, (e.ordinality - 1)::smallint AS ord
      FROM jsonb_array_elements(p_requested) WITH ORDINALITY e
  LOOP
    v_kind := v_item.v ->> 'kind';
    v_raw_id := v_item.v ->> 'id';
    v_user := NULL; v_team := NULL; v_map := NULL;
    IF v_kind IN ('player', 'team')
       AND v_raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      IF v_kind = 'player' THEN v_user := v_raw_id::uuid; ELSE v_team := v_raw_id::uuid; END IF;
    ELSIF v_kind = 'map' AND v_raw_id ~ '^[a-z0-9-]{1,64}$' THEN
      v_map := v_raw_id;
    ELSE
      RETURN jsonb_build_object('status', 'invalid_items');
    END IF;

    -- Le compte ET la rareté de l'exemplaire qu'elle céderait (le moins
    -- précieux) : c'est ce que sa vitrine de doubles montre déjà, rien de plus.
    -- La rareté réelle est réécrite à l'acceptation.
    --
    -- DEUX CONDITIONS : au moins deux exemplaires (on ne demande que ce qu'elle
    -- a en double) ET au moins un exemplaire ÉCHANGEABLE — c'est lui qui
    -- partira, jamais une carte de paquet cadeau.
    SELECT count(*),
           count(*) FILTER (WHERE public.tcg_pack_source_tradeable(p.source_kind)),
           (array_agg(pc.rarity ORDER BY public.tcg_rarity_rank(pc.rarity), pc.is_foil)
              FILTER (WHERE public.tcg_pack_source_tradeable(p.source_kind)))[1],
           (array_agg(pc.is_foil ORDER BY public.tcg_rarity_rank(pc.rarity), pc.is_foil)
              FILTER (WHERE public.tcg_pack_source_tradeable(p.source_kind)))[1]
      INTO v_count, v_tradeable, v_rarity, v_foil
      FROM public.tcg_pack_cards pc
      JOIN public.tcg_packs p ON p.id = pc.pack_id
     WHERE p.tenant_id = p_tenant_id
       AND p.user_id = p_recipient_id
       AND p.opened_at IS NOT NULL
       AND pc.recycled_at IS NULL
       AND pc.subject_kind = v_kind
       AND (v_user IS NULL OR pc.card_user_id = v_user)
       AND (v_team IS NULL OR pc.card_team_id = v_team)
       AND (v_map IS NULL OR pc.card_map_slug = v_map);
    IF v_count < 2 OR v_tradeable < 1 THEN
      RETURN jsonb_build_object('status', 'requested_not_available', 'kind', v_kind, 'id', v_raw_id);
    END IF;

    v_requested_rows := v_requested_rows || jsonb_build_object(
      'ord', v_item.ord, 'kind', v_kind, 'user', v_user, 'team', v_team, 'map', v_map,
      'rarity', v_rarity, 'foil', v_foil
    );
  END LOOP;

  -- 7) Écriture.
  v_expires := v_now + make_interval(hours => p_ttl_hours);
  INSERT INTO public.tcg_trades (tenant_id, proposer_id, recipient_id, status, created_at, expires_at)
  VALUES (p_tenant_id, p_proposer_id, p_recipient_id, 'pending', v_now, v_expires)
  RETURNING id INTO v_trade_id;

  INSERT INTO public.tcg_trade_items (
    trade_id, side, ordinal, subject_kind, card_user_id, card_team_id, card_map_slug,
    rarity, is_foil, from_pack_id, from_position
  )
  SELECT v_trade_id, 'offered', (o ->> 'ord')::smallint, o ->> 'kind',
         (o ->> 'user')::uuid, (o ->> 'team')::uuid, o ->> 'map',
         o ->> 'rarity', (o ->> 'foil')::boolean,
         (o ->> 'pack')::uuid, (o ->> 'position')::smallint
    FROM jsonb_array_elements(v_offered_rows) o;

  -- Demandées : sujet + rareté ATTENDUE, sans exemplaire (`from_*` NULL).
  INSERT INTO public.tcg_trade_items (
    trade_id, side, ordinal, subject_kind, card_user_id, card_team_id, card_map_slug,
    rarity, is_foil
  )
  SELECT v_trade_id, 'requested', (r ->> 'ord')::smallint, r ->> 'kind',
         (r ->> 'user')::uuid, (r ->> 'team')::uuid, r ->> 'map',
         r ->> 'rarity', (r ->> 'foil')::boolean
    FROM jsonb_array_elements(v_requested_rows) r;

  RETURN jsonb_build_object('status', 'proposed', 'tradeId', v_trade_id, 'expiresAt', v_expires);
END;
$$;

/* ---------------------------------------------------------------------------
 * 7) tcg_accept_trade — accepter, en une transaction
 *
 *    Ordre des verrous, toujours le même (pas d'interblocage entre deux
 *    acceptations qui partagent une joueuse) :
 *      a. lecture SANS verrou de la proposition, pour connaître la paire ;
 *      b. verrous consultatifs sur les deux joueuses, ordre stable ;
 *      c. verrou de ligne sur la proposition, puis sur les cartes.
 *
 *    IDEMPOTENCE : une proposition déjà acceptée rend `already_accepted`, sans
 *    rien réécrire — un double clic ou un retry réseau ne rejoue ni le
 *    déplacement ni l'annonce.
 *
 *    Retours : `accepted` (+ paquets créés, + propositions devenues caduques),
 *    `already_accepted`, `not_found`, `not_pending`, `expired` (transition
 *    faite ici), `stale` (carte offerte indisponible → annulée par le système),
 *    `requested_unavailable` (la destinataire n'a plus la carte : RIEN n'est
 *    changé, pour ne rien révéler de sa collection à la proposante),
 *    `daily_limit`, `partner_daily_limit`, `not_eligible`.
 * ------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.tcg_accept_trade(
  p_tenant_id uuid,
  p_trade_id uuid,
  p_user_id uuid,
  p_max_accepted_per_day integer,
  p_min_account_age_days integer,
  p_min_collection_age_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_proposer uuid;
  v_recipient uuid;
  v_trade public.tcg_trades%ROWTYPE;
  v_expected integer;
  v_locked integer := 0;
  v_count integer;
  v_item record;
  v_copy record;
  v_req_ords smallint[] := '{}';
  v_req_packs uuid[] := '{}';
  v_req_positions smallint[] := '{}';
  v_req_rarities text[] := '{}';
  v_req_foils boolean[] := '{}';
  v_proposer_pack uuid;
  v_recipient_pack uuid;
  v_pos integer;
  v_i integer;
  v_cancelled jsonb := '[]'::jsonb;
BEGIN
  -- a) La paire, sans verrou.
  SELECT proposer_id, recipient_id INTO v_proposer, v_recipient
    FROM public.tcg_trades
   WHERE id = p_trade_id AND tenant_id = p_tenant_id;
  IF NOT FOUND OR v_recipient <> p_user_id THEN
    -- 404 côté route : on ne confirme pas l'existence d'une proposition qui
    -- n'est pas adressée à l'appelante.
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- b) Verrous consultatifs, ordre stable.
  IF v_proposer::text < v_recipient::text THEN
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, v_proposer));
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, v_recipient));
  ELSE
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, v_recipient));
    PERFORM pg_advisory_xact_lock(public.tcg_trade_lock_key(p_tenant_id, v_proposer));
  END IF;

  -- c) La proposition, verrouillée et relue.
  SELECT * INTO v_trade FROM public.tcg_trades
   WHERE id = p_trade_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    -- Supprimée entre la lecture et le verrou : sans ce test, `v_trade.status`
    -- vaudrait NULL et aucune des comparaisons suivantes ne l'arrêterait.
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_trade.status = 'accepted' THEN
    RETURN jsonb_build_object('status', 'already_accepted', 'tradeId', v_trade.id,
      'proposerId', v_trade.proposer_id, 'recipientId', v_trade.recipient_id);
  END IF;
  IF v_trade.status <> 'pending' THEN
    RETURN jsonb_build_object('status', 'not_pending', 'current', v_trade.status);
  END IF;
  IF v_trade.expires_at <= v_now THEN
    -- Transition faite ICI : c'est cet appel, et lui seul, qui l'annonce.
    UPDATE public.tcg_trades SET status = 'expired', resolved_at = v_now
     WHERE id = v_trade.id;
    RETURN jsonb_build_object('status', 'expired', 'tradeId', v_trade.id,
      'proposerId', v_trade.proposer_id, 'recipientId', v_trade.recipient_id);
  END IF;

  -- d) Plafond d'échanges acceptés par 24 h glissantes, pour CHACUNE des deux.
  --    Garde multi-comptes : même à parité, un réseau de comptes secondaires ne
  --    peut faire converger qu'un nombre borné de cartes par jour.
  SELECT count(*) INTO v_count FROM public.tcg_trades
   WHERE tenant_id = p_tenant_id AND status = 'accepted'
     AND resolved_at > v_now - interval '24 hours'
     AND (proposer_id = v_trade.recipient_id OR recipient_id = v_trade.recipient_id);
  IF v_count >= p_max_accepted_per_day THEN
    RETURN jsonb_build_object('status', 'daily_limit');
  END IF;
  SELECT count(*) INTO v_count FROM public.tcg_trades
   WHERE tenant_id = p_tenant_id AND status = 'accepted'
     AND resolved_at > v_now - interval '24 hours'
     AND (proposer_id = v_trade.proposer_id OR recipient_id = v_trade.proposer_id);
  IF v_count >= p_max_accepted_per_day THEN
    RETURN jsonb_build_object('status', 'partner_daily_limit');
  END IF;

  -- Ancienneté revérifiée (défense en profondeur ; l'activation l'exigeait).
  IF NOT COALESCE((public.tcg_trade_eligibility(
       p_tenant_id, v_trade.recipient_id, p_min_account_age_days, p_min_collection_age_days
     ) ->> 'eligible')::boolean, false)
     OR NOT COALESCE((public.tcg_trade_eligibility(
       p_tenant_id, v_trade.proposer_id, p_min_account_age_days, p_min_collection_age_days
     ) ->> 'eligible')::boolean, false) THEN
    RETURN jsonb_build_object('status', 'not_eligible');
  END IF;

  -- e) RE-VÉRIFICATION des cartes offertes, verrouillées : toujours au paquet
  --    OUVERT de la proposante, dans cet espace, non recyclées, et du même
  --    sujet qu'à la proposition. Une ligne recyclée ou déplacée entre-temps ne
  --    passe pas le filtre (Postgres réévalue le WHERE sur la version
  --    committée d'une ligne qu'il a dû attendre).
  SELECT count(*) INTO v_expected FROM public.tcg_trade_items
   WHERE trade_id = v_trade.id AND side = 'offered';

  FOR v_item IN
    SELECT pc.pack_id
      FROM public.tcg_trade_items i
      JOIN public.tcg_pack_cards pc
        ON pc.pack_id = i.from_pack_id AND pc.position = i.from_position
      JOIN public.tcg_packs p ON p.id = pc.pack_id
     WHERE i.trade_id = v_trade.id
       AND i.side = 'offered'
       AND p.tenant_id = p_tenant_id
       AND p.user_id = v_trade.proposer_id
       AND p.opened_at IS NOT NULL
       AND public.tcg_pack_source_tradeable(p.source_kind)
       AND pc.recycled_at IS NULL
       AND pc.subject_kind = i.subject_kind
       AND pc.card_user_id IS NOT DISTINCT FROM i.card_user_id
       AND pc.card_team_id IS NOT DISTINCT FROM i.card_team_id
       AND pc.card_map_slug IS NOT DISTINCT FROM i.card_map_slug
     ORDER BY pc.pack_id, pc.position
     FOR UPDATE OF pc
  LOOP
    v_locked := v_locked + 1;
  END LOOP;

  IF v_locked < v_expected THEN
    -- La proposante n'a plus ce qu'elle offrait : la proposition devient
    -- caduque PROPREMENT (annulée par le système, annoncée à la proposante),
    -- plutôt que de rester acceptable en apparence et refusée à chaque clic.
    UPDATE public.tcg_trades
       SET status = 'cancelled', resolution_reason = 'offered_unavailable', resolved_at = v_now
     WHERE id = v_trade.id;
    RETURN jsonb_build_object('status', 'stale', 'tradeId', v_trade.id,
      'proposerId', v_trade.proposer_id, 'recipientId', v_trade.recipient_id);
  END IF;

  -- f) Cartes demandées : l'exemplaire le MOINS précieux de la destinataire,
  --    de préférence non engagé dans ses propres propositions, verrouillé.
  FOR v_item IN
    SELECT ordinal, subject_kind, card_user_id, card_team_id, card_map_slug
      FROM public.tcg_trade_items
     WHERE trade_id = v_trade.id AND side = 'requested'
     ORDER BY ordinal
  LOOP
    SELECT pc.pack_id, pc.position, pc.rarity, pc.is_foil
      INTO v_copy
      FROM public.tcg_pack_cards pc
      JOIN public.tcg_packs p ON p.id = pc.pack_id
     WHERE p.tenant_id = p_tenant_id
       AND p.user_id = v_trade.recipient_id
       AND p.opened_at IS NOT NULL
       AND public.tcg_pack_source_tradeable(p.source_kind)
       AND pc.recycled_at IS NULL
       AND pc.subject_kind = v_item.subject_kind
       AND pc.card_user_id IS NOT DISTINCT FROM v_item.card_user_id
       AND pc.card_team_id IS NOT DISTINCT FROM v_item.card_team_id
       AND pc.card_map_slug IS NOT DISTINCT FROM v_item.card_map_slug
     ORDER BY
       EXISTS (
         SELECT 1 FROM public.tcg_trade_items oi
           JOIN public.tcg_trades ot ON ot.id = oi.trade_id
          WHERE oi.side = 'offered'
            AND oi.from_pack_id = pc.pack_id
            AND oi.from_position = pc.position
            AND ot.status = 'pending'
       ),
       public.tcg_rarity_rank(pc.rarity), pc.is_foil, pc.pack_id, pc.position
     LIMIT 1
     FOR UPDATE OF pc;

    IF NOT FOUND THEN
      -- Rien n'a été écrit : la transaction rend ses verrous, la proposition
      -- reste en attente. On ne l'annule PAS — l'annoncer à la proposante lui
      -- apprendrait ce que la destinataire ne possède plus.
      RETURN jsonb_build_object('status', 'requested_unavailable');
    END IF;

    v_req_ords := v_req_ords || v_item.ordinal;
    v_req_packs := v_req_packs || v_copy.pack_id;
    v_req_positions := v_req_positions || v_copy.position;
    v_req_rarities := v_req_rarities || v_copy.rarity;
    v_req_foils := v_req_foils || v_copy.is_foil;
  END LOOP;

  -- g) Écriture. Deux paquets `trade`, ouverts d'emblée.
  INSERT INTO public.tcg_packs (tenant_id, user_id, source_kind, source_match_id, granted_at, opened_at)
  VALUES (p_tenant_id, v_trade.recipient_id, 'trade', NULL, v_now, v_now)
  RETURNING id INTO v_recipient_pack;

  INSERT INTO public.tcg_packs (tenant_id, user_id, source_kind, source_match_id, granted_at, opened_at)
  VALUES (p_tenant_id, v_trade.proposer_id, 'trade', NULL, v_now, v_now)
  RETURNING id INTO v_proposer_pack;

  -- Offertes → destinataire. La LIGNE change de paquet : rareté et brillance
  -- du tirage la suivent, aucune image n'existe à recopier.
  v_pos := 0;
  FOR v_item IN
    SELECT ordinal, from_pack_id, from_position
      FROM public.tcg_trade_items
     WHERE trade_id = v_trade.id AND side = 'offered'
     ORDER BY ordinal
  LOOP
    UPDATE public.tcg_pack_cards
       SET pack_id = v_recipient_pack, position = v_pos
     WHERE pack_id = v_item.from_pack_id AND position = v_item.from_position;
    UPDATE public.tcg_trade_items
       SET to_pack_id = v_recipient_pack, to_position = v_pos
     WHERE trade_id = v_trade.id AND side = 'offered' AND ordinal = v_item.ordinal;
    v_pos := v_pos + 1;
  END LOOP;

  -- Demandées → proposante.
  FOR v_i IN 1 .. COALESCE(array_length(v_req_ords, 1), 0) LOOP
    UPDATE public.tcg_pack_cards
       SET pack_id = v_proposer_pack, position = v_i - 1
     WHERE pack_id = v_req_packs[v_i] AND position = v_req_positions[v_i];
    UPDATE public.tcg_trade_items
       SET from_pack_id = v_req_packs[v_i],
           from_position = v_req_positions[v_i],
           rarity = v_req_rarities[v_i],
           is_foil = v_req_foils[v_i],
           to_pack_id = v_proposer_pack,
           to_position = v_i - 1
     WHERE trade_id = v_trade.id AND side = 'requested' AND ordinal = v_req_ords[v_i];
  END LOOP;

  UPDATE public.tcg_trades
     SET status = 'accepted', resolved_at = v_now,
         proposer_pack_id = v_proposer_pack, recipient_pack_id = v_recipient_pack
   WHERE id = v_trade.id;

  -- h) Caducité en cascade : toute AUTRE proposition en attente qui offrait un
  --    exemplaire qui vient de bouger ne peut plus aboutir. On l'annule tout de
  --    suite (système) plutôt que de laisser sa destinataire tomber dessus.
  WITH moved AS (
    SELECT from_pack_id, from_position FROM public.tcg_trade_items
     WHERE trade_id = v_trade.id AND from_pack_id IS NOT NULL
  ), hit AS (
    UPDATE public.tcg_trades t
       SET status = 'cancelled', resolution_reason = 'card_unavailable', resolved_at = v_now
     WHERE t.tenant_id = p_tenant_id
       AND t.status = 'pending'
       AND t.id <> v_trade.id
       AND EXISTS (
         SELECT 1 FROM public.tcg_trade_items i
           JOIN moved m ON m.from_pack_id = i.from_pack_id AND m.from_position = i.from_position
          WHERE i.trade_id = t.id AND i.side = 'offered'
       )
    RETURNING t.id, t.proposer_id, t.recipient_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'tradeId', id, 'proposerId', proposer_id, 'recipientId', recipient_id)), '[]'::jsonb)
    INTO v_cancelled
    FROM hit;

  RETURN jsonb_build_object(
    'status', 'accepted',
    'tradeId', v_trade.id,
    'proposerId', v_trade.proposer_id,
    'recipientId', v_trade.recipient_id,
    'proposerPackId', v_proposer_pack,
    'recipientPackId', v_recipient_pack,
    'cancelled', v_cancelled
  );
END;
$$;

/* ---------------------------------------------------------------------------
 * 8) Droits d'exécution : service_role SEULEMENT.
 * ------------------------------------------------------------------------- */

REVOKE ALL ON FUNCTION public.tcg_propose_trade(uuid, uuid, uuid, jsonb, jsonb, integer, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tcg_accept_trade(uuid, uuid, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tcg_trade_eligibility(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tcg_propose_trade(uuid, uuid, uuid, jsonb, jsonb, integer, integer, integer, integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.tcg_accept_trade(uuid, uuid, uuid, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.tcg_trade_eligibility(uuid, uuid, integer, integer) TO service_role;

COMMENT ON TABLE public.tcg_trade_settings IS
  'Préférence « recevoir des propositions d''échange TCG ». Défaut false (opt-in) : être sollicitable est un choix. Pas de ligne = false.';
COMMENT ON TABLE public.tcg_trades IS
  'Proposition d''échange TCG carte contre carte, à parité, sans pièces ni paquet fermé. Acceptation atomique par tcg_accept_trade (verrous + revérification). Aucun texte libre : pas de canal de message.';
COMMENT ON TABLE public.tcg_trade_items IS
  'Cartes d''une proposition. offered = exemplaire figé à la proposition ; requested = sujet, exemplaire choisi (le moins précieux) à l''acceptation. from_* → to_* garde la provenance d''une carte déplacée. Aucune image.';

COMMIT;

NOTIFY pgrst, 'reload schema';
