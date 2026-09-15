-- Migration : solde TCG recalculé et dépensé SOUS VERROU, en une transaction.
-- Date: 2026-09-15
-- Statut : NON APPLIQUÉE à la rédaction.
--
-- WHY — deux défauts confirmés par l'audit de sécurité du 2026-09-15 :
--
--   1. ACHATS CONCURRENTS SOUS-PAYÉS. `POST /api/player/tcg/booster` débitait
--      le CACHE (`tcg_wallets.balance`, écriture conditionnelle), créait le
--      paquet, PUIS écrivait au registre — trois requêtes PostgREST, trois
--      transactions. Entre-temps, n'importe quel `refreshBalance` (un gain, un
--      recyclage, un autre achat) relisait un registre pas encore débité et
--      ÉCRASAIT le cache sans condition : le débit disparaissait, le troisième
--      achat voyait un solde plein. Constat : 3 boosters pour le prix de 2, un
--      registre négatif ramené silencieusement à 0 par le plafond du recalcul.
--      L'écriture conditionnelle ne protégeait que du cas « deux achats
--      lisent la même valeur », pas d'un recalcul intercalé.
--
--   2. SOLDE FAUX AU-DELÀ DE 1000 ÉCRITURES. `refreshBalance` et la route
--      `admin/tcg/grant` sommaient en JavaScript un `select('amount')` non
--      paginé : PostgREST coupe à 1000 lignes (`max_rows`). Au-delà, le solde
--      se figeait sur les 1000 premières lignes, sans erreur.
--
-- LE PRINCIPE. Toute écriture qui DÉCIDE sur un solde passe par une fonction
-- qui, dans UNE transaction :
--   a. verrouille la ligne `tcg_wallets` (`SELECT … FOR UPDATE`, créée au besoin),
--   b. relit le solde par `SUM(amount)` sur le registre — jamais le cache,
--   c. contrôle, écrit au registre, réécrit le cache.
-- Le verrou sérialise les dépenses d'une même joueuse ; `SUM` côté base ne
-- connaît pas de plafond de lignes. Sous READ COMMITTED, chaque instruction
-- PL/pgSQL prend un nouvel instantané : le `SUM` qui suit l'obtention du verrou
-- voit donc ce que la transaction concurrente vient de valider.
--
-- Les GAINS n'ont pas besoin du verrou pour s'écrire (un gain ne peut pas
-- rendre un solde négatif) : ils insèrent, puis appellent
-- `tcg_refresh_wallet_balance`, qui attend un achat en vol et recalcule APRÈS
-- lui. Le dernier recalcul voit tout ce qui est validé.
--
-- TROIS FONCTIONS, toutes SECURITY DEFINER, `search_path` épinglé, EXECUTE
-- réservé à service_role (appelées par `supabaseAdmin`) :
--   - tcg_refresh_wallet_balance(tenant, user) → integer
--   - tcg_purchase_booster(tenant, user, price) → jsonb
--       { status: 'ok', pack_id, balance, price }
--       { status: 'insufficient_funds', balance, price }
--   - tcg_admin_debit(tenant, user, cost, source_ref, note) → jsonb
--       { status: 'ok', entry_id, balance }
--       { status: 'insufficient', balance }
--     Une clé d'idempotence déjà utilisée lève 23505 (contrainte du registre),
--     comme l'insertion directe : la route relit par la clé et répond « rejeu ».
--
-- LA MONNAIE SE GAGNE, ELLE NE S'ACHÈTE PAS. `tcg_purchase_booster` dépense des
-- pièces GAGNÉES ; aucune de ces fonctions ne connaît de moyen de paiement
-- (boîtes à butin interdites BE/NL, surveillées par l'ANJ — cf. docs/TCG.md).
--
-- ORDRE DE DÉPLOIEMENT : appliquer AVANT le site.
--   Site déployé SANS cette migration :
--     - `refreshBalance` détecte la fonction absente (PGRST202 / 42883) et se
--       replie sur une somme PAGINÉE en JavaScript : le plafond des 1000 lignes
--       est levé, la course du point 1 subsiste pour ce repli seulement ;
--     - l'achat de booster est REFUSÉ (503 `purchase_unavailable`) plutôt que
--       fait sans verrou ;
--     - le retrait staff (`admin_grant` négatif) est REFUSÉ (503
--       `WITHDRAWAL_UNAVAILABLE`) ; les crédits staff restent possibles.
--   Rien n'est perdu : appliquer la migration rouvre les deux gestes.
--
-- IDEMPOTENTE : CREATE OR REPLACE, REVOKE/GRANT rejouables. Aucune table ni
-- colonne modifiée (schema-snapshot.json inchangé).

BEGIN;

/* ---------------------------------------------------------------------------
 * 1) Recalcul du cache depuis le registre, sous verrou
 * ------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.tcg_refresh_wallet_balance(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sum bigint;
  v_balance integer;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_wallet' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- La ligne doit exister pour être verrouillée.
  INSERT INTO public.tcg_wallets (tenant_id, user_id, balance)
  VALUES (p_tenant_id, p_user_id, 0)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  PERFORM 1
  FROM public.tcg_wallets
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id
  FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.tcg_wallet_entries
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  -- Le CHECK interdit un cache négatif : une somme négative signale un
  -- registre incohérent, elle est plafonnée à zéro (et la route l'aura évitée).
  v_balance := LEAST(GREATEST(v_sum, 0), 2147483647)::integer;

  UPDATE public.tcg_wallets
  SET balance = v_balance, updated_at = now()
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  RETURN v_balance;
END;
$$;

/* ---------------------------------------------------------------------------
 * 2) Achat d'un booster : contrôle, paquet, registre, cache — une transaction
 * ------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.tcg_purchase_booster(
  p_tenant_id uuid,
  p_user_id uuid,
  p_price integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sum bigint;
  v_pack_id uuid;
  v_balance integer;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'invalid_purchase' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Pré-contrôle SANS verrou ni écriture : qui n'a pas les moyens n'obtient
  -- pas de porte-monnaie créé pour rien. Il ne décide jamais d'un achat.
  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.tcg_wallet_entries
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_sum < p_price THEN
    RETURN jsonb_build_object(
      'status', 'insufficient_funds',
      'balance', GREATEST(v_sum, 0),
      'price', p_price
    );
  END IF;

  INSERT INTO public.tcg_wallets (tenant_id, user_id, balance)
  VALUES (p_tenant_id, p_user_id, 0)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  -- LE VERROU. Un second achat de la même joueuse attend ici la fin du premier.
  PERFORM 1
  FROM public.tcg_wallets
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id
  FOR UPDATE;

  -- Relu SOUS verrou : c'est cette somme qui fait foi.
  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.tcg_wallet_entries
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_sum < p_price THEN
    v_balance := LEAST(GREATEST(v_sum, 0), 2147483647)::integer;
    UPDATE public.tcg_wallets
    SET balance = v_balance, updated_at = now()
    WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
    RETURN jsonb_build_object(
      'status', 'insufficient_funds',
      'balance', v_balance,
      'price', p_price
    );
  END IF;

  -- Paquet FERMÉ : `source_kind = 'purchase'` + `source_match_id` NULL, exigés
  -- ensemble par `tcg_packs_source_coherent`.
  INSERT INTO public.tcg_packs (tenant_id, user_id, source_kind, source_match_id)
  VALUES (p_tenant_id, p_user_id, 'purchase', NULL)
  RETURNING id INTO v_pack_id;

  INSERT INTO public.tcg_wallet_entries (
    tenant_id, user_id, amount, source_kind, source_ref
  )
  VALUES (p_tenant_id, p_user_id, -p_price, 'booster_purchase', v_pack_id::text);

  v_balance := LEAST(GREATEST(v_sum - p_price, 0), 2147483647)::integer;
  UPDATE public.tcg_wallets
  SET balance = v_balance, updated_at = now()
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'pack_id', v_pack_id,
    'balance', v_balance,
    'price', p_price
  );
END;
$$;

/* ---------------------------------------------------------------------------
 * 3) Retrait staff (`admin_grant` négatif) : jamais sous zéro, sous verrou
 * ------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.tcg_admin_debit(
  p_tenant_id uuid,
  p_user_id uuid,
  p_cost integer,
  p_source_ref text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sum bigint;
  v_entry_id uuid;
  v_balance integer;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_cost IS NULL OR p_cost <= 0
     OR p_source_ref IS NULL OR length(p_source_ref) = 0 THEN
    RAISE EXCEPTION 'invalid_debit' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.tcg_wallets (tenant_id, user_id, balance)
  VALUES (p_tenant_id, p_user_id, 0)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  PERFORM 1
  FROM public.tcg_wallets
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id
  FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.tcg_wallet_entries
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_sum < p_cost THEN
    v_balance := LEAST(GREATEST(v_sum, 0), 2147483647)::integer;
    UPDATE public.tcg_wallets
    SET balance = v_balance, updated_at = now()
    WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
    RETURN jsonb_build_object('status', 'insufficient', 'balance', v_balance);
  END IF;

  -- Une clé déjà servie lève 23505 ici : la transaction est annulée en entier,
  -- et la route constate le rejeu en relisant par la clé.
  INSERT INTO public.tcg_wallet_entries (
    tenant_id, user_id, amount, source_kind, source_ref, note
  )
  VALUES (p_tenant_id, p_user_id, -p_cost, 'admin_grant', p_source_ref, p_note)
  RETURNING id INTO v_entry_id;

  v_balance := LEAST(GREATEST(v_sum - p_cost, 0), 2147483647)::integer;
  UPDATE public.tcg_wallets
  SET balance = v_balance, updated_at = now()
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'entry_id', v_entry_id,
    'balance', v_balance
  );
END;
$$;

COMMENT ON FUNCTION public.tcg_refresh_wallet_balance(uuid, uuid) IS
  'Réécrit tcg_wallets.balance depuis SUM(tcg_wallet_entries.amount), sous verrou FOR UPDATE de la ligne de porte-monnaie. Sans plafond de lignes (le recalcul JS était coupé à 1000 par PostgREST). EXECUTE réservé à service_role.';
COMMENT ON FUNCTION public.tcg_purchase_booster(uuid, uuid, integer) IS
  'Achat d''un booster TCG en une transaction : verrou du porte-monnaie, contrôle du solde par SUM du registre, paquet fermé, écriture booster_purchase, cache. Les pièces sont GAGNÉES : aucun moyen de paiement. EXECUTE réservé à service_role.';
COMMENT ON FUNCTION public.tcg_admin_debit(uuid, uuid, integer, text, text) IS
  'Retrait staff (admin_grant négatif) sous verrou : jamais sous zéro, source_ref = clé d''idempotence (23505 sur rejeu). EXECUTE réservé à service_role.';

REVOKE ALL ON FUNCTION public.tcg_refresh_wallet_balance(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tcg_refresh_wallet_balance(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.tcg_refresh_wallet_balance(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tcg_refresh_wallet_balance(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.tcg_purchase_booster(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tcg_purchase_booster(uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.tcg_purchase_booster(uuid, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tcg_purchase_booster(uuid, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.tcg_admin_debit(uuid, uuid, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tcg_admin_debit(uuid, uuid, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.tcg_admin_debit(uuid, uuid, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tcg_admin_debit(uuid, uuid, integer, text, text) TO service_role;

COMMIT;

-- PostgREST découvre les nouvelles fonctions au rechargement de son cache.
NOTIFY pgrst, 'reload schema';
