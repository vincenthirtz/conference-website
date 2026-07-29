// utils/caster/obsOps.ts
//
// Opérations OBS de haut niveau — port des handlers IPC de l'app desktop
// (womenscup-caster/src/main/obs.js) sur le client navigateur ObsClient.
// Module PUR (zéro React/DOM) : l'origin des overlays hébergés est passé en
// paramètre par l'appelant (pas de window ici).
//
// ⚠️ ÉCART VOLONTAIRE vs desktop : PAS de port de SetStreamServiceSettings /
// ensureTwitchStreamService. Le desktop pousse la clé de stream Twitch du
// compte connecté dans OBS avant StartStream ; côté web, la clé ne doit JAMAIS
// transiter par le navigateur. Le démarrage du stream web se contente de
// ToggleStream sur la configuration déjà en place dans OBS (Paramètres → Flux)
// — l'UI l'explique par une note (obsStreamKeyNote).

import type { ObsClient } from './obsClient';

// ---------------------------------------------------------------------------
// Scènes
// ---------------------------------------------------------------------------

export type ObsSceneSummary = { sceneName: string };

export type ObsSceneList = {
  scenes: ObsSceneSummary[];
  currentScene: string | undefined;
};

export async function getScenes(client: ObsClient): Promise<ObsSceneList> {
  const data = await client.call('GetSceneList');
  return {
    scenes: (data.scenes as ObsSceneSummary[]) || [],
    currentScene: data.currentProgramSceneName as string | undefined,
  };
}

export async function setScene(
  client: ObsClient,
  sceneName: string
): Promise<void> {
  await client.call('SetCurrentProgramScene', { sceneName });
}

// ---------------------------------------------------------------------------
// Stream / Record
// ---------------------------------------------------------------------------

export type ObsStreamStatus = {
  outputActive: boolean;
  outputReconnecting?: boolean;
  /** Durée du flux en millisecondes. */
  outputDuration?: number;
  outputTimecode?: string;
};

export async function getStreamStatus(
  client: ObsClient
): Promise<ObsStreamStatus> {
  return (await client.call('GetStreamStatus')) as ObsStreamStatus;
}

export type ToggleStreamResult = {
  /** État visé après le toggle. */
  streaming: boolean;
  /**
   * Au démarrage : true si OBS a confirmé outputActive/outputReconnecting sous
   * ~6 s (même vérification que le desktop). false = ToggleStream accepté mais
   * sortie jamais vue active — probablement une config Flux absente/invalide
   * dans OBS (le web ne pousse PAS la clé Twitch, voir en-tête).
   */
  verified: boolean;
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Démarre/arrête le stream. L'arrêt est inconditionnel ; le démarrage est
 * vérifié en pollant GetStreamStatus jusqu'à ~6 s (la sortie RTMP se connecte
 * à l'ingest de façon asynchrone). Throw si OBS refuse le ToggleStream.
 */
export async function toggleStream(
  client: ObsClient
): Promise<ToggleStreamResult> {
  const status = await getStreamStatus(client);
  const starting = !status.outputActive;

  await client.call('ToggleStream');
  if (!starting) return { streaming: false, verified: true };

  for (let i = 0; i < 6; i++) {
    await delay(1000);
    const st = await getStreamStatus(client);
    if (st.outputActive || st.outputReconnecting) {
      return { streaming: true, verified: true };
    }
  }
  return { streaming: true, verified: false };
}

export type ObsRecordStatus = {
  outputActive: boolean;
  outputDuration?: number;
  outputTimecode?: string;
};

export async function getRecordStatus(
  client: ObsClient
): Promise<ObsRecordStatus> {
  return (await client.call('GetRecordStatus')) as ObsRecordStatus;
}

export async function toggleRecord(client: ObsClient): Promise<void> {
  await client.call('ToggleRecord');
}

// ---------------------------------------------------------------------------
// Mixer audio (faders des sources OBS)
// ---------------------------------------------------------------------------

export type ObsAudioInput = {
  name: string;
  kind: string;
  volumeMul: number;
  volumeDb: number;
  muted: boolean;
};

/**
 * Liste les inputs qui portent de l'audio, avec volume + mute. Même approche
 * que le desktop : on sonde GetInputVolume par input — les inputs vidéo-only
 * rejettent, donc le filtre est « a de l'audio » sans allow-list d'inputKind.
 */
export async function listAudioInputs(
  client: ObsClient
): Promise<ObsAudioInput[]> {
  const { inputs = [] } = (await client.call('GetInputList')) as {
    inputs?: Array<{ inputName: string; inputKind: string }>;
  };
  const probed = await Promise.all(
    inputs.map(async (i) => {
      try {
        const vol = await client.call('GetInputVolume', {
          inputName: i.inputName,
        });
        const mute = await client.call('GetInputMute', {
          inputName: i.inputName,
        });
        return {
          name: i.inputName,
          kind: i.inputKind,
          volumeMul: Number(vol.inputVolumeMul) || 0,
          volumeDb: Number(vol.inputVolumeDb) || 0,
          muted: !!mute.inputMuted,
        };
      } catch {
        return null; // input sans audio
      }
    })
  );
  return probed.filter((i): i is ObsAudioInput => i != null);
}

export async function setInputVolume(
  client: ObsClient,
  inputName: string,
  volumeMul: number
): Promise<void> {
  await client.call('SetInputVolume', {
    inputName,
    inputVolumeMul: volumeMul,
  });
}

export async function setInputMute(
  client: ObsClient,
  inputName: string,
  muted: boolean
): Promise<void> {
  await client.call('SetInputMute', { inputName, inputMuted: !!muted });
}

// ---------------------------------------------------------------------------
// Setup des scènes overlay (idempotent) — réplique de obs:setup-overlay-scenes
// ---------------------------------------------------------------------------

/** Types de scènes qui reçoivent une Game Capture sous l'overlay (gameplay). */
export const OVERLAY_GAMEPLAY_TYPES: ReadonlySet<string> = new Set([
  'match',
  'results',
]);

/** Nom de la source Game Capture partagée (même nom que le desktop). */
export const GAME_INPUT_NAME = 'WC Game Capture';

export type OverlaySceneSetup = {
  type: string;
  sceneName: string;
  url: string;
  withGame: boolean;
};

/**
 * Construit le payload de setup à partir de l'origin du site et des types de
 * scènes : URL des overlays HÉBERGÉS `${origin}/overlay/caster/<type>` (écart
 * vs desktop qui pointe sur son serveur overlay local). Pur, testable.
 */
export function buildOverlaySceneSetup(
  origin: string,
  types: readonly string[]
): OverlaySceneSetup[] {
  const base = origin.replace(/\/+$/, '');
  return types.map((type) => ({
    type,
    sceneName: type,
    url: `${base}/overlay/caster/${type}`,
    withGame: OVERLAY_GAMEPLAY_TYPES.has(type),
  }));
}

export type SetupOverlayScenesResult = {
  /** Éléments créés (scènes + inputs) — vide si tout existait déjà. */
  created: string[];
};

/**
 * Crée/complète les scènes OBS des overlays : pour chaque entrée, s'assure que
 * la scène OBS existe, puis ajoute (idempotent) le Browser Source de l'overlay
 * au-dessus ; les scènes gameplay reçoivent aussi la Game Capture partagée en
 * dessous. Re-exécutable : un input/scène existant est réutilisé, pas dupliqué,
 * et l'URL du Browser Source est réparée au passage (logique EXACTE du desktop).
 */
export async function setupOverlayScenes(
  client: ObsClient,
  scenes: OverlaySceneSetup[]
): Promise<SetupOverlayScenesResult> {
  const sceneList = (await client.call('GetSceneList')) as {
    scenes?: Array<{ sceneName: string }>;
  };
  const existingScenes = new Set(
    (sceneList.scenes || []).map((s) => s.sceneName)
  );
  const inputList = (await client.call('GetInputList')) as {
    inputs?: Array<{ inputName: string }>;
  };
  const existingInputs = new Set(
    (inputList.inputs || []).map((i) => i.inputName)
  );
  const created: string[] = [];

  const sceneHasSource = async (sceneName: string, sourceName: string) => {
    const { sceneItems = [] } = (await client.call('GetSceneItemList', {
      sceneName,
    })) as { sceneItems?: Array<{ sourceName: string }> };
    return sceneItems.some((it) => it.sourceName === sourceName);
  };

  for (const s of scenes) {
    if (!s?.sceneName || !s?.url) continue;

    if (!existingScenes.has(s.sceneName)) {
      await client.call('CreateScene', { sceneName: s.sceneName });
      existingScenes.add(s.sceneName);
      created.push(`scène ${s.sceneName}`);
    }

    // Game Capture partagée sous l'overlay (scènes gameplay uniquement).
    if (s.withGame) {
      if (!existingInputs.has(GAME_INPUT_NAME)) {
        await client.call('CreateInput', {
          sceneName: s.sceneName,
          inputName: GAME_INPUT_NAME,
          inputKind: 'game_capture',
          inputSettings: { capture_mode: 'any' },
          sceneItemEnabled: true,
        });
        existingInputs.add(GAME_INPUT_NAME);
        created.push(GAME_INPUT_NAME);
      } else if (!(await sceneHasSource(s.sceneName, GAME_INPUT_NAME))) {
        await client.call('CreateSceneItem', {
          sceneName: s.sceneName,
          sourceName: GAME_INPUT_NAME,
          sceneItemEnabled: true,
        });
      }
    }

    // Browser Source de l'overlay au-dessus.
    const overlayName = `WC Overlay – ${s.type}`;
    const overlaySettings = { url: s.url, width: 1920, height: 1080 };
    let overlayItemId: number | null = null;
    if (!existingInputs.has(overlayName)) {
      const r = await client.call('CreateInput', {
        sceneName: s.sceneName,
        inputName: overlayName,
        inputKind: 'browser_source',
        inputSettings: overlaySettings,
        sceneItemEnabled: true,
      });
      overlayItemId = (r.sceneItemId as number) ?? null;
      existingInputs.add(overlayName);
      created.push(overlayName);
    } else {
      // Répare l'URL au re-run (ex. passage du serveur local desktop aux
      // overlays hébergés) : une source existante ne doit pas rester pointée
      // sur un endpoint mort.
      await client.call('SetInputSettings', {
        inputName: overlayName,
        inputSettings: overlaySettings,
        overlay: true,
      });
      if (!(await sceneHasSource(s.sceneName, overlayName))) {
        const r = await client.call('CreateSceneItem', {
          sceneName: s.sceneName,
          sourceName: overlayName,
          sceneItemEnabled: true,
        });
        overlayItemId = (r.sceneItemId as number) ?? null;
      }
    }

    // Force l'overlay au-dessus de la game capture (l'item le plus récent
    // n'est pas toujours en haut après un re-run). Index max = rendu au-dessus.
    if (overlayItemId != null) {
      try {
        const { sceneItems = [] } = (await client.call('GetSceneItemList', {
          sceneName: s.sceneName,
        })) as { sceneItems?: unknown[] };
        await client.call('SetSceneItemIndex', {
          sceneName: s.sceneName,
          sceneItemId: overlayItemId,
          sceneItemIndex: Math.max(0, sceneItems.length - 1),
        });
      } catch {
        /* ajustement d'index best-effort */
      }
    }
  }

  return { created };
}
