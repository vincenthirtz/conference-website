-- Migration : le registre accepte l'origine « cadeau d'accueil supportrice ».
-- Date: 2026-09-14
--
-- WHY:
--   Une supportrice n'a aucune victoire à son actif : les six autres sources de
--   gain supposent toutes qu'on joue. Sa seule voie ouverte est le drop Twitch
--   pendant un direct — donc hors direct, elle arrive sur une collection vide
--   sans rien à faire, et le rôle qu'on vient de lui donner ne mène nulle part.
--   Le cadeau d'accueil ouvre la porte au lieu de la montrer.
--
-- POURQUOI UNE ORIGINE DISTINCTE DE `welcome_gift`, et non un réemploi.
--   `welcome_gift` vaut UNE FOIS PAR ÉDITION et se distribue aux rosters
--   engagés : son `source_ref` porte le TOURNOI. Celui-ci vaut UNE FOIS PAR
--   COMPTE : son `source_ref` porte le TENANT. L'unicité du registre étant
--   `(tenant_id, user_id, source_kind, source_ref)`, faire porter deux règles
--   d'unicité différentes à une même clé aurait rendu « une fois » ambigu — et
--   `earnSources.ts` déclare un `refKind` par source précisément pour que cette
--   question ait une réponse écrite.
--
--   Le corollaire est voulu : une supportrice qui rejoindrait plus tard un
--   roster pourra recevoir le cadeau de son ÉDITION en plus de celui-ci. Ce
--   sont deux accueils différents. L'inverse est refusé côté applicatif — on ne
--   sert pas le cadeau supportrice à qui figure déjà sur un roster.
--
-- CE QU'IL NE FAUT PAS REFAIRE, et pourquoi cette migration est courte.
--   Le 2026-09-14 au matin, élargir `tcg_packs_source_kind_check` sans toucher
--   `tcg_packs_source_coherent` a fait rejeter 58 paquets en silence : une
--   table peut porter PLUSIEURS CHECK sur la même colonne, et le second ne
--   nommait pas la colonne dans son nom. Les contraintes des DEUX tables ont
--   donc été énumérées avant d'écrire ceci :
--
--     SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = ANY (ARRAY['public.tcg_packs'::regclass,
--                                 'public.tcg_wallet_entries'::regclass])
--       AND contype = 'c';
--
--   Résultat VÉRIFIÉ, pas supposé : `tcg_packs` admet déjà `welcome` dans ses
--   deux contraintes, avec `source_match_id IS NULL`. Le paquet d'accueil d'une
--   supportrice est un paquet `welcome` comme un autre. AUCUNE contrainte de
--   `tcg_packs` n'est touchée ici.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : elle ne distribue rien. Elle lève un
--   verrou ; le cadeau se réclame depuis l'espace joueuse, un geste par compte.
--
-- CAVEATS:
--   - Idempotente : DROP CONSTRAINT IF EXISTS avant recréation.
--   - Purement ADDITIVE : un CHECK élargi n'invalide aucune ligne existante.
--   - La liste est RECOPIÉE en entier parce qu'un CHECK se remplace, il ne
--     s'augmente pas. Elle doit rester en phase avec `earnSources.ts`, dont le
--     drapeau `schemaReady` bascule AVEC cette migration — ni avant (l'écriture
--     serait rejetée en production), ni après (la voie resterait éteinte en
--     silence).
--   - APPLIQUÉE EN PRODUCTION le 2026-09-14.

ALTER TABLE public.tcg_wallet_entries
  DROP CONSTRAINT IF EXISTS tcg_wallet_entries_source_kind_check;

ALTER TABLE public.tcg_wallet_entries
  ADD CONSTRAINT tcg_wallet_entries_source_kind_check
  CHECK (
    source_kind IN (
      'match_win',
      'scrim_win',
      'booster_purchase',
      'admin_grant',
      'card_recycled',
      'twitch_drop',
      -- Une fois par personne et par ÉDITION : `source_ref` = le tournoi.
      'welcome_gift',
      -- Une fois par personne, point : `source_ref` = le TENANT. C'est ce qui
      -- distingue les deux cadeaux, et l'unicité du registre l'applique seule.
      'supporter_welcome'
    )
  );

-- PostgREST doit revoir son cache de schéma, sinon la contrainte modifiée reste
-- invisible à l'API jusqu'au prochain redémarrage.
NOTIFY pgrst, 'reload schema';
