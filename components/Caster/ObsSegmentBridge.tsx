// components/Caster/ObsSegmentBridge.tsx
//
// Pont entre le déroulé du show et OBS, pour la régie (`/admin/regie`).
//
// Avant : la régie enchaînait les segments et quelqu'un cliquait la scène à la
// main dans OBS, au moment précis d'une transition. Le cockpit `/admin/caster`
// savait déjà piloter OBS (utils/caster/obsClient + le hook useObs), mais rien
// ne reliait cette capacité au run-of-show.
//
// Maintenant : chaque segment porte un `obs_scene` (nom de scène OBS, cf.
// add_event_segments_obs_scene.sql). Quand le segment courant change, ce
// composant bascule OBS dessus.
//
// Trois garde-fous d'antenne :
//   1. La bascule ne bloque JAMAIS le segment. Un échec (OBS fermé, scène
//      renommée) s'affiche ici et se journalise, le show continue.
//   2. On ne bascule qu'une fois par segment (`appliedRef`) — un simple
//      re-render, un refetch ou un event realtime ne doit pas ré-envoyer un
//      SetCurrentProgramScene alors que l'opérateur a changé de scène à la main
//      entre-temps.
//   3. Rien n'est automatique tant qu'OBS n'est pas connecté : pas de connexion
//      d'office au montage, c'est l'opérateur qui l'ouvre en début de show. Les
//      réglages (hôte/port/mot de passe) sont ceux déjà saisis dans le cockpit
//      caster — même navigateur, mêmes clés localStorage `caster_obs_*`.
//
// Hypothèse de déploiement : OBS tourne sur LA MACHINE qui ouvre la régie (le
// hook parle à ws://localhost:4455 par défaut). Sinon, il faut renseigner l'IP
// du poste OBS dans le cockpit caster — obs-websocket écoute sur 0.0.0.0.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useObs } from '@/components/admin/caster/useObs';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { AdminFetchError } from '@/hooks/useAdminFetch';
import { useT, format } from '@/lib/i18n/useT';
import { logger } from '@/utils/logger';
import type { EventSegment } from '@/types/events';
import nsAdminRegie from '@/lib/i18n/locales/fr/adminRegie';

function errText(err: unknown): string {
  const e = err as AdminFetchError;
  const payloadError =
    typeof e?.payload === 'object' && e.payload && 'error' in e.payload
      ? String((e.payload as { error: string }).error)
      : null;
  return payloadError || e?.message || 'erreur inconnue';
}

export default function ObsSegmentBridge({
  runId,
  currentSegment,
  nextSegment,
  canEdit,
  onSegmentUpdated,
}: {
  runId: string;
  currentSegment: EventSegment | null;
  nextSegment: EventSegment | null;
  canEdit: boolean;
  onSegmentUpdated: (segment: EventSegment) => void;
}) {
  const t = useT(nsAdminRegie);
  const { mutateJson } = useIdempotentMutation();
  const { phase, scenes, currentScene, connect, switchScene, connectError } =
    useObs();

  // Dernier segment pour lequel une bascule a été tentée. Garde-fou n°2.
  const appliedRef = useRef<string | null>(null);
  const [switchMsg, setSwitchMsg] = useState<string | null>(null);
  const [switchErr, setSwitchErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Le segment qu'on lie : celui à l'antenne, sinon le prochain (on prépare la
  // transition avant qu'elle arrive).
  const target = currentSegment ?? nextSegment;

  // Bascule automatique au changement de segment courant.
  useEffect(() => {
    if (phase !== 'connected') return;
    const seg = currentSegment;
    if (!seg) return;
    if (appliedRef.current === seg.id) return;
    appliedRef.current = seg.id;

    const scene = (seg.obs_scene ?? '').trim();
    if (!scene) return;

    setSwitchMsg(null);
    setSwitchErr(null);

    // La scène a pu être renommée dans OBS depuis qu'on l'a liée : on le dit
    // explicitement plutôt que de laisser obs-websocket répondre une erreur
    // générique que personne ne relie au renommage.
    if (scenes.length > 0 && !scenes.includes(scene)) {
      setSwitchErr(format(t.obsSceneMissing, { scene }));
      logger.warn('[regie] scène OBS liée introuvable', { scene });
      return;
    }

    (async () => {
      try {
        await switchScene(scene);
        setSwitchMsg(format(t.obsSwitched, { scene }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSwitchErr(format(t.obsSwitchError, { scene, message }));
        logger.error('[regie] bascule OBS échouée', err);
      }
    })();
  }, [phase, currentSegment, scenes, switchScene, t]);

  const handleBind = useCallback(
    async (scene: string) => {
      if (!target) return;
      setSaving(true);
      setSaveErr(null);
      try {
        const updated = await mutateJson<EventSegment>(
          `/api/admin/events/${runId}/segments/${target.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ obs_scene: scene || null }),
          }
        );
        onSegmentUpdated(updated);
        // Lier une scène au segment DÉJÀ à l'antenne doit pouvoir la mettre à
        // l'antenne : on relâche la garde pour que l'effet rejoue.
        if (currentSegment && target.id === currentSegment.id) {
          appliedRef.current = null;
        }
      } catch (err) {
        setSaveErr(format(t.obsSaveError, { message: errText(err) }));
      } finally {
        setSaving(false);
      }
    },
    [target, runId, mutateJson, onSegmentUpdated, currentSegment, t]
  );

  return (
    <section
      className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 space-y-3"
      data-testid="regie-obs-bridge"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{t.obsTitle}</h2>
          <p className="text-xs text-neutral-400 mt-1">{t.obsDesc}</p>
        </div>
        <span
          className={`shrink-0 text-[11px] px-2 py-1 rounded-full border ${
            phase === 'connected'
              ? 'border-emerald-500/40 bg-emerald-900/20 text-emerald-200'
              : phase === 'connecting'
                ? 'border-amber-500/40 bg-amber-900/20 text-amber-200'
                : 'border-neutral-700 bg-neutral-800/60 text-neutral-400'
          }`}
          data-testid="regie-obs-phase"
        >
          {phase === 'connected'
            ? t.obsConnected
            : phase === 'connecting'
              ? t.obsConnecting
              : t.obsDisconnected}
        </span>
      </div>

      {phase !== 'connected' && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => void connect()}
            disabled={phase === 'connecting'}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium disabled:opacity-50"
            data-testid="regie-obs-connect"
          >
            {t.obsConnect}
          </button>
          <p className="text-[11px] text-neutral-500">{t.obsConnectHint}</p>
          {connectError && (
            <p className="text-[11px] text-red-300" role="alert">
              {format(t.obsConnectError, { message: connectError })}
            </p>
          )}
        </div>
      )}

      {!target ? (
        <p className="text-xs text-neutral-500">{t.obsNoSegment}</p>
      ) : (
        <label className="block">
          <span className="block text-xs text-neutral-400 mb-1">
            {format(t.obsSceneLabel, { segment: target.title })}
          </span>
          <select
            value={target.obs_scene ?? ''}
            onChange={(e) => void handleBind(e.target.value)}
            disabled={!canEdit || saving || phase !== 'connected'}
            className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2.5 py-2 text-sm text-white disabled:opacity-50"
            data-testid="regie-obs-scene"
          >
            <option value="">{t.obsSceneNone}</option>
            {/* Une scène liée puis renommée/supprimée dans OBS ne serait plus
                dans `scenes` : on l'ajoute pour que le select montre l'état
                réel au lieu de retomber silencieusement sur « Aucune ». */}
            {(target.obs_scene && !scenes.includes(target.obs_scene)
              ? [target.obs_scene, ...scenes]
              : scenes
            ).map((sc) => (
              <option key={sc} value={sc}>
                {sc}
              </option>
            ))}
          </select>
          {saving && (
            <p className="mt-1 text-[11px] text-neutral-500">{t.obsSaving}</p>
          )}
          {saveErr && (
            <p className="mt-1 text-[11px] text-red-300" role="alert">
              {saveErr}
            </p>
          )}
        </label>
      )}

      {phase === 'connected' && currentScene && (
        <p className="text-[11px] text-neutral-500">
          OBS : <span className="text-neutral-300">{currentScene}</span>
        </p>
      )}
      {switchMsg && (
        <p className="text-[11px] text-emerald-300" role="status">
          {switchMsg}
        </p>
      )}
      {switchErr && (
        <p className="text-[11px] text-red-300" role="alert">
          {switchErr}
        </p>
      )}
    </section>
  );
}
