-- Migration : la boîte d'alertes de stream (Twitch + dons HelloAsso).
-- Date: 2026-09-18
--
-- WHY:
--   Une source OBS n'a AUCUNE session. L'EventSub d'aujourd'hui
--   (`pages/api/admin/twitch/eventsub/subscribe.ts`) est en transport
--   websocket : c'est l'onglet staff du cockpit caster qui ouvre la socket avec
--   sa session, et les events n'existent que dans cette page. Une boîte
--   d'alertes posée dans OBS ne peut donc rien en recevoir.
--
--   Les dons HelloAsso, eux, ont déjà la bonne forme : webhook → table → poll
--   public. Cette migration donne aux events Twitch la MÊME forme, pour que la
--   source lise les deux flux par le même chemin.
--
-- TROIS TABLES, ET POURQUOI ELLES SONT SÉPARÉES :
--   - `stream_alert_events` : ce qui S'EST PASSÉ. Croît sans fin, se purge.
--   - `stream_alert_settings` : comment la boîte SE COMPORTE (durée, son,
--     couleur). Une ligne par espace, doit survivre à tout.
--   - `stream_alert_rules` : ce qu'on ANNONCE et comment, type par type.
--     Séparée des réglages parce que c'est une ligne PAR TYPE : les mettre en
--     colonnes donnerait `follow_enabled`, `follow_message`, `sub_enabled`…
--     et une migration à chaque type ajouté.
--
-- LE NOM DU SPECTATEUR EST STOCKÉ, ET C'EST UNE DIFFÉRENCE ASSUMÉE AVEC LES
--   DONS. `helloasso_donations` ne garde AUCUNE donnée personnelle : le
--   donateur saisit son nom pour un reçu fiscal, pas pour l'antenne. Un pseudo
--   Twitch est l'inverse — il est public par construction, il est déjà affiché
--   dans le chat de la chaîne, et c'est TOUT l'objet de l'alerte (« Machine
--   vient de s'abonner »). Une alerte sans nom n'annonce rien.
--
-- POURQUOI DES COLONNES ET DES CHECK PLUTÔT QU'UN JSONB : même raison que
--   `tcg_overlay_themes`. Cette configuration est lue par une page qui tourne
--   pendant un direct ; une valeur aberrante n'y a pas sa place, et la base est
--   le seul endroit qui refuse vraiment.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout.
--   - Purement ADDITIVE : trois tables neuves, aucune existante touchée.
--   - RLS activée SANS policy sur les trois : tout est servi par des routes en
--     service-role. Aucun client anonyme ne lit ces tables en direct.

BEGIN;

-- ── Ce qui s'est passé ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stream_alert_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- L'identifiant du MESSAGE EventSub, pas celui de l'event. Twitch REJOUE un
  -- message quand il n'a pas eu son 2xx à temps, avec le même `message_id` :
  -- c'est lui qui rend l'insertion idempotente, et donc qui empêche d'annoncer
  -- deux fois le même sub à l'antenne.
  twitch_message_id TEXT NOT NULL,

  -- Close : la source rend un gabarit par type. Une valeur inconnue ne
  -- produirait rien à l'écran, en direct, sans erreur visible.
  kind          TEXT NOT NULL CHECK (kind IN (
    'follow', 'sub', 'resub', 'gift', 'cheer', 'raid'
  )),

  -- Le pseudo affiché. Nullable : un sub ou un gift peut être ANONYME côté
  -- Twitch (`is_anonymous`), et une alerte anonyme reste une alerte — la source
  -- dira « Quelqu'un » plutôt que de ne rien dire.
  actor_name    TEXT CHECK (actor_name IS NULL OR char_length(actor_name) <= 60),

  -- La quantité, dont le SENS dépend du type : bits (cheer), mois cumulés
  -- (resub), nombre d'abonnements offerts (gift), spectateurs amenés (raid).
  -- Une seule colonne plutôt que quatre, parce qu'une alerte n'en affiche
  -- jamais qu'une — et le type dit laquelle.
  amount        INTEGER CHECK (amount IS NULL OR amount >= 0),

  -- Palier d'abonnement tel que Twitch le nomme. Nullable hors sub/resub/gift.
  tier          TEXT CHECK (tier IS NULL OR tier IN ('prime', '1000', '2000', '3000')),

  -- L'heure de l'ÉVÉNEMENT, pas celle de l'insertion : c'est elle qui décide
  -- si une alerte est encore fraîche à afficher quand la source rouvre.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Le rejeu de Twitch tombe ici, silencieusement (ON CONFLICT DO NOTHING).
  CONSTRAINT stream_alert_events_message_key UNIQUE (tenant_id, twitch_message_id)
);

-- Sert exactement la lecture de l'overlay : « les events de cet espace, les
-- plus récents d'abord ».
CREATE INDEX IF NOT EXISTS idx_stream_alert_events_tenant_created
  ON public.stream_alert_events (tenant_id, created_at DESC);

ALTER TABLE public.stream_alert_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stream_alert_events IS
  'Événements Twitch (follow/sub/resub/gift/cheer/raid) reçus par webhook EventSub, en attente d''affichage par la source OBS « boîte d''alertes ». Contient un pseudo PUBLIC — contrairement à helloasso_donations, qui ne garde aucune donnée personnelle. Purgée : rien ici ne doit être conservé durablement.';

COMMENT ON COLUMN public.stream_alert_events.amount IS
  'Quantité dont le sens dépend de `kind` : bits (cheer), mois (resub), abonnements offerts (gift), spectateurs (raid).';

-- ── Comment la boîte se comporte ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stream_alert_settings (
  -- Une boîte par espace : les alertes sont celles de LA chaîne, pas d'un
  -- tournoi. Elles se règlent depuis la page Outils d'un tournoi parce que
  -- c'est là que la régie travaille, mais elles lui survivent.
  tenant_id       UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Coupe-circuit d'antenne : une seule case pour tout éteindre sans avoir à
  -- décocher sept règles ni à retirer la source d'OBS.
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,

  -- Durée d'une alerte à l'écran. NULL = la durée de l'animation elle-même.
  -- Bornée : sous 3 s on ne lit pas la phrase, au-delà de 60 s la file d'un
  -- soir de raid ne se résorbe jamais.
  duration_ms     INTEGER CHECK (duration_ms IS NULL OR duration_ms BETWEEN 3000 AND 60000),

  -- Son joué à l'apparition. NULL = muet, et c'est le défaut : une source qui
  -- se met à faire du bruit toute seule dans une régie est un incident.
  -- Chemin servi par le site (`/overlay/...`) ou URL https complète.
  sound_url       TEXT CHECK (sound_url IS NULL OR char_length(sound_url) <= 500),
  -- En pourcentage, parce que c'est ce que la régie manipule.
  sound_volume    INTEGER NOT NULL DEFAULT 70 CHECK (sound_volume BETWEEN 0 AND 100),

  -- Habillage. NULL = le défaut du code (cf. utils/overlay/alertBox.ts).
  accent_color    TEXT CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'),

  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID
);

ALTER TABLE public.stream_alert_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stream_alert_settings IS
  'Comportement de la source OBS « boîte d''alertes », par espace. NULL = garder le défaut du code, pas « vide ».';

-- ── Ce qu'on annonce, type par type ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stream_alert_rules (
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- `donation` figure ici alors qu'il n'existe PAS dans stream_alert_events :
  -- les dons vivent dans `helloasso_donations`, mais ils s'annoncent dans la
  -- même boîte, et ils doivent donc pouvoir se régler et s'éteindre comme les
  -- autres. La liste des types réglables est celle de la SOURCE, pas d'une
  -- table.
  kind          TEXT NOT NULL CHECK (kind IN (
    'follow', 'sub', 'resub', 'gift', 'cheer', 'raid', 'donation'
  )),

  enabled       BOOLEAN NOT NULL DEFAULT TRUE,

  -- La phrase annoncée. Interpole `{name}` et `{amount}`. Bornée à 120
  -- caractères : au-delà, elle déborde de la bande de l'habillage et devient
  -- illisible — la borne est ici pour que l'interface ne soit pas seule à la
  -- tenir. C'est du CONTENU (le texte de cette chaîne, dans sa langue), pas de
  -- la traduction, et il est rendu en TEXTE, jamais en HTML.
  message       TEXT CHECK (message IS NULL OR char_length(message) <= 120),

  -- Seuil d'annonce : n'alerter qu'au-delà de N bits, N € ou N spectateurs.
  -- Sans lui, un soir de raid, la file se remplit de « 1 bit ». NULL = tout
  -- annoncer.
  min_amount    INTEGER CHECK (min_amount IS NULL OR min_amount >= 0),

  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, kind)
);

ALTER TABLE public.stream_alert_rules ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stream_alert_rules IS
  'Une règle d''annonce par type d''alerte et par espace. Une ligne ABSENTE vaut « activé avec la phrase par défaut » : un espace qui n''a jamais ouvert l''éditeur a des alertes qui marchent.';

COMMIT;

-- PostgREST doit revoir son cache de schéma : des FK ont été ajoutées, sinon
-- les tables restent invisibles à l'API jusqu'au prochain redémarrage.
NOTIFY pgrst, 'reload schema';
