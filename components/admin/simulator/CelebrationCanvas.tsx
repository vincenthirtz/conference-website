import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Fun WebGL celebration backdrop for the simulator "quiz/slides" reveal.
 *
 * Renders behind the champion card: a slowly rotating wireframe icosahedron
 * (the "trophy gem") plus a continuous confetti fountain of colored points
 * affected by gravity. Pure three.js (no react-three-fiber) so it stays a
 * light, self-contained dependency. Mounted via next/dynamic (ssr:false) —
 * WebGL is browser-only. Everything is disposed on unmount.
 *
 * CSP-safe: three.js bundles no eval; WebGL needs no external hosts.
 */

const CONFETTI_COLORS = [
  0x8f21bf, // purple (brand)
  0x22d3ee, // neon cyan
  0xf59e0b, // amber (seed 1)
  0x34d399, // emerald
  0xf472b6, // pink
  0xfacc15, // gold
];

type Props = {
  /** Hex color of the centerpiece gem — defaults to gold. */
  gemColor?: number;
  className?: string;
};

export default function CelebrationCanvas({
  gemColor = 0xfacc15,
  className,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let width = mount.clientWidth || 600;
    let height = mount.clientHeight || 400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.z = 14;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    // --- Centerpiece "gem" -------------------------------------------------
    const gemGeo = new THREE.IcosahedronGeometry(3.2, 0);
    const gemMat = new THREE.MeshBasicMaterial({
      color: gemColor,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    scene.add(gem);

    const gemGlow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.24, 0),
      new THREE.MeshBasicMaterial({
        color: gemColor,
        transparent: true,
        opacity: 0.06,
      })
    );
    scene.add(gemGlow);

    // --- Confetti fountain -------------------------------------------------
    const COUNT = prefersReduced ? 120 : 420;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    // Per-particle velocity + a deterministic seed for respawn variety. We
    // avoid Math.random for the very first frame layout only in spirit; here
    // randomness is purely visual and client-side, so it's fine to use it.
    const velocities = new Float32Array(COUNT * 3);
    const color = new THREE.Color();

    const resetParticle = (i: number, initial: boolean) => {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 4;
      positions[i3 + 1] = initial
        ? Math.random() * 18 - 9
        : -7 - Math.random() * 2;
      positions[i3 + 2] = (Math.random() - 0.5) * 6;
      velocities[i3] = (Math.random() - 0.5) * 0.06;
      velocities[i3 + 1] = 0.12 + Math.random() * 0.14;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.06;
      color.setHex(
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
      );
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    };
    for (let i = 0; i < COUNT; i++) resetParticle(i, true);

    const confettiGeo = new THREE.BufferGeometry();
    confettiGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    confettiGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const confettiMat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
    });
    const confetti = new THREE.Points(confettiGeo, confettiMat);
    scene.add(confetti);

    const GRAVITY = 0.0055;
    let raf = 0;
    let running = true;

    const tick = () => {
      if (!running) return;
      gem.rotation.x += 0.004;
      gem.rotation.y += 0.006;
      gemGlow.rotation.copy(gem.rotation);

      const pos = confettiGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        velocities[i3 + 1] -= GRAVITY;
        pos[i3] += velocities[i3];
        pos[i3 + 1] += velocities[i3 + 1];
        pos[i3 + 2] += velocities[i3 + 2];
        if (pos[i3 + 1] < -10) resetParticle(i, false);
      }
      confettiGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Pause when tab is hidden (saves GPU / battery).
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onResize = () => {
      if (!mount) return;
      width = mount.clientWidth || width;
      height = mount.clientHeight || height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(onResize)
        : null;
    ro?.observe(mount);
    window.addEventListener('resize', onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      gemGeo.dispose();
      gemMat.dispose();
      gemGlow.geometry.dispose();
      (gemGlow.material as THREE.Material).dispose();
      confettiGeo.dispose();
      confettiMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [gemColor]);

  return (
    <div
      ref={mountRef}
      className={className}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    />
  );
}
