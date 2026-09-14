-- Migration : le registre accepte l'origine « cadeau de bienvenue ».
-- Date: 2026-09-14
--
-- WHY:
--   Les participantes de la Cup 2026 arrivent sur un TCG dont le porte-monnaie
--   est vide, et le resteront jusqu'à leur première victoire. Or la première
--   journée n'a pas encore eu lieu : au moment où l'on veut qu'elles découvrent
--   la collection, rien ne leur permet d'y toucher. Un cadeau d'accueil ouvre
--   la porte au lieu de la montrer.
--
--   `tcg_wallet_entries_source_kind_check` n'admet pas `welcome_gift`. Le
--   registre des sources (`utils/tcg/earnSources.ts`) l'encode par
--   `schemaReady`, et son en-tête est explicite : ce drapeau COMMANDE. Migrer
--   sans basculer laisse la voie éteinte en silence, basculer sans migrer fait
--   rejeter l'écriture en production. Les deux gestes vont ensemble, et
--   `tests/unit/tcgEarnSources.test.ts` le rappelle en assertant la liste
--   exacte des sources écrivables.
--
-- POURQUOI `source_ref` PORTE LE TOURNOI. L'unicité du registre est
--   `(tenant_id, user_id, source_kind, source_ref)`. En y mettant l'identifiant
--   du tournoi, « un cadeau par personne et par édition » est garanti par le
--   SCHÉMA, sans compteur ni vérification applicative — la même mécanique que
--   `twitch_drop`, dont le `source_ref` porte le direct. Rejouer l'attribution
--   ne crée alors rien : c'est ce qui rend l'opération sûre à relancer, y
--   compris après l'arrivée d'une joueuse dans un roster.
--
--   Le corollaire est voulu : une joueuse qui participera à une ÉDITION
--   suivante recevra un nouveau cadeau. C'est un cadeau de bienvenue au
--   tournoi, pas au site.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : elle ne distribue rien. Elle lève un
--   verrou ; l'attribution est un geste de staff, explicite et journalisé
--   (`/api/admin/tcg/welcome-gift`). Créditer 58 comptes ne doit pas être
--   l'effet de bord d'un déploiement.
--
-- CAVEATS:
--   - Idempotente : DROP CONSTRAINT IF EXISTS avant recréation.
--   - Purement ADDITIVE : un CHECK ÉLARGI. Élargir une contrainte ne peut
--     invalider aucune ligne existante.
--   - La liste est RECOPIÉE en entier parce qu'un CHECK se remplace, il ne
--     s'augmente pas. Elle doit rester en phase avec `earnSources.ts`.

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
      -- Cadeau d'accueil d'une édition. `source_ref` porte le TOURNOI, donc
      -- l'unicité du registre réalise « un cadeau par personne et par édition »
      -- sans compteur.
      'welcome_gift'
    )
  );

/* ---------------------------------------------------------------------------
 * 2) Le registre des PAQUETS accepte la même origine
 *
 * `tcg_packs` porte son propre CHECK, avec un vocabulaire distinct de celui du
 * porte-monnaie (`victory` / `purchase`, et non `match_win` / `booster_purchase`).
 * On y ajoute donc `welcome`, dans SA langue.
 *
 * POURQUOI UN PAQUET ET PAS SEULEMENT DES PIÈCES : ne créditer que de la
 * monnaie exigerait une seconde démarche — aller acheter — avant de procurer
 * la moindre joie, alors que l'ouverture d'un paquet EST le moment qui compte
 * dans un TCG. C'est aussi l'invariant que `tests/unit/tcgEarnSources.test.ts`
 * défend : toute source de gain fait apparaître un paquet.
 *
 * ⚠️ L'IDEMPOTENCE NE VIENT PAS D'ICI, et c'est le piège de cette table.
 * `tcg_packs_one_per_match` est unique sur `(tenant_id, user_id,
 * source_match_id)`, mais un cadeau n'a pas de match : `source_match_id` vaut
 * NULL, et Postgres considère deux NULL comme DISTINCTS. L'index ne bloque donc
 * rien — rejouer l'attribution créerait un paquet de plus à chaque passage.
 *
 * La protection est ailleurs, dans l'ORDRE d'écriture : l'attribution insère
 * d'abord l'entrée de porte-monnaie, dont l'unicité `(tenant_id, user_id,
 * source_kind, source_ref)` est bien réelle, et n'accorde un paquet qu'aux
 * joueuses que le `ON CONFLICT DO NOTHING ... RETURNING` a effectivement
 * rendues. Même mécanique que `grantVictoryRewards`, dans l'autre sens.
 * ------------------------------------------------------------------------- */

ALTER TABLE public.tcg_packs
  DROP CONSTRAINT IF EXISTS tcg_packs_source_kind_check;

ALTER TABLE public.tcg_packs
  ADD CONSTRAINT tcg_packs_source_kind_check
  CHECK (source_kind IN ('victory', 'purchase', 'welcome'));

-- PostgREST doit revoir son cache de schéma, sinon les contraintes modifiées
-- restent invisibles à l'API jusqu'au prochain redémarrage.
NOTIFY pgrst, 'reload schema';
