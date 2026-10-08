// features/admin/diffusion/ui/RegieLayoutPanel.tsx — Diffusion › Overlays ›
// « Mise en page de la source Régie » : où la source OBS plein écran
// `/overlay/regie` pose ses éléments (alertes, drops TCG, sondage MVP,
// partenaires, QR).
//
// L'APERÇU est la scène 1920×1080 réduite : chaque élément y est un bloc à sa
// taille approximative, placé par la MÊME fonction que la source
// (`slotStyle`, utils/overlay/regieLayout.ts) — ce qu'on voit ici est ce que
// la source fera. On le fait glisser (décalage), ou on le règle au pixel.
//
// « Tout afficher dans OBS » lance l'alerte de test et le sondage de test :
// on cale la scène sur le VRAI rendu, pas seulement sur ces blocs.

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { adminRequest } from '@/utils/admin/adminHttp';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminRegieLayout from '@/lib/i18n/locales/admin-fr/adminRegieLayout';
import {
  DEFAULT_REGIE_LAYOUT,
  REGIE_ANCHORS,
  REGIE_ELEMENTS,
  SCALE_MAX,
  SCALE_MIN,
  SCENE_H,
  SCENE_W,
  normalizeRegieLayout,
  slotStyle,
  type RegieAnchor,
  type RegieElement,
  type RegieLayout,
  type RegieSlot,
} from '@/utils/overlay/regieLayout';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanEyebrow,
  rubanFormInput,
  rubanHelp,
  rubanLabel,
  rubanMuted,
} from '@/features/ruban/ruban';
import { adminKey, withAdminQuery } from '../../_shared/query';

const URL = '/api/admin/diffusion/regie-layout';
const KEY = adminKey('diffusion', 'regie-layout');

/** Taille approximative de chaque élément à l'échelle 1 (px de la scène). */
const BOX: Record<RegieElement, { w: number; h: number; color: string }> = {
  alerts: { w: 760, h: 240, color: '#e5484d' },
  tcg: { w: 620, h: 120, color: '#f0a238' },
  mvp: { w: 640, h: 440, color: '#b467d1' },
  partners: { w: 1500, h: 150, color: '#3b82f6' },
  don: { w: 420, h: 150, color: '#22c55e' },
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function RegieLayoutPanel({ canEdit }: { canEdit: boolean }) {
  const t = useAdminT(nsAdminRegieLayout);
  const { addToast } = useToast();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => adminRequest<{ layout: RegieLayout }>(URL),
  });
  const saved = query.data?.layout ?? null;
  const [draft, setDraft] = useState<RegieLayout | null>(null);
  const [selected, setSelected] = useState<RegieElement>('mvp');
  const [busy, setBusy] = useState(false);
  const layout = draft ?? saved ?? DEFAULT_REGIE_LAYOUT;
  const slot = layout[selected];
  const dirty = !!draft;

  const saveMutation = useIdempotentMutation();
  const testMvp = useIdempotentMutation();
  const testAlert = useIdempotentMutation();

  // Largeur réelle de l'aperçu → facteur scène → aperçu.
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(640);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth || 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = frameW / SCENE_W;

  const update = (el: RegieElement, patch: Partial<RegieSlot>) =>
    setDraft(
      normalizeRegieLayout({ ...layout, [el]: { ...layout[el], ...patch } })
    );

  // Glisser-déposer : le déplacement dans l'aperçu devient un décalage en
  // pixels de la scène, depuis l'ancrage.
  const drag = useRef<{
    el: RegieElement;
    px: number;
    py: number;
    x: number;
    y: number;
  } | null>(null);
  function onPointerDown(el: RegieElement, e: PointerEvent<HTMLDivElement>) {
    setSelected(el);
    if (!canEdit) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = {
      el,
      px: e.clientX,
      py: e.clientY,
      x: layout[el].x,
      y: layout[el].y,
    };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    update(d.el, {
      x: Math.round(clamp(d.x + (e.clientX - d.px) / k, -SCENE_W, SCENE_W)),
      y: Math.round(clamp(d.y + (e.clientY - d.py) / k, -SCENE_H, SCENE_H)),
    });
  }
  const onPointerUp = () => {
    drag.current = null;
  };

  async function run(fn: () => Promise<unknown>, ok: string, ko: string) {
    setBusy(true);
    try {
      await fn();
      addToast(ok, 'success');
      return true;
    } catch (err: unknown) {
      addToast((err as Error)?.message || ko, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(
      async () => {
        const res = await saveMutation.mutateJson<{ layout: RegieLayout }>(
          URL,
          {
            method: 'PUT',
            body: JSON.stringify(layout),
          }
        );
        qc.setQueryData(KEY, res);
        setDraft(null);
      },
      t.saved,
      t.errorSave
    );

  const testObs = () =>
    run(
      () =>
        Promise.all([
          testMvp.mutateJson('/api/admin/diffusion/mvp-overlay', {
            method: 'POST',
            body: JSON.stringify({ action: 'test-start' }),
          }),
          testAlert.mutateJson('/api/admin/stream-alert-test', {
            method: 'POST',
            body: JSON.stringify({ kind: 'follow', name: 'Test' }),
          }),
        ]),
      t.testObsDone,
      t.testObsError
    );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--t1,#f4edf7)]">
          {t.title}
        </h2>
        <p className={`mt-1 text-sm ${rubanMuted}`}>{t.subtitle}</p>
        {!canEdit && <p className={rubanHelp}>{t.readOnly}</p>}
      </div>
      {query.isError && (
        <p className="text-sm text-[var(--err,#ff6b6b)]">{t.errorLoad}</p>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Aperçu de la scène */}
        <div>
          <div
            ref={frameRef}
            role="img"
            aria-label={t.previewLabel}
            className="relative w-full select-none overflow-hidden rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))]"
            style={{
              aspectRatio: `${SCENE_W} / ${SCENE_H}`,
              background:
                'repeating-conic-gradient(#1a1320 0% 25%, #140e18 0% 50%) 0 0 / 24px 24px',
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {REGIE_ELEMENTS.map((el) => {
              const s = layout[el];
              const box = BOX[el];
              const active = el === selected;
              return (
                <div
                  key={el}
                  style={slotStyle(s, { k })}
                  className="pointer-events-none"
                >
                  <div
                    onPointerDown={(e) => onPointerDown(el, e)}
                    className={`pointer-events-auto flex items-center justify-center rounded-md border-2 text-center font-semibold ${
                      canEdit ? 'cursor-move' : 'cursor-pointer'
                    }`}
                    style={{
                      width: box.w * k,
                      height: box.h * k,
                      fontSize: Math.max(10, 28 * k),
                      borderColor: box.color,
                      background: `${box.color}${active ? '55' : '2a'}`,
                      color: '#fff',
                      opacity: s.visible ? 1 : 0.35,
                      outline: active ? '2px solid #fff' : 'none',
                      outlineOffset: 2,
                    }}
                    data-testid={`regie-layout-box-${el}`}
                  >
                    {t[`el_${el}`]}
                    {!s.visible ? ` (${t.hidden})` : ''}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canEdit && (
              <AdminButton
                variant="primary"
                size="sm"
                disabled={busy || !dirty}
                onClick={() => void save()}
              >
                {t.save}
              </AdminButton>
            )}
            {canEdit && dirty && (
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => setDraft(null)}
              >
                {t.cancel}
              </AdminButton>
            )}
            {canEdit && (
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => setDraft(DEFAULT_REGIE_LAYOUT)}
              >
                {t.resetAll}
              </AdminButton>
            )}
            {dirty && (
              <span className="text-xs text-[var(--warn,#f5a524)]">
                {t.unsaved}
              </span>
            )}
          </div>

          {canEdit && (
            <div className="mt-4">
              <AdminButton
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void testObs()}
                data-testid="regie-layout-test-obs"
              >
                {t.testObs}
              </AdminButton>
              <p className={rubanHelp}>{t.testObsHint}</p>
            </div>
          )}
        </div>

        {/* Réglages de l'élément choisi */}
        <div className="space-y-4">
          <div
            role="tablist"
            aria-label={t.title}
            className="flex flex-wrap gap-1.5"
          >
            {REGIE_ELEMENTS.map((el) => (
              <AdminButton
                key={el}
                type="button"
                size="xs"
                role="tab"
                aria-selected={el === selected}
                variant={el === selected ? 'secondary' : 'ghost'}
                onClick={() => setSelected(el)}
              >
                {t[`el_${el}`]}
              </AdminButton>
            ))}
          </div>

          <fieldset disabled={!canEdit} className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
              <input
                type="checkbox"
                checked={slot.visible}
                onChange={(e) =>
                  update(selected, { visible: e.target.checked })
                }
              />
              {t.visible}
            </label>

            <div>
              <span className={rubanLabel}>{t.anchorLabel}</span>
              <div
                role="radiogroup"
                aria-label={t.anchorLabel}
                className="grid w-28 grid-cols-3 gap-1"
              >
                {REGIE_ANCHORS.map((a: RegieAnchor) => (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={slot.anchor === a}
                    aria-label={t[`anchor_${a}`]}
                    title={t[`anchor_${a}`]}
                    onClick={() => update(selected, { anchor: a, x: 0, y: 0 })}
                    className={`h-8 rounded-[var(--r-ctrl,4px)] border transition ${
                      slot.anchor === a
                        ? 'border-[var(--or,#b467d1)] bg-[var(--or,#b467d1)]'
                        : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] hover:border-[var(--or,#b467d1)]'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className={rubanLabel}>{t.offsetX}</span>
                <input
                  type="number"
                  step={10}
                  className={`${rubanFormInput} font-mono`}
                  value={slot.x}
                  onChange={(e) =>
                    update(selected, { x: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label>
                <span className={rubanLabel}>{t.offsetY}</span>
                <input
                  type="number"
                  step={10}
                  className={`${rubanFormInput} font-mono`}
                  value={slot.y}
                  onChange={(e) =>
                    update(selected, { y: Number(e.target.value) || 0 })
                  }
                />
              </label>
            </div>

            <label className="block">
              <span className={rubanLabel}>
                {format(t.scaleLabel, { pct: Math.round(slot.scale * 100) })}
              </span>
              <input
                type="range"
                min={SCALE_MIN}
                max={SCALE_MAX}
                step={0.05}
                value={slot.scale}
                onChange={(e) =>
                  update(selected, { scale: Number(e.target.value) })
                }
                className="w-full"
              />
            </label>

            <AdminButton
              variant="ghost"
              size="xs"
              onClick={() => update(selected, DEFAULT_REGIE_LAYOUT[selected])}
            >
              {t.resetElement}
            </AdminButton>
          </fieldset>
          <p className={`text-xs ${rubanEyebrow}`}>
            {t[`anchor_${slot.anchor}`]}
          </p>
        </div>
      </div>
    </div>
  );
}

// Son propre cache de requêtes : chargé à la demande par la page (bundle).
export default withAdminQuery(RegieLayoutPanel);
