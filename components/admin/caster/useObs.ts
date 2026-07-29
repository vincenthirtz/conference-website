// components/admin/caster/useObs.ts
//
// Hook React du panneau OBS (/admin/caster) — enrobe le client pur
// utils/caster/obsClient + les opérations utils/caster/obsOps :
//
//  - Réglages de connexion (host/port/password) persistés en localStorage
//    (clés préfixées `caster_obs_`) — le mot de passe est stocké en clair dans
//    CE navigateur, comme le fait l'app desktop dans son userData (secret local
//    d'un OBS sur la machine de casting ; à faire tourner si la machine est
//    partagée). L'UI l'affiche en note.
//  - État temps réel piloté par les ÉVÉNEMENTS OBS (scène programme, stream,
//    record, volumes/mute) — pas de polling, seulement le fetch initial à la
//    connexion (même posture que l'app desktop).
//  - Reconnexion auto gérée par le client (backoff) ; le hook reflète les
//    phases disconnected / connecting / connected + l'abandon (reconnectFailed).

import { useCallback, useEffect, useRef, useState } from 'react';

import { ObsClient } from '@/utils/caster/obsClient';
import {
  buildOverlaySceneSetup,
  getRecordStatus,
  getScenes,
  getStreamStatus,
  listAudioInputs,
  setInputMute,
  setInputVolume,
  setScene as opSetScene,
  setupOverlayScenes,
  toggleRecord as opToggleRecord,
  toggleStream as opToggleStream,
  type ObsAudioInput,
  type SetupOverlayScenesResult,
  type ToggleStreamResult,
} from '@/utils/caster/obsOps';
import { CASTER_SCENE_TYPES } from '@/types/caster';

const LS_HOST = 'caster_obs_host';
const LS_PORT = 'caster_obs_port';
const LS_PASSWORD = 'caster_obs_password';

export type ObsSettings = { host: string; port: number; password: string };

export type ObsPhase = 'disconnected' | 'connecting' | 'connected';

export type ObsOutputState = {
  active: boolean;
  /** Epoch ms du démarrage (durée dérivée côté UI) — null si inactif. */
  startedAt: number | null;
};

function loadSettings(): ObsSettings {
  try {
    return {
      host: localStorage.getItem(LS_HOST) || 'localhost',
      port: parseInt(localStorage.getItem(LS_PORT) || '', 10) || 4455,
      password: localStorage.getItem(LS_PASSWORD) || '',
    };
  } catch {
    return { host: 'localhost', port: 4455, password: '' };
  }
}

function saveSettings(s: ObsSettings): void {
  try {
    localStorage.setItem(LS_HOST, s.host);
    localStorage.setItem(LS_PORT, String(s.port));
    localStorage.setItem(LS_PASSWORD, s.password);
  } catch {
    /* localStorage indisponible */
  }
}

export function useObs() {
  // Client unique pour la vie du composant (les listeners survivent aux
  // reconnexions internes du client) — initialiseur lazy de useState : instance
  // stable sans accès à un ref pendant le render (règle react-hooks/refs).
  const [client] = useState(() => new ObsClient());

  const [settings, setSettings] = useState<ObsSettings>(loadSettings);
  const [phase, setPhase] = useState<ObsPhase>('disconnected');
  /** Erreur de connexion : 'timeout' | 'socket' | 'exhausted' | message brut. */
  const [connectError, setConnectError] = useState<string | null>(null);
  const [reconnectFailedAttempts, setReconnectFailedAttempts] = useState<
    number | null
  >(null);

  const [scenes, setScenes] = useState<string[]>([]);
  const [currentScene, setCurrentScene] = useState<string>('');
  const [stream, setStream] = useState<ObsOutputState>({
    active: false,
    startedAt: null,
  });
  const [record, setRecord] = useState<ObsOutputState>({
    active: false,
    startedAt: null,
  });
  const [audioInputs, setAudioInputs] = useState<ObsAudioInput[]>([]);

  // Garde anti-course : pas de setState après unmount.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Fetch initial à la connexion — ensuite les événements font foi. */
  const refreshAll = useCallback(async () => {
    try {
      const [sceneList, streamSt, recordSt, inputs] = await Promise.all([
        getScenes(client),
        getStreamStatus(client),
        getRecordStatus(client),
        listAudioInputs(client),
      ]);
      if (!alive.current) return;
      // OBS liste les scènes de bas en haut — on inverse pour l'ordre visuel
      // (même rendu que l'app desktop).
      setScenes(
        sceneList.scenes
          .slice()
          .reverse()
          .map((s) => s.sceneName)
      );
      setCurrentScene(sceneList.currentScene || '');
      setStream({
        active: !!streamSt.outputActive,
        startedAt: streamSt.outputActive
          ? Date.now() - (Number(streamSt.outputDuration) || 0)
          : null,
      });
      setRecord({
        active: !!recordSt.outputActive,
        startedAt: recordSt.outputActive
          ? Date.now() - (Number(recordSt.outputDuration) || 0)
          : null,
      });
      setAudioInputs(inputs);
    } catch {
      /* déconnecté entre-temps : les événements reprendront la main */
    }
  }, [client]);

  // Abonnements aux événements du client — une fois pour la vie du composant.
  useEffect(() => {
    const offs = [
      client.on('connected', () => {
        if (!alive.current) return;
        setPhase('connected');
        setConnectError(null);
        setReconnectFailedAttempts(null);
        void refreshAll();
      }),
      client.on('disconnected', () => {
        if (!alive.current) return;
        // Le client reprogramme une reconnexion sauf déconnexion manuelle.
        setPhase(client.status().reconnecting ? 'connecting' : 'disconnected');
      }),
      client.on('reconnectFailed', (payload) => {
        if (!alive.current) return;
        setPhase('disconnected');
        setReconnectFailedAttempts(
          (payload as { attempts?: number })?.attempts ?? null
        );
      }),
      client.on('CurrentProgramSceneChanged', (d) => {
        if (!alive.current) return;
        const name = (d as { sceneName?: string })?.sceneName;
        if (name) setCurrentScene(name);
      }),
      client.on('SceneListChanged', () => {
        if (!alive.current) return;
        void getScenes(client)
          .then((list) => {
            if (!alive.current) return;
            setScenes(
              list.scenes
                .slice()
                .reverse()
                .map((s) => s.sceneName)
            );
            setCurrentScene(list.currentScene || '');
          })
          .catch(() => undefined);
      }),
      client.on('StreamStateChanged', (d) => {
        if (!alive.current) return;
        const active = !!(d as { outputActive?: boolean })?.outputActive;
        setStream((prev) => ({
          active,
          startedAt: active
            ? prev.active
              ? prev.startedAt
              : Date.now()
            : null,
        }));
      }),
      client.on('RecordStateChanged', (d) => {
        if (!alive.current) return;
        const active = !!(d as { outputActive?: boolean })?.outputActive;
        setRecord((prev) => ({
          active,
          startedAt: active
            ? prev.active
              ? prev.startedAt
              : Date.now()
            : null,
        }));
      }),
      client.on('InputVolumeChanged', (d) => {
        if (!alive.current) return;
        const ev = d as {
          inputName?: string;
          inputVolumeMul?: number;
          inputVolumeDb?: number;
        };
        if (!ev?.inputName) return;
        setAudioInputs((prev) =>
          prev.map((i) =>
            i.name === ev.inputName
              ? {
                  ...i,
                  volumeMul: Number(ev.inputVolumeMul) || 0,
                  volumeDb: Number(ev.inputVolumeDb) || 0,
                }
              : i
          )
        );
      }),
      client.on('InputMuteStateChanged', (d) => {
        if (!alive.current) return;
        const ev = d as { inputName?: string; inputMuted?: boolean };
        if (!ev?.inputName) return;
        setAudioInputs((prev) =>
          prev.map((i) =>
            i.name === ev.inputName ? { ...i, muted: !!ev.inputMuted } : i
          )
        );
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [client, refreshAll]);

  // Coupe la socket (et la reconnexion auto) quand la page se démonte.
  useEffect(() => {
    return () => {
      client.disconnect();
    };
  }, [client]);

  const connect = useCallback(async () => {
    saveSettings(settings);
    setConnectError(null);
    setReconnectFailedAttempts(null);
    setPhase('connecting');
    const res = await client.connect({
      host: settings.host || 'localhost',
      port: settings.port || 4455,
      password: settings.password || undefined,
    });
    if (!alive.current) return res;
    if ('error' in res) {
      setPhase('disconnected');
      setConnectError(res.error);
    }
    return res;
  }, [client, settings]);

  const disconnect = useCallback(() => {
    client.disconnect();
    setPhase('disconnected');
    setConnectError(null);
    setReconnectFailedAttempts(null);
    setScenes([]);
    setCurrentScene('');
    setStream({ active: false, startedAt: null });
    setRecord({ active: false, startedAt: null });
    setAudioInputs([]);
  }, [client]);

  const switchScene = useCallback(
    async (sceneName: string) => {
      await opSetScene(client, sceneName);
      // L'événement CurrentProgramSceneChanged confirmera ; optimiste ici.
      if (alive.current) setCurrentScene(sceneName);
    },
    [client]
  );

  const toggleStream = useCallback((): Promise<ToggleStreamResult> => {
    return opToggleStream(client);
  }, [client]);

  const toggleRecord = useCallback(() => {
    return opToggleRecord(client);
  }, [client]);

  const changeVolume = useCallback(
    async (inputName: string, volumeMul: number) => {
      // Optimiste (le slider suit le doigt) ; l'événement recale ensuite.
      setAudioInputs((prev) =>
        prev.map((i) => (i.name === inputName ? { ...i, volumeMul } : i))
      );
      await setInputVolume(client, inputName, volumeMul);
    },
    [client]
  );

  const changeMute = useCallback(
    async (inputName: string, muted: boolean) => {
      setAudioInputs((prev) =>
        prev.map((i) => (i.name === inputName ? { ...i, muted } : i))
      );
      await setInputMute(client, inputName, muted);
    },
    [client]
  );

  /** Setup idempotent des scènes overlay dans OBS, sur l'origin fourni. */
  const setupScenes = useCallback(
    (origin: string): Promise<SetupOverlayScenesResult> => {
      return setupOverlayScenes(
        client,
        buildOverlaySceneSetup(origin, CASTER_SCENE_TYPES)
      );
    },
    [client]
  );

  return {
    settings,
    setSettings,
    phase,
    connectError,
    reconnectFailedAttempts,
    scenes,
    currentScene,
    stream,
    record,
    audioInputs,
    connect,
    disconnect,
    switchScene,
    toggleStream,
    toggleRecord,
    changeVolume,
    changeMute,
    setupScenes,
  };
}
