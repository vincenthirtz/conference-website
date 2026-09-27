-- Migration : `tcg_forge_card` — la forge, en UNE transaction.
-- Date: 2026-09-27
-- Lot T2 de docs/PLAN-tcg.md. Suite de `tcg_forge_and_showcase_cosmetics.sql`.
--
-- POURQUOI UNE FONCTION SQL, ET PAS UNE SUITE D'APPELS DEPUIS L'API. La forge
--   fait QUATRE écritures qui n'ont de sens qu'ensemble : retirer trois cartes,
--   débiter des pièces, créer un paquet, y poser la carte forgée. Chaque
--   frontière entre deux d'entre elles est un état intermédiaire absurde —
--   trois cartes détruites sans rien en retour, ou des pièces prélevées pour
--   une carte qui n'existe pas.
--
--   Le projet a déjà tranché cette question une fois : `booster.ts` faisait
--   débit puis création côté application, et un 504 PostgREST entre les deux
--   (mode d'échec CONSTATÉ ici, ~1,7 %) faisait perdre 300 pièces sans rien
--   rendre. Il est passé par `tcg_purchase_booster`. La forge suit le même
--   chemin, et pour la même raison.
--
-- CE QUI RESTE CÔTÉ APPLICATION, ET POURQUOI. Le CHOIX du sujet forgé. La
--   rareté d'une carte de joueuse se déduit de ses badges, calculés en
--   TypeScript (`utils/tcg/rarity.ts`, qui prolonge `profile/achievements`).
--   La recalculer en SQL donnerait deux barèmes jumeaux, libres de diverger —
--   exactement ce que `rarity.ts` existe pour empêcher. La fonction reçoit donc
--   un sujet DÉJÀ choisi, et se contente de le poser.
--
-- LES GARDES, toutes vérifiées ICI et pas seulement chez l'appelant :
--   1. les trois cartes appartiennent à des paquets OUVERTS de cette joueuse ;
--   2. elles ne sont pas déjà recyclées (le `UPDATE … WHERE recycled_at IS
--      NULL` sert de réservation atomique : deux clics simultanés ne peuvent
--      pas consommer la même carte deux fois) ;
--   3. il reste au moins un exemplaire vivant de chaque sujet consommé APRÈS
--      la forge — « forger un doublon » ne doit jamais devenir « détruire sa
--      collection » ;
--   4. le solde couvre les frais.
--   Un échec sur l'une quelconque annule TOUT, la transaction s'en charge.
--
-- LE SOLDE EST RECALCULÉ, jamais incrémenté : `tcg_wallets.balance` est un
--   cache du registre. Un incrément perdu creuse un écart définitif, un
--   recalcul se répare tout seul.
--
-- SECURITY DEFINER + search_path figé : la fonction écrit sous le rôle du
--   propriétaire, elle ne doit pas résoudre ses tables dans un schéma choisi
--   par l'appelant. Elle n'est PAS exposée à `anon`/`authenticated` : l'API
--   l'appelle avec la clé de service, après avoir authentifié la joueuse.

CREATE OR REPLACE FUNCTION public.tcg_forge_card(
  p_tenant_id uuid,
  p_user_id uuid,
  -- [{ "packId": uuid, "position": int }, …] — les cartes consommées.
  p_cards jsonb,
  p_fee integer,
  p_rarity text,
  p_subject_kind text,
  p_card_user_id uuid DEFAULT NULL,
  p_card_team_id uuid DEFAULT NULL,
  p_card_map_slug text DEFAULT NULL,
  p_card_mascot_slug text DEFAULT NULL,
  p_card_fanart_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_expected integer := jsonb_array_length(p_cards);
  v_marked integer := 0;
  v_balance integer;
  v_pack_id uuid;
  v_ref text;
  v_orphan integer;
BEGIN
  IF v_expected < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_enough');
  END IF;
  IF p_fee < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_fee');
  END IF;

  -- 1) Réservation ATOMIQUE des cartes consommées. Le filtre porte sur les
  --    paquets OUVERTS de cette joueuse : une carte d'un paquet fermé n'est pas
  --    encore possédée, une carte d'un paquet d'autrui ne l'est pas du tout.
  WITH wanted AS (
    SELECT (e->>'packId')::uuid AS pack_id, (e->>'position')::smallint AS position
    FROM jsonb_array_elements(p_cards) AS e
  ),
  mine AS (
    SELECT c.pack_id, c.position
    FROM public.tcg_pack_cards c
    JOIN public.tcg_packs p ON p.id = c.pack_id
    JOIN wanted w ON w.pack_id = c.pack_id AND w.position = c.position
    WHERE p.tenant_id = p_tenant_id
      AND p.user_id = p_user_id
      AND p.opened_at IS NOT NULL
      AND c.recycled_at IS NULL
  ),
  marked AS (
    UPDATE public.tcg_pack_cards c
       SET recycled_at = v_now
      FROM mine m
     WHERE c.pack_id = m.pack_id
       AND c.position = m.position
       AND c.recycled_at IS NULL
    RETURNING c.pack_id
  )
  SELECT count(*) INTO v_marked FROM marked;

  IF v_marked <> v_expected THEN
    -- Une au moins n'était pas à elle, ou venait d'être consommée ailleurs.
    RAISE EXCEPTION 'forge_cards_unavailable';
  END IF;

  -- 2) Aucun sujet ne doit se retrouver SANS exemplaire vivant. Le contrôle est
  --    fait APRÈS la réservation, exprès : avant, deux forges concurrentes le
  --    passeraient toutes les deux et videraient le sujet à elles deux.
  --    Les cartes consommées sont retrouvées par LEUR CLÉ, pas par
  --    `recycled_at = v_now` : `now()` est l'horodatage de transaction, et rien
  --    n'interdit à deux forges concurrentes de le partager. Une collision
  --    ferait compter les cartes de l'autre.
  SELECT count(*) INTO v_orphan
  FROM (
    SELECT DISTINCT coalesce(
             c.card_user_id::text, c.card_team_id::text,
             c.card_map_slug, c.card_mascot_slug, c.card_fanart_id::text
           ) AS subject_key
      FROM public.tcg_pack_cards c
      JOIN jsonb_array_elements(p_cards) AS e
        ON c.pack_id = (e->>'packId')::uuid
       AND c.position = (e->>'position')::smallint
  ) consumed
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.tcg_pack_cards c2
      JOIN public.tcg_packs p2 ON p2.id = c2.pack_id
     WHERE p2.tenant_id = p_tenant_id
       AND p2.user_id = p_user_id
       AND p2.opened_at IS NOT NULL
       AND c2.recycled_at IS NULL
       AND coalesce(
             c2.card_user_id::text, c2.card_team_id::text,
             c2.card_map_slug, c2.card_mascot_slug, c2.card_fanart_id::text
           ) = consumed.subject_key
  );

  IF v_orphan > 0 THEN
    RAISE EXCEPTION 'forge_would_empty_subject';
  END IF;

  -- 3) Le solde, lu depuis le REGISTRE et non depuis son cache : c'est le
  --    registre qui fait foi, et un cache périmé autoriserait une dépense à
  --    découvert.
  SELECT coalesce(sum(amount), 0) INTO v_balance
    FROM public.tcg_wallet_entries
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_balance < p_fee THEN
    RAISE EXCEPTION 'forge_insufficient_funds';
  END IF;

  -- 4) Le débit. `source_ref` est la PREMIÈRE carte consommée : elle ne peut
  --    l'être qu'une fois (réservation atomique ci-dessus), ce qui fait de
  --    (tenant, joueuse, 'card_forged', ref) une clé d'idempotence réelle.
  v_ref := 'forge:' || (p_cards->0->>'packId') || ':' || (p_cards->0->>'position');
  INSERT INTO public.tcg_wallet_entries
    (tenant_id, user_id, amount, source_kind, source_ref, created_at)
  VALUES (p_tenant_id, p_user_id, -p_fee, 'card_forged', v_ref, v_now);

  -- 5) Le paquet d'accueil de la carte forgée, créé DÉJÀ OUVERT : il n'y a
  --    rien à révéler, la joueuse a choisi ce qu'elle forgeait.
  INSERT INTO public.tcg_packs
    (tenant_id, user_id, source_kind, source_match_id, granted_at, opened_at)
  VALUES (p_tenant_id, p_user_id, 'forge', NULL, v_now, v_now)
  RETURNING id INTO v_pack_id;

  INSERT INTO public.tcg_pack_cards
    (pack_id, position, subject_kind, card_user_id, card_team_id,
     card_map_slug, card_mascot_slug, card_fanart_id, rarity, is_foil)
  VALUES (v_pack_id, 0, p_subject_kind, p_card_user_id, p_card_team_id,
          p_card_map_slug, p_card_mascot_slug, p_card_fanart_id, p_rarity, false);

  -- 6) Le cache de solde suit le registre.
  INSERT INTO public.tcg_wallets (tenant_id, user_id, balance, updated_at)
  VALUES (p_tenant_id, p_user_id, v_balance - p_fee, v_now)
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET balance = EXCLUDED.balance, updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'ok', true,
    'packId', v_pack_id,
    'rarity', p_rarity,
    'balance', v_balance - p_fee
  );
END;
$$;

COMMENT ON FUNCTION public.tcg_forge_card IS
  'Forge TCG : consomme des doublons + des pièces et rend une carte d''une rareté supérieure, en UNE transaction. Le sujet est choisi par l''application (la rareté se déduit des badges, calculés en TypeScript). Lève forge_cards_unavailable / forge_would_empty_subject / forge_insufficient_funds.';

-- Service-role uniquement : l'API authentifie la joueuse avant d'appeler.
REVOKE ALL ON FUNCTION public.tcg_forge_card FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tcg_forge_card FROM anon, authenticated;

-- ===========================================================================
-- `tcg_buy_cosmetic` — l'achat d'un habillage de vitrine, même discipline.
-- ===========================================================================
--
-- Deux écritures qui n'ont de sens qu'ensemble : débiter, et ajouter la clé aux
-- cosmétiques débloqués. Un échec entre les deux prélève des pièces pour rien —
-- le mode d'échec que `tcg_purchase_booster` existe déjà pour fermer.
--
-- LE VERROU DE LIGNE (`FOR UPDATE`) n'est pas décoratif : sans lui, deux achats
-- simultanés du même cosmétique passent tous les deux la vérification « déjà
-- acheté » et prélèvent deux fois pour un objet qu'on ne peut posséder qu'une.
--
-- LE CATALOGUE RESTE CÔTÉ APPLICATION (`utils/tcg/cosmetics.ts`) : un cadre est
-- un rendu — des classes CSS et un nom —, pas une donnée d'exploitation. La
-- fonction reçoit donc une clé et un prix déjà validés.

CREATE OR REPLACE FUNCTION public.tcg_buy_cosmetic(
  p_tenant_id uuid,
  p_user_id uuid,
  p_key text,
  p_price integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_balance integer;
  v_owned text[];
BEGIN
  IF p_price < 0 THEN
    RAISE EXCEPTION 'cosmetic_invalid_price';
  END IF;

  INSERT INTO public.tcg_showcases (tenant_id, user_id)
  VALUES (p_tenant_id, p_user_id)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  SELECT unlocked_cosmetics INTO v_owned
    FROM public.tcg_showcases
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id
   FOR UPDATE;

  IF p_key = ANY (coalesce(v_owned, '{}'::text[])) THEN
    RAISE EXCEPTION 'cosmetic_already_owned';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_balance
    FROM public.tcg_wallet_entries
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_balance < p_price THEN
    RAISE EXCEPTION 'cosmetic_insufficient_funds';
  END IF;

  INSERT INTO public.tcg_wallet_entries
    (tenant_id, user_id, amount, source_kind, source_ref, created_at)
  VALUES (p_tenant_id, p_user_id, -p_price, 'showcase_cosmetic',
          'cosmetic:' || p_key, v_now);

  UPDATE public.tcg_showcases
     SET unlocked_cosmetics = array_append(coalesce(unlocked_cosmetics, '{}'::text[]), p_key),
         updated_at = v_now
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  INSERT INTO public.tcg_wallets (tenant_id, user_id, balance, updated_at)
  VALUES (p_tenant_id, p_user_id, v_balance - p_price, v_now)
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET balance = EXCLUDED.balance, updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object('ok', true, 'balance', v_balance - p_price);
END;
$$;

COMMENT ON FUNCTION public.tcg_buy_cosmetic IS
  'Achat d''un cosmétique de vitrine, en UNE transaction : débit du registre + ajout à unlocked_cosmetics. Verrouille la ligne de vitrine (FOR UPDATE) pour que deux achats simultanés du même objet ne passent pas tous les deux. Lève cosmetic_already_owned / cosmetic_insufficient_funds. Le catalogue et le prix vivent côté application (utils/tcg/cosmetics.ts).';

REVOKE ALL ON FUNCTION public.tcg_buy_cosmetic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tcg_buy_cosmetic FROM anon, authenticated;
