-- Clé « plateforme » : autorise UNE clé bot à agir pour le compte d'un autre
-- tenant, via l'en-tête `x-tenant-id`.
--
-- Pourquoi : le bot Discord invité par un nouveau tenant est NOTRE process
-- partagé (l'URL d'invitation est construite avec notre DISCORD_CLIENT_ID),
-- et ce process ne connaît qu'une seule `BOT_API_KEY`. Or le site résout le
-- tenant depuis la clé et ignorait l'en-tête : toute commande lancée depuis le
-- serveur d'un second tenant écrivait dans le tenant propriétaire de la clé.
--
-- Le drapeau est OPT-IN, faux par défaut : une clé de tenant ordinaire (bot
-- auto-hébergé) reste strictement scopée à son propre tenant, exactement comme
-- avant. Seule la clé du process partagé le porte.
--
-- Garde-fous côté site (utils/botAuth.ts) : le tenant ciblé doit exister et
-- être actif, et si le bot envoie `x-guild-id`, le guild doit appartenir au
-- tenant ciblé (sinon 403).

ALTER TABLE public.tenant_secrets
  ADD COLUMN IF NOT EXISTS is_platform_key boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenant_secrets.is_platform_key IS
  'true = clé du bot mutualisé, autorisée à agir pour un autre tenant via x-tenant-id (cf. utils/botAuth.ts). Faux par défaut.';

-- Le tenant flagship (conference) porte la clé du bot mutualisé aujourd'hui
-- déployé sur la Freebox. Sans ce seed, le bot continuerait d'écrire tout dans
-- conference quel que soit le serveur d'origine.
UPDATE public.tenant_secrets s
SET is_platform_key = true
FROM public.tenants t
WHERE t.id = s.tenant_id
  AND t.slug = 'conference';

NOTIFY pgrst, 'reload schema';
