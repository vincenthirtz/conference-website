-- Migration : une chaîne de diffusion PAR DÉFAUT au niveau du tournoi.
-- Date: 2026-09-20
--
-- WHY:
--   Le tableau de bord staff alertait « 27 match(s) a venir sans stream
--   attribue » sur la Cup 2026 — les 27 matchs restants, aucun avec
--   `stream_url`. L'alerte disait vrai colonne par colonne, et faux dans les
--   faits : tout ce qui est diffusé l'est sur NOTRE chaîne. Renseigner 27 fois
--   la même URL à la main était le seul moyen de la faire taire, et il aurait
--   fallu recommencer à chaque match créé.
--
--   La diffusion est une propriété du TOURNOI, pas de chaque match : on
--   l'écrit une fois ici, et un match n'a besoin d'une URL propre que s'il
--   déroge (chaîne partenaire, co-stream d'une équipe).
--
-- CAVEATS:
--   - NULLABLE et sans valeur par défaut : un tournoi qui n'est pas diffusé ne
--     doit pas hériter d'un lien qui mènerait à une chaîne éteinte. L'alerte du
--     tableau de bord reste donc pertinente pour ces tournois-là.
--   - Ce champ ne dit PAS qu'un match est casté — seulement où regarder quand
--     il l'est. Un vrai « ce match est diffusé » se lit sur les assignations de
--     cast, qui restent la source pour savoir qui commente quoi.
--   - Idempotente.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS default_stream_url text;

COMMENT ON COLUMN public.tournaments.default_stream_url IS
  'Chaîne de diffusion par défaut du tournoi. Un match sans stream_url propre en hérite ; NULL = tournoi non diffusé.';

NOTIFY pgrst, 'reload schema';
