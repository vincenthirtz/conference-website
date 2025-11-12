declare module 'canvas-confetti' {
  type ConfettiOptions = Record<string, any>;
  export default function confetti(opts?: ConfettiOptions): void;
}