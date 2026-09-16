-- Migration : scrims et recrutement ouverts entre espaces volontaires.
-- Date: 2026-09-16
--
-- WHY. Lot 4 du rapport de comparaison : l'effet réseau est ce qui fait la
--   croissance du concurrent — un tournoi publié chez lui est vu par toute la
--   communauté. Chez nous, chaque espace est une île : une équipe qui cherche
--   un adversaire ne voit que les équipes de SON espace, et une joueuse libre
--   n'est lue que par les capitaines du même espace. C'est la contrepartie de
--   la marque blanche, et elle coûte cher aux petits espaces.
--
-- CE QUI EST OUVERT, ET PAR QUI. Rien n'est global : chaque espace décide, et
--   ne voit que s'il donne. Deux interrupteurs distincts parce que les deux
--   décisions n'ont pas le même poids — ouvrir ses créneaux de scrim n'engage
--   qu'un calendrier, ouvrir son recrutement expose des annonces d'équipes.
--
-- POURQUOI UNE TROISIÈME COLONNE, SUR LES JOUEUSES. `tenants.*` décide pour ce
--   qui appartient à l'espace : ses équipes, leurs créneaux, leurs annonces de
--   recrutement. Une joueuse libre, elle, n'appartient à personne : elle s'est
--   signalée sur UN site, et étendre sa visibilité à d'autres sans la
--   consulter élargirait la portée d'un consentement qu'elle n'a pas donné.
--   `free_players.share_across_tenants` porte donc SA décision, à elle, et le
--   défaut est faux — les annonces déjà déposées ne partent nulle part.
--   (Même doctrine que `player_discovery_profiles` : opt-in, jamais rétroactif.)
--
-- CAVEATS:
--   - Additive et idempotente. Aucune valeur rétroactive : par défaut, rien ne
--     change pour personne.
--   - Rollback : DROP COLUMN sur les trois colonnes ; les listes redeviennent
--     strictement mono-espace.
--   - APPLIQUÉE en production le 2026-09-16, instantané de schéma régénéré.

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS network_share_scrims boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS network_share_recruitment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.network_share_scrims IS
  'L''espace partage-t-il les recherches de scrim de ses équipes avec les autres espaces volontaires ? Réciproque : il ne voit les leurs que s''il partage les siennes.';

COMMENT ON COLUMN public.tenants.network_share_recruitment IS
  'L''espace partage-t-il les annonces de recrutement de ses équipes avec les autres espaces volontaires ? Réciproque.';

ALTER TABLE public.free_players
  ADD COLUMN IF NOT EXISTS share_across_tenants boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.free_players.share_across_tenants IS
  'Décision de la JOUEUSE : son annonce peut-elle être lue depuis les autres espaces volontaires ? Défaut faux — l''espace ne peut pas la prendre à sa place.';

COMMIT;
