-- Seed : la carte TCG « Arukdo » (catégorie « L'association », rareté rare).
-- Date: 2026-10-12
--
-- WHY. Arukdo organise la Women's Cup et préside l'association : sa carte
--   est un visuel de l'association, pas une carte joueuse. Elle vit donc
--   dans `tcg_fanart_cards` avec `category = 'association'`
--   (cf. `tcg_association_cards.sql`, docs/TCG.md « La catégorie
--   L'association ») :
--     - la rareté y est CHOISIE à la main (`rare`), là où celle d'une carte
--       joueuse dérive des badges (`utils/tcg/rarity.ts`) et ne se force pas ;
--     - aucune file de modération : c'est le staff qui dépose ;
--     - tirage (emplacement de décor), échanges, forge, vitrine et recyclage
--       la traitent sans une ligne de code de plus.
--   L'image est la photo de son chat, fournie par Arukdo lui-même : aucune
--   personne n'y figure, le garde-fou de consentement d'une photo de
--   joueuse (docs/TCG.md §2) n'a rien à protéger ici.
--
-- VOIE RECOMMANDÉE : NE PAS PASSER PAR CE FICHIER. L'onglet « L'association »
--   de /admin/tcg (« Déposer une image ») fait exactement la même chose en un
--   geste — envoi du fichier vérifié par magic bytes, ligne `approved`,
--   journal staff, nettoyage du fichier si l'insertion échoue. Ce seed est la
--   voie CLI, pour qui préfère tout faire en SQL :
--     1. déposer `tmp-arukdo-card/arukdo-chat-v1.webp` dans le bucket PUBLIC
--        `teams-images`, au chemin EXACT `tcg-association/arukdo-chat-v1.webp`
--        (Content-Type image/webp) ;
--     2. exécuter ce fichier.
--   L'ordre compte : une ligne posée avant le fichier donnerait une carte
--   sans image dans les paquets tirés entre-temps.
--
-- IDEMPOTENCE. `source_ref = 'staff:arukdo:v1'`, unique par espace
--   (`uq_tcg_fanart_source_ref`) : rejouer ne crée pas de seconde carte. Une
--   v2 (nouvelle photo) sera une NOUVELLE carte, comme le voxel du nœud : on
--   n'écrase pas l'image de cartes déjà possédées.
--
-- CAVEATS:
--   - Espace par défaut seulement (conference, ce69a726-…).
--   - `submitted_by` NULL : la carte appartient à l'association
--     (`tcg_fanart_submitter_check`), pas au compte qui l'a posée.
--   - `reviewed_by` NULL : personne n'est tracé en base par cette voie — une
--     raison de plus de préférer l'écran staff.
--   - Rollback : ne PAS supprimer (`tcg_pack_cards` la référence en
--     ON DELETE RESTRICT dès le premier tirage) ; la retirer via l'écran
--     (`revoked`), ou `UPDATE … SET status = 'revoked'`.
--   - NON APPLIQUÉ.

BEGIN;

INSERT INTO public.tcg_fanart_cards (
  tenant_id,
  category,
  submitted_by,
  source_ref,
  title,
  artist_name,
  artist_url,
  image_path,
  status,
  rarity,
  licence_accepted_at,
  reviewed_at
)
SELECT
  'ce69a726-773e-4d12-b5eb-d2503aa752b4'::uuid,
  'association',
  NULL,
  'staff:arukdo:v1',
  'Arukdo',
  'Arukdo',
  NULL,
  'tcg-association/arukdo-chat-v1.webp',
  'approved',
  'rare',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.tcg_fanart_cards
  WHERE tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'::uuid
    AND source_ref = 'staff:arukdo:v1'
);

COMMIT;
