// components/admin/tournament/StreamAlertsPanel.tsx
//
// L'éditeur de la source OBS « boîte d'alertes », posé sous le panneau des
// sources de stream : on copie l'URL juste au-dessus, on règle ce qu'elle
// annonce juste en dessous.
//
// PAR ESPACE, PAS PAR TOURNOI — comme l'API qu'il consomme. Les alertes sont
// celles de LA chaîne, elles survivent au tournoi dans la page duquel on les
// règle. C'est pour ça que le composant ne reçoit aucun identifiant de
// tournoi : lui en passer un laisserait croire qu'on règle ce tournoi-là.
//
// LE COUPE-CIRCUIT S'ENREGISTRE SEUL, le reste attend « Enregistrer ». En
// direct, « éteins ça » ne se négocie pas : obliger à cliquer un second bouton
// laisse des alertes passer entre les deux. C'est exactement l'écriture
// PARTIELLE que le PATCH sait faire — on n'envoie que `enabled`, donc une
// modification en cours de saisie n'est ni perdue ni poussée par accident.
//
// LES PHRASES NE SONT PAS TRADUITES, et c'est volontaire : c'est du contenu
// d'antenne, écrit par la régie dans la langue de sa chaîne. Seuls les
// LIBELLÉS de l'éditeur passent par `useAdminT`. Les défauts affichés en
// placeholder viennent de `utils/overlay/alertBox.ts`, la seule source de
// vérité — les recopier ici garantirait qu'ils divergent.

import { useCallback, useEffect, useState } from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import StreamAlertsMediaFields, {
  alertFileErrorMessage,
  type AlertMedia,
  type FileEdit,
} from '@/components/admin/tournament/StreamAlertsMediaFields';
import StreamAlertsTwitchCard from '@/components/admin/tournament/StreamAlertsTwitchCard';
import StreamAlertsTestCard from '@/components/admin/tournament/StreamAlertsTestCard';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminStreamAlerts from '@/lib/i18n/locales/admin-fr/adminStreamAlerts';
import {
  ALERT_KINDS,
  ALERT_DURATION_DEFAULT_MS,
  ALERT_DURATION_MAX_MS,
  ALERT_DURATION_MIN_MS,
  DEFAULT_ALERT_MESSAGES,
  clampVolume,
  type AlertKind,
} from '@/utils/overlay/alertBox';
import { logger } from '@/utils/logger';

const ENDPOINT = '/api/admin/stream-alerts';

/**
 * Les types qui portent une quantité, donc les seuls à mériter un seuil. Un
 * `min_amount` sur `follow` n'éteindrait pas les follows (cf.
 * `alertPassesRule`), il ne ferait qu'induire en erreur qui le pose.
 */
const AMOUNT_KINDS: ReadonlySet<AlertKind> = new Set<AlertKind>([
  'resub',
  'gift',
  'cheer',
  'raid',
  'donation',
]);

/**
 * Le seuil d'un don se saisit en EUROS et se stocke en CENTIMES : la base et
 * la source comparent des centimes (`helloasso_donations.amount_cents`), la
 * régie pense en euros. La conversion vit ici, au bord de la saisie.
 */
const CENTS_PER_EURO = 100;

/**
 * Seulement pour pré-positionner le sélecteur quand rien n'est choisi : la
 * valeur ENREGISTRÉE reste `null` (= « garde le défaut du code »), sinon
 * ouvrir l'éditeur figerait la couleur de la charte en base.
 */
const SWATCH_FALLBACK = '#f0e63c';

const HEX = /^#[0-9A-Fa-f]{6}$/;

type SettingsRow = {
  enabled: boolean;
  duration_ms: number | null;
  sound_url: string | null;
  sound_volume: number;
  accent_color: string | null;
  /**
   * Le CHEMIN de bucket du son déposé. Inaffichable tel quel — il ne sert qu'à
   * savoir s'il existe un fichier à retirer, ce que `media.soundUrl` ne dit pas
   * (l'API y sert déjà le repli sur l'URL collée).
   */
  sound_path: string | null;
};

type RuleRow = {
  kind: AlertKind;
  enabled: boolean;
  message: string | null;
  min_amount: number | null;
};

type ApiResponse = {
  settings: SettingsRow | null;
  rules: RuleRow[];
  /** URLs SERVABLES de ce qui est déjà en place (cf. `utils/overlay/alertMedia`). */
  media?: {
    frameUrl: string | null;
    frameKind: 'image' | 'video' | null;
    soundUrl: string | null;
  };
};

/** Aucun fichier connu : l'état de départ, et celui d'une lecture sans `media`. */
const NO_MEDIA: AlertMedia = {
  frameUrl: null,
  frameKind: null,
  soundUrl: null,
  hasSoundFile: false,
};

/** Brouillon : tout ce qui peut être vide est une chaîne, pas un `null`. */
type SettingsDraft = {
  enabled: boolean;
  /** En SECONDES, `''` = garder le défaut. */
  durationSec: string;
  soundUrl: string;
  soundVolume: number;
  /** `''` = garder le défaut du code. */
  accentColor: string;
};

type RuleDraft = {
  enabled: boolean;
  message: string;
  /** Dans l'unité que la régie voit (euros pour un don), `''` = aucun seuil. */
  minAmount: string;
};

type RuleDrafts = Record<AlertKind, RuleDraft>;

function emptyRules(): RuleDrafts {
  return Object.fromEntries(
    ALERT_KINDS.map((kind) => [
      kind,
      // Une ligne absente vaut « activé » : même défaut que `resolveRule`,
      // sinon l'éditeur montrerait « éteint » pour des alertes qui marchent.
      { enabled: true, message: '', minAmount: '' },
    ])
  ) as RuleDrafts;
}

/** La quantité telle que la régie la saisit (euros pour un don). */
function toDisplayAmount(kind: AlertKind, stored: number | null): string {
  if (stored == null) return '';
  return kind === 'donation' ? String(stored / CENTS_PER_EURO) : String(stored);
}

export default function StreamAlertsPanel() {
  const t = useAdminT(nsAdminStreamAlerts);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();

  const [settings, setSettings] = useState<SettingsDraft | null>(null);
  const [rules, setRules] = useState<RuleDrafts>(emptyRules);
  const [media, setMedia] = useState<AlertMedia>(NO_MEDIA);
  // Les fichiers en attente d'envoi. `undefined` = intact : l'éditeur ne doit
  // PAS envoyer une clé `frame`/`sound` qu'on n'a pas touchée (cf. les trois
  // états du PATCH), sinon enregistrer un volume effacerait l'habillage.
  const [frameEdit, setFrameEdit] = useState<FileEdit>(undefined);
  const [soundEdit, setSoundEdit] = useState<FileEdit>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const json = await adminFetchJson<ApiResponse>(ENDPOINT);
      const row = json.settings;
      setSettings({
        enabled: row?.enabled ?? true,
        durationSec: row?.duration_ms ? String(row.duration_ms / 1000) : '',
        soundUrl: row?.sound_url ?? '',
        soundVolume: clampVolume(row?.sound_volume),
        accentColor: row?.accent_color ?? '',
      });
      setMedia({
        frameUrl: json.media?.frameUrl ?? null,
        frameKind: json.media?.frameKind ?? null,
        soundUrl: json.media?.soundUrl ?? null,
        hasSoundFile: Boolean(row?.sound_path),
      });
      // Un brouillon de fichier ne survit pas à une relecture : il porterait
      // sur un état que la base ne montre plus.
      setFrameEdit(undefined);
      setSoundEdit(undefined);
      const next = emptyRules();
      for (const rule of json.rules ?? []) {
        if (!(rule.kind in next)) continue; // type inconnu : on n'invente pas
        next[rule.kind] = {
          enabled: rule.enabled,
          message: rule.message ?? '',
          minAmount: toDisplayAmount(rule.kind, rule.min_amount),
        };
      }
      setRules(next);
      setDirty(false);
    } catch (err) {
      logger.error('[admin/stream-alerts] load error:', err);
      setLoadError(t.loadError);
    }
  }, [adminFetchJson, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchSettings = (patch: Partial<SettingsDraft>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };

  const patchRule = (kind: AlertKind, patch: Partial<RuleDraft>) => {
    setRules((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
    setDirty(true);
  };

  /** Le coupe-circuit : envoyé seul, tout de suite (cf. l'en-tête). */
  const toggleEnabled = async (next: boolean) => {
    if (!settings) return;
    const previous = settings.enabled;
    setSettings({ ...settings, enabled: next });
    try {
      await mutateJson(ENDPOINT, {
        method: 'PATCH',
        body: JSON.stringify({ settings: { enabled: next } }),
      });
      addToast(next ? t.enabledOn : t.enabledOff, 'success');
    } catch (err) {
      logger.error('[admin/stream-alerts] toggle error:', err);
      // On remet la case comme elle était : afficher « coupé » alors que
      // l'antenne alerte toujours est pire que de ne rien changer.
      setSettings((prev) => (prev ? { ...prev, enabled: previous } : prev));
      addToast((err as Error)?.message || t.saveError, 'error');
    }
  };

  const save = async () => {
    if (!settings) return;

    let durationMs: number | null = null;
    if (settings.durationSec.trim() !== '') {
      const seconds = Number(settings.durationSec);
      durationMs = Number.isFinite(seconds) ? Math.round(seconds * 1000) : NaN;
      if (
        !Number.isFinite(durationMs) ||
        durationMs < ALERT_DURATION_MIN_MS ||
        durationMs > ALERT_DURATION_MAX_MS
      ) {
        addToast(
          format(t.durationInvalid, {
            min: ALERT_DURATION_MIN_MS / 1000,
            max: ALERT_DURATION_MAX_MS / 1000,
          }),
          'error'
        );
        return;
      }
    }

    const soundUrl = settings.soundUrl.trim();
    if (
      soundUrl !== '' &&
      !soundUrl.startsWith('/') &&
      !soundUrl.startsWith('https://')
    ) {
      addToast(t.soundUrlInvalid, 'error');
      return;
    }

    const accent = settings.accentColor.trim();
    if (accent !== '' && !HEX.test(accent)) {
      addToast(t.accentInvalid, 'error');
      return;
    }

    const payloadRules: {
      kind: AlertKind;
      enabled: boolean;
      message: string;
      minAmount: number | null;
    }[] = [];
    for (const kind of ALERT_KINDS) {
      const draft = rules[kind];
      let minAmount: number | null = null;
      // Un seuil saisi sur un type sans quantité ne serait jamais appliqué :
      // on ne l'envoie pas plutôt que de le laisser pourrir en base.
      if (AMOUNT_KINDS.has(kind) && draft.minAmount.trim() !== '') {
        const typed = Number(draft.minAmount);
        if (!Number.isFinite(typed) || typed < 0) {
          addToast(
            format(t.thresholdInvalid, { kind: kindLabel(t, kind) }),
            'error'
          );
          return;
        }
        minAmount = Math.round(
          kind === 'donation' ? typed * CENTS_PER_EURO : typed
        );
      }
      payloadRules.push({
        kind,
        enabled: draft.enabled,
        // `''` : l'API le relit comme « reviens à la phrase par défaut ».
        message: draft.message.trim(),
        minAmount,
      });
    }

    const body: Record<string, unknown> = {
      settings: {
        enabled: settings.enabled,
        durationMs,
        // `''` échouerait la validation hexadécimale côté API : un choix
        // vide, c'est `null` (« garde le défaut »), pas une chaîne vide.
        accentColor: accent === '' ? null : accent,
        soundUrl: soundUrl === '' ? null : soundUrl,
        soundVolume: clampVolume(settings.soundVolume),
      },
      rules: payloadRules,
    };
    // CLÉ ABSENTE = « n'y touche pas ». On n'envoie `frame`/`sound` que si la
    // régie a déposé ou retiré quelque chose ; le `name` reste ici, l'API ne
    // le connaît pas et le corps est déjà assez lourd comme ça.
    const mediaTouched = frameEdit !== undefined || soundEdit !== undefined;
    if (frameEdit !== undefined) {
      body.frame = frameEdit && {
        data: frameEdit.data,
        mimeType: frameEdit.mimeType,
      };
    }
    if (soundEdit !== undefined) {
      body.sound = soundEdit && {
        data: soundEdit.data,
        mimeType: soundEdit.mimeType,
      };
    }

    setSaving(true);
    try {
      await mutateJson(ENDPOINT, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setDirty(false);
      addToast(t.saved, 'success');
      // Un dépôt change les URLs servies : sans relecture, l'aperçu montrerait
      // encore le `data:` du brouillon et « retirer » porterait sur du vide.
      if (mediaTouched) await load();
    } catch (err) {
      logger.error('[admin/stream-alerts] save error:', err);
      // Un refus de fichier a un `code` : le traduire évite le « Enregistrement
      // impossible » qui ne dit ni quel fichier, ni pourquoi.
      addToast(
        alertFileErrorMessage(t, err) || (err as Error)?.message || t.saveError,
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
      >
        {loadError}
      </div>
    );
  }

  // Tant que la lecture n'a pas répondu, on n'affiche pas un formulaire vide :
  // il donnerait à croire que la régie n'a rien réglé, et un « Enregistrer »
  // impatient écraserait les réglages en service.
  if (!settings) return <LoadingSpinner size="sm" className="py-6" />;

  return (
    <div className="space-y-4">
      {/* Le titre vit ICI, et pas dans la page : elle n'aurait rien d'autre à
          faire de ce namespace que de l'afficher. */}
      <h3 className="text-sm font-semibold text-white">{t.title}</h3>
      <p className="text-xs text-neutral-400">{t.description}</p>

      {/* En tête, parce que c'est la panne la plus silencieuse : sans ces
          abonnements, Twitch n'envoie rien et la boîte reste muette. */}
      <StreamAlertsTwitchCard />
      <StreamAlertsTestCard />

      {/* Réglages globaux */}
      <div className="space-y-4 rounded-xl border border-neutral-700/40 bg-neutral-900/50 p-4">
        <div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => void toggleEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-600 bg-neutral-900 accent-purple-500"
            />
            <span>
              <span className="block text-sm font-medium text-white">
                {t.enabledLabel}
              </span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                {t.enabledHelp}
              </span>
            </span>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="stream-alerts-duration"
              className="mb-1 block text-xs font-medium text-neutral-300"
            >
              {t.durationLabel}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="stream-alerts-duration"
                type="number"
                min={ALERT_DURATION_MIN_MS / 1000}
                max={ALERT_DURATION_MAX_MS / 1000}
                step={1}
                value={settings.durationSec}
                onChange={(e) => patchSettings({ durationSec: e.target.value })}
                className="w-24 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-xs text-neutral-500">{t.durationUnit}</span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              {format(t.durationHelp, {
                min: ALERT_DURATION_MIN_MS / 1000,
                max: ALERT_DURATION_MAX_MS / 1000,
                default: ALERT_DURATION_DEFAULT_MS / 1000,
              })}
            </p>
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-300">
              {t.accentLabel}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={t.accentLabel}
                value={settings.accentColor || SWATCH_FALLBACK}
                onChange={(e) => patchSettings({ accentColor: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded-lg border border-neutral-700 bg-neutral-900"
              />
              <span className="font-mono text-xs text-neutral-400">
                {settings.accentColor || t.accentIsDefault}
              </span>
              {settings.accentColor !== '' && (
                <button
                  type="button"
                  onClick={() => patchSettings({ accentColor: '' })}
                  className="rounded-lg border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:border-neutral-500 hover:text-white"
                >
                  {t.accentReset}
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">{t.accentHelp}</p>
          </div>

          <div>
            <label
              htmlFor="stream-alerts-sound"
              className="mb-1 block text-xs font-medium text-neutral-300"
            >
              {t.soundUrlLabel}
            </label>
            <input
              id="stream-alerts-sound"
              type="text"
              inputMode="url"
              maxLength={500}
              value={settings.soundUrl}
              placeholder={t.soundUrlPlaceholder}
              onChange={(e) => patchSettings({ soundUrl: e.target.value })}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              {t.soundUrlHelp}
            </p>
          </div>

          <div>
            <label
              htmlFor="stream-alerts-volume"
              className="mb-1 block text-xs font-medium text-neutral-300"
            >
              {t.volumeLabel}
            </label>
            <div className="flex items-center gap-3">
              <input
                id="stream-alerts-volume"
                type="range"
                min={0}
                max={100}
                step={1}
                value={settings.soundVolume}
                onChange={(e) =>
                  patchSettings({ soundVolume: Number(e.target.value) })
                }
                className="h-2 flex-1 cursor-pointer accent-purple-500"
              />
              <span className="w-10 text-right font-mono text-xs text-neutral-400">
                {settings.soundVolume}%
              </span>
            </div>
          </div>
        </div>

        {/* Les fichiers en dernier : on règle d'abord ce qui se lit d'un coup
            d'œil, puis ce qui demande d'aller chercher un fichier. */}
        <StreamAlertsMediaFields
          media={media}
          frameEdit={frameEdit}
          soundEdit={soundEdit}
          onFrameEdit={(edit) => {
            setFrameEdit(edit);
            setDirty(true);
          }}
          onSoundEdit={(edit) => {
            setSoundEdit(edit);
            setDirty(true);
          }}
          disabled={saving}
        />
      </div>

      {/* Une ligne par type d'alerte */}
      <div className="space-y-3 rounded-xl border border-neutral-700/40 bg-neutral-900/50 p-4">
        <div>
          <h4 className="text-sm font-medium text-white">{t.rulesTitle}</h4>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
            {t.rulesHint}
          </p>
        </div>

        <div className="space-y-2">
          {ALERT_KINDS.map((kind) => {
            const draft = rules[kind];
            const label = kindLabel(t, kind);
            return (
              <div
                key={kind}
                className="flex flex-col gap-2 rounded-lg border border-neutral-700/40 bg-neutral-950/40 p-3 sm:flex-row sm:items-center"
              >
                <label className="flex w-48 shrink-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) =>
                      patchRule(kind, { enabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-neutral-600 bg-neutral-900 accent-purple-500"
                  />
                  <span className="text-sm text-neutral-200">{label}</span>
                </label>

                <input
                  type="text"
                  maxLength={120}
                  value={draft.message}
                  // Le défaut en placeholder : la régie voit ce qui sera dit
                  // si elle n'écrit rien, au lieu d'un champ muet.
                  placeholder={DEFAULT_ALERT_MESSAGES[kind]}
                  aria-label={format(t.messageAria, { kind: label })}
                  onChange={(e) => patchRule(kind, { message: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />

                {/* Les types sans quantité gardent la place du seuil vide :
                    sinon leur phrase s'étire et la colonne se désaligne, ce
                    qui se lit comme « ces lignes-là sont différentes ». */}
                {!AMOUNT_KINDS.has(kind) && (
                  <div
                    aria-hidden="true"
                    className="hidden w-[184px] shrink-0 sm:block"
                  />
                )}

                {AMOUNT_KINDS.has(kind) && (
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={kind === 'donation' ? 0.5 : 1}
                      value={draft.minAmount}
                      placeholder={t.thresholdPlaceholder}
                      aria-label={format(t.thresholdAria, { kind: label })}
                      onChange={(e) =>
                        patchRule(kind, { minAmount: e.target.value })
                      }
                      className="w-24 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="w-20 text-[11px] text-neutral-500">
                      {unitLabel(t, kind)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] leading-relaxed text-neutral-500">
          {t.rulesThresholdHint}
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          {saving ? t.saving : t.save}
        </button>
      </div>
    </div>
  );
}

type Dict = typeof nsAdminStreamAlerts.fr;

/**
 * Les libellés sont indexés par type (`kind_cheer`…) pour qu'ajouter un type
 * d'alerte n'oblige pas à toucher un `switch` de plus.
 */
function kindLabel(t: Dict, kind: AlertKind): string {
  return t[`kind_${kind}` as keyof Dict] as string;
}

/** L'unité du seuil. Vide pour un type sans quantité : il n'en affiche pas. */
function unitLabel(t: Dict, kind: AlertKind): string {
  return (t[`unit_${kind}` as keyof Dict] as string | undefined) ?? '';
}
