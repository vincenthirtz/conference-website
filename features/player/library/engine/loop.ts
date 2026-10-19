// Boucle de rendu À LA DEMANDE : pas de 60 fps au repos.
//
// `request()` programme UNE image (survol, caméra, image décodée…). Tant que
// `tick` répond keepGoing (un avatar marche, un bot attend de repartir), la
// boucle s'enchaîne d'elle-même ; sinon elle s'arrête jusqu'à la prochaine
// demande. Les FPS ne sont mesurés que pendant ces séquences animées.

export type FrameStats = {
  /** Images/s sur la dernière seconde animée, null au repos. */
  fps: number | null;
  /** Temps moyen de simulation + dessin d'une image, en ms. */
  frameMs: number;
};

export type Tick = (dt: number) => { keepGoing: boolean; frameMs: number };

type Raf = (cb: (now: number) => void) => number;
type Caf = (id: number) => void;

export class FrameLoop {
  private handle = 0;
  private last = -1;
  private running = false;
  private stopped = false;
  private windowStart = -1;
  private frames = 0;
  private msSum = 0;

  constructor(
    private tick: Tick,
    private onStats: (s: FrameStats) => void = () => {},
    private raf: Raf = (cb) => requestAnimationFrame(cb),
    private caf: Caf = (id) => cancelAnimationFrame(id)
  ) {}

  request(): void {
    if (this.handle || this.stopped) return;
    this.handle = this.raf(this.frame);
  }

  stop(): void {
    this.stopped = true;
    if (this.handle) this.caf(this.handle);
    this.handle = 0;
  }

  private frame = (now: number): void => {
    this.handle = 0;
    if (this.stopped) return;
    // Première image après un repos : dt = 0 (pas de saut de l'avatar).
    const dt = this.last < 0 ? 0 : Math.min(0.1, (now - this.last) / 1000);
    const { keepGoing, frameMs } = this.tick(dt);

    if (keepGoing) {
      if (this.windowStart < 0) this.windowStart = now;
      this.frames++;
      this.msSum += frameMs;
      const elapsed = now - this.windowStart;
      if (elapsed >= 1000) {
        this.onStats({
          fps: ((this.frames - 1) * 1000) / elapsed,
          frameMs: this.msSum / this.frames,
        });
        this.windowStart = now;
        this.frames = 1;
        this.msSum = frameMs;
      }
      this.running = true;
      this.last = now;
      this.handle = this.raf(this.frame);
      return;
    }
    if (this.running) this.onStats({ fps: null, frameMs });
    this.running = false;
    this.last = -1;
    this.windowStart = -1;
    this.frames = 0;
    this.msSum = 0;
  };
}
