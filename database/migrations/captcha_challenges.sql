-- Migration : les défis de captcha vivent côté SERVEUR.
-- Date: 2026-09-16
--
-- WHY (backlog Q037). Le jeton remis au navigateur était un JSON base64url
--   `{"answer":33,"issuedAt":…,"nonce":…,"hmac":…}` : la signature empêchait de
--   le FORGER, pas de le LIRE. Un script qui décode le jeton répond juste à tous
--   les coups — le captcha ne filtrait donc que les robots qui ne le décodent
--   pas. Second défaut, aussi coûteux : rien ne rendait un jeton à usage
--   unique, donc un défi résolu une fois servait à toutes les soumissions
--   pendant cinq minutes.
--
-- CE QUE CETTE TABLE CHANGE. La réponse ne quitte plus le serveur : le jeton ne
--   porte que le nonce et sa signature (le HMAC évite de sonder des nonces au
--   hasard avant d'aller en base). La ligne porte l'empreinte de la réponse,
--   l'échéance, le compteur de tentatives et la consommation.
--
-- UNE BONNE RÉPONSE CONSOMME LE DÉFI, ATOMIQUEMENT :
--   `UPDATE … SET consumed_at = now() WHERE nonce = ? AND consumed_at IS NULL`
--   ne rend une ligne qu'au premier appel — deux soumissions simultanées avec
--   le même jeton ne peuvent pas réussir toutes les deux.
--
-- TROIS TENTATIVES, PAS UNE. Une seule punirait une faute de frappe (les
--   formulaires redemandent un défi, mais l'utilisatrice, elle, voit surtout un
--   refus) ; un nombre illimité laisserait deviner la réponse (l'espace est
--   petit : quelques centaines de valeurs). Trois borne le hasard sans punir la
--   maladresse — et la limite de débit par IP des formulaires reste le vrai
--   plafond.
--
-- PAS D'IDENTIFIANT PERSONNEL. Ni IP, ni compte : un défi de captcha ne doit
--   pas devenir un journal de qui a rempli quel formulaire.
--
-- CAVEATS:
--   - Additive et idempotente (IF NOT EXISTS, DROP POLICY IF EXISTS).
--   - RLS activée, service role uniquement : les routes passent par
--     `supabaseAdmin`, jamais le client navigateur.
--   - Purge : les lignes échues sont supprimées au fil de l'eau à la création
--     d'un défi (au plus une fois par heure et par instance). Aucun cron requis.
--   - ⚠️ ORDRE DE DÉPLOIEMENT : appliquer AVANT de déployer le site. Sans la
--     table, `verifyCaptcha` échoue FERMÉ et tous les formulaires publics
--     refusent — c'est le bon sens du refus, mais il faut l'éviter.
--   - Rollback : DROP TABLE public.captcha_challenges (le code revient alors à
--     un refus systématique : redéployer la version précédente du site).
--   - APPLIQUÉE en production le 2026-09-16.

BEGIN;

CREATE TABLE IF NOT EXISTS public.captcha_challenges (
  -- Le nonce EST la clé : c'est ce que le jeton transporte.
  nonce text PRIMARY KEY CHECK (char_length(nonce) BETWEEN 16 AND 64),
  -- HMAC de la réponse : la base ne porte pas la solution en clair.
  answer_hash text NOT NULL CHECK (char_length(answer_hash) BETWEEN 32 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz
);

-- Purge des défis échus : balayage par date.
CREATE INDEX IF NOT EXISTS idx_captcha_challenges_expires
  ON public.captcha_challenges (expires_at);

ALTER TABLE public.captcha_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS captcha_challenges_service_role
  ON public.captcha_challenges;
CREATE POLICY captcha_challenges_service_role
  ON public.captcha_challenges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
