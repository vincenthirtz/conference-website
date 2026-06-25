-- Migration: activer RLS sur `news` et `news_comments`
-- Date: 2026-06-25
--
-- WHY:
--   `news` et `news_comments` ont été créées via des fichiers loose non
--   versionnés (database/news.sql, database/news_comments.sql) qui n'ont JAMAIS
--   activé RLS. Résultat : les deux tables sont reachable via PostgREST avec RLS
--   désactivé -> toute clé anon ou authenticated peut lire/insérer directement.
--   Concrètement, ça ouvre un vecteur de spam de commentaires (INSERT anon
--   direct sur news_comments, contournant le CAPTCHA + honeypot + rate-limit de
--   /api/news/comments) et une lecture brute des brouillons (news.status =
--   'draft') non encore publiés.
--
--   Toutes les autres tables tier-1 ont déjà leur baseline RLS
--   (cf. enable_rls_baseline_tables.sql, enable_rls_remaining_tables.sql,
--   enable_rls_contact_submissions.sql). Ces deux tables sont les dernières à
--   passer au travers.
--
-- CHEMIN DE LECTURE CONSTATÉ — service-role-only (aucun accès anon direct) :
--   - /api/news/index.ts (GET list), /api/news/rss.ts, /api/news/comments.ts
--     (GET + POST) : `supabaseAdmin ?? getServerClient(req, res)`. Le chemin
--     primaire est supabaseAdmin (service_role -> bypass RLS).
--   - pages/index.tsx (getStaticProps), pages/news/[slug].tsx (getStaticProps),
--     pages/sitemap.xml.ts (getServerSideProps), pages/admin/news/* : toutes ces
--     lectures passent par supabaseAdmin côté serveur.
--   - Le composant Comments (browser) lit ET écrit UNIQUEMENT via
--     fetch('/api/news/comments') — jamais un client Supabase anon côté nav.
--   => Aucune lecture/écriture publique directe. Activer RLS SANS policy ne
--      casse donc aucun flux d'affichage public ni la soumission de commentaires
--      (qui transite par l'API service_role).
--
-- WHAT:
--   - ENABLE ROW LEVEL SECURITY sur public.news et public.news_comments, SANS
--     aucune policy (même pattern que enable_rls_contact_submissions.sql /
--     enable_rls_baseline_tables.sql).
--   - Service-role-only : ni anon ni authenticated n'y accèdent. Toutes les
--     lectures publiques (news publiées, commentaires) et écritures (ingest bot,
--     commentaires, admin) passent par supabaseAdmin (service_role bypass RLS).
--   - On n'ouvre PAS de policy SELECT publique : inutile ici puisque l'affichage
--     public ne lit jamais ces tables avec une clé anon. Ajouter une policy
--     serait du sur-périmètre (et exposerait potentiellement les brouillons).
--   - On n'ouvre PAS de policy INSERT pour les commentaires : ils sont insérés
--     par /api/news/comments via supabaseAdmin, derrière CAPTCHA + honeypot +
--     rate-limit. Ouvrir un INSERT anon recréerait exactement le trou de spam
--     que cette migration vient fermer.
--
-- CAVEATS:
--   - Idempotente : `ENABLE ROW LEVEL SECURITY` est sans effet si RLS est déjà
--     actif (pas d'erreur). Aucune policy créée -> rien à DROP/recréer.
--   - Pas de changement de FK ni de schéma -> reload du schema cache PostgREST
--     NON requis pour cette migration.
--   - Si un jour une vitrine publique devait lire `news` sans passer par l'API
--     (client anon côté navigateur), il faudra AJOUTER en follow-up une policy
--     SELECT restreinte aux articles publiés, ex :
--       CREATE POLICY news_select_published ON public.news
--         FOR SELECT TO anon, authenticated
--         USING (status = 'published');
--     Tant que la lecture passe par supabaseAdmin, cette policy reste inutile.

BEGIN;

-- Service-role-only : aucune policy.
ALTER TABLE public.news          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_comments ENABLE ROW LEVEL SECURITY;

COMMIT;
