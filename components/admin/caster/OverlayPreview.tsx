// components/admin/caster/OverlayPreview.tsx
//
// Aperçu live de l'overlay de la scène éditée (lot 7) — port de
// `loadOverlayPreview` de womenscup-caster/src/renderer/editor.js.
//
// AUCUNE PLOMBERIE DE DONNÉES : l'iframe charge la VRAIE page overlay
// (`/overlay/caster/<id>`), qui lit `caster_scenes` avec la clé anon et suit sa
// ligne en Supabase Realtime. Une frappe dans l'éditeur → auto-save → event
// Realtime → l'aperçu se met à jour tout seul. C'est aussi ce que voit OBS : un
// aperçu qui divergerait de l'antenne serait pire qu'aucun aperçu.
//
// Ciblage par UUID et non par type : `/overlay/caster/match` résout la PREMIÈRE
// scène `match` par sort_order, donc l'aperçu montrerait la mauvaise scène dès
// qu'il en existe deux du même type (ce que le CRUD du lot 7 rend banal).
//
// Mise à l'échelle : l'overlay est un canevas fixe 1920×1080. On le rend à sa
// taille réelle et on applique un `scale()` avec `transform-origin: top left`
// dans un conteneur en `aspect-ratio: 16/9` + `overflow: hidden` — le rendu
// interne reste px-exact (pas de reflow), seul l'affichage est réduit.
//
// ⚠️ SCÈNE `webcam` : l'overlay appelle `getUserMedia`. Monter l'iframe à chaque
// sélection allumerait la webcam de ce poste (voyant allumé, et surtout caméra
// volée à OBS qui en est le consommateur unique — c'est OBS qui part à
// l'antenne). L'app desktop résout ça avec un flag `preview: true` qui affiche
// un placeholder ; la page overlay web n'a pas ce flag (et elle est hors
// périmètre de ce lot). On exige donc un clic explicite pour ce type.
//
// CSP — `proxy.ts` autorise l'embarquement des routes `/overlay/*` par NOTRE
// origine (`frame-ancestors 'self'`, et le X-Frame-Options global de
// netlify.toml y est retiré). C'est ce qui rend cet aperçu possible ; couvert
// par `tests/unit/proxyCsp.test.ts`.
//
// La SONDE ci-dessous (HEAD same-origin, lecture de l'en-tête CSP) reste en
// place comme garde : si quelqu'un resserre un jour la politique, on affiche un
// encart explicite au lieu d'un cadre noir muet et inexplicable en régie.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdminT } from '@/lib/i18n/useAdminT';
import { logger } from '@/utils/logger';
import type { CasterScene } from '@/types/caster';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

/** Canevas natif des overlays (identique au desktop). */
const OVERLAY_W = 1920;
const OVERLAY_H = 1080;

/** Mémorisation du pli/dépli — un poste de régie garde son choix. */
const STORAGE_KEY = 'caster.preview.open';

type FramingVerdict = 'checking' | 'allowed' | 'blocked';

/**
 * La politique de framing ne dépend pas de la scène : on la sonde UNE fois par
 * session (promesse mémoïsée au niveau module) plutôt qu'à chaque sélection.
 */
let framingProbe: Promise<boolean> | null = null;

function probeFraming(url: string): Promise<boolean> {
  framingProbe ??= fetch(url, { method: 'HEAD' })
    .then((res) => {
      const csp = res.headers.get('content-security-policy') || '';
      const match = /frame-ancestors ([^;]+)/i.exec(csp);
      // Pas de directive du tout ⇒ on tente (X-Frame-Options peut encore
      // bloquer, mais l'encart mentirait moins qu'un faux négatif).
      if (!match) return true;
      return !/'none'/i.test(match[1]);
    })
    .catch((err) => {
      logger.error('[OverlayPreview] framing probe failed', err);
      return true; // On tente : un cadre noir vaut mieux qu'un encart à tort.
    });
  return framingProbe;
}

type Props = { scene: CasterScene };

export default function OverlayPreview({ scene }: Props) {
  const t = useAdminT(nsAdminCasterScenes);

  // Ouvert par DÉFAUT (l'intérêt de l'aperçu est de ne pas éditer à l'aveugle),
  // mais le choix est mémorisé. Lecture du localStorage dans un effet : le SSR
  // n'a pas `window`, et une valeur initiale divergente casserait l'hydratation.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '0') setOpen(false);
    } catch {
      /* localStorage indisponible (mode privé) : on reste ouvert. */
    }
  }, []);

  const toggle = useCallback((next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* non bloquant */
    }
  }, []);

  // Remonte l'iframe (bouton « Rafraîchir ») : plus fiable qu'un
  // contentWindow.location.reload() (cross-origin-safe, et ça reconstruit la
  // souscription Realtime de l'overlay si elle a lâché pendant le show).
  const [reloadKey, setReloadKey] = useState(0);

  // La webcam n'est montée que sur demande explicite, et la demande est
  // réinitialisée au changement de scène (sinon la caméra resterait ouverte en
  // naviguant d'une scène webcam à une autre).
  const [webcamAllowed, setWebcamAllowed] = useState(false);
  useEffect(() => {
    setWebcamAllowed(false);
  }, [scene.id]);
  const blockedForWebcam = scene.type === 'webcam' && !webcamAllowed;

  const src = `/overlay/caster/${scene.id}`;

  // Sonde CSP : la politique de framing est globale, on ne la lit qu'une fois.
  const [framing, setFraming] = useState<FramingVerdict>('checking');
  useEffect(() => {
    if (!open || blockedForWebcam) return undefined;
    let alive = true;
    void probeFraming(src).then((ok) => {
      if (alive) setFraming(ok ? 'allowed' : 'blocked');
    });
    return () => {
      alive = false;
    };
  }, [open, blockedForWebcam, src]);

  // Échelle = largeur disponible / 1920, recalculée au redimensionnement du
  // conteneur (ResizeObserver : le panneau bouge aussi quand un onglet change).
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !open) return undefined;
    // Largeur 0 = panneau masqué (onglet inactif) : on GARDE la dernière
    // échelle, sinon l'iframe se démonterait et rechargerait à chaque
    // changement d'onglet (et perdrait sa souscription Realtime).
    const measure = () => {
      const w = box.clientWidth;
      if (w > 0) setScale(w / OVERLAY_W);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [open, blockedForWebcam, framing]);

  return (
    <section
      className="mb-4 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5"
      data-testid="caster-overlay-preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => toggle(!open)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-sm font-medium text-neutral-200 hover:text-white"
          data-testid="caster-overlay-preview-toggle"
        >
          <span aria-hidden="true" className="text-[10px] text-neutral-500">
            {open ? '▼' : '►'}
          </span>
          {t.previewTitle}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={!open || blockedForWebcam}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-[11px] font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
            data-testid="caster-overlay-preview-refresh"
          >
            {t.previewRefresh}
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-[11px] font-medium text-cyan-200 hover:bg-neutral-700"
            data-testid="caster-overlay-preview-open"
          >
            {t.previewOpen}
          </a>
        </div>
      </div>

      {open && (
        <>
          {blockedForWebcam ? (
            <div
              className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-3"
              data-testid="caster-overlay-preview-webcam-guard"
            >
              <p className="text-xs font-medium text-amber-200">
                {t.previewWebcamTitle}
              </p>
              <p className="mt-1 text-[11px] text-amber-100/70">
                {t.previewWebcamBody}
              </p>
              <button
                type="button"
                onClick={() => setWebcamAllowed(true)}
                className="mt-2 rounded-lg border border-amber-500/50 bg-amber-900/40 px-2.5 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-900/70"
                data-testid="caster-overlay-preview-webcam-allow"
              >
                {t.previewWebcamShow}
              </button>
            </div>
          ) : framing === 'blocked' ? (
            // CSP `frame-ancestors 'none'` sur /overlay/* : le navigateur
            // refuserait l'iframe. On le dit, plutôt que d'afficher un cadre
            // noir que le caster prendrait pour un overlay cassé.
            <div
              className="mt-2 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-3"
              data-testid="caster-overlay-preview-blocked"
            >
              <p className="text-xs font-medium text-red-200">
                {t.previewBlockedTitle}
              </p>
              <p className="mt-1 text-[11px] text-red-100/70">
                {t.previewBlockedBody}
              </p>
            </div>
          ) : (
            <div
              ref={boxRef}
              // Ratio 16/9 préservé et débordement coupé : l'iframe fait
              // physiquement 1920×1080, seule sa transformée la fait tenir.
              className="mt-2 w-full overflow-hidden rounded-lg border border-neutral-800 bg-black"
              style={{ aspectRatio: '16 / 9' }}
            >
              {scale > 0 && framing === 'allowed' && (
                <iframe
                  key={`${scene.id}-${reloadKey}`}
                  src={src}
                  title={t.previewTitle}
                  // L'overlay est same-origin : pas de sandbox (il a besoin de
                  // sa connexion Realtime et de ses scripts).
                  className="border-0"
                  style={{
                    width: OVERLAY_W,
                    height: OVERLAY_H,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                  }}
                />
              )}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-neutral-600">{t.previewHint}</p>
        </>
      )}
    </section>
  );
}
