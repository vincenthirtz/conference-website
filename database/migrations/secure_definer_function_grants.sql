/* ---------------------------------------------------------------------------
 * secure_definer_function_grants.sql — fermer les fonctions SECURITY DEFINER
 * que n'importe qui pouvait appeler
 *
 * CE QUI ÉTAIT OUVERT, ET POURQUOI C'EST GRAVE.
 *
 * `reassign_captain(p_team_id, p_new_captain, p_tenant)` est SECURITY DEFINER,
 * exposée en RPC par PostgREST (`/rest/v1/rpc/reassign_captain`), et son corps
 * ne contrôle PAS son appelante : elle verrouille la ligne d'équipe et
 * réassigne le capitanat. `EXECUTE` était accordé à `PUBLIC`, `anon` ET
 * `authenticated`.
 *
 * La clé `anon` est publique par construction — elle part dans le bundle
 * navigateur —, et les identifiants d'équipe se lisent sur les pages publiques.
 * N'importe qui pouvait donc se nommer capitaine de n'importe quelle équipe, et
 * de là gérer son roster. L'autorisation existe bel et bien, mais UNE COUCHE
 * TROP HAUT : dans `pages/api/teams/transfer-captain.ts`, que rien n'obligeait
 * à traverser.
 *
 * LES TROIS AUTRES sont des fonctions de DÉCLENCHEUR
 * (`clear_supporter_role_on_roster_join`, `handle_caster_themes_updated_at`,
 * `sync_team_member_battletag_verification`). Les appeler directement échoue,
 * faute de contexte de déclencheur : le risque est théorique. Elles sont
 * révoquées dans le même geste parce qu'une surface qu'on n'utilise pas n'a
 * aucune raison d'être exposée — et parce qu'une liste d'exceptions « celles-ci
 * sont inoffensives » est exactement ce qu'on relit mal dans six mois.
 *
 * RÉVOQUER `PUBLIC` EST INDISPENSABLE. L'ACL portait `=X/postgres`, c'est-à-dire
 * EXECUTE pour PUBLIC, EN PLUS des grants nommés. Ne révoquer que `anon` et
 * `authenticated` aurait laissé le privilège intact par héritage — et le
 * correctif aurait été un placebo, ce qui est pire qu'une absence de correctif
 * puisqu'on l'aurait coché.
 *
 * `service_role` GARDE SON DROIT : c'est par là que le site appelle, depuis
 * `supabaseAdmin`, après avoir vérifié qui demande.
 *
 * IDEMPOTENT : révoquer un droit déjà absent ne fait rien.
 * ------------------------------------------------------------------------- */

BEGIN;

-- LA FAILLE. Seule fonction non-déclencheur du lot, et la seule qui écrivait.
REVOKE EXECUTE ON FUNCTION public.reassign_captain(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- Surface inutile : des fonctions de déclencheur n'ont rien à faire en RPC.
REVOKE EXECUTE ON FUNCTION public.clear_supporter_role_on_roster_join()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_caster_themes_updated_at()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_team_member_battletag_verification()
  FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
