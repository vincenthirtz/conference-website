-- Permissions accordées À L'UNITÉ, en plus de celles du rôle.
--
-- Jusqu'ici, les droits dérivaient du SEUL rôle (utils/staffPermissions.ts) :
-- pour confier une tâche précise à quelqu'un, il fallait lui donner un rôle
-- entier. « Donner le Drive de l'asso à la trésorière » revenait donc à la
-- faire admin — c'est-à-dire à lui donner le site.
--
-- Cette colonne ajoute la seconde source : permissions effectives = celles du
-- rôle UNION celles accordées ici. Elle n'en retire aucune — un droit se
-- retire en changeant de rôle, pas en soustrayant de cette liste. Une
-- soustraction créerait un état où deux personnes du même rôle n'ont pas les
-- mêmes droits sans que rien ne le dise, et où lire le rôle ne renseignerait
-- plus sur rien.
--
-- Le contenu n'est PAS contraint par un enum SQL : le catalogue vit dans le
-- code (union typée), et une valeur inconnue y est ignorée à la lecture. Un
-- CHECK ici imposerait une migration à chaque droit ajouté, et ferait échouer
-- un déploiement dont le code est déjà en avance.
--
-- Idempotent : re-jouable sans effet.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS extra_permissions text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN staff.extra_permissions IS
  'Permissions accordées à l''unité, en PLUS de celles du rôle (jamais en moins). Valeurs = STAFF_PERMISSION_VALUES côté code ; une valeur inconnue est ignorée à la lecture.';

-- Index partiel : la très grande majorité des lignes garde le tableau vide, et
-- les seules requêtes utiles portent sur « qui a des droits en plus ».
CREATE INDEX IF NOT EXISTS idx_staff_extra_permissions
  ON staff USING GIN (extra_permissions)
  WHERE extra_permissions <> '{}';
