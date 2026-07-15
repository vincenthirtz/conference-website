// utils/playChime.ts
//
// Feature: Run-of-show — Lot 5 (Director comms).
// Mini util pour jouer un beep court via Web Audio API. Aucun fichier audio
// requis. Utilise par le CueFeed du Director pour notifier l'arrivee d'un
// cue 'urgent' (ou 'warn' sur demande).
//
// Pourquoi pas un <audio> + fichier mp3 ?
//   - Pas de dependance binaire dans le repo.
//   - Web Audio API marche partout (Chrome/Edge/Firefox/Safari modernes).
//   - L'oscillator suffit largement pour un signal d'attention discret.
//
// Limitations connues :
//   - Le browser exige une interaction utilisateur prealable AVANT le premier
//     son (autoplay policy). Sur la page Director, l'utilisateur clique
//     forcement "Demarrer le run" / "Envoyer cue" avant d'attendre un cue
//     entrant — donc en pratique c'est OK. Si l'AudioContext est encore
//     'suspended', on appelle resume() au best-effort puis on tente play.
//   - Si rien ne marche (test env, audio bloque, etc.), on swallow l'erreur :
//     un cue qui ne beep pas ne doit pas casser l'UI.
//
// Variantes :
//   - 'info'   : 1 beep doux a 440Hz, gain faible (cockpit caster).
//   - 'warn'   : 2 beeps a 660Hz.
//   - 'urgent' : 3 beeps espaces a 880Hz (plus aigu, gain plus fort).

type ChimeVariant = 'info' | 'warn' | 'urgent';

// On reutilise un seul AudioContext (les browsers limitent le nombre
// d'instances). Lazily cree au premier appel cote client.
let ctxRef: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctxRef) return ctxRef;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctxRef = new Ctor();
    return ctxRef;
  } catch {
    return null;
  }
}

function beep(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  durationMs: number,
  peakGain = 0.08
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;

  const start = ctx.currentTime + startOffset;
  const end = start + durationMs / 1000;

  // Enveloppe attaque/release rapide pour eviter le "clic" sur on/off.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.01);
  gain.gain.linearRampToValueAtTime(0, end);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(end + 0.02);
}

// Débloque l'AudioContext suite à un geste utilisateur (autoplay policy des
// navigateurs mobiles). À appeler une fois sur la première interaction
// (pointerdown / keydown) : sans ça, le contexte reste 'suspended' et un
// playChime() ultérieur — déclenché par un cue urgent entrant, donc SANS
// interaction — n'émet aucun son. Idempotent (getContext réutilise le
// singleton), best-effort, no-op si Web Audio n'est pas supporté.
export function unlockAudio(): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }
}

export function playChime(variant: ChimeVariant): void {
  const ctx = getContext();
  if (!ctx) return;
  // Si le contexte est suspendu (autoplay policy), on tente un resume()
  // best-effort. Si ca echoue, on swallow.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }
  try {
    if (variant === 'info') {
      // info : 1 beep doux a 440Hz.
      beep(ctx, 440, 0, 160, 0.05);
    } else if (variant === 'warn') {
      // warn : 2 beeps 660Hz.
      beep(ctx, 660, 0, 160, 0.1);
      beep(ctx, 660, 0.24, 160, 0.1);
    } else {
      // urgent : 3 beeps 880Hz, gain plus fort.
      beep(ctx, 880, 0, 140, 0.16);
      beep(ctx, 880, 0.22, 140, 0.16);
      beep(ctx, 880, 0.44, 140, 0.16);
    }
  } catch {
    // L'API peut throw si la page est en background ou si le hardware audio
    // a disparu (casque debranche en plein call, etc.). On ignore.
  }
}
