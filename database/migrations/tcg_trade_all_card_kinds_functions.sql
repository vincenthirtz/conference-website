/* ---------------------------------------------------------------------------
 * tcg_trade_all_card_kinds_functions.sql — les échanges connaissent les cinq
 * types de cartes
 *
 * POURQUOI. `tcg_trade_all_card_kinds.sql` a ouvert la TABLE aux fanarts et aux
 * mascottes (colonnes + CHECK d'exclusivité à cinq branches). Les deux
 * FONCTIONS, elles, parlaient encore trois langues : joueuse, équipe, map. Une
 * carte mascotte proposée ressortait en `invalid_items` — un message qui dit
 * « proposition malformée » à une joueuse qui a simplement proposé une carte
 * qu'elle possède. Les fanarts étaient dans le même cas depuis leur création.
 *
 * CE QUI CHANGE. Rien d'autre que le sujet : mêmes verrous, même ordre, mêmes
 * statuts de retour, même règle d'exemplaire (le moins précieux part). Les deux
 * fonctions sont réécrites en entier parce que Postgres ne sait pas modifier un
 * corps par morceaux — la seule différence avec la version précédente est la
 * prise en charge de `card_fanart_id` (UUID) et `card_mascot_slug` (slug).
 *
 * IDEMPOTENT : `CREATE OR REPLACE`, aucune donnée touchée.
 * ------------------------------------------------------------------------- */

BEGIN;

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
  v_fanart uuid;
  v_mascot text;
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
    v_user := NULL; v_team := NULL; v_map := NULL; v_fanart := NULL; v_mascot := NULL;
    IF v_kind IN ('player', 'team', 'fanart')
       AND v_raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      IF v_kind = 'player' THEN v_user := v_raw_id::uuid;
      ELSIF v_kind = 'team' THEN v_team := v_raw_id::uuid;
      ELSE v_fanart := v_raw_id::uuid; END IF;
    ELSIF v_kind = 'map' AND v_raw_id ~ '^[a-z0-9-]{1,64}$' THEN
      v_map := v_raw_id;
    ELSIF v_kind = 'mascot' AND v_raw_id ~ '^[a-z0-9-]{1,64}$' THEN
      v_mascot := v_raw_id;
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
       AND (v_fanart IS NULL OR pc.card_fanart_id = v_fanart)
       AND (v_mascot IS NULL OR pc.card_mascot_slug = v_mascot)
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
      'fanart', v_fanart, 'mascot', v_mascot,
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
    v_user := NULL; v_team := NULL; v_map := NULL; v_fanart := NULL; v_mascot := NULL;
    IF v_kind IN ('player', 'team', 'fanart')
       AND v_raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      IF v_kind = 'player' THEN v_user := v_raw_id::uuid;
      ELSIF v_kind = 'team' THEN v_team := v_raw_id::uuid;
      ELSE v_fanart := v_raw_id::uuid; END IF;
    ELSIF v_kind = 'map' AND v_raw_id ~ '^[a-z0-9-]{1,64}$' THEN
      v_map := v_raw_id;
    ELSIF v_kind = 'mascot' AND v_raw_id ~ '^[a-z0-9-]{1,64}$' THEN
      v_mascot := v_raw_id;
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
       AND (v_map IS NULL OR pc.card_map_slug = v_map)
       AND (v_fanart IS NULL OR pc.card_fanart_id = v_fanart)
       AND (v_mascot IS NULL OR pc.card_mascot_slug = v_mascot);
    IF v_count < 2 OR v_tradeable < 1 THEN
      RETURN jsonb_build_object('status', 'requested_not_available', 'kind', v_kind, 'id', v_raw_id);
    END IF;

    v_requested_rows := v_requested_rows || jsonb_build_object(
      'ord', v_item.ord, 'kind', v_kind, 'user', v_user, 'team', v_team, 'map', v_map,
      'fanart', v_fanart, 'mascot', v_mascot,
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
    card_fanart_id, card_mascot_slug,
    rarity, is_foil, from_pack_id, from_position
  )
  SELECT v_trade_id, 'offered', (o ->> 'ord')::smallint, o ->> 'kind',
         (o ->> 'user')::uuid, (o ->> 'team')::uuid, o ->> 'map',
         (o ->> 'fanart')::uuid, o ->> 'mascot',
         o ->> 'rarity', (o ->> 'foil')::boolean,
         (o ->> 'pack')::uuid, (o ->> 'position')::smallint
    FROM jsonb_array_elements(v_offered_rows) o;

  -- Demandées : sujet + rareté ATTENDUE, sans exemplaire (`from_*` NULL).
  INSERT INTO public.tcg_trade_items (
    trade_id, side, ordinal, subject_kind, card_user_id, card_team_id, card_map_slug,
    card_fanart_id, card_mascot_slug,
    rarity, is_foil
  )
  SELECT v_trade_id, 'requested', (r ->> 'ord')::smallint, r ->> 'kind',
         (r ->> 'user')::uuid, (r ->> 'team')::uuid, r ->> 'map',
         (r ->> 'fanart')::uuid, r ->> 'mascot',
         r ->> 'rarity', (r ->> 'foil')::boolean
    FROM jsonb_array_elements(v_requested_rows) r;

  RETURN jsonb_build_object('status', 'proposed', 'tradeId', v_trade_id, 'expiresAt', v_expires);
END;
$$;

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
       AND pc.card_fanart_id IS NOT DISTINCT FROM i.card_fanart_id
       AND pc.card_mascot_slug IS NOT DISTINCT FROM i.card_mascot_slug
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
    SELECT ordinal, subject_kind, card_user_id, card_team_id, card_map_slug,
           card_fanart_id, card_mascot_slug
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
       AND pc.card_fanart_id IS NOT DISTINCT FROM v_item.card_fanart_id
       AND pc.card_mascot_slug IS NOT DISTINCT FROM v_item.card_mascot_slug
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

COMMIT;

NOTIFY pgrst, 'reload schema';
